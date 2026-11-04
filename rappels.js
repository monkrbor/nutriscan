/* NutriScan — rappels (notifications push) : réglages dans Profil → Rappels.
   Les réglages font partie des données du compte (S.remind, synchronisés). Chaque appareil qui active les notifications
   s'abonne (push_subs) ; le serveur (fonction « rappels ») envoie ce qui est dû, sauf si c'est déjà noté. */
(function () {
  'use strict';
  const A = window.NS_APP, C = window.NS_CLOUDAPI;
  if (!A) return;
  const { esc, ic, $ } = A;
  const FN = '/functions/v1/rappels';
  const DKEY = 'nutriscan.push';
  const DEF = { on: false, bk: '08:00', lu: '12:30', di: '19:30', sn: '', water: true, weigh: 1, wT: '08:00', sport: [], sT: '18:00', report: true, streak: true, t: 0 };
  const DAYS = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']];
  const DAYS_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const R = () => A.S.remind;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* rien */ } } };

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone);
  const lang = () => (A.lang ? A.lang() : 'fr');
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch (e) { return 'Europe/Paris'; } };
  const deviceOn = () => !!store.get(DKEY) && supported() && Notification.permission === 'granted';
  const ub64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const b64u = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  function touch() { R().t = Date.now(); A.save(); }
  async function swReg() {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 8000))]);
    return reg;
  }
  async function vapidKey() {
    const r = await C.req(FN);
    if (!r || !r.key) throw new Error('clé');
    store.set('nutriscan.vapid', r.key);
    return r.key;
  }
  async function saveSub(sub) {
    const j = sub.toJSON(), u = C.session && C.session.user;
    if (!u) throw new Error('Connecte-toi d’abord');
    await C.req('/rest/v1/push_subs?on_conflict=endpoint', { method: 'POST', auth: true, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { endpoint: j.endpoint, user_id: u.id, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: tz(), lang: lang(), updated_at: new Date().toISOString() } });
    store.set(DKEY, j.endpoint);
    store.set('nutriscan.pushDay', A.today());
  }
  async function subscribe() {
    const reg = await swReg();
    const key = await vapidKey();
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options && sub.options.applicationServerKey ? b64u(sub.options.applicationServerKey) : key;
      if (cur !== key) { try { await sub.unsubscribe(); } catch (e) { /* rien */ } sub = null; }
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ub64(key) });
    await saveSub(sub);
    return sub;
  }

  /* ---------- Activer / désactiver sur cet appareil ---------- */
  let busy = false;
  async function enable() {
    if (busy) return; busy = true;
    try {
      if (!supported()) { A.toast(isIOS() && !standalone() ? 'Installe d’abord NutriScan sur ton écran d’accueil' : 'Ce navigateur ne gère pas les notifications'); return; }
      const p = await Notification.requestPermission();
      if (p !== 'granted') { A.toast(p === 'denied' ? 'Notifications bloquées : autorise-les dans les réglages du navigateur' : 'Notifications non autorisées'); render(); return; }
      await subscribe();
      const first = !R().on;
      if (first) {
        Object.assign(R(), { on: true });
        const sp = A.S.sport && A.S.sport.prefs && Array.isArray(A.S.sport.prefs.days) ? A.S.sport.prefs.days : [];
        if (!R().sport.length && sp.length && A.S.workouts.length) R().sport = sp.map(d => +d % 7);
      }
      touch();
      A.track('remind_on', { first });
      A.toast('Rappels activés sur cet appareil');
      test(true);
    } catch (e) {
      console.warn(e);
      A.toast(e && e.offline ? 'Pas de connexion Internet' : 'Impossible d’activer les rappels pour l’instant');
    } finally { busy = false; render(); }
  }
  async function offDevice(quiet) {
    const ep = store.get(DKEY);
    store.set(DKEY, null);
    if (!ep && quiet) return;
    try { if (supported()) { const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 2000))]); const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } } catch (e) { /* rien */ }
    if (ep && C && C.session) { try { await C.req('/rest/v1/push_subs?endpoint=eq.' + encodeURIComponent(ep), { method: 'DELETE', auth: true }); } catch (e) { /* rien */ } }
    if (!quiet) { A.toast('Rappels désactivés sur cet appareil'); A.track('remind_off', {}); render(); }
  }
  async function test(silent) {
    try {
      const r = await C.req(FN, { method: 'POST', auth: true, body: { test: true, endpoint: store.get(DKEY) || undefined } });
      if (!silent) A.toast(r && r.sent ? 'Notification de test envoyée' : 'Aucun appareil abonné : réactive les rappels');
    } catch (e) { if (!silent) A.toast('Envoi impossible pour l’instant'); }
  }
  // À l'ouverture : garde l'abonnement à jour (fuseau, langue, abonnement renouvelé par le navigateur)
  async function refresh(force) {
    if (!deviceOn() || !C || !C.session) return;
    if (!force && store.get('nutriscan.pushDay') === A.today()) return;
    try { await subscribe(); } catch (e) { /* on réessaiera */ }
  }

  /* ---------- Carte dans le Profil ---------- */
  function count() {
    const r = R(); let n = 0;
    ['bk', 'lu', 'di', 'sn'].forEach(k => { if (r[k]) n++; });
    if (r.water) n++; if (r.weigh >= 0) n++; if (r.sport.length) n++; if (r.report) n++; if (r.streak) n++;
    return n;
  }
  function cardHTML() {
    if (!C || !C.enabled || !C.session) return '';
    const on = deviceOn();
    let sub;
    if (on) sub = 'Activés sur cet appareil · ' + count() + ' rappel' + (count() > 1 ? 's' : '');
    else if (!supported() && isIOS() && !standalone()) sub = 'Sur iPhone, installe d’abord NutriScan sur ton écran d’accueil (iOS 16.4 ou plus).';
    else if (!supported()) sub = 'Ce navigateur ne gère pas les notifications.';
    else if (Notification.permission === 'denied') sub = 'Notifications bloquées : autorise-les dans les réglages du navigateur pour ce site.';
    else sub = 'Repas, eau, pesée, sport et bilan de la semaine, au bon moment.';
    return '<section class="card rm-card"><span class="micon" style="--mc:' + (on ? 'var(--brand)' : 'var(--burn)') + '">' + ic('i-bell') + '</span>' +
      '<div class="min0 grow"><b>Rappels</b><small>' + esc(sub) + '</small></div>' +
      (on ? '<button class="btn outline" data-rm="open">Régler</button>' : supported() ? '<button class="btn primary" data-rm="enable">Activer</button>' : (isIOS() && !standalone() ? '<button class="btn outline" data-act="install">Installer</button>' : '')) + '</section>';
  }

  /* ---------- Feuille de réglages ---------- */
  let SH = null;
  function open() {
    const el = A.mountSheet(A.head('Rappels') + '<div id="rmBody"></div>', { tall: true });
    SH = el;
    A.openLayer({ el, onClose: () => { SH = null; } });
    renderSheet();
    el.addEventListener('change', onChange);
  }
  const sw = (k, on, label, sub) => '<label class="rm-row"><span class="min0 grow"><b>' + esc(label) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
    '<input type="checkbox" class="tgl" data-k="' + k + '"' + (on ? ' checked' : '') + '></label>';
  const time = (k, v) => '<input type="time" class="rm-time" data-t="' + k + '" value="' + esc(v) + '" step="300">';
  function renderSheet() {
    if (!SH) return;
    const r = R(), on = deviceOn();
    const meals = [['bk', 'Petit-déjeuner', '08:00'], ['lu', 'Déjeuner', '12:30'], ['di', 'Dîner', '19:30'], ['sn', 'Collation', '16:00']];
    $('#rmBody', SH).innerHTML =
      '<section class="card rm-dev"><div class="min0 grow"><b>' + (on ? 'Notifications activées sur cet appareil' : 'Notifications désactivées sur cet appareil') + '</b>' +
      '<small>' + (on ? 'Tu peux les activer aussi sur tes autres appareils.' : 'Active-les pour recevoir tes rappels ici.') + '</small></div>' +
      (on ? '<div class="row-btns"><button class="btn outline" data-rm="test">Tester</button><button class="btn outline" data-rm="off">Désactiver</button></div>' : '<button class="btn primary block" data-rm="enable">Activer sur cet appareil</button>') + '</section>' +
      '<h4 class="rm-h">Repas</h4><section class="card rm-list">' +
      meals.map(m => '<div class="rm-row"><span class="min0 grow"><b>' + m[1] + '</b><small>' + (r[m[0]] ? 'Seulement si tu ne l’as pas encore noté' : 'Pas de rappel') + '</small></span>' +
        (r[m[0]] ? time(m[0], r[m[0]]) : '') + '<input type="checkbox" class="tgl" data-k="' + m[0] + '" data-def="' + m[2] + '"' + (r[m[0]] ? ' checked' : '') + ' aria-label="' + m[1] + '"></div>').join('') + '</section>' +
      '<h4 class="rm-h">Suivi</h4><section class="card rm-list">' +
      sw('water', r.water, 'Eau', 'Vers 11 h, 15 h et 18 h 30, seulement si tu es en retard sur ton objectif') +
      '<div class="rm-row"><span class="min0 grow"><b>Pesée</b><small>' + (r.weigh >= 0 ? 'Chaque ' + DAYS_LONG[r.weigh].toLowerCase() + ', si tu ne t’es pas encore pesé' : 'Pas de rappel') + '</small></span>' +
      (r.weigh >= 0 ? time('wT', r.wT) : '') + '<input type="checkbox" class="tgl" data-k="weigh"' + (r.weigh >= 0 ? ' checked' : '') + ' aria-label="Pesée"></div>' +
      (r.weigh >= 0 ? '<div class="chips rm-days">' + DAYS.map(d => '<button class="chip' + (r.weigh === d[0] ? ' on' : '') + '" data-rm="wday" data-d="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>' : '') +
      '<div class="rm-row"><span class="min0 grow"><b>Sport</b><small>' + (r.sport.length ? 'Les jours choisis, si tu n’as pas encore fait ta séance' : 'Choisis tes jours de sport') + '</small></span>' + (r.sport.length ? time('sT', r.sT) : '') + '</div>' +
      '<div class="chips rm-days">' + DAYS.map(d => '<button class="chip' + (r.sport.includes(d[0]) ? ' on' : '') + '" data-rm="sday" data-d="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>' +
      sw('report', r.report, 'Bilan de la semaine', 'Le dimanche à 19 h') +
      sw('streak', r.streak, 'Garder ma série', 'À 20 h 30, si rien n’est noté et que tu as une série en cours') +
      '</section><p class="hint" style="margin-top:12px">Les rappels arrivent même quand l’appli est fermée. Tes réglages sont les mêmes sur tous tes appareils.</p>';
  }
  function onChange(e) {
    const t = e.target, r = R();
    if (t.matches('.tgl')) {
      const k = t.dataset.k;
      if (['bk', 'lu', 'di', 'sn'].includes(k)) r[k] = t.checked ? t.dataset.def : '';
      else if (k === 'weigh') r.weigh = t.checked ? 1 : -1;
      else r[k] = t.checked;
      touch(); renderSheet();
    } else if (t.matches('.rm-time') && /^\d{2}:\d{2}$/.test(t.value)) {
      r[t.dataset.t] = t.value; touch();
    }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]'); if (!b || b.disabled) return;
    const a = b.dataset.rm, r = R();
    if (a === 'enable') enable();
    else if (a === 'open') open();
    else if (a === 'test') test(false);
    else if (a === 'off') offDevice(false);
    else if (a === 'wday') { r.weigh = +b.dataset.d; touch(); renderSheet(); }
    else if (a === 'sday') { const d = +b.dataset.d, i = r.sport.indexOf(d); if (i >= 0) r.sport.splice(i, 1); else r.sport.push(d); touch(); renderSheet(); }
  });
  function render() { renderSheet(); if (A.tab === 'profile') A.renderAll(); }

  window.NS_RAPPELS = { cardHTML, enable, offDevice, test, refresh, open, deviceOn, DEF };
  setTimeout(refresh, 4000);
})();
