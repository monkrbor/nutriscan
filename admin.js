/* Console d'administration NutriScan : vue d'ensemble, utilisateurs (gestion complète), erreurs, activité, messages. */
(function () {
  'use strict';
  const C = window.NS_CLOUDAPI;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fk = v => Math.round(v || 0).toLocaleString('fr-FR');
  const pl = (n, w) => fk(n) + ' ' + w + (n > 1 ? 's' : '');
  const day = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const dt = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const short = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const ago = s => {
    if (!s) return '—';
    const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h';
    const d = Math.round(h / 24); return d < 31 ? 'il y a ' + d + ' j' : new Date(s).toLocaleDateString('fr-FR');
  };
  const ERR_TYPES = ['error', 'camera_error', 'camera_black', 'sync_error'];
  const TYPE_LABEL = {
    app_open: 'Ouverture de l’appli', scan_start: 'Caméra ouverte', scan_ok: 'Scan réussi', scan_unknown: 'Produit introuvable', scan_offline: 'Scan hors ligne', scan_cancel: 'Scan abandonné',
    search: 'Recherche', product_add: 'Aliment ajouté', login: 'Connexion', login_start: 'Début de connexion', signup: 'Création de compte', consent: 'Accord pour le suivi',
    error: 'Erreur', camera_error: 'Erreur caméra', camera_black: 'Caméra noire', sync_error: 'Erreur de synchro'
  };
  let users = [], events = [], messages = [], reads = [], feedback = [], owner = {}, view = 'overview', current = null, ufilter = 'all', afilter = 'all', toastT;
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
  function show(id) { ['login', 'panel', 'notice'].forEach(x => { $('#' + x).hidden = x !== id; }); $('#topActs').hidden = id === 'login' || (id === 'notice' && !C.session); }
  function notice(html) { $('#notice').innerHTML = html; show('notice'); }
  function arm(btn, text) {
    if (btn.classList.contains('armed')) return true;
    const orig = btn.innerHTML; btn.classList.add('armed'); btn.textContent = text;
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.innerHTML = orig; } }, 3500);
    return false;
  }
  function download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const slugName = u => String(u.name || u.email || u.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const userById = id => users.find(u => u.id === id);
  const who = e => { const u = userById(e.user_id || owner[e.device]); return u ? (u.name || u.email) + (e.user_id ? '' : ' (avant connexion)') : 'Sans compte · appareil ' + String(e.device || '').slice(-6); };
  // Événements d'un compte : les siens + ceux envoyés par ses appareils avant qu'il se connecte
  const eventsOf = id => events.filter(e => e.user_id === id || (!e.user_id && owner[e.device] === id));
  function device(ua) {
    ua = String(ua || '');
    let os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Autre';
    // Modèle précis quand l'appareil le donne (surtout Android : « SM-G991B », « Pixel 7 »…)
    const am = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build|[);])/);
    if (am && am[1]) { const m = am[1].trim().replace(/\s*\/.*$/, ''); if (m && !/^wv$/i.test(m)) os = 'Android · ' + m; }
    const br = /Brave/.test(ua) ? 'Brave' : /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return os + (br ? ' · ' + br : '');
  }
  function evDetail(e) {
    const d = e.data || {};
    if (e.type === 'scan_ok') return 'Code ' + (d.code || '?') + (d.ms ? ' · ' + (d.ms / 1000).toFixed(1).replace('.', ',') + ' s' : '') + (d.engine ? ' · lecteur ' + d.engine : '');
    if (e.type === 'scan_unknown' || e.type === 'scan_offline') return 'Code ' + (d.code || '?');
    if (e.type === 'search') return '« ' + (d.q || '') + ' »';
    if (e.type === 'product_add') return 'Source : ' + ({ off: 'produit du commerce', gen: 'aliment courant', custom: 'aliment perso', quick: 'ajout rapide' }[d.source] || d.source || '?');
    if (e.type === 'login' || e.type === 'signup' || e.type === 'login_start') return d.provider === 'google' ? 'Avec Google' : 'Par e-mail';
    if (e.type === 'scan_start') return 'Lecteur ' + (d.engine || '?');
    if (e.type === 'scan_cancel') return 'Fermé après ' + Math.round((d.ms || 0) / 1000) + ' s sans lecture · lecteur ' + (d.engine || '?');
    if (e.type === 'app_open') return [d.standalone ? 'appli installée' : 'navigateur', d.online === false ? 'hors ligne' : '', d.logged ? 'connecté' : ''].filter(Boolean).join(' · ');
    if (ERR_TYPES.includes(e.type)) return d.msg || d.message || d.name || '';
    return '';
  }

  /* ---------- Chargement ---------- */
  async function rpc(name, args) { return C.req('/rest/v1/rpc/' + name, { method: 'POST', auth: true, body: args || {} }); }
  async function loadAll() {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [u, ev, msg, rd, fb] = await Promise.all([
      rpc('admin_users'),
      C.req('/rest/v1/events?select=id,created_at,user_id,device,type,data,version,ua,ip&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc&limit=5000', { auth: true }).catch(() => []),
      C.req('/rest/v1/messages?select=id,user_id,title,body,created_at&order=created_at.desc&limit=200', { auth: true }).catch(() => []),
      C.req('/rest/v1/message_reads?select=message_id,user_id', { auth: true }).catch(() => []),
      C.req('/rest/v1/feedback?select=id,created_at,user_id,email,device,type,message,version,handled,ip&order=created_at.desc&limit=500', { auth: true }).catch(() => [])
    ]);
    users = u || []; events = ev || []; messages = msg || []; reads = rd || []; feedback = fb || [];
    owner = {}; events.slice().reverse().forEach(e => { if (e.user_id && userById(e.user_id)) owner[e.device] = e.user_id; });
    updateBadges();
    render();
  }
  function updateBadges() {
    const errs7 = events.filter(e => ERR_TYPES.includes(e.type) && Date.now() - new Date(e.created_at) < 7 * 864e5).length;
    const eb = $('#errBadge'); if (eb) { eb.hidden = !errs7; eb.textContent = errs7; }
    const open = feedback.filter(f => !f.handled).length;
    const sb = $('#sgBadge'); if (sb) { sb.hidden = !open; sb.textContent = open; }
  }
  async function start() {
    if (!C || !C.enabled) { notice('La console n’est pas encore branchée : remplis <b>config.js</b> avec l’adresse et la clé publique Supabase.'); return; }
    if (window.NS_CLOUD && window.NS_CLOUD.google) $('#lGoogle').hidden = false;
    const link = await C.fromLink();
    if (link && link.error) toast(link.error);
    if (!C.session) { show('login'); return; }
    try {
      const me = C.session.user;
      const rows = await C.req('/rest/v1/admins?select=user_id&user_id=eq.' + me.id, { auth: true });
      if (!rows || !rows.length) {
        $('#who').textContent = me.email;
        notice('Le compte <b>' + esc(me.email) + '</b> n’est pas administrateur. Dans Supabase → SQL Editor, lance :<code style="display:block;margin-top:8px;overflow-wrap:anywhere">insert into public.admins (user_id) select id from auth.users where email = \'' + esc(me.email) + '\';</code>');
        $('#topActs').hidden = false;
        return;
      }
      $('#who').textContent = 'Connecté : ' + me.email;
      show('panel');
      await loadAll();
    } catch (e) {
      if (e.status === 401) { await C.signOut(); show('login'); return; }
      notice(esc(e.message));
    }
  }

  /* ---------- Rendu ---------- */
  function render() {
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    const v = $('#view');
    if (view === 'overview') v.innerHTML = overviewHTML();
    else if (view === 'users') { v.innerHTML = usersHTML(); if (current) openUser(current, true); else renderList(); }
    else if (view === 'errors') v.innerHTML = errorsHTML();
    else if (view === 'activity') v.innerHTML = activityHTML();
    else if (view === 'suggestions') v.innerHTML = suggestionsHTML();
    else if (view === 'messages') v.innerHTML = messagesHTML();
  }
  // Largeur du dessin = largeur réelle du cadre, pour que les textes gardent leur taille sur téléphone
  const chartW = () => Math.round(Math.min(600, Math.max(300, window.innerWidth >= 760 ? window.innerWidth / 2 - 90 : window.innerWidth - 66)));
  function barsSVG(days, vals, color, label) {
    const W = chartW(), H = 140, top = 14, bottom = 22, n = days.length, slot = W / n, bw = Math.min(26, slot * 0.6);
    const max = Math.max(1, ...vals);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '"><line x1="0" x2="' + W + '" y1="' + (H - bottom) + '" y2="' + (H - bottom) + '" stroke="var(--line)"/>';
    vals.forEach((v, i) => {
      const h = (H - top - bottom) * v / max, x = slot * i + (slot - bw) / 2;
      if (v > 0) s += '<rect x="' + x.toFixed(1) + '" y="' + (H - bottom - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(2, h).toFixed(1) + '" rx="4" fill="' + color + '"><title>' + esc(days[i] + ' : ' + v) + '</title></rect>';
      if (v > 0) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - bottom - h - 3).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
      if (i % 2 === 0 || n <= 7) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + days[i].slice(8) + '/' + days[i].slice(5, 7) + '</text>';
    });
    return '<div class="bars">' + s + '</svg></div>';
  }
  function overviewHTML() {
    const now = Date.now(), d7 = now - 7 * 864e5;
    const e7 = events.filter(e => new Date(e.created_at) > d7);
    const scans = e7.filter(e => e.type === 'scan_ok').length, starts = e7.filter(e => e.type === 'scan_start').length;
    const unknown = e7.filter(e => e.type === 'scan_unknown').length;
    const errs = e7.filter(e => ERR_TYPES.includes(e.type)).length;
    const devices = new Set(e7.map(e => e.device)).size;
    const newU = users.filter(u => new Date(u.created_at) > d7).length;
    const active = users.filter(u => new Date(u.updated_at || u.last_sign_in_at || 0) > d7).length;
    const days = Array.from({ length: 14 }, (_, i) => day(now - (13 - i) * 864e5));
    const act = days.map(d => new Set(events.filter(e => day(e.created_at) === d).map(e => e.device)).size);
    const errd = days.map(d => events.filter(e => ERR_TYPES.includes(e.type) && day(e.created_at) === d).length);
    const unk = {};
    events.filter(e => e.type === 'scan_unknown').forEach(e => { const c = (e.data || {}).code || '?'; unk[c] = unk[c] || { n: 0, last: e.created_at }; unk[c].n++; });
    const topUnk = Object.entries(unk).sort((a, b) => b[1].n - a[1].n).slice(0, 10);
    const eng = {};
    e7.filter(e => /^scan_(start|ok|cancel)$/.test(e.type)).forEach(e => {
      const k = (e.data || {}).engine || '?'; eng[k] = eng[k] || { start: 0, ok: 0, cancel: 0, ms: [] };
      if (e.type === 'scan_start') eng[k].start++; else if (e.type === 'scan_cancel') eng[k].cancel++; else { eng[k].ok++; if ((e.data || {}).ms) eng[k].ms.push(e.data.ms); }
    });
    const devs = {};
    e7.forEach(e => { const k = device(e.ua); devs[k] = devs[k] || new Set(); devs[k].add(e.device); });
    return '<div class="stats">' +
      '<div class="stat"><b>' + fk(users.length) + '</b><span>comptes</span></div>' +
      '<div class="stat"><b>' + fk(newU) + '</b><span>nouveaux comptes (7 j)</span></div>' +
      '<div class="stat"><b>' + fk(active) + '</b><span>comptes actifs (7 j)</span></div>' +
      '<div class="stat"><b>' + fk(devices) + '</b><span>appareils actifs (7 j)</span></div>' +
      '<div class="stat"><b>' + fk(scans) + '</b><span>scans réussis (7 j)' + (starts ? ' · ' + Math.round(scans / starts * 100) + ' % des ouvertures de caméra' : '') + '</span></div>' +
      '<div class="stat"><b>' + fk(unknown) + '</b><span>produits introuvables (7 j)</span></div>' +
      '<div class="stat' + (errs ? ' bad' : '') + '"><b>' + fk(errs) + '</b><span>erreurs (7 j)</span></div></div>' +
      '<div class="two"><section class="panel"><h2>Appareils actifs par jour</h2>' + barsSVG(days, act, 'var(--brand)', 'Appareils actifs par jour') + '</section>' +
      '<section class="panel"><h2>Erreurs par jour</h2>' + barsSVG(days, errd, 'var(--danger)', 'Erreurs par jour') + '</section></div>' +
      '<div class="two"><section class="panel"><h2>Lecteur de code-barres (7 j)</h2>' + (Object.keys(eng).length ?
        '<div class="tbl"><table><thead><tr><th>Lecteur</th><th class="num">Caméra ouverte</th><th class="num">Scans réussis</th><th class="num">Abandons</th><th class="num">Temps moyen</th></tr></thead><tbody>' +
        Object.entries(eng).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="num">' + v.start + '</td><td class="num">' + v.ok + '</td><td class="num">' + v.cancel + '</td><td class="num">' + (v.ms.length ? (v.ms.reduce((a, b) => a + b, 0) / v.ms.length / 1000).toFixed(1).replace('.', ',') + ' s' : '—') + '</td></tr>').join('') +
        '</tbody></table></div>' : '<p class="hint">Pas encore de scan.</p>') + '</section>' +
      '<section class="panel"><h2>Téléphones et navigateurs (7 j)</h2>' + (Object.keys(devs).length ?
        '<div class="tbl"><table><thead><tr><th>Appareil</th><th class="num">Appareils</th></tr></thead><tbody>' +
        Object.entries(devs).sort((a, b) => b[1].size - a[1].size).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td class="num">' + v.size + '</td></tr>').join('') +
        '</tbody></table></div>' : '<p class="hint">Pas encore de données.</p>') + '</section></div>' +
      '<section class="panel"><h2>Produits introuvables les plus scannés (30 j)</h2>' + (topUnk.length ?
        '<div class="tbl"><table><thead><tr><th>Code-barres</th><th class="num">Scans</th><th>Dernier</th></tr></thead><tbody>' +
        topUnk.map(([c, v]) => '<tr><td>' + esc(c) + '</td><td class="num">' + v.n + '</td><td>' + esc(ago(v.last)) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="hint">Aucun pour l’instant.</p>') + '</section>' +
      '<p class="hint">Les statistiques ne concernent que les utilisateurs qui ont accepté le suivi. Elles sont gardées 180 jours.</p>';
  }

  /* ---------- Utilisateurs ---------- */
  let utab = 'progress', ucache = null, jday = null, pendingAll = null;
  const MEALS = [['breakfast', 'Petit-déjeuner'], ['lunch', 'Déjeuner'], ['dinner', 'Dîner'], ['snack', 'Collations']];
  const UTABS = [['progress', 'Progression'], ['journal', 'Journal'], ['sport', 'Sport'], ['meals', 'Repas'], ['data', 'Profil et aliments'], ['backups', 'Sauvegardes'], ['account', 'Compte'], ['activity', 'Activité']];
  const EXN = Object.fromEntries((window.NS_EX || []).map(e => [e.id, e.n]));
  const RCP = Object.fromEntries(((window.NS_RECIPES || {}).R || []).map(r => [r.id, r]));
  const SPG = { fat: 'Perdre du gras', muscle: 'Prendre du muscle', strength: 'Gagner en force', fit: 'Être en forme' };
  const SPP = { gym: 'Salle de sport', home: 'Maison avec matériel', body: 'Poids du corps' };
  const WDN = ['', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const SLN = { breakfast: 'Petit-déj', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation' };
  const n1 = v => (Math.round((+v || 0) * 10) / 10).toLocaleString('fr-FR');
  const kg = v => v == null || v === '' || !isFinite(v) ? '—' : n1(v) + ' kg';
  const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v));
  const dayFR = (d, o) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', o || { weekday: 'short', day: 'numeric', month: 'short' });
  const addDays = (d, n) => day(new Date(d + 'T12:00:00').getTime() + n * 864e5);
  const ddmm = d => String(d || '').slice(8) + '/' + String(d || '').slice(5, 7);
  const isBanned = u => !!u.banned_until && (String(u.banned_until) === 'infinity' || new Date(u.banned_until) > new Date());
  const GOAL_TXT = { lose: 'Perdre du poids', gain: 'Prendre du muscle', maintain: 'Garder son poids' };
  const ACT_TXT = { sedentary: 'Sédentaire', light: 'Peu actif', moderate: 'Actif', very: 'Très actif', active: 'Très actif' };
  function bytes(n) { n = +n || 0; return n < 1024 ? n + ' o' : n < 1048576 ? Math.round(n / 1024) + ' Ko' : n1(n / 1048576) + ' Mo'; }

  // Résumé chiffré d'une sauvegarde : totaux par jour, séries, moyennes
  function stats(d) {
    const byDay = {};
    (d.entries || []).forEach(e => {
      const x = byDay[e.date] = byDay[e.date] || { kcal: 0, p: 0, c: 0, f: 0, n: 0 };
      x.kcal += +e.kcal || 0; x.p += +e.p || 0; x.c += +e.c || 0; x.f += +e.f || 0; x.n++;
    });
    const days = Object.keys(byDay).sort();
    const set = new Set(days), today = day(Date.now());
    let cur = 0, k = set.has(today) ? today : addDays(today, -1);
    while (set.has(k)) { cur++; k = addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    days.forEach(x => { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; });
    const last = n => days.filter(x => x > addDays(today, -n));
    const avg = (list, f) => list.length ? list.reduce((a, x) => a + byDay[x][f], 0) / list.length : 0;
    const w = (d.weights || []).filter(x => x && +x.kg > 0);
    return { byDay, days, cur, best, last, avg, w, first: w[0], lastW: w[w.length - 1] };
  }
  function exByDay(d) { const o = {}; (d.exercises || []).forEach(x => { (o[x.date] = o[x.date] || []).push(x); }); return o; }

  /* Graphiques (SVG) : une seule série, objectif en pointillé, infobulle au survol ou au toucher */
  function weightSVG(points, goal) {
    const W = chartW(), H = 200, L = 44, R = 14, T = 14, B = 26;
    const pts = points.slice(-120);
    const t = p => new Date(p.date + 'T12:00:00').getTime();
    const t0 = t(pts[0]), t1 = Math.max(t(pts[pts.length - 1]), t0 + 864e5);
    const vals = pts.map(p => +p.kg).concat(goal ? [goal] : []);
    let lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
    const X = p => L + (W - L - R) * (t(p) - t0) / (t1 - t0), Y = v => T + (H - T - B) * (hi - v) / (hi - lo);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Évolution du poids">';
    for (let i = 0; i <= 3; i++) { const v = lo + (hi - lo) * i / 3, y = Y(v); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + n1(v) + '</text>'; }
    if (goal && goal >= lo && goal <= hi) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal).toFixed(1) + '" y2="' + Y(goal).toFixed(1) + '" stroke="var(--ink)" stroke-dasharray="5 5" stroke-width="1.5" opacity=".55"/><text class="lbl" x="' + (W - R) + '" y="' + (Y(goal) - 6).toFixed(1) + '" text-anchor="end">Objectif ' + n1(goal) + ' kg</text>';
    if (pts.length > 1) s += '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + X(p).toFixed(1) + ' ' + Y(+p.kg).toFixed(1)).join('') + '" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach((p, i) => {
      const lastP = i === pts.length - 1;
      if (pts.length <= 40 || lastP) s += '<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(+p.kg).toFixed(1) + '" r="4" fill="var(--brand)" stroke="var(--surface)" stroke-width="2"/>';
      s += '<circle cx="' + X(p).toFixed(1) + '" cy="' + Y(+p.kg).toFixed(1) + '" r="12" fill="transparent" data-tip="' + esc(dayFR(p.date) + ' : ' + n1(p.kg) + ' kg') + '"/>';
    });
    const lp = pts[pts.length - 1];
    s += '<text class="lbl" x="' + Math.min(X(lp), W - R).toFixed(1) + '" y="' + (Y(+lp.kg) - 10).toFixed(1) + '" text-anchor="end">' + n1(lp.kg) + ' kg</text>';
    s += '<text x="' + L + '" y="' + (H - 6) + '">' + ddmm(pts[0].date) + '</text><text x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + ddmm(lp.date) + '</text>';
    return '<div class="chart">' + s + '</svg></div>';
  }
  function kcalSVG(days, byDay, goal) {
    const W = chartW(), H = 190, L = 40, R = 10, T = 16, B = 24, n = days.length, slot = (W - L - R) / n, bw = Math.max(4, Math.min(16, slot - 2));
    const vals = days.map(x => byDay[x] ? byDay[x].kcal : 0);
    const hi = Math.max(goal || 0, ...vals) * 1.12 || 1;
    const Y = v => T + (H - T - B) * (1 - v / hi);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Calories par jour">';
    [0, 0.5, 1].forEach(f => { const v = Math.round(hi * f / 100) * 100, y = Y(v); s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--line)"/><text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end">' + fk(v) + '</text>'; });
    days.forEach((x, i) => {
      const v = vals[i], cx = L + slot * i + slot / 2;
      if (v > 0) { const h = Math.max(3, (H - T - B) * v / hi); s += '<path d="M' + (cx - bw / 2).toFixed(1) + ' ' + (H - B) + 'v' + (-(h - 3)).toFixed(1) + 'a3 3 0 0 1 3 -3h' + (bw - 6).toFixed(1) + 'a3 3 0 0 1 3 3v' + (h - 3).toFixed(1) + 'z" fill="var(--brand)"/>'; }
      s += '<rect x="' + (L + slot * i).toFixed(1) + '" y="' + T + '" width="' + slot.toFixed(1) + '" height="' + (H - T - B) + '" fill="transparent" data-tip="' + esc(dayFR(x) + ' : ' + (v ? fk(v) + ' kcal' : 'rien noté')) + '" data-jd="' + x + '"/>';
      if (i % 5 === 0 || i === n - 1) s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' + ddmm(x) + '</text>';
    });
    if (goal) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(goal).toFixed(1) + '" y2="' + Y(goal).toFixed(1) + '" stroke="var(--ink)" stroke-dasharray="5 5" stroke-width="1.5" opacity=".55" pointer-events="none"/><text class="lbl" x="' + (W - R) + '" y="' + (Y(goal) - 5).toFixed(1) + '" text-anchor="end" pointer-events="none">Objectif ' + fk(goal) + '</text>';
    return '<div class="chart">' + s + '</svg></div>';
  }
  function hbar(label, v, goal, unit) {
    const pct = goal ? Math.min(100, v / goal * 100) : 0;
    return '<div class="hb"><div class="hb-top"><span>' + label + '</span><b>' + fk(v) + (goal ? ' / ' + fk(goal) : '') + ' ' + unit + '</b></div><div class="hb-track"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>';
  }

  /* Liste des comptes */
  function usersHTML() {
    if (current) return '<div id="upage"><div class="loading"><div class="spin"></div>Chargement…</div></div>';
    const f = [['all', 'Tous'], ['active', 'Actifs 7 j'], ['new', 'Nouveaux'], ['inactive', 'Inactifs 14 j'], ['flagged', 'Signalés'], ['banned', 'Bloqués'], ['nobackup', 'Sans sauvegarde']];
    return '<section class="panel">' +
      '<div class="ulist-top"><div class="searchbox"><svg class="ic sm"><use href="#i-search"/></svg><input id="q" type="search" placeholder="Nom ou e-mail" autocomplete="off" aria-label="Rechercher un compte"></div>' +
      '<div class="acts"><button class="btn outline" data-x="exportAll"><svg class="ic sm"><use href="#i-download"/></svg>Exporter tous les comptes</button>' +
      '<button class="btn outline" data-x="restoreAll"><svg class="ic sm"><use href="#i-upload"/></svg>Restaurer une sauvegarde complète</button></div></div>' +
      '<div id="restoreAllBox"></div>' +
      '<div class="filters" style="padding:0">' + f.map(x => '<button data-f="' + x[0] + '"' + (ufilter === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>' +
      '<div id="list" class="ulist"></div></section>';
  }
  function renderList() {
    const el = $('#list'); if (!el) return;
    const q = ($('#q') && $('#q').value.trim().toLowerCase()) || '';
    const d7 = Date.now() - 7 * 864e5, d14 = Date.now() - 14 * 864e5;
    const lastSeen = u => new Date(u.updated_at || u.last_sign_in_at || u.created_at || 0);
    const list = users.filter(u => {
      if (q && !(String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().includes(q)) return false;
      if (ufilter === 'active') return lastSeen(u) > d7;
      if (ufilter === 'new') return new Date(u.created_at) > d7;
      if (ufilter === 'inactive') return lastSeen(u) < d14;
      if (ufilter === 'flagged') return u.flagged;
      if (ufilter === 'banned') return isBanned(u);
      if (ufilter === 'nobackup') return !u.updated_at;
      return true;
    });
    el.innerHTML = list.length ? '<div class="urow head" aria-hidden="true"><span></span><span>Compte</span><span>Suivi</span><span>Poids</span><span>Dernière activité</span></div>' + list.map(u => {
      const dk = u.first_kg != null && u.last_kg != null ? u.last_kg - u.first_kg : null;
      return '<button class="urow" data-u="' + esc(u.id) + '"><span class="av">' + esc((u.name || u.email || '?').charAt(0).toUpperCase()) + '</span>' +
        '<span class="min0"><b>' + esc(u.name || u.email || 'Sans nom') + '</b><small>' + esc(u.name ? u.email : (u.provider === 'google' ? 'Compte Google' : 'Compte e-mail')) + '</small>' +
        '<span class="tags">' + (isBanned(u) ? '<span class="chip2 red">Bloqué</span>' : '') + (u.flagged ? '<span class="chip2 orange">Signalé</span>' : '') + (u.provider === 'google' ? '<span class="chip2">Google</span>' : '') + (!u.updated_at ? '<span class="chip2">Sans sauvegarde</span>' : '') + '</span></span>' +
        '<span class="ucol"><b>' + pl(u.days_tracked || 0, 'jour') + '</b><small>' + pl(u.entries_count || 0, 'aliment') + '</small></span>' +
        '<span class="ucol"><b>' + (u.last_kg != null ? kg(u.last_kg) : '—') + '</b><small>' + (dk != null && Math.abs(dk) >= 0.05 ? sgn(dk) + ' kg depuis le début' : u.last_kg != null ? 'stable' : 'pas de pesée') + (u.goal_kg ? ' · objectif ' + n1(u.goal_kg) : '') + '</small></span>' +
        '<span class="ucol"><b>' + esc(ago(lastSeen(u))) + '</b><small>' + (u.last_day ? 'dernier repas noté ' + dayFR(u.last_day, { day: 'numeric', month: 'short' }) : 'aucun repas noté') + '</small></span></button>';
    }).join('') : '<p class="empty-d">' + (users.length ? 'Aucun compte ne correspond.' : 'Aucun compte pour l’instant.') + '</p>';
  }

  /* Page d'un utilisateur */
  async function openUser(id, keepTab) {
    if (current !== id) { current = id; if (!keepTab) { utab = 'progress'; jday = null; } }
    if (view !== 'users' || !$('#upage')) { view = 'users'; render(); return; }
    const page = $('#upage');
    const u = userById(id); if (!u) { current = null; render(); return; }
    let b = null, hist = [];
    try {
      const r = await Promise.all([
        C.req('/rest/v1/backups?select=*&user_id=eq.' + id, { auth: true }),
        C.req('/rest/v1/backup_history?select=id,saved_at,entries_count&user_id=eq.' + id + '&order=saved_at.desc', { auth: true }).catch(() => [])
      ]);
      b = r[0] && r[0][0]; hist = r[1] || [];
    } catch (e) { page.innerHTML = '<p class="empty-d">' + esc(e.message) + '</p>'; return; }
    if (current !== id || !page.isConnected) return;
    ucache = { id, u, b, hist, d: (b && b.data) || {}, st: stats((b && b.data) || {}) };
    if (!jday) jday = ucache.st.days[ucache.st.days.length - 1] || day(Date.now());
    renderUser();
  }
  function renderUser() {
    const page = $('#upage'); if (!page || !ucache) return;
    const tp = document.getElementById('tip'); if (tp) tp.hidden = true;
    const { u, b, d, st } = ucache, P = d.profile || {}, G = d.goals || {};
    const banned = isBanned(u);
    const a7 = st.last(7), dk = st.first && st.lastW ? st.lastW.kg - st.first.kg : null;
    page.innerHTML =
      '<button class="back" data-x="back">← Tous les utilisateurs</button>' +
      '<section class="panel uhead"><div class="uid"><span class="av big">' + esc((u.name || P.name || u.email || '?').charAt(0).toUpperCase()) + '</span>' +
      '<div class="min0"><h2 class="big">' + esc(u.name || P.name || u.email) + '</h2><p class="hint">' + esc(u.email || '') + ' · inscrit ' + esc(ago(u.created_at)) + '</p>' +
      '<div class="tags"><span class="chip2">' + (u.provider === 'google' ? 'Compte Google' : 'Compte e-mail') + '</span>' + (banned ? '<span class="chip2 red">Bloqué</span>' : '<span class="chip2 green">Actif</span>') + (u.flagged ? '<span class="chip2 orange">Signalé</span>' : '') + (P.goal ? '<span class="chip2">' + esc(GOAL_TXT[P.goal] || P.goal) + '</span>' : '') + '</div></div></div>' +
      '<div class="acts"><button class="btn primary" data-a="dl"' + (b ? '' : ' disabled') + '><svg class="ic sm"><use href="#i-download"/></svg>Exporter ses données</button>' +
      '<button class="btn outline" data-a="csv"' + (b ? '' : ' disabled') + '>Journal en tableur (CSV)</button>' +
      '<button class="btn outline" data-ut="backups"><svg class="ic sm"><use href="#i-upload"/></svg>Restaurer</button></div>' +
      '<div class="mini">' +
      '<div><b>' + fk(st.days.length) + '</b><span>jours suivis</span></div>' +
      '<div><b>' + pl(st.cur, 'jour') + '</b><span>série en cours (record ' + st.best + ')</span></div>' +
      '<div><b>' + kg(st.lastW && st.lastW.kg) + '</b><span>' + (dk != null && st.w.length > 1 ? sgn(dk) + ' kg depuis le ' + ddmm(st.first.date) : 'poids actuel') + '</span></div>' +
      '<div><b>' + (a7.length ? fk(st.avg(a7, 'kcal')) : '—') + '</b><span>kcal / jour (7 j) · objectif ' + fk(G.kcal) + '</span></div>' +
      '<div><b>' + esc(ago(u.updated_at || u.last_sign_in_at)) + '</b><span>dernière activité</span></div></div></section>' +
      '<nav class="nav sub" aria-label="Sections du compte">' + UTABS.map(t => '<button data-ut="' + t[0] + '"' + (utab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>').join('') + '</nav>' +
      '<div id="utab">' + (b || utab === 'account' || utab === 'activity' || utab === 'backups' ? tabHTML() : '<section class="panel"><p class="empty-d">Pas encore de sauvegarde pour ce compte : il n’a rien enregistré en ligne.</p></section>') + '</div>';
  }
  function tabHTML() {
    const { u, b, hist, d, st } = ucache, P = d.profile || {}, G = d.goals || {};
    if (utab === 'progress') {
      const today = day(Date.now()), days30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
      const l30 = st.last(30), inGoal = l30.filter(x => G.kcal && Math.abs(st.byDay[x].kcal - G.kcal) <= G.kcal * 0.1).length;
      const weeks = Array.from({ length: 8 }, (_, i) => addDays(today, -7 * (7 - i)));
      const wk = weeks.map(w0 => st.days.filter(x => x > w0 && x <= addDays(w0, 7)).length);
      const water = Object.entries(d.water || {}).filter(([k]) => k > addDays(today, -30)).map(([, v]) => +v || 0);
      const ex30 = (d.exercises || []).filter(x => x.date > addDays(today, -30));
      const goalKg = P.goalWeight ? +P.goalWeight : null;
      const left = goalKg && st.lastW ? st.lastW.kg - goalKg : null;
      return '<div class="two">' +
        '<section class="panel"><h2>Poids</h2>' + (st.w.length ? weightSVG(st.w, goalKg) +
          '<div class="mini"><div><b>' + kg(st.first.kg) + '</b><span>départ (' + ddmm(st.first.date) + ')</span></div><div><b>' + kg(st.lastW.kg) + '</b><span>actuel (' + ddmm(st.lastW.date) + ')</span></div>' +
          '<div><b>' + (st.w.length > 1 ? sgn(st.lastW.kg - st.first.kg) + ' kg' : '—') + '</b><span>évolution</span></div><div><b>' + (left != null ? (Math.abs(left) < 0.05 ? 'Atteint' : n1(Math.abs(left)) + ' kg') : '—') + '</b><span>' + (goalKg ? 'reste vers ' + n1(goalKg) + ' kg' : 'pas d’objectif de poids') + '</span></div></div>'
          : '<p class="hint">Aucune pesée enregistrée.</p>') + '</section>' +
        '<section class="panel"><h2>Calories des 30 derniers jours</h2>' + kcalSVG(days30, st.byDay, G.kcal) +
          '<div class="mini"><div><b>' + (l30.length ? fk(st.avg(l30, 'kcal')) : '—') + '</b><span>kcal en moyenne (jours notés)</span></div><div><b>' + l30.length + ' / 30</b><span>jours notés</span></div>' +
          '<div><b>' + (l30.length ? inGoal : '—') + '</b><span>jours dans l’objectif (±10 %)</span></div></div><p class="hint">Touche une barre pour ouvrir ce jour dans le journal.</p></section></div>' +
        '<div class="two"><section class="panel"><h2>Moyennes sur 30 jours</h2>' +
          hbar('Protéines', st.avg(l30, 'p'), G.p, 'g') + hbar('Glucides', st.avg(l30, 'c'), G.c, 'g') + hbar('Lipides', st.avg(l30, 'f'), G.f, 'g') +
          hbar('Eau', water.length ? water.reduce((a, x) => a + x, 0) / water.length : 0, G.water, 'ml') +
          '<p class="hint">' + pl(ex30.length, 'activité') + ' sportive' + (ex30.length > 1 ? 's' : '') + ' · ' + fk(ex30.reduce((a, x) => a + (+x.kcal || 0), 0)) + ' kcal brûlées sur 30 jours</p></section>' +
        '<section class="panel"><h2>Régularité (8 dernières semaines)</h2>' + barsSVG(weeks.map(w0 => addDays(w0, 1)), wk, 'var(--brand)', 'Jours notés par semaine') +
          '<p class="hint">Nombre de jours notés chaque semaine (sur 7). Série en cours : ' + pl(st.cur, 'jour') + ', record : ' + pl(st.best, 'jour') + '.</p></section></div>';
    }
    if (utab === 'journal') {
      const ents = (d.entries || []).filter(e => e.date === jday).sort((a, c) => (a.ts || 0) - (c.ts || 0));
      const tot = st.byDay[jday] || { kcal: 0, p: 0, c: 0, f: 0, n: 0 };
      const ex = exByDay(d)[jday] || [], wt = (d.weights || []).find(w => w.date === jday), water = +(d.water || {})[jday] || 0;
      const all = st.days.slice().reverse().slice(0, 120);
      return '<section class="panel"><div class="daynav"><button class="btn outline mbtn" data-jd="' + addDays(jday, -1) + '" aria-label="Jour précédent">‹</button>' +
        '<input type="date" id="jdIn" value="' + esc(jday) + '" aria-label="Choisir un jour"><button class="btn outline mbtn" data-jd="' + addDays(jday, 1) + '" aria-label="Jour suivant">›</button>' +
        '<h2 class="dayname">' + esc(dayFR(jday, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</h2></div>' +
        '<div class="mini"><div><b>' + fk(tot.kcal) + '</b><span>kcal · objectif ' + fk(G.kcal) + '</span></div><div><b>' + fk(tot.p) + ' g</b><span>protéines</span></div><div><b>' + fk(tot.c) + ' g</b><span>glucides</span></div><div><b>' + fk(tot.f) + ' g</b><span>lipides</span></div>' +
        '<div><b>' + (water ? n1(water / 1000) + ' L' : '—') + '</b><span>eau</span></div><div><b>' + (wt ? kg(wt.kg) : '—') + '</b><span>pesée</span></div></div>' +
        (ents.length ? MEALS.map(([m, label]) => {
          const list = ents.filter(e => (e.meal || 'snack') === m); if (!list.length) return '';
          return '<div class="sec"><h3>' + label + ' · ' + fk(list.reduce((a, e) => a + (+e.kcal || 0), 0)) + ' kcal</h3><div class="tbl"><table><thead><tr><th>Aliment</th><th class="num">kcal</th><th class="num">Prot.</th><th class="num">Gluc.</th><th class="num">Lip.</th></tr></thead><tbody>' +
            list.map(e => '<tr><td class="food">' + esc(e.name) + (e.pending ? ' <span class="chip2 orange">scanné hors ligne</span>' : '') + '<small>' + esc([e.brand, e.key === 'quick' ? 'ajout rapide' : n1(e.amount) + ' ' + (e.unit || 'g') + (e.grams && e.unit !== 'g' && e.unit !== 'ml' ? ' (' + fk(e.grams) + ' g)' : '')].filter(Boolean).join(' · ')) + '</small></td><td class="num">' + fk(e.kcal) + '</td><td class="num">' + fk(e.p) + ' g</td><td class="num">' + fk(e.c) + ' g</td><td class="num">' + fk(e.f) + ' g</td></tr>').join('') +
            '</tbody></table></div></div>';
        }).join('') : '<p class="empty-d">Rien de noté ce jour-là.</p>') +
        (ex.length ? '<div class="sec"><h3>Activités</h3>' + ex.map(x => '<div class="kv"><span>' + esc(x.name || 'Activité') + (x.minutes ? ' · ' + x.minutes + ' min' : '') + '</span><b>−' + fk(x.kcal) + ' kcal</b></div>').join('') + '</div>' : '') + '</section>' +
        '<section class="panel"><h2>Tous les jours notés</h2>' + (all.length ? '<div class="tbl"><table class="click"><thead><tr><th>Jour</th><th class="num">kcal</th><th class="num">Prot.</th><th class="num">Gluc.</th><th class="num">Lip.</th><th class="num">Eau</th></tr></thead><tbody>' +
          all.map(x => { const t = st.byDay[x], wa = +(d.water || {})[x] || 0; return '<tr data-jd="' + x + '"' + (x === jday ? ' class="on"' : '') + '><td class="nw">' + esc(dayFR(x, { weekday: 'short' }) + ' ' + ddmm(x) + (x.slice(0, 4) !== day(Date.now()).slice(0, 4) ? '/' + x.slice(2, 4) : '')) + '</td><td class="num">' + fk(t.kcal) + '</td><td class="num">' + fk(t.p) + ' g</td><td class="num">' + fk(t.c) + ' g</td><td class="num">' + fk(t.f) + ' g</td><td class="num">' + (wa ? n1(wa / 1000) + ' L' : '—') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' + (st.days.length > 120 ? '<p class="hint">Les 120 derniers jours sont affichés ; l’export contient tout.</p>' : '') : '<p class="hint">Aucun jour noté.</p>') + '</section>';
    }
    if (utab === 'sport') {
      const sp = d.sport || {}, pr = sp.prefs, plan = sp.plan, ws = (d.workouts || []).slice().sort((a, b) => (b.date + (b.end || '')).localeCompare(a.date + (a.end || '')));
      const m30 = ws.filter(w => w.date > addDays(day(Date.now()), -30));
      return '<div class="two"><section class="panel"><h2>Programme</h2>' + (pr && plan ?
          '<div class="kv"><span>Objectif</span><b>' + esc(SPG[pr.goal] || pr.goal) + '</b></div><div class="kv"><span>Lieu</span><b>' + esc(SPP[pr.place] || pr.place) + '</b></div>' +
          '<div class="kv"><span>Jours</span><b>' + esc((pr.days || []).map(x => WDN[x]).join(', ')) + ' · ' + pr.dur + ' min</b></div><div class="kv"><span>Niveau</span><b>' + ['', 'Débutant', 'Intermédiaire', 'Avancé'][pr.level || 1] + '</b></div>' +
          ((pr.pain || []).length ? '<div class="kv"><span>Douleurs</span><b>' + esc(pr.pain.map(x => ({ k: 'genoux', b: 'dos', s: 'épaules', w: 'poignets' })[x]).join(', ')) + '</b></div>' : '') +
          plan.sessions.map(s => '<div class="sec"><h3>' + esc(s.key + ' · ' + s.name) + '</h3><p class="hint">' + esc(s.items.map(it => (EXN[it.ex] || it.ex) + ' ' + (it.sets > 1 ? it.sets + '×' : '') + it.reps).join(' · ')) + '</p></div>').join('')
          : '<p class="hint">Pas encore de programme.</p>') + '</section>' +
        '<section class="panel"><h2>Séances <span class="chip2">' + ws.length + '</span></h2>' +
          '<div class="mini"><div><b>' + m30.length + '</b><span>séances (30 j)</span></div><div><b>' + fk(m30.reduce((a, w) => a + (w.vol || 0), 0)) + '</b><span>kg soulevés (30 j)</span></div><div><b>' + fk(m30.reduce((a, w) => a + (w.kcal || 0), 0)) + '</b><span>kcal (30 j)</span></div></div>' +
          (ws.length ? '<div class="tbl"><table><thead><tr><th>Jour</th><th>Séance</th><th class="num">Durée</th><th class="num">Séries</th><th class="num">Volume</th></tr></thead><tbody>' +
            ws.slice(0, 40).map(w => '<tr><td class="nw">' + esc(dayFR(w.date, { day: 'numeric', month: 'short' })) + '</td><td class="wrap">' + esc(w.name) + '</td><td class="num">' + Math.round((w.dur || 0) / 60) + ' min</td><td class="num">' + (w.items || []).reduce((a, i) => a + (i.sets || []).filter(x => x.done).length, 0) + '</td><td class="num">' + fk(w.vol) + ' kg</td></tr>').join('') +
            '</tbody></table></div>' : '<p class="hint">Aucune séance faite.</p>') + '</section></div>';
    }
    if (utab === 'meals') {
      const c = d.cook || {}, pr = c.prefs, wk = c.week;
      const DIETN = { omni: 'Mange de tout (sans porc)', pesco: 'Poisson, pas de viande', vege: 'Végétarien', vegan: 'Végan' };
      return '<div class="two"><section class="panel"><h2>Goûts</h2>' + (pr ?
          '<div class="kv"><span>Alimentation</span><b>' + esc(DIETN[pr.diet] || pr.diet) + '</b></div>' +
          ((pr.avoid || []).length ? '<div class="kv"><span>Évite</span><b>' + esc(pr.avoid.join(', ')) + '</b></div>' : '') +
          '<div class="kv"><span>Temps max</span><b>' + (pr.time ? pr.time + ' min' : 'peu importe') + '</b></div><div class="kv"><span>Personnes</span><b>' + (pr.people || 1) + '</b></div>' +
          '<div class="kv"><span>Recettes favorites</span><b>' + esc((c.favs || []).map(id => (RCP[id] || {}).n || id).join(', ') || '—') + '</b></div>'
          : '<p class="hint">Questionnaire pas encore rempli.</p>') + '</section>' +
        '<section class="panel"><h2>Menu de la semaine</h2>' + (wk ? Object.keys(wk.days).sort().map(dd => '<div class="sec"><h3>' + esc(dayFR(dd, { weekday: 'long', day: 'numeric', month: 'short' })) + '</h3>' +
          Object.keys(wk.days[dd]).map(sl => '<div class="kv"><span>' + esc(SLN[sl] || sl) + '</span><b>' + esc((RCP[wk.days[dd][sl].id] || {}).n || wk.days[dd][sl].id) + '</b></div>').join('') + '</div>').join('')
          : '<p class="hint">Pas de menu créé.</p>') + '</section></div>';
    }
    if (utab === 'data') {
      const prods = Object.values(d.products || {}), mine = prods.filter(p => p && (p.source === 'custom' || p.manual));
      const pname = k => { const p = (d.products || {})[k]; return p ? p.name : String(k).replace(/^gen-/, '').replace(/-/g, ' '); };
      const wr = d.warn || {};
      return '<div class="two"><section class="panel"><h2>Profil</h2>' + (d.profile ? [
          ['Prénom', P.name], ['Sexe', P.sex === 'f' ? 'Femme' : P.sex === 'm' ? 'Homme' : ''], ['Âge', P.age ? P.age + ' ans' : ''], ['Taille', P.height ? P.height + ' cm' : ''],
          ['Poids au départ', P.weight ? kg(P.weight) : ''], ['Objectif', GOAL_TXT[P.goal] || ''], ['Poids visé', P.goalWeight ? kg(P.goalWeight) : ''],
          ['Rythme', P.rate ? n1(P.rate) + ' kg / semaine' : ''], ['Activité', ACT_TXT[P.activity] || P.activity || '']
        ].filter(x => x[1]).map(x => '<div class="kv"><span>' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>').join('') : '<p class="hint">Profil pas rempli (il a passé le questionnaire).</p>') + '</section>' +
        '<section class="panel"><h2>Objectifs</h2><div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr))">' +
        [['kcal', 'kcal'], ['p', 'Prot. (g)'], ['c', 'Gluc. (g)'], ['f', 'Lip. (g)'], ['water', 'Eau (ml)']].map(x => '<div class="field"><label for="g_' + x[0] + '">' + x[1] + '</label><input id="g_' + x[0] + '" inputmode="numeric" value="' + esc(G[x[0]] != null ? Math.round(G[x[0]]) : '') + '"></div>').join('') +
        '</div><div class="acts"><button class="btn primary mbtn" data-a="goals">Modifier ses objectifs</button></div><p class="hint">Il recevra les nouveaux objectifs à sa prochaine ouverture de l’appli.</p></section></div>' +
        '<div class="two"><section class="panel"><h2>Ses aliments créés <span class="chip2">' + mine.length + '</span></h2>' + (mine.length ? '<div class="tbl"><table><thead><tr><th>Aliment</th><th class="num">kcal / 100</th><th class="num">P</th><th class="num">G</th><th class="num">L</th></tr></thead><tbody>' +
          mine.map(p => { const c = p.per100 || {}; return '<tr><td class="wrap">' + esc(p.name) + (p.code ? ' <small class="hint">' + esc(p.code) + '</small>' : '') + '</td><td class="num">' + fk(c.kcal) + '</td><td class="num">' + n1(c.p) + '</td><td class="num">' + n1(c.c) + '</td><td class="num">' + n1(c.f) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="hint">Aucun.</p>') + '</section>' +
        '<section class="panel"><h2>Favoris et réglages</h2>' + ((d.favorites || []).length ? '<div class="tags">' + d.favorites.map(k => '<span class="chip2">' + esc(pname(k)) + '</span>').join('') + '</div>' : '<p class="hint">Pas de favori.</p>') +
          '<div class="kv"><span>Produits gardés sur le téléphone</span><b>' + prods.length + '</b></div><div class="kv"><span>Thème</span><b>' + ({ auto: 'Automatique', light: 'Clair', dark: 'Sombre' }[d.theme] || '—') + '</b></div>' +
          '<div class="kv"><span>Avertissements d’ingrédients</span><b>' + (wr.on === false ? 'Désactivés' : 'Activés') + '</b></div></section></div>';
    }
    if (utab === 'backups') {
      return '<div class="two"><section class="panel"><h2>Sauvegarde actuelle</h2>' + (b ?
          '<div class="kv"><span>Enregistrée</span><b>' + esc(dt(b.updated_at)) + '</b></div><div class="kv"><span>Par</span><b>' + (b.device === 'admin' ? 'toi (admin)' : 'son téléphone') + '</b></div>' +
          '<div class="kv"><span>Contenu</span><b>' + pl((d.entries || []).length, 'aliment') + ' · ' + pl(st.days.length, 'jour') + ' · ' + pl(st.w.length, 'pesée') + '</b></div><div class="kv"><span>Taille</span><b>' + bytes(JSON.stringify(d).length) + '</b></div>' +
          '<div class="acts"><button class="btn primary" data-a="dl"><svg class="ic sm"><use href="#i-download"/></svg>Exporter (JSON)</button><button class="btn outline" data-a="csv">Journal (CSV)</button></div>'
          : '<p class="hint">Aucune sauvegarde en ligne pour l’instant.</p>') +
        '<div class="sec"><h3>Restaurer</h3><p class="hint">Remplace sa sauvegarde par un fichier exporté (le sien, ou une sauvegarde complète de tous les comptes). L’ancienne version est gardée dans l’historique. Son téléphone lui proposera de récupérer les données à la prochaine ouverture.</p>' +
          '<div class="acts" style="margin-top:8px"><button class="btn outline" data-a="up"><svg class="ic sm"><use href="#i-upload"/></svg>Restaurer depuis un fichier</button>' + (b ? '<button class="btn danger" data-a="delbackup">Effacer sa sauvegarde</button>' : '') + '</div></div></section>' +
        '<section class="panel"><h2>Versions précédentes <span class="chip2">' + hist.length + '</span></h2>' + (hist.length ? hist.map(h =>
          '<div class="ver"><span>' + esc(dt(h.saved_at)) + '<br><small class="hint">' + pl(h.entries_count, 'aliment') + '</small></span><button class="btn outline" data-a="vdl" data-v="' + h.id + '">Exporter</button><button class="btn outline" data-a="vrs" data-v="' + h.id + '">Restaurer</button></div>').join('')
          : '<p class="hint">Une version est gardée automatiquement toutes les 6 heures au maximum (30 au total).</p>') + '</section></div>';
    }
    if (utab === 'account') {
      const uev = eventsOf(u.id), msgs = messages.filter(m => m.user_id === u.id || !m.user_id);
      const banned = isBanned(u);
      return '<div class="two"><section class="panel"><h2>Compte</h2>' +
        '<div class="kv"><span>E-mail</span><b>' + esc(u.email) + '</b></div><div class="kv"><span>Connexion</span><b>' + (u.provider === 'google' ? 'Google' : 'E-mail et mot de passe') + '</b></div>' +
        '<div class="kv"><span>Inscription</span><b>' + esc(dt(u.created_at)) + '</b></div><div class="kv"><span>Dernière connexion</span><b>' + esc(dt(u.last_sign_in_at)) + '</b></div>' +
        '<div class="kv"><span>Dernière sauvegarde</span><b>' + esc(dt(u.updated_at)) + '</b></div><div class="kv"><span>Accord sauvegarde en ligne</span><b>' + esc(u.consent_at ? dt(u.consent_at) : 'non enregistré') + '</b></div>' +
        '<div class="kv"><span>Dernier appareil</span><b>' + (uev.length ? esc(device((uev[0] || {}).ua) || '—') : '<span class="hint">à sa prochaine ouverture</span>') + '</b></div>' +
        (uev.length ? '<div class="kv"><span>Tous les appareils</span><b>' + esc([...new Set(uev.map(e => device(e.ua)).filter(Boolean))].join(', ') || '—') + '</b></div>' : '') +
        '<div class="kv"><span>Dernière IP</span><b style="font-size:13px">' + (uev.some(e => e.ip) ? esc((uev.find(e => e.ip) || {}).ip) : '<span class="hint">à sa prochaine ouverture</span>') + '</b></div>' +
        (uev.filter(e => e.ip).length > 1 ? '<div class="kv"><span>Toutes les IP (30 j)</span><b style="font-size:12px">' + esc([...new Set(uev.map(e => e.ip).filter(Boolean))].slice(0, 12).join(', ')) + '</b></div>' : '') +
        '<div class="kv"><span>Identifiant</span><b style="font-size:12px">' + esc(u.id) + '</b></div>' +
        '<div class="acts"><button class="btn ' + (banned ? 'primary' : 'outline') + '" data-a="ban">' + (banned ? 'Débloquer le compte' : 'Bloquer le compte') + '</button>' +
        (u.provider !== 'google' ? '<button class="btn outline" data-a="reset">Envoyer un lien de mot de passe</button>' : '') +
        '<button class="btn danger" data-a="deluser"><svg class="ic sm"><use href="#i-trash"/></svg>Supprimer le compte</button></div></section>' +
        '<section class="panel"><h2>Note privée</h2><textarea id="uNote" placeholder="Visible seulement par toi">' + esc(u.note || '') + '</textarea>' +
        '<div class="acts"><label class="check" style="flex:1;align-items:center"><input type="checkbox" id="uFlag"' + (u.flagged ? ' checked' : '') + '><span>Signaler ce compte</span></label><button class="btn primary mbtn" data-a="note">Enregistrer</button></div>' +
        '<h2 style="margin-top:8px">Lui écrire</h2><div class="field"><input id="mTitle" type="text" placeholder="Titre"></div><textarea id="mBody" placeholder="Message affiché dans son appli à la prochaine ouverture"></textarea>' +
        '<div class="acts"><button class="btn primary mbtn" data-a="msg">Envoyer</button></div>' +
        (msgs.length ? '<div class="sec"><h3>Messages reçus</h3>' + msgs.map(m => '<div class="kv"><span>' + esc(m.title) + (m.user_id ? '' : ' <small class="hint">(à tous)</small>') + '</span><b>' + (reads.some(r => r.message_id === m.id && r.user_id === u.id) ? 'Lu' : 'Pas encore lu') + '</b></div>').join('') + '</div>' : '') + '</section></div>';
    }
    const uev = eventsOf(u.id), uerr = uev.filter(e => ERR_TYPES.includes(e.type));
    return '<div class="two"><section class="panel"><h2>Erreurs (30 j) <span class="chip2' + (uerr.length ? ' red' : ' green') + '">' + uerr.length + '</span></h2>' + (uerr.length ? '<div class="feed">' + uerr.slice(0, 30).map(evRow).join('') + '</div>' : '<p class="hint">Aucune erreur.</p>') + '</section>' +
      '<section class="panel"><h2>Activité (30 j)</h2>' + (uev.length ? '<div class="feed">' + uev.slice(0, 80).map(evRow).join('') + '</div>' : '<p class="hint">Aucune activité enregistrée (suivi refusé ou appli pas encore ouverte).</p>') + '</section></div>';
  }
  function evRow(e) {
    const err = ERR_TYPES.includes(e.type);
    return '<div class="ev"><time>' + esc(short(e.created_at)) + '</time><div class="min0"><b' + (err ? ' style="color:var(--danger)"' : '') + '>' + esc(TYPE_LABEL[e.type] || e.type) + '</b>' +
      (view !== 'users' ? ' · ' + esc(who(e)) : '') + '<small>' + esc([evDetail(e), e.ua ? device(e.ua) : '', e.ip ? 'IP ' + e.ip : '', e.version ? 'v' + e.version : ''].filter(Boolean).join(' · ')) + '</small></div></div>';
  }
  function csvOf(d) {
    const num = v => String(Math.round((+v || 0) * 10) / 10).replace('.', ',');
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const meal = Object.fromEntries(MEALS);
    const rows = [['Date', 'Repas', 'Aliment', 'Marque', 'Quantité', 'Unité', 'Grammes', 'kcal', 'Protéines (g)', 'Glucides (g)', 'Lipides (g)']];
    (d.entries || []).slice().sort((a, c) => (a.date + String(a.ts || 0)).localeCompare(c.date + String(c.ts || 0))).forEach(e => rows.push([e.date, meal[e.meal] || e.meal, e.name, e.brand, e.key === 'quick' ? '' : num(e.amount), e.key === 'quick' ? '' : e.unit, num(e.grams), num(e.kcal), num(e.p), num(e.c), num(e.f)]));
    (d.weights || []).forEach(w => rows.push([w.date, 'Pesée', '', '', num(w.kg), 'kg', '', '', '', '', '']));
    Object.entries(d.water || {}).forEach(([k, v]) => rows.push([k, 'Eau', '', '', num(v), 'ml', '', '', '', '', '']));
    (d.exercises || []).forEach(x => rows.push([x.date, 'Activité', x.name, '', num(x.minutes), 'min', '', '-' + num(x.kcal), '', '', '']));
    return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
  }
  function downloadText(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // Écrit la sauvegarde d'un compte (crée la ligne si elle avait été effacée) ; l'ancienne version part dans l'historique
  async function saveBackup(u, data, label, quiet) {
    await C.req('/rest/v1/backups?on_conflict=user_id', { method: 'POST', auth: true, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: u.id, email: u.email, name: (data.profile && data.profile.name) || u.name || null, data, entries_count: (data.entries || []).length, device: 'admin', updated_at: new Date().toISOString() } });
    if (!quiet) { toast(label); await loadAll(); }
  }
  const isState = x => x && typeof x === 'object' && Array.isArray(x.entries);
  async function onDetail(ev) {
    const btn = ev.target.closest('[data-a]'); if (!btn || !ucache) return;
    const { id, u, b, d } = ucache;
    const a = btn.dataset.a;
    try {
      if (a === 'ban') {
        const ban = !isBanned(u);
        if (ban && !arm(btn, 'Confirmer le blocage ?')) return;
        await rpc('admin_set_ban', { target: id, ban }); toast(ban ? 'Compte bloqué' : 'Compte débloqué'); await loadAll();
      } else if (a === 'reset') { await C.recover(u.email, location.origin + location.pathname.replace(/admin\.html$/, '')); toast('Lien envoyé à ' + u.email); }
      else if (a === 'deluser') {
        if (!arm(btn, 'Appuie encore : suppression définitive')) return;
        await rpc('admin_delete_user', { target: id }); current = null; ucache = null; toast('Compte supprimé'); await loadAll();
      } else if (a === 'note') {
        await C.req('/rest/v1/user_admin?on_conflict=user_id', { method: 'POST', auth: true, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: { user_id: id, note: $('#uNote').value, flagged: $('#uFlag').checked, updated_at: new Date().toISOString() } });
        toast('Note enregistrée'); await loadAll();
      } else if (a === 'msg') {
        const title = $('#mTitle').value.trim(), body = $('#mBody').value.trim();
        if (!title || !body) { toast('Écris un titre et un message'); return; }
        await C.req('/rest/v1/messages', { method: 'POST', auth: true, headers: { Prefer: 'return=minimal' }, body: { user_id: id, title, body } });
        toast('Message envoyé'); await loadAll();
      } else if (a === 'goals') {
        if (!b) return;
        const data = JSON.parse(JSON.stringify(d));
        data.goals = Object.assign({}, data.goals || {});
        ['kcal', 'p', 'c', 'f', 'water'].forEach(k => { const v = parseFloat(String($('#g_' + k).value).replace(',', '.')); if (isFinite(v) && v >= 0) data.goals[k] = Math.round(v); });
        data.metaT = Date.now();
        await saveBackup(u, data, 'Objectifs modifiés : il les recevra à sa prochaine ouverture');
      } else if (a === 'dl') { if (b) download('nutriscan-' + slugName(u) + '-' + day(Date.now()) + '.json', d); }
      else if (a === 'csv') { if (b) downloadText('nutriscan-' + slugName(u) + '-journal-' + day(Date.now()) + '.csv', csvOf(d), 'text/csv;charset=utf-8'); }
      else if (a === 'up') { $('#fileIn').dataset.mode = 'user'; $('#fileIn').click(); }
      else if (a === 'delbackup') {
        if (!arm(btn, 'Appuie encore pour effacer')) return;
        await C.req('/rest/v1/backups?user_id=eq.' + id, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
        toast('Sauvegarde effacée'); await loadAll();
      } else if (a === 'vdl' || a === 'vrs') {
        const r = await C.req('/rest/v1/backup_history?select=data,saved_at&id=eq.' + btn.dataset.v, { auth: true });
        if (!r || !r[0]) { toast('Version introuvable'); return; }
        if (a === 'vdl') download('nutriscan-' + slugName(u) + '-version-' + day(r[0].saved_at) + '.json', r[0].data);
        else { if (!arm(btn, 'Confirmer ?')) return; await saveBackup(u, r[0].data, 'Version du ' + dt(r[0].saved_at) + ' restaurée'); }
      }
    } catch (e) { toast(e.message); }
  }
  async function exportAll() {
    const rows = await C.req('/rest/v1/backups?select=user_id,email,name,data,entries_count,device,updated_at', { auth: true });
    const out = { app: 'NutriScan', exported_at: new Date().toISOString(), accounts: users.length, users: (rows || []).map(r => Object.assign({}, r, { account: userById(r.user_id) ? { email: userById(r.user_id).email, created_at: userById(r.user_id).created_at, provider: userById(r.user_id).provider } : null })) };
    download('nutriscan-tous-les-comptes-' + day(Date.now()) + '.json', out);
    toast(pl(out.users.length, 'sauvegarde') + ' exportée' + (out.users.length > 1 ? 's' : ''));
  }
  function showRestoreAll(file) {
    const box = $('#restoreAllBox'); if (!box) return;
    const list = (file.users || []).filter(r => r && r.user_id && isState(r.data));
    const ok = list.filter(r => userById(r.user_id)), gone = list.length - ok.length;
    pendingAll = ok;
    box.innerHTML = '<div class="msg"><b>Sauvegarde complète du ' + esc(dt(file.exported_at)) + '</b><p style="margin-top:6px">' + pl(list.length, 'compte') + ' dans le fichier, ' + ok.length + ' existe' + (ok.length > 1 ? 'nt' : '') + ' encore' + (gone ? ' (' + gone + ' supprimé' + (gone > 1 ? 's' : '') + ' depuis, ignoré' + (gone > 1 ? 's' : '') + ')' : '') + '. Chaque sauvegarde actuelle sera remplacée ; l’ancienne reste dans son historique.</p>' +
      '<div class="acts" style="margin-top:10px"><button class="btn primary" data-x="restoreAllGo"' + (ok.length ? '' : ' disabled') + '>Restaurer ' + pl(ok.length, 'compte') + '</button><button class="btn outline" data-x="restoreAllCancel">Annuler</button></div></div>';
  }
  async function restoreAllGo(btn) {
    if (!pendingAll || !pendingAll.length) return;
    if (!arm(btn, 'Appuie encore pour confirmer')) return;
    let n = 0;
    for (const r of pendingAll) { try { await saveBackup(userById(r.user_id), r.data, '', true); n++; } catch (e) { toast(e.message); } }
    pendingAll = null; toast(pl(n, 'compte') + ' restauré' + (n > 1 ? 's' : '')); await loadAll();
  }

  /* ---------- Erreurs ---------- */
  function errorsHTML() {
    const errs = events.filter(e => ERR_TYPES.includes(e.type));
    const groups = {};
    errs.forEach(e => {
      const d = e.data || {};
      const key = e.type + '|' + String(d.msg || d.message || d.name || '').slice(0, 160);
      const g = groups[key] = groups[key] || { type: e.type, msg: d.msg || d.message || d.name || '(sans message)', items: [], devices: new Set(), users: new Set(), versions: new Set() };
      g.items.push(e); g.devices.add(e.device); const ou = e.user_id || owner[e.device]; if (ou) g.users.add(ou); if (e.version) g.versions.add(e.version);
    });
    const list = Object.values(groups).sort((a, b) => b.items.length - a.items.length);
    return '<section class="panel"><h2>Erreurs des 30 derniers jours <span class="chip2' + (errs.length ? ' red' : ' green') + '">' + pl(errs.length, 'erreur') + '</span></h2>' +
      (list.length ? list.map((g, i) => {
        const s = g.items[0], d = s.data || {};
        return '<div class="err"><div class="err-top"><div class="min0"><b>' + esc(TYPE_LABEL[g.type] || g.type) + ' · ' + esc(g.msg) + '</b>' +
          '<p class="hint">' + fk(g.items.length) + ' fois' + ' · ' + pl(g.devices.size, 'appareil') + ' · ' + pl(g.users.size, 'compte') + ' · dernière ' + esc(ago(s.created_at)) +
          (g.versions.size ? ' · version ' + esc([...g.versions].join(', ')) : '') + '</p>' +
          '<p class="hint">' + esc([...new Set(g.items.map(e => device(e.ua)))].join(', ')) + '</p></div>' +
          '<button class="btn outline mbtn" data-eg="' + i + '">Marquer corrigée</button></div>' +
          ((d.stack || d.src) ? '<pre>' + esc((d.src ? d.src + ':' + (d.line || '') + ':' + (d.col || '') + '\n' : '') + (d.stack || '')) + '</pre>' : '') + '</div>';
      }).join('') : '<p class="empty-d">Aucune erreur. 🎉</p>') + '</section>' +
      '<p class="hint">« Marquer corrigée » efface ces rapports, pour voir tout de suite si l’erreur revient après ton correctif.</p>';
  }
  function errGroups() {
    const errs = events.filter(e => ERR_TYPES.includes(e.type)), groups = {};
    errs.forEach(e => { const d = e.data || {}; const key = e.type + '|' + String(d.msg || d.message || d.name || '').slice(0, 160); (groups[key] = groups[key] || { items: [] }).items.push(e); });
    return Object.values(groups).sort((a, b) => b.items.length - a.items.length);
  }

  /* ---------- Activité ---------- */
  function activityHTML() {
    const types = ['all'].concat([...new Set(events.map(e => e.type))]);
    const list = events.filter(e => afilter === 'all' || e.type === afilter).slice(0, 300);
    return '<section class="panel"><h2>Activité récente</h2><div class="filters" style="padding:0">' +
      types.map(t => '<button data-af="' + esc(t) + '"' + (afilter === t ? ' class="on"' : '') + '>' + esc(t === 'all' ? 'Tout' : (TYPE_LABEL[t] || t)) + '</button>').join('') + '</div>' +
      (list.length ? '<div class="feed">' + list.map(evRow).join('') + '</div>' : '<p class="empty-d">Aucune activité enregistrée pour l’instant.</p>') + '</section>';
  }

  /* ---------- Messages ---------- */
  function suggestionsHTML() {
    const TLAB = { suggestion: 'Suggestion', probleme: 'Problème', autre: 'Autre' };
    const TCOL = { suggestion: '', probleme: 'orange', autre: '' };
    const open = feedback.filter(f => !f.handled), done = feedback.filter(f => f.handled);
    const card = f => {
      const u = f.user_id && userById(f.user_id);
      const who = u ? (u.name ? u.name + ' · ' + u.email : u.email) : (f.email || (f.device ? 'Appareil ' + f.device.slice(0, 8) : 'Anonyme'));
      return '<div class="fb' + (f.handled ? ' done' : '') + '"><div class="fb-h"><span class="chip2 ' + (TCOL[f.type] || '') + '">' + esc(TLAB[f.type] || f.type || 'Autre') + '</span>' +
        '<small class="hint">' + esc(who) + ' · ' + esc(dt(f.created_at)) + (f.ip ? ' · IP ' + esc(f.ip) : '') + (f.version ? ' · v' + esc(f.version) : '') + '</small></div>' +
        '<p class="fb-msg">' + esc(f.message || '') + '</p>' +
        '<div class="acts">' + (f.handled
          ? '<button class="btn outline mbtn" data-sg="undone" data-id="' + f.id + '">Rouvrir</button>'
          : '<button class="btn primary mbtn" data-sg="done" data-id="' + f.id + '">Marquer traité</button>') +
        '<button class="btn danger mbtn" data-sg="del" data-id="' + f.id + '">Supprimer</button></div></div>';
    };
    return '<div class="two"><section class="panel"><h2>À traiter <span class="chip2' + (open.length ? ' orange' : ' green') + '">' + open.length + '</span></h2>' +
      (open.length ? open.map(card).join('') : '<p class="hint">Aucun message en attente. 🎉</p>') + '</section>' +
      '<section class="panel"><h2>Traités <span class="chip2">' + done.length + '</span></h2>' +
      (done.length ? done.slice(0, 100).map(card).join('') : '<p class="hint">Rien pour l’instant.</p>') + '</section></div>';
  }
  function messagesHTML() {
    const readCount = id => reads.filter(r => r.message_id === id).length;
    return '<div class="two"><section class="panel"><h2>Nouveau message</h2>' +
      '<div class="field"><label for="nmTo">Destinataire</label><select id="nmTo"><option value="">Tous les utilisateurs</option>' +
      users.map(u => '<option value="' + esc(u.id) + '">' + esc((u.name ? u.name + ' · ' : '') + u.email) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="nmTitle">Titre</label><input id="nmTitle" type="text" placeholder="ex. Nouvelle version disponible"></div>' +
      '<div class="field"><label for="nmBody">Message</label><textarea id="nmBody" placeholder="Il s’affichera dans l’appli à la prochaine ouverture"></textarea></div>' +
      '<button class="btn primary" data-m="send">Envoyer</button></section>' +
      '<section class="panel"><h2>Messages envoyés</h2>' + (messages.length ? messages.map(m => {
        const u = m.user_id && userById(m.user_id);
        return '<div class="ver"><span><b>' + esc(m.title) + '</b><br><small class="hint">' + esc(u ? 'À ' + (u.name || u.email) : 'À tous') + ' · ' + esc(dt(m.created_at)) + ' · lu ' + fk(readCount(m.id)) + ' fois' + '</small></span>' +
          '<button class="btn danger mbtn" data-m="del" data-id="' + m.id + '">Supprimer</button></div>';
      }).join('') : '<p class="hint">Aucun message envoyé.</p>') + '</section></div>';
  }

  /* ---------- Événements ---------- */
  $('#nav').addEventListener('click', ev => { const b = ev.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; render(); });
  $('#view').addEventListener('click', async ev => {
    const uB = ev.target.closest('[data-u]'); if (uB) { current = null; openUser(uB.dataset.u); window.scrollTo(0, 0); return; }
    const fB = ev.target.closest('[data-f]'); if (fB) { ufilter = fB.dataset.f; $$('[data-f]').forEach(x => x.classList.toggle('on', x === fB)); renderList(); return; }
    const aF = ev.target.closest('[data-af]'); if (aF) { afilter = aF.dataset.af; render(); return; }
    const x = ev.target.closest('[data-x]');
    if (x) {
      const k = x.dataset.x;
      if (k === 'back') { current = null; ucache = null; render(); window.scrollTo(0, 0); }
      else if (k === 'exportAll') exportAll().catch(e => toast(e.message));
      else if (k === 'restoreAll') { $('#fileIn').dataset.mode = 'all'; $('#fileIn').click(); }
      else if (k === 'restoreAllCancel') { pendingAll = null; $('#restoreAllBox').innerHTML = ''; }
      else if (k === 'restoreAllGo') restoreAllGo(x);
      return;
    }
    const ut = ev.target.closest('[data-ut]'); if (ut && ucache) { utab = ut.dataset.ut; renderUser(); return; }
    const jd = ev.target.closest('[data-jd]'); if (jd && ucache) { jday = jd.dataset.jd; utab = 'journal'; renderUser(); return; }
    if (ev.target.closest('#upage')) { onDetail(ev); return; }
    const eg = ev.target.closest('[data-eg]');
    if (eg) {
      const g = errGroups()[+eg.dataset.eg]; if (!g) return;
      if (!arm(eg, 'Confirmer ?')) return;
      try {
        const ids = g.items.map(e => e.id);
        for (let i = 0; i < ids.length; i += 100) await C.req('/rest/v1/events?id=in.(' + ids.slice(i, i + 100).join(',') + ')', { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
        toast('Erreur marquée comme corrigée'); await loadAll();
      } catch (e) { toast(e.message); }
      return;
    }
    const m = ev.target.closest('[data-m]');
    if (m) {
      try {
        if (m.dataset.m === 'send') {
          const title = $('#nmTitle').value.trim(), body = $('#nmBody').value.trim(), to = $('#nmTo').value || null;
          if (!title || !body) { toast('Écris un titre et un message'); return; }
          await C.req('/rest/v1/messages', { method: 'POST', auth: true, headers: { Prefer: 'return=minimal' }, body: { user_id: to, title, body } });
          toast(to ? 'Message envoyé' : 'Message envoyé à tout le monde'); await loadAll();
        } else if (m.dataset.m === 'del') {
          if (!arm(m, 'Confirmer ?')) return;
          await C.req('/rest/v1/messages?id=eq.' + m.dataset.id, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
          toast('Message supprimé'); await loadAll();
        }
      } catch (e) { toast(e.message); }
    }
    const sg = ev.target.closest('[data-sg]');
    if (sg) {
      try {
        if (sg.dataset.sg === 'done' || sg.dataset.sg === 'undone') {
          const h = sg.dataset.sg === 'done';
          await C.req('/rest/v1/feedback?id=eq.' + sg.dataset.id, { method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' }, body: { handled: h } });
          const f = feedback.find(x => String(x.id) === String(sg.dataset.id)); if (f) f.handled = h;
          render(); updateBadges();
        } else if (sg.dataset.sg === 'del') {
          if (!arm(sg, 'Confirmer ?')) return;
          await C.req('/rest/v1/feedback?id=eq.' + sg.dataset.id, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
          feedback = feedback.filter(x => String(x.id) !== String(sg.dataset.id));
          toast('Supprimé'); render(); updateBadges();
        }
      } catch (e) { toast(e.message); }
    }
  });
  $('#view').addEventListener('input', ev => { if (ev.target.id === 'q') renderList(); });
  $('#view').addEventListener('change', ev => { if (ev.target.id === 'jdIn' && ev.target.value && ucache) { jday = ev.target.value; renderUser(); } });
  // Infobulle des graphiques (survol à la souris, toucher sur téléphone)
  const tip = document.createElement('div'); tip.id = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  function showTip(ev) {
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.getAttribute('data-tip'); tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, ev.clientX - tip.offsetWidth / 2));
    tip.style.left = x + 'px'; tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 14) + 'px';
  }
  $('#view').addEventListener('pointermove', showTip);
  $('#view').addEventListener('pointerdown', showTip);
  $('#view').addEventListener('pointerleave', () => { tip.hidden = true; });
  window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  $('#fileIn').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0], mode = ev.target.dataset.mode; ev.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const file = JSON.parse(r.result);
        if (mode === 'all') { if (!file || !Array.isArray(file.users)) throw new Error('format'); showRestoreAll(file); return; }
        if (!ucache) return;
        // Fichier d'un seul compte, ou sauvegarde complète : on prend la partie de ce compte
        let data = isState(file) ? file : null;
        if (!data && file && Array.isArray(file.users)) { const row = file.users.find(x => x && x.user_id === ucache.id); if (!row) throw new Error('Ce compte n’est pas dans ce fichier'); data = row.data; }
        if (!isState(data)) throw new Error('format');
        await saveBackup(ucache.u, data, 'Sauvegarde restaurée : ' + pl(data.entries.length, 'aliment'));
      } catch (e) { toast(e.message === 'format' ? 'Ce fichier n’est pas une sauvegarde NutriScan' : e.message); }
    };
    r.readAsText(f);
  });
  $('#reload').addEventListener('click', () => loadAll().then(() => toast('Données à jour')).catch(e => toast(e.message)));
  $('#logout').addEventListener('click', async () => { await C.signOut(); users = []; events = []; current = null; ucache = null; $('#who').textContent = 'Console d’administration'; show('login'); });
  $('#lGoogle').addEventListener('click', () => C.oauth('google', location.origin + location.pathname));
  $('#login').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#lErr');
    try { err.hidden = true; await C.signIn($('#lEmail').value.trim(), $('#lPass').value); await start(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  start();
})();
