// NutriScan — rappels (notifications push).
// Appelée toutes les 15 minutes par pg_cron ({"run":true}) : envoie les rappels dus à chaque appareil abonné,
// selon ses réglages (Profil → Rappels) et ce qui est déjà noté dans le journal (un repas déjà noté ne déclenche rien).
// GET → clé publique VAPID (créée et gardée côté serveur au premier appel, jamais exposée en privé).
// POST {"test":true} avec le jeton de l'utilisateur → notification de test sur ses appareils.
// Web Push implémenté avec WebCrypto (RFC 8291 aes128gcm + VAPID RFC 8292), sans dépendance.

const SB = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CONTACT = 'mailto:nutriscan-support@googlegroups.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (d, s) => new Response(JSON.stringify(d), { status: s || 200, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ---------- Base de données (clé de service, côté serveur uniquement) ---------- */
async function rest(path, opts) {
  opts = opts || {};
  const r = await fetch(SB + '/rest/v1/' + path, {
    method: opts.method || 'GET',
    headers: { apikey: SK, Authorization: 'Bearer ' + SK, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const t = await r.text();
  if (!r.ok) throw new Error(path.split('?')[0] + ' ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

/* ---------- Outils binaires ---------- */
const enc = new TextEncoder();
const b64u = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const ub64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

/* ---------- Clés VAPID (générées une fois, gardées dans push_keys, table sans accès public) ---------- */
let VAPID = null;
async function vapid() {
  if (VAPID) return VAPID;
  let rows = await rest('push_keys?id=eq.1&select=pub,jwk');
  if (!rows.length) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    await rest('push_keys?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: { id: 1, pub, jwk } });
    rows = await rest('push_keys?id=eq.1&select=pub,jwk');
  }
  const jwk = Object.assign({}, rows[0].jwk); delete jwk.key_ops; delete jwk.ext;
  VAPID = { pub: rows[0].pub, key: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return VAPID;
}
async function vapidAuth(endpoint) {
  const v = await vapid();
  const h = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.key, enc.encode(h + '.' + p));
  return 'vapid t=' + h + '.' + p + '.' + b64u(sig) + ', k=' + v.pub;
}

/* ---------- Chiffrement du message (RFC 8291) ---------- */
async function encrypt(sub, text) {
  const ua = ub64u(sub.p256dh), secret = ub64u(sub.auth);
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, kp.privateKey, 256));
  const prkKey = await hmac(secret, shared);
  const ikm = (await hmac(prkKey, cat(enc.encode('WebPush: info'), new Uint8Array([0]), ua, asPub, new Uint8Array([1])))).slice(0, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0, 1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0, 1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), asPub, ct);
}
async function sendPush(sub, msg) {
  const body = await encrypt(sub, JSON.stringify(msg));
  const headers = { Authorization: await vapidAuth(sub.endpoint), TTL: '21600', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Urgency: 'normal' };
  if (msg.tag && /^[A-Za-z0-9_-]{1,32}$/.test(msg.tag)) headers.Topic = msg.tag;
  const r = await fetch(sub.endpoint, { method: 'POST', headers, body });
  if (!r.ok) console.log('push', r.status, new URL(sub.endpoint).host, (await r.text()).slice(0, 160));
  return r.status;
}

/* ---------- Textes (fr / en / ar) ---------- */
const TXT = {
  fr: {
    bk: ['Petit-déjeuner', 'Qu’as-tu mangé ce matin ? Note-le en quelques secondes.'],
    lu: ['Déjeuner', 'C’est l’heure de noter ton déjeuner.'],
    di: ['Dîner', 'Note ton dîner pour bien finir ta journée.'],
    sn: ['Collation', 'Une collation aujourd’hui ? Pense à la noter.'],
    water: ['Pense à boire', 'Tu en es à {x} L sur {g} L aujourd’hui.'],
    weigh: ['Pesée de la semaine', 'Pèse-toi ce matin et note ton poids.'],
    sport: ['Séance du jour', 'C’est jour de sport : ta séance t’attend !'],
    report: ['Ton bilan de la semaine', 'Découvre tes progrès de la semaine.'],
    streak: ['Ta série de {n} jours', 'Note au moins un repas aujourd’hui pour la garder.'],
    test: ['Rappels activés', 'Tu recevras tes rappels NutriScan sur cet appareil.']
  },
  en: {
    bk: ['Breakfast', 'What did you eat this morning? Log it in a few seconds.'],
    lu: ['Lunch', 'Time to log your lunch.'],
    di: ['Dinner', 'Log your dinner to wrap up your day.'],
    sn: ['Snack', 'Had a snack today? Remember to log it.'],
    water: ['Time to drink', 'You’re at {x} L out of {g} L today.'],
    weigh: ['Weekly weigh-in', 'Weigh yourself this morning and log your weight.'],
    sport: ['Today’s workout', 'It’s workout day: your session is waiting!'],
    report: ['Your weekly report', 'See how your week went.'],
    streak: ['Your {n}-day streak', 'Log at least one meal today to keep it going.'],
    test: ['Reminders on', 'You’ll get your NutriScan reminders on this device.']
  },
  ar: {
    bk: ['الفطور', 'ماذا أكلت هذا الصباح؟ سجّله في ثوانٍ.'],
    lu: ['الغداء', 'حان وقت تسجيل غدائك.'],
    di: ['العشاء', 'سجّل عشاءك لتختم يومك.'],
    sn: ['وجبة خفيفة', 'هل تناولت وجبة خفيفة اليوم؟ لا تنسَ تسجيلها.'],
    water: ['اشرب الماء', 'شربت {x} لتر من أصل {g} لتر اليوم.'],
    weigh: ['وزن الأسبوع', 'زِن نفسك هذا الصباح وسجّل وزنك.'],
    sport: ['حصة اليوم', 'اليوم يوم رياضة: حصتك في انتظارك!'],
    report: ['حصيلة أسبوعك', 'اكتشف تقدّمك هذا الأسبوع.'],
    streak: ['سلسلة {n} أيام', 'سجّل وجبة واحدة على الأقل اليوم للحفاظ عليها.'],
    test: ['التذكيرات مفعّلة', 'ستصلك تذكيرات NutriScan على هذا الجهاز.']
  }
};
function msg(lang, k, vars, go) {
  const L = TXT[lang] || TXT.fr, t = L[k] || TXT.fr[k];
  const fill = s => s.replace(/\{(\w+)\}/g, (_, v) => vars && vars[v] != null ? String(vars[v]) : '');
  return { title: fill(t[0]), body: fill(t[1]), tag: k, url: './' + (go ? '?go=' + go : ''), lang };
}
const liters = (ml, lang) => { const v = String(Math.round((ml || 0) / 100) / 10); return lang === 'fr' ? v.replace('.', ',') : v; };

/* ---------- Heure locale de l'appareil ---------- */
function localNow(tz) {
  let f;
  try { f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }); }
  catch (e) { f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }); }
  const p = {}; f.formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return { date: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + +p.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}
