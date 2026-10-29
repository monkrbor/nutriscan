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
  let users = [], events = [], messages = [], reads = [], owner = {}, view = 'overview', current = null, ufilter = 'all', afilter = 'all', toastT;
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
    const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Autre';
    const br = /Brave/.test(ua) ? 'Brave' : /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
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
    const [u, ev, msg, rd] = await Promise.all([
      rpc('admin_users'),
      C.req('/rest/v1/events?select=id,created_at,user_id,device,type,data,version,ua&created_at=gte.' + encodeURIComponent(since) + '&order=created_at.desc&limit=5000', { auth: true }).catch(() => []),
      C.req('/rest/v1/messages?select=id,user_id,title,body,created_at&order=created_at.desc&limit=200', { auth: true }).catch(() => []),
      C.req('/rest/v1/message_reads?select=message_id,user_id', { auth: true }).catch(() => [])
    ]);
    users = u || []; events = ev || []; messages = msg || []; reads = rd || [];
    owner = {}; events.slice().reverse().forEach(e => { if (e.user_id && userById(e.user_id)) owner[e.device] = e.user_id; });
    const errs7 = events.filter(e => ERR_TYPES.includes(e.type) && Date.now() - new Date(e.created_at) < 7 * 864e5).length;
    $('#errBadge').hidden = !errs7; $('#errBadge').textContent = errs7;
    render();
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
    else if (view === 'users') { v.innerHTML = usersHTML(); renderList(); if (current) openUser(current, true); }
    else if (view === 'errors') v.innerHTML = errorsHTML();
    else if (view === 'activity') v.innerHTML = activityHTML();
    else if (view === 'messages') v.innerHTML = messagesHTML();
  }
  function barsSVG(days, vals, color, label) {
    const W = 560, H = 140, top = 10, bottom = 22, n = days.length, slot = W / n, bw = Math.min(26, slot * 0.6);
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
  function usersHTML() {
    const f = [['all', 'Tous'], ['active', 'Actifs 7 j'], ['new', 'Nouveaux'], ['flagged', 'Signalés'], ['banned', 'Bloqués'], ['nobackup', 'Sans sauvegarde']];
    return '<div class="grid"><div class="users">' +
      '<div class="searchbox"><svg class="ic sm"><use href="#i-search"/></svg><input id="q" type="search" placeholder="Nom ou e-mail" autocomplete="off" aria-label="Rechercher un compte"></div>' +
      '<div class="filters">' + f.map(x => '<button data-f="' + x[0] + '"' + (ufilter === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>').join('') + '</div>' +
      '<div id="list"></div></div><aside class="panel detail" id="detail"><p class="empty-d">Choisis un compte pour le gérer.</p></aside></div>';
  }
  const isBanned = u => u.banned_until && new Date(u.banned_until) > new Date();
  function renderList() {
    const el = $('#list'); if (!el) return;
    const q = ($('#q') && $('#q').value.trim().toLowerCase()) || '';
    const d7 = Date.now() - 7 * 864e5;
    const list = users.filter(u => {
      if (q && !(String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().includes(q)) return false;
      if (ufilter === 'active') return new Date(u.updated_at || u.last_sign_in_at || 0) > d7;
      if (ufilter === 'new') return new Date(u.created_at) > d7;
      if (ufilter === 'flagged') return u.flagged;
      if (ufilter === 'banned') return isBanned(u);
      if (ufilter === 'nobackup') return !u.updated_at;
      return true;
    });
    el.innerHTML = list.length ? list.map(u =>
      '<button class="u' + (u.id === current ? ' on' : '') + '" data-u="' + esc(u.id) + '"><span class="av">' + esc((u.name || u.email || '?').charAt(0).toUpperCase()) + '</span>' +
      '<span class="min0"><b>' + esc(u.name || u.email || 'Sans nom') + '</b><small>' + esc(u.email || '') + ' · ' + pl(u.entries_count || 0, 'aliment') + '</small></span>' +
      '<span class="when">' + esc(ago(u.updated_at || u.last_sign_in_at || u.created_at)) +
      (isBanned(u) ? '<span class="chip2 red">Bloqué</span>' : u.flagged ? '<span class="chip2 orange">Signalé</span>' : u.provider === 'google' ? '<span class="chip2">Google</span>' : '') + '</span></button>').join('')
      : '<p class="empty-d">' + (users.length ? 'Aucun compte ne correspond.' : 'Aucun compte pour l’instant.') + '</p>';
  }
  async function openUser(id, quiet) {
    current = id; renderList();
    const box = $('#detail'); if (!box) return;
    const u = userById(id); if (!u) { box.innerHTML = '<p class="empty-d">Compte introuvable.</p>'; return; }
    if (!quiet) box.innerHTML = '<div class="loading"><div class="spin"></div>Chargement…</div>';
    let b = null, hist = [];
    try {
      const r = await Promise.all([
        C.req('/rest/v1/backups?select=*&user_id=eq.' + id, { auth: true }),
        C.req('/rest/v1/backup_history?select=id,saved_at,entries_count&user_id=eq.' + id + '&order=saved_at.desc', { auth: true }).catch(() => [])
      ]);
      b = r[0] && r[0][0]; hist = r[1] || [];
    } catch (e) { box.innerHTML = '<p class="empty-d">' + esc(e.message) + '</p>'; return; }
    if (current !== id) return;
    const d = (b && b.data) || {}, P = d.profile || {}, G = d.goals || {};
    const entries = (d.entries || []).slice().sort((a, c) => (c.date + String(c.ts || 0)).localeCompare(a.date + String(a.ts || 0)));
    const daysN = new Set((d.entries || []).map(e => e.date)).size;
    const w = (d.weights || []).slice(-1)[0];
    const uev = eventsOf(id);
    const uerr = uev.filter(e => ERR_TYPES.includes(e.type));
    const banned = isBanned(u);
    box.dataset.uid = id; box._b = b;
    box.innerHTML =
      '<div><h2 class="big">' + esc(u.name || P.name || u.email) + '</h2><p class="hint">' + esc(u.email || '') + '</p>' +
      '<div class="tags" style="margin-top:8px"><span class="chip2' + (u.provider === 'google' ? '' : '') + '">' + (u.provider === 'google' ? 'Compte Google' : 'Compte e-mail') + '</span>' +
      (banned ? '<span class="chip2 red">Bloqué</span>' : '<span class="chip2 green">Actif</span>') + (u.flagged ? '<span class="chip2 orange">Signalé</span>' : '') + '</div></div>' +
      '<div class="acts">' +
      '<button class="btn ' + (banned ? 'primary' : 'outline') + '" data-a="ban">' + (banned ? 'Débloquer le compte' : 'Bloquer le compte') + '</button>' +
      (u.provider !== 'google' ? '<button class="btn outline" data-a="reset">Envoyer un lien de mot de passe</button>' : '') +
      '<button class="btn danger" data-a="deluser"><svg class="ic sm"><use href="#i-trash"/></svg>Supprimer le compte</button></div>' +
      '<div class="sec"><h3>Compte</h3>' +
      '<div class="kv"><span>Inscription</span><b>' + esc(dt(u.created_at)) + '</b></div>' +
      '<div class="kv"><span>Dernière connexion</span><b>' + esc(dt(u.last_sign_in_at)) + '</b></div>' +
      '<div class="kv"><span>Dernière sauvegarde</span><b>' + esc(dt(u.updated_at)) + '</b></div>' +
      '<div class="kv"><span>Accord sauvegarde</span><b>' + esc(u.consent_at ? dt(u.consent_at) : 'non enregistré') + '</b></div>' +
      (uev.length ? '<div class="kv"><span>Appareils</span><b>' + esc([...new Set(uev.map(e => device(e.ua)))].join(', ')) + '</b></div>' : '') + '</div>' +
      '<div class="sec"><h3>Note privée</h3><textarea id="uNote" placeholder="Visible seulement par toi">' + esc(u.note || '') + '</textarea>' +
      '<div class="acts" style="margin-top:8px"><label class="check" style="flex:1;align-items:center"><input type="checkbox" id="uFlag"' + (u.flagged ? ' checked' : '') + '><span>Signaler ce compte</span></label><button class="btn primary mbtn" data-a="note">Enregistrer</button></div></div>' +
      '<div class="sec"><h3>Lui écrire</h3><div class="field"><input id="mTitle" type="text" placeholder="Titre"></div><textarea id="mBody" placeholder="Message affiché dans son appli à la prochaine ouverture" style="margin-top:8px"></textarea>' +
      '<div class="acts" style="margin-top:8px"><button class="btn primary mbtn" data-a="msg">Envoyer</button></div></div>' +
      (b ? '<div class="mini"><div><b>' + fk(entries.length) + '</b><span>aliments notés</span></div><div><b>' + fk(daysN) + '</b><span>jours suivis</span></div>' +
        '<div><b>' + (w ? String(w.kg).replace('.', ',') + ' kg' : '—') + '</b><span>dernier poids</span></div><div><b>' + fk(uev.length) + '</b><span>événements (30 j)</span></div></div>' +
        '<div class="sec"><h3>Objectifs</h3><div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(90px,1fr))">' +
        [['kcal', 'kcal'], ['p', 'Prot. (g)'], ['c', 'Gluc. (g)'], ['f', 'Lip. (g)'], ['water', 'Eau (ml)']].map(x => '<div class="field"><label for="g_' + x[0] + '">' + x[1] + '</label><input id="g_' + x[0] + '" inputmode="numeric" value="' + esc(G[x[0]] != null ? Math.round(G[x[0]]) : '') + '"></div>').join('') +
        '</div><div class="acts" style="margin-top:8px"><button class="btn primary mbtn" data-a="goals">Modifier ses objectifs</button></div></div>' +
        (P.goal ? '<div class="sec"><h3>Profil</h3><div class="kv"><span>Infos</span><b>' + esc([P.sex === 'f' ? 'Femme' : 'Homme', P.age ? P.age + ' ans' : '', P.height ? P.height + ' cm' : '', P.goal === 'lose' ? 'veut perdre du poids' : P.goal === 'gain' ? 'veut prendre du muscle' : 'veut garder son poids'].filter(Boolean).join(' · ')) + '</b></div></div>' : '') +
        '<div class="acts"><button class="btn outline" data-a="dl"><svg class="ic sm"><use href="#i-download"/></svg>Télécharger ses données</button>' +
        '<button class="btn outline" data-a="up"><svg class="ic sm"><use href="#i-upload"/></svg>Restaurer depuis un fichier</button>' +
        '<button class="btn danger" data-a="delbackup">Effacer sa sauvegarde</button></div>' +
        '<div class="sec"><h3>Derniers aliments</h3>' + (entries.length ? '<div class="tbl"><table><thead><tr><th>Date</th><th>Aliment</th><th class="num">Quantité</th><th class="num">kcal</th></tr></thead><tbody>' +
          entries.slice(0, 15).map(e => '<tr><td>' + esc(String(e.date || '').slice(8) + '/' + String(e.date || '').slice(5, 7)) + '</td><td class="wrap">' + esc(e.name) + '</td><td class="num">' + (e.key === 'quick' ? '—' : fk(e.grams) + ' ' + esc(e.unit || 'g')) + '</td><td class="num">' + fk(e.kcal) + '</td></tr>').join('') +
          '</tbody></table></div>' : '<p class="hint">Aucun aliment noté.</p>') + '</div>' +
        '<div class="sec"><h3>Versions précédentes</h3>' + (hist.length ? hist.map(h =>
          '<div class="ver"><span>' + esc(dt(h.saved_at)) + ' · ' + pl(h.entries_count, 'aliment') + '</span><button class="btn outline" data-a="vdl" data-v="' + h.id + '">Télécharger</button><button class="btn outline" data-a="vrs" data-v="' + h.id + '">Restaurer</button></div>').join('')
          : '<p class="hint">Une version est gardée toutes les 6 heures au maximum (30 au total).</p>') + '</div>'
        : '<p class="hint">Pas encore de sauvegarde pour ce compte.</p>') +
      '<div class="sec"><h3>Erreurs de ce compte (30 j)</h3>' + (uerr.length ? '<div class="feed">' + uerr.slice(0, 15).map(evRow).join('') + '</div>' : '<p class="hint">Aucune erreur.</p>') + '</div>' +
      '<div class="sec"><h3>Activité (30 j)</h3>' + (uev.length ? '<div class="feed">' + uev.slice(0, 30).map(evRow).join('') + '</div>' : '<p class="hint">Aucune activité enregistrée (ou suivi refusé).</p>') + '</div>';
  }
  function evRow(e) {
    const err = ERR_TYPES.includes(e.type);
    return '<div class="ev"><time>' + esc(short(e.created_at)) + '</time><div class="min0"><b' + (err ? ' style="color:var(--danger)"' : '') + '>' + esc(TYPE_LABEL[e.type] || e.type) + '</b>' +
      (view !== 'users' ? ' · ' + esc(who(e)) : '') + '<small>' + esc([evDetail(e), e.ua ? device(e.ua) : '', e.version ? 'v' + e.version : ''].filter(Boolean).join(' · ')) + '</small></div></div>';
  }
  async function patchBackup(id, data, label) {
    await C.req('/rest/v1/backups?user_id=eq.' + id, { method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
      body: { data, entries_count: (data.entries || []).length, device: 'admin', updated_at: new Date().toISOString() } });
    toast(label);
    await loadAll();
  }
  async function onDetail(ev) {
    const btn = ev.target.closest('[data-a]'); if (!btn) return;
    const box = $('#detail'), id = box.dataset.uid, b = box._b, u = userById(id); if (!id || !u) return;
    const a = btn.dataset.a;
    try {
      if (a === 'ban') {
        const ban = !isBanned(u);
        if (ban && !arm(btn, 'Confirmer le blocage ?')) return;
        await rpc('admin_set_ban', { target: id, ban }); toast(ban ? 'Compte bloqué' : 'Compte débloqué'); await loadAll();
      } else if (a === 'reset') { await C.recover(u.email, location.origin + location.pathname.replace(/admin\.html$/, '')); toast('Lien envoyé à ' + u.email); }
      else if (a === 'deluser') {
        if (!arm(btn, 'Appuie encore : suppression définitive')) return;
        await rpc('admin_delete_user', { target: id }); current = null; toast('Compte supprimé'); await loadAll();
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
        const data = JSON.parse(JSON.stringify(b.data || {}));
        data.goals = Object.assign({}, data.goals || {});
        ['kcal', 'p', 'c', 'f', 'water'].forEach(k => { const v = parseFloat(String($('#g_' + k).value).replace(',', '.')); if (isFinite(v) && v >= 0) data.goals[k] = Math.round(v); });
        data.metaT = Date.now();
        await patchBackup(id, data, 'Objectifs modifiés : il les recevra à sa prochaine ouverture');
      } else if (a === 'dl') { if (b) download('nutriscan-' + slugName(u) + '-' + day(Date.now()) + '.json', b.data); }
      else if (a === 'up') { $('#fileIn').dataset.uid = id; $('#fileIn').click(); }
      else if (a === 'delbackup') {
        if (!arm(btn, 'Appuie encore pour effacer')) return;
        await C.req('/rest/v1/backups?user_id=eq.' + id, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
        toast('Sauvegarde effacée'); await loadAll();
      } else if (a === 'vdl' || a === 'vrs') {
        const r = await C.req('/rest/v1/backup_history?select=data,saved_at&id=eq.' + btn.dataset.v, { auth: true });
        if (!r || !r[0]) { toast('Version introuvable'); return; }
        if (a === 'vdl') download('nutriscan-' + slugName(u) + '-version-' + day(r[0].saved_at) + '.json', r[0].data);
        else { if (!arm(btn, 'Confirmer ?')) return; await patchBackup(id, r[0].data, 'Version du ' + dt(r[0].saved_at) + ' restaurée'); }
      }
    } catch (e) { toast(e.message); }
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
    const uB = ev.target.closest('[data-u]'); if (uB) { openUser(uB.dataset.u); return; }
    const fB = ev.target.closest('[data-f]'); if (fB) { ufilter = fB.dataset.f; $$('[data-f]').forEach(x => x.classList.toggle('on', x === fB)); renderList(); return; }
    const aF = ev.target.closest('[data-af]'); if (aF) { afilter = aF.dataset.af; render(); return; }
    if (ev.target.closest('#detail')) { onDetail(ev); return; }
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
  });
  $('#view').addEventListener('input', ev => { if (ev.target.id === 'q') renderList(); });
  $('#fileIn').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0], id = ev.target.dataset.uid; ev.target.value = '';
    if (!f || !id) return;
    const r = new FileReader();
    r.onload = async () => {
      try { const data = JSON.parse(r.result); if (!data || !Array.isArray(data.entries)) throw new Error('format'); await patchBackup(id, data, 'Fichier restauré'); }
      catch (e) { toast(e.message === 'format' ? 'Ce fichier n’est pas une sauvegarde NutriScan' : e.message); }
    };
    r.readAsText(f);
  });
  $('#reload').addEventListener('click', () => loadAll().then(() => toast('Données à jour')).catch(e => toast(e.message)));
  $('#logout').addEventListener('click', async () => { await C.signOut(); users = []; events = []; current = null; $('#who').textContent = 'Console d’administration'; show('login'); });
  $('#lGoogle').addEventListener('click', () => C.oauth('google', location.origin + location.pathname));
  $('#login').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#lErr');
    try { err.hidden = true; await C.signIn($('#lEmail').value.trim(), $('#lPass').value); await start(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  start();
})();