const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* ---------- Rappels dus pour un appareil ---------- */
function dueFor(sub, D, L) {
  const R = D && D.remind;
  if (!R || !R.on) return [];
  const lang = sub.lang, out = [];
  const due = t => t != null && L.min >= t && L.min < t + 20;
  const ents = (D.entries || []).filter(e => e && e.date === L.date);
  const meals = new Set(ents.map(e => e.meal));
  [['bk', 'breakfast'], ['lu', 'lunch'], ['di', 'dinner'], ['sn', 'snack']].forEach(([k, meal]) => {
    if (R[k] && due(hm(R[k])) && !meals.has(meal)) out.push(['m-' + k, msg(lang, k, null, 'add&meal=' + meal)]);
  });
  const goalW = +(D.goals && D.goals.water) || 0, water = +((D.water || {})[L.date]) || 0;
  if (R.water && goalW > 0) [[660, 0.3], [900, 0.55], [1110, 0.8]].forEach(([t, f], i) => {
    if (due(t) && water < goalW * f) out.push(['water' + i, msg(lang, 'water', { x: liters(water, lang), g: liters(goalW, lang) }, 'water')]);
  });
  if (R.weigh != null && +R.weigh >= 0 && L.dow === +R.weigh && due(hm(R.wT || '08:00')) && !(D.weights || []).some(w => w && w.date === L.date)) out.push(['weigh', msg(lang, 'weigh', null, 'weight')]);
  if (Array.isArray(R.sport) && R.sport.map(Number).includes(L.dow) && due(hm(R.sT || '18:00')) && !(D.exercises || []).some(x => x && x.date === L.date)) out.push(['sport', msg(lang, 'sport', null, 'sport')]);
  if (R.report && L.dow === 0 && due(19 * 60)) out.push(['report', msg(lang, 'report', null, 'report')]);
  if (R.streak && due(20 * 60 + 30) && !ents.length) {
    const days = new Set((D.entries || []).map(e => e && e.date));
    let n = 0, d = addDays(L.date, -1);
    while (days.has(d) && n < 3650) { n++; d = addDays(d, -1); }
    if (n >= 2) out.push(['streak', msg(lang, 'streak', { n }, 'journal')]);
  }
  return out;
}

async function run() {
  // Une seule tournée toutes les 4 minutes au plus, même si la fonction est appelée plus souvent
  const lim = new Date(Date.now() - 4 * 60000).toISOString();
  const ok = await rest('push_keys?id=eq.1&or=' + encodeURIComponent('(last_run.is.null,last_run.lt."' + lim + '")'), { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { last_run: new Date().toISOString() } });
  if (!ok || !ok.length) { await vapid(); return { skipped: true }; }
  const subs = await rest('push_subs?select=endpoint,user_id,p256dh,auth,tz,lang,sent');
  if (!subs.length) return { subs: 0, sent: 0 };
  const ids = [...new Set(subs.map(s => s.user_id))];
  const data = {};
  for (let i = 0; i < ids.length; i += 40) {
    const rows = await rest('backups?select=user_id,remind:data->remind,goals:data->goals,water:data->water,entries:data->entries,weights:data->weights,exercises:data->exercises&user_id=in.(' + ids.slice(i, i + 40).join(',') + ')');
    rows.forEach(r => { data[r.user_id] = r; });
  }
  let sent = 0, gone = 0;
  for (const sub of subs) {
    const L = localNow(sub.tz), list = dueFor(sub, data[sub.user_id], L);
    const was = sub.sent || {}, now = {};
    Object.keys(was).forEach(k => { if (was[k] === L.date) now[k] = was[k]; });
    let changed = Object.keys(now).length !== Object.keys(was).length, dead = false;
    for (const [key, m] of list) {
      if (now[key] === L.date) continue;
      const st = await sendPush(sub, m);
      if (st === 404 || st === 410) { dead = true; break; }
      if (st >= 200 && st < 300) { sent++; now[key] = L.date; changed = true; }
    }
    const ep = encodeURIComponent(sub.endpoint);
    if (dead) { gone++; await rest('push_subs?endpoint=eq.' + ep, { method: 'DELETE' }); }
    else if (changed) await rest('push_subs?endpoint=eq.' + ep, { method: 'PATCH', body: { sent: now } });
  }
  return { subs: subs.length, sent, gone };
}

async function test(req, body) {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return json({ error: 'auth' }, 401);
  const u = await fetch(SB + '/auth/v1/user', { headers: { apikey: SK, Authorization: 'Bearer ' + tok } });
  if (!u.ok) return json({ error: 'auth' }, 401);
  const user = await u.json();
  let q = 'push_subs?select=endpoint,p256dh,auth,lang&user_id=eq.' + user.id;
  if (body.endpoint) q += '&endpoint=eq.' + encodeURIComponent(body.endpoint);
  const subs = await rest(q);
  let sent = 0;
  for (const s of subs) {
    const st = await sendPush(s, msg(s.lang, 'test', null, ''));
    if (st === 404 || st === 410) await rest('push_subs?endpoint=eq.' + encodeURIComponent(s.endpoint), { method: 'DELETE' });
    else if (st >= 200 && st < 300) sent++;
  }
  return json({ sent, subs: subs.length });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    if (req.method === 'GET') return json({ key: (await vapid()).pub });
    const body = await req.json().catch(() => ({}));
    if (body.test) return await test(req, body);
    if (body.run) return json(await run());
    return json({ error: 'bad request' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e && e.message || e) }, 500);
  }
});
