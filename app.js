/* NutriScan v2 — compteur de calories et de macros.
   Tout est stocké sur le téléphone (localStorage), et en ligne pour les comptes. */
(function () {
  'use strict';

  /* ================= Outils ================= */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; };
  const r0 = v => Math.round(v || 0);
  const f1 = v => { v = v || 0; return (Math.abs(v) < 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v))).replace('.', ','); };
  const fk = v => r0(v).toLocaleString('fr-FR');
  const fkg = v => String(Math.round((v || 0) * 10) / 10).replace('.', ',');
  const fL = ml => String(Math.round((ml || 0) / 10) / 100).replace('.', ',');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const parseYmd = s => { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = () => ymd(new Date());
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').toLowerCase().trim();
  const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const ic = (id, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + id + '"/></svg>';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  /* ================= Constantes ================= */
  const MEALS = [
    { id: 'breakfast', label: 'Petit-déjeuner', short: 'Petit-déj', to: 'au petit-déjeuner', share: 0.25, icon: 'i-sunrise', color: '#EFA02E' },
    { id: 'lunch', label: 'Déjeuner', short: 'Déjeuner', to: 'au déjeuner', share: 0.35, icon: 'i-sun', color: '#E5603A' },
    { id: 'dinner', label: 'Dîner', short: 'Dîner', to: 'au dîner', share: 0.30, icon: 'i-moon', color: '#5B6BEE' },
    { id: 'snack', label: 'Collations', short: 'Collation', to: 'aux collations', share: 0.10, icon: 'i-apple', color: '#24A06A' }
  ];
  const MEAL = Object.fromEntries(MEALS.map(m => [m.id, m]));
  const MACROS = [
    { k: 'p', label: 'Protéines', short: 'Prot.', color: 'var(--prot)', kcal: 4 },
    { k: 'c', label: 'Glucides', short: 'Gluc.', color: 'var(--carb)', kcal: 4 },
    { k: 'f', label: 'Lipides', short: 'Lip.', color: 'var(--fat)', kcal: 9 }
  ];
  const ACTIVITIES = [
    { id: 'walk', label: 'Marche', met: 3.5 }, { id: 'run', label: 'Course à pied', met: 9.8 },
    { id: 'bike', label: 'Vélo', met: 7.5 }, { id: 'gym', label: 'Musculation', met: 5 },
    { id: 'hiit', label: 'HIIT / cardio', met: 8 }, { id: 'swim', label: 'Natation', met: 7 },
    { id: 'foot', label: 'Football', met: 7 }, { id: 'basket', label: 'Basket', met: 6.5 },
    { id: 'box', label: 'Boxe', met: 9 }, { id: 'dance', label: 'Danse', met: 5 },
    { id: 'yoga', label: 'Yoga', met: 2.5 }, { id: 'other', label: 'Autre', met: 5 }
  ];
  const ACT_LEVELS = [
    { id: 'low', label: 'Sédentaire', sub: 'Travail assis, peu de marche', f: 1.2 },
    { id: 'light', label: 'Peu actif', sub: 'Un peu de marche, sport 1 à 2 fois/sem.', f: 1.375 },
    { id: 'moderate', label: 'Actif', sub: 'Sport 3 à 5 fois par semaine', f: 1.55 },
    { id: 'high', label: 'Très actif', sub: 'Sport intense ou travail physique', f: 1.725 }
  ];
  const GOALS = { lose: 'Perdre du poids', maintain: 'Garder mon poids', gain: 'Prendre du muscle' };
  const NUTRI_COLORS = { a: '#038141', b: '#85BB2F', c: '#E5B700', d: '#EE8100', e: '#E63E11' };
  const OFF = 'https://world.openfoodfacts.org';
  const OFF_SEARCH = 'https://fr.openfoodfacts.org';
  const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,quantity,serving_size,serving_quantity,nutriments,nutriscore_grade,image_front_small_url,image_small_url,ingredients_text_fr,ingredients_text,ingredients_tags,additives_tags,labels_tags,ingredients_analysis_tags,traces_tags,allergens_tags';
  const H = window.NS_ING;

  /* ================= Données ================= */
  const KEY = 'nutriscan.v2';
  const DEF_GOALS = { kcal: 2200, p: 140, c: 250, f: 70, water: 2000 };

  function fixState(s) {
    s = s && typeof s === 'object' ? s : {};
    const o = {
      v: 2,
      profile: s.profile && typeof s.profile === 'object' ? s.profile : null,
      skipSetup: !!s.skipSetup,
      goals: Object.assign({}, DEF_GOALS, s.goals && typeof s.goals === 'object' ? s.goals : {}),
      entries: Array.isArray(s.entries) ? s.entries.filter(e => e && e.date && isFinite(e.kcal)) : [],
      products: s.products && typeof s.products === 'object' ? s.products : {},
      recents: Array.isArray(s.recents) ? s.recents.filter(k => typeof k === 'string') : [],
      favorites: Array.isArray(s.favorites) ? s.favorites.filter(k => typeof k === 'string') : [],
      water: s.water && typeof s.water === 'object' ? s.water : {},
      exercises: Array.isArray(s.exercises) ? s.exercises.filter(x => x && x.date) : [],
      weights: Array.isArray(s.weights) ? s.weights.filter(w => w && w.date && w.kg > 0) : [],
      theme: ['auto', 'light', 'dark'].includes(s.theme) ? s.theme : 'auto',
      warn: Object.assign({}, H.DEF, (s.warn && typeof s.warn === 'object') ? s.warn : (s.halal && typeof s.halal === 'object') ? s.halal : {}),
      // Synchronisation entre appareils : dates de modification et suppressions
      tomb: s.tomb && typeof s.tomb === 'object' ? s.tomb : {},
      waterT: s.waterT && typeof s.waterT === 'object' ? s.waterT : {},
      metaT: num(s.metaT)
    };
    const old = Date.now() - 120 * 864e5;
    Object.keys(o.tomb).forEach(k => { if (!(o.tomb[k] > old)) delete o.tomb[k]; });
    for (const k of Object.keys(o.products)) {
      const p = o.products[k];
      if (!p || !p.per100) { delete o.products[k]; continue; }
      if (!Array.isArray(p.portions)) p.portions = p.serving ? [{ label: 'portion', g: num(p.serving) }] : [];
      if (!p.unit) p.unit = 'g';
      if (!p.source) p.source = p.manual ? 'custom' : 'off';
      if (!p.key) p.key = k;
    }
    o.entries.forEach(e => {
      if (!e.id) e.id = uid();
      if (!MEAL[e.meal]) e.meal = 'snack';
      if (e.amount == null) { e.amount = e.grams; e.unitIdx = 0; }
      ['kcal', 'p', 'c', 'f'].forEach(k => { e[k] = num(e[k]); });
      if (!e.mt) e.mt = e.ts || 1;
    });
    o.exercises.forEach(x => { if (!x.id) x.id = uid(); if (!x.mt) x.mt = 1; });
    o.weights.forEach(w => { if (!w.mt) w.mt = 1; });
    o.weights.sort((a, b) => a.date < b.date ? -1 : 1);
    return o;
  }
  function loadState() {
    let s = store.get(KEY, null);
    if (!s) { // reprise des données de la version 1
      s = { entries: store.get('ns.entries', []), products: store.get('ns.products', {}), recents: store.get('ns.recents', []) };
      const g = store.get('ns.goals', null); if (g) s.goals = g;
    }
    return fixState(s);
  }
  let S = loadState();
  let saveWarned = false;
  function pruneProducts() {
    const keep = new Set(S.recents.concat(S.favorites));
    const since = addDays(today(), -60);
    S.entries.forEach(e => { if (e.date >= since) keep.add(e.key); });
    Object.keys(S.products).forEach(k => {
      const p = S.products[k];
      if (p.source === 'custom' || keep.has(k)) { if (p.ingTags && p.ingTags.length > 20) p.ingTags = p.ingTags.slice(0, 20); return; }
      delete S.products[k];
    });
  }
  function save() {
    if (!store.set(KEY, S)) {
      pruneProducts();
      if (!store.set(KEY, S) && !saveWarned) { saveWarned = true; toast("Mémoire du navigateur pleine : sauvegarde tes données puis efface d'anciens jours"); }
    }
    schedulePush();
  }
  const now = () => Date.now();
  const touchMeta = () => { S.metaT = now(); };
  function removeEntries(pred) {
    const t = now();
    S.entries = S.entries.filter(e => { if (pred(e)) { S.tomb['e:' + e.id] = t; return false; } return true; });
  }

  /* ---------- Sauvegarde en ligne ---------- */
  const C = window.NS_CLOUDAPI || { enabled: false, session: null };
  const DEVICE = (() => { let d = store.get('nutriscan.device', null); if (!d) { d = 'd-' + uid(); store.set('nutriscan.device', d); } return d; })();
  const SYNC = Object.assign({ lastPush: null, consentAt: null, pending: false, admin: false }, store.get('nutriscan.sync', {}));
  const saveSync = () => store.set('nutriscan.sync', SYNC);
  let syncState = 'idle', syncError = '', pushT = null, suppressPush = false;
  function schedulePush() {
    if (!C.enabled || !C.session || suppressPush) return;
    SYNC.pending = true; saveSync();
    clearTimeout(pushT); pushT = setTimeout(() => sync(), 2500);
  }
  let syncing = null, syncAgain = false;
  /* Synchronise ce téléphone avec la sauvegarde en ligne :
     1. si un autre appareil a sauvegardé depuis, on fusionne (sans rien perdre, suppressions comprises) ;
     2. si ce téléphone a des modifications (ou après fusion), on envoie. */
  function sync(opts) {
    opts = opts || {};
    if (!C.enabled || !C.session) return Promise.resolve(false);
    if (!navigator.onLine) { syncState = 'offline'; refreshAccountStatus(); return Promise.resolve(false); }
    if (syncing) { syncAgain = true; return syncing; }
    clearTimeout(pushT);
    syncing = (async () => {
      syncState = 'saving'; refreshAccountStatus();
      let merged = false;
      try {
        if (!opts.force) {
          const m = await C.meta();
          const newer = m && m.device !== DEVICE && (!SYNC.lastPush || new Date(m.updated_at) > new Date(SYNC.lastPush));
          if (newer) {
            const r = await C.pull();
            if (r && r.device === 'admin') { syncState = 'idle'; refreshAccountStatus(); if (!layers.length) offerRemote(r); return false; }
            if (r) {
              suppressPush = true; S = mergeStates(S, r.data); store.set(KEY, S); suppressPush = false;
              halalVersion++; applyTheme(); renderAll(); merged = true;
              if (OB && (S.profile || S.skipSetup)) closeOB();
            }
          }
        }
        if (merged || SYNC.pending || opts.push || opts.force) {
          SYNC.lastPush = await C.push(S, { device: DEVICE, consentAt: SYNC.consentAt });
        }
        SYNC.pending = false; saveSync(); syncState = 'idle'; syncError = '';
        refreshAccountStatus();
        if (merged && !opts.quiet) toast('Synchronisé avec tes autres appareils');
        return true;
      } catch (e) {
        syncState = e.offline ? 'offline' : 'error'; syncError = e.message || '';
        if (!e.offline) track('sync_error', { msg: String(e.message || '').slice(0, 200), status: e.status || 0 });
        if (e.status === 401) syncError = 'Session expirée : reconnecte-toi.';
        refreshAccountStatus(); return false;
      } finally {
        syncing = null;
        if (syncAgain) { syncAgain = false; setTimeout(() => sync(), 500); }
      }
    })();
    return syncing;
  }
  const doPush = () => sync({ push: true });

  /* ---------- Statistiques et rapports d'erreurs (seulement avec l'accord de l'utilisateur) ---------- */
  const VERSION = '2.5';
  const TQ_KEY = 'nutriscan.tq';
  let TQ = store.get(TQ_KEY, []);
  let consent = store.get('nutriscan.consent', null); // true, false, ou null = pas encore demandé
  let flushT = null, flushing = false;
  function track(type, data) {
    if (consent !== true) return;
    TQ.push({ t: type, d: data || null, at: new Date().toISOString() });
    if (TQ.length > 300) TQ.splice(0, TQ.length - 300);
    store.set(TQ_KEY, TQ);
    clearTimeout(flushT); flushT = setTimeout(flushTrack, /error/.test(type) ? 1500 : 8000);
  }
  async function flushTrack() {
    if (flushing || !C.enabled || !navigator.onLine || !TQ.length || consent !== true) return;
    flushing = true;
    const batch = TQ.slice(0, 50);
    const uidv = C.session && C.session.user ? C.session.user.id : null;
    const rows = batch.map(e => ({ created_at: e.at, user_id: uidv, device: DEVICE, type: e.t, data: e.d, version: VERSION, ua: navigator.userAgent.slice(0, 180) }));
    try {
      await C.req('/rest/v1/events', { method: 'POST', auth: !!uidv, headers: { Prefer: 'return=minimal' }, body: rows });
      TQ = TQ.slice(batch.length); store.set(TQ_KEY, TQ);
    } catch (e) {
      if (e.status === 400 || e.status === 403 || e.status === 404) { TQ = TQ.slice(batch.length); store.set(TQ_KEY, TQ); }
    }
    flushing = false;
    if (TQ.length && navigator.onLine) flushT = setTimeout(flushTrack, 4000);
  }
  function setConsent(v) {
    consent = !!v; store.set('nutriscan.consent', consent);
    if (!consent) { TQ = []; store.set(TQ_KEY, TQ); }
    else track('consent', { v: VERSION });
  }
  window.addEventListener('error', ev => {
    if (!ev || !ev.message || ev.message === 'Script error.') return;
    track('error', { msg: String(ev.message).slice(0, 300), src: String(ev.filename || '').split('/').pop(), line: ev.lineno, col: ev.colno, stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 800) : '' });
  });
  window.addEventListener('unhandledrejection', ev => {
    const r = ev && ev.reason;
    track('error', { msg: String((r && r.message) || r).slice(0, 300), stack: r && r.stack ? String(r.stack).slice(0, 800) : '', kind: 'promise' });
  });

  /* ---------- Produits ---------- */
  const TMP = new Map();          // produits vus pendant la session (recherche, scan)
  const SEARCH_CACHE = new Map();
  const GEN = (window.NS_FOODS || []).map(x => ({
    key: 'gen-' + slug(x[0]), code: '', name: x[0], brand: '', qty: '', image: '', unit: x[6] || 'g',
    portions: x[5] ? [{ label: x[5][0], g: x[5][1] }] : [], nutri: '',
    per100: { kcal: x[1], p: x[2], c: x[3], f: x[4], sugar: null, sfat: null, fiber: null, salt: null },
    hasNutri: true, source: 'gen', s: norm(x[0] + ' ' + (x[7] || ''))
  }));
  const GEN_MAP = new Map(GEN.map(p => [p.key, p]));
  const getP = k => (k && (S.products[k] || GEN_MAP.get(k) || TMP.get(k))) || null;

  /* ---------- Avertissements ingrédients / végan / additifs ---------- */
  let halalVersion = 0;
  const HCACHE = new WeakMap();
  function halalOf(p) {
    const sig = halalVersion + '|' + (p.ing || '').length + '|' + (p.additives || []).length + '|' + (p.allergens || []).length + '|' + (p.labels || []).length;
    const c = HCACHE.get(p);
    if (c && c.sig === sig) return c.res;
    const res = H.analyze(p, S.warn);
    HCACHE.set(p, { sig, res });
    return res;
  }
  const SHORT = { porc: 'Porc', alcool: 'Alcool', 'alcool-trace-vinaigre': 'Alcool', 'alcool-trace-vanille': 'Alcool', vinaigre: 'Vinaigre', gelatine: 'Gélatine', sang: 'Sang',
    'traces-porc': 'Traces de porc', 'traces-gelatine': 'Traces de gélatine', 'traces-alcool': 'Traces d’alcool', viande: 'Viande', insectes: 'Insectes', presure: 'Présure', 'adds-avoid': 'Additif à éviter', e542: 'Os d’animaux' };
  const shortOf = r => SHORT[r.key] || (/^e\d/.test(r.key) ? 'E' + r.key.slice(1) : r.title);
  const VEG_LABEL = { vegan: 'Végan', vegetarian: 'Végétarien', 'maybe-veg': 'Végétarien ?', 'maybe-vegan': 'Végan ?', nonveg: 'Non végétarien' };
  function halalPill(p) {
    if (!p || !S.warn.on || p.source === 'quick') return '';
    const h = halalOf(p);
    const reds = h.reasons.filter(r => r.level === 'red');
    const pick = reds.length ? reds : h.reasons.filter(r => r.cat === 'core' || r.cat === 'origin');
    const labels = [...new Set(pick.map(shortOf))].slice(0, 2);
    return labels.map(l => '<span class="hp h-' + (reds.length ? 'red' : 'orange') + '">' + esc(l) + '</span>').join('');
  }
  function halalCardHTML(p) {
    const h = halalOf(p);
    const vegChip = VEG_LABEL[h.veg] ? '<span class="hchip' + (h.veg === 'vegan' || h.veg === 'vegetarian' ? ' veg' : '') + '">' + VEG_LABEL[h.veg] + '</span>' : '';
    if (!S.warn.on) return vegChip ? '<div class="h-chips">' + vegChip + '</div>' : '';
    const reds = h.reasons.filter(r => r.level === 'red'), oranges = h.reasons.filter(r => r.level === 'orange');
    let icon = 'i-check', title = '', sub = '';
    if (h.status === 'red') {
      icon = 'i-alert';
      title = 'Contient : ' + [...new Set(reds.map(shortOf))].join(', ').toLowerCase();
      sub = oranges.length ? 'et ' + oranges.length + ' autre' + (oranges.length > 1 ? 's' : '') + ' avertissement' + (oranges.length > 1 ? 's' : '') : '1 avertissement important';
    } else if (h.status === 'orange') {
      icon = 'i-alert'; title = oranges.length + ' avertissement' + (oranges.length > 1 ? 's' : '');
      sub = 'Lis le détail avant d’acheter.';
    } else if (h.status === 'ok') {
      title = 'Aucun avertissement'; sub = 'Rien de sensible détecté dans les ingrédients.';
    } else {
      icon = 'i-help'; title = 'Ingrédients inconnus';
      sub = p.source === 'custom' ? 'Aliment créé par toi : pas de liste d’ingrédients.' : 'La liste d’ingrédients de ce produit n’est pas encore disponible : regarde le paquet.';
    }
    return '<section class="halal h-' + h.status + '" aria-label="Avertissements">' +
      '<div class="h-top"><span class="h-ic">' + ic(icon) + '</span><div class="min0"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></div></div>' +
      (h.reasons.length ? '<ul class="h-list">' + h.reasons.map(r => '<li class="h-' + r.level + '"><i></i><b>' + esc(r.title) + '</b><span>' + esc(r.why) + '</span></li>').join('') + '</ul>' : '') +
      (vegChip ? '<div class="h-chips">' + vegChip + '</div>' : '') +
      (h.status === 'unknown' ? '' : '<p class="h-note">Analyse automatique de la liste d’ingrédients. Elle peut être incomplète : vérifie toujours l’emballage.</p>') +
      '</section>';
  }
  const HAL_TAG = { u: ['orange', 'Origine animale possible'], i: ['orange', 'Insectes'], b: ['orange', 'Os d’animaux'], g: ['red', 'Souvent du porc'], a: ['red', 'Alcool'] };
  const HEALTH_TAG = [['ok', 'Pas de risque connu'], ['orange', 'À limiter'], ['red', 'À éviter']];
  function addHTML(a) {
    const i = a.info, code = 'E' + a.code.slice(1);
    if (!i) return '<div class="add"><div class="add-top"><b>' + esc(code) + '</b><span>Additif non répertorié dans l’appli</span></div></div>';
    const ht = S.warn.on ? HAL_TAG[i.halal] : null, he = HEALTH_TAG[i.level] || HEALTH_TAG[0];
    return '<div class="add"><div class="add-top"><b>' + esc(code) + '</b><span>' + esc(i.name) + '</span></div>' +
      '<div class="tags"><span class="tag">' + esc(i.role) + '</span><span class="tag">' + esc(i.origin) + '</span>' +
      (ht ? '<span class="tag t-' + ht[0] + '">' + ht[1] + '</span>' : '') + '<span class="tag t-' + he[0] + '">' + he[1] + '</span></div>' +
      (i.health ? '<p>' + esc(i.health) + '</p>' : '') + '</div>';
  }
  function extraHTML(p) {
    if (p.source === 'gen' || p.source === 'custom' || p.source === 'quick') return '';
    const h = halalOf(p), adds = h.additives;
    let html = '';
    if (adds.length) html += '<section class="xcard"><div class="card-title"><h2>Additifs<span class="count">' + adds.length + '</span></h2></div><div class="adds">' + adds.map(addHTML).join('') + '</div></section>';
    else if (p.ing) html += '<p class="hint center">Aucun additif (E…) dans la liste d’ingrédients.</p>';
    if (p.ing) html += '<details class="xcard ing"' + (h.status === 'red' || h.status === 'orange' ? ' open' : '') + '><summary>Ingrédients</summary><p class="ing-text">' + H.highlight(p.ing, h.hits, esc) + '</p></details>';
    return html;
  }
  const needsDetails = p => !!(p && p.source === 'off' && p.code && p.ing === undefined);
  async function fetchOff(code) {
    const res = await fetch(OFF + '/api/v2/product/' + code + '.json?fields=' + FIELDS);
    const data = await res.json().catch(() => null);
    return data && data.status === 1 && data.product ? normalizeOff(data.product, code) : null;
  }
  function vibrateFor(p) {
    if (!navigator.vibrate || !S.warn.on) return;
    const rs = halalOf(p).reasons;
    try {
      if (rs.some(r => r.level === 'red')) navigator.vibrate([180, 90, 180, 90, 180]);
      else if (rs.some(r => r.cat === 'core' || r.cat === 'origin')) navigator.vibrate([120, 80, 120]);
    } catch (e) { /* rien */ }
  }

  function unitOf(qty) { return /\d\s*(ml|cl|dl|l)\b/i.test(String(qty || '')) ? 'ml' : 'g'; }
  function normalizeOff(p, codeHint) {
    if (!p) return null;
    const n = p.nutriments || {};
    let kcal = n['energy-kcal_100g'];
    if ((kcal == null || kcal === '') && n['energy_100g'] != null) kcal = num(n['energy_100g']) / 4.184;
    const opt = v => (v == null || v === '' ? null : num(v));
    const code = String(p.code || codeHint || '');
    const sq = num(p.serving_quantity);
    const name = (p.product_name_fr || p.product_name || p.generic_name_fr || '').trim();
    return {
      key: code || 'off-' + uid(), code, name: name || 'Produit sans nom',
      brand: String(p.brands || '').split(',')[0].trim(), qty: String(p.quantity || '').trim(),
      image: p.image_front_small_url || p.image_small_url || '',
      unit: unitOf(p.quantity),
      portions: sq > 0 && sq < 2000 ? [{ label: 'portion', g: Math.round(sq * 10) / 10 }] : [],
      nutri: /^[a-e]$/.test(String(p.nutriscore_grade || '').toLowerCase()) ? String(p.nutriscore_grade).toLowerCase() : '',
      per100: { kcal: num(kcal), p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g),
        sugar: opt(n.sugars_100g), sfat: opt(n['saturated-fat_100g']), fiber: opt(n.fiber_100g), salt: opt(n.salt_100g) },
      hasNutri: kcal != null && kcal !== '',
      source: 'off',
      ing: String(p.ingredients_text_fr || p.ingredients_text || '').replace(/_/g, '').trim(),
      ingTags: Array.isArray(p.ingredients_tags) ? p.ingredients_tags.slice(0, 80) : [],
      additives: Array.isArray(p.additives_tags) ? p.additives_tags : [],
      labels: Array.isArray(p.labels_tags) ? p.labels_tags : [],
      analysis: Array.isArray(p.ingredients_analysis_tags) ? p.ingredients_analysis_tags : [],
      traces: Array.isArray(p.traces_tags) ? p.traces_tags : [],
      allergens: Array.isArray(p.allergens_tags) ? p.allergens_tags : []
    };
  }
  const portionsOf = p => (p && Array.isArray(p.portions) ? p.portions.filter(x => x && x.g > 0) : []);
  function portionText(label, amount) {
    const n = f1(amount);
    if (Math.abs(amount - 1) < 1e-9) return '1 ' + label;
    const plural = /^[a-zàâäéèêëîïôöûüùç-]+$/i.test(label) && !/[sxz]$/i.test(label) ? label + 's' : label;
    return n + ' ' + plural;
  }
  function gramsFrom(p, unitIdx, amount) {
    const ps = portionsOf(p);
    return unitIdx > 0 && ps[unitIdx - 1] ? amount * ps[unitIdx - 1].g : amount;
  }
  function calc(p, g) { const k = g / 100, n = p.per100; return { kcal: n.kcal * k, p: n.p * k, c: n.c * k, f: n.f * k }; }
  function lastEntryOf(key) { for (let i = S.entries.length - 1; i >= 0; i--) if (S.entries[i].key === key) return S.entries[i]; return null; }
  function defaultAmountOf(p) {
    const last = lastEntryOf(p.key);
    const ps = portionsOf(p);
    if (last && last.amount > 0) { const u = Math.min(last.unitIdx || 0, ps.length); return { unitIdx: u, amount: u === 0 ? last.grams : last.amount }; }
    return ps.length ? { unitIdx: 1, amount: 1 } : { unitIdx: 0, amount: 100 };
  }
  function amountLabel(p, unitIdx, amount, grams) {
    const ps = portionsOf(p), u = (p && p.unit) || 'g';
    if (unitIdx > 0 && ps[unitIdx - 1]) return portionText(ps[unitIdx - 1].label, amount) + ' (' + f1(grams) + ' ' + u + ')';
    return f1(grams) + ' ' + u;
  }
  function remember(p) {
    if (!p || p.source === 'quick') return;
    const copy = Object.assign({}, p); delete copy.s;
    S.products[p.key] = copy;
    S.recents = [p.key].concat(S.recents.filter(k => k !== p.key)).slice(0, 40);
  }
  function rebuildFromEntry(e) {
    const k = e.grams > 0 ? 100 / e.grams : 0;
    return { key: e.key || 'x-' + e.id, code: '', name: e.name, brand: e.brand || '', qty: '', image: '', unit: e.unit || 'g', portions: [], nutri: '',
      per100: { kcal: e.kcal * k, p: e.p * k, c: e.c * k, f: e.f * k, sugar: null, sfat: null, fiber: null, salt: null }, hasNutri: true, source: 'custom' };
  }

  /* ---------- Calculs du jour ---------- */
  let day = today();
  let weekStart = mondayOf(day);
  let tab = 'journal';
  let range = 7;
  function mondayOf(d) { const x = parseYmd(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ymd(x); }
  const entriesOf = d => S.entries.filter(e => e.date === d);
  function totals(d) {
    return entriesOf(d).reduce((a, e) => { a.kcal += e.kcal; a.p += e.p; a.c += e.c; a.f += e.f; return a; }, { kcal: 0, p: 0, c: 0, f: 0 });
  }
  const burnedOf = d => S.exercises.filter(x => x.date === d).reduce((a, x) => a + num(x.kcal), 0);
  const loggedDays = () => new Set(S.entries.map(e => e.date));
  function streakCount() {
    const L = loggedDays(); let d = today(); if (!L.has(d)) d = addDays(d, -1);
    let n = 0; while (L.has(d) && n < 3650) { n++; d = addDays(d, -1); } return n;
  }
  function latestWeight() { return S.weights.length ? S.weights[S.weights.length - 1].kg : (S.profile && num(S.profile.weight)) || 0; }
  function defaultMeal() { const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snack' : 'dinner'; }
  function dayLabel(d, long) {
    const t = today();
    if (d === t) return "Aujourd'hui";
    if (d === addDays(t, -1)) return 'Hier';
    return cap(parseYmd(d).toLocaleDateString('fr-FR', long === false ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }));
  }

  /* ================= Journal ================= */
  function renderJournal() {
    const h = new Date().getHours();
    const name = S.profile && S.profile.name ? ' ' + S.profile.name : '';
    $('#hello').textContent = (h >= 18 || h < 4 ? 'Bonsoir' : 'Bonjour') + name;
    $('#dayTitle').textContent = dayLabel(day);
    $('#streakN').textContent = streakCount();
    renderWeek(); renderHero(); renderMeals(); renderWater(); renderActivity();
  }
  function renderWeek() {
    const t = today(), L = loggedDays(), letters = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    $('#weekDays').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      const cls = 'wd' + (d === day ? ' sel' : '') + (d === t ? ' today' : '') + (L.has(d) ? ' has' : '');
      return '<button class="' + cls + '" data-act="day" data-d="' + d + '"' + (d > t ? ' disabled' : '') + ' aria-label="' + esc(dayLabel(d)) + '"' + (d === day ? ' aria-current="date"' : '') +
        '><span>' + letters[i] + '</span><b>' + parseYmd(d).getDate() + '</b><i></i></button>';
    }).join('');
    $('#wNext').disabled = addDays(weekStart, 7) > t;
  }
  function renderHero() {
    const T = totals(day), B = burnedOf(day), G = S.goals;
    const budget = G.kcal + B, rem = budget - T.kcal;
    const C = 339.29, ratio = budget > 0 ? T.kcal / budget : 0;
    $('#hRingVal').style.strokeDashoffset = String(C * (1 - clamp(ratio, 0, 1)));
    $('#hRing').classList.toggle('over', rem < 0);
    $('#hEaten').textContent = fk(T.kcal);
    $('#hBurned').textContent = fk(B);
    $('#hRemain').textContent = fk(Math.abs(rem));
    $('#hRemainLbl').textContent = rem < 0 ? 'kcal en trop' : 'kcal restantes';
    $('#heroMacros').innerHTML = MACROS.map(m => {
      const v = T[m.k], g = G[m.k] || 0;
      return '<div class="hm"><span>' + m.label + '</span><div class="bar"><i style="width:' + (g > 0 ? clamp(v / g, 0, 1) * 100 : 0).toFixed(1) + '%"></i></div>' +
        '<b class="num">' + f1(v) + ' <small>/ ' + r0(g) + ' g</small></b></div>';
    }).join('');
  }
  function entryRow(e) {
    const p = getP(e.key);
    const sub = e.pending ? f1(e.grams) + ' g · sera complété au retour d’Internet' : e.unknown ? f1(e.grams) + ' g · touche pour créer le produit' : e.key === 'quick' ? 'Ajout rapide' : (e.brand ? e.brand + ' · ' : '') + amountLabel(p || { unit: e.unit }, e.unitIdx || 0, e.amount, e.grams);
    return '<li><button class="entry" data-act="editEntry" data-id="' + esc(e.id) + '"><span class="en">' + esc(e.name) + halalPill(p) + '</span><span class="es">' + esc(sub) +
      '</span><span class="ek num">' + (e.pending ? '…' : fk(e.kcal)) + '<small>kcal</small></span></button></li>';
  }
  function renderMeals() {
    const y = addDays(day, -1);
    $('#meals').innerHTML = MEALS.map(m => {
      const list = S.entries.filter(e => e.date === day && e.meal === m.id).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const k = list.reduce((a, e) => a + e.kcal, 0);
      const target = Math.round(S.goals.kcal * m.share / 10) * 10;
      const yCount = list.length ? 0 : S.entries.filter(e => e.date === y && e.meal === m.id).length;
      return '<section class="card meal">' +
        '<div class="meal-row"><span class="micon" style="--mc:' + m.color + '">' + ic(m.icon) + '</span>' +
        '<div class="meal-title"><h3>' + m.label + '</h3><p class="num">' + fk(k) + ' / ' + fk(target) + ' kcal</p></div>' +
        '<button class="iconbtn ghost" data-act="mealMenu" data-meal="' + m.id + '" aria-label="Options ' + m.label + '">' + ic('i-dots') + '</button>' +
        '<button class="addbtn" data-act="addFood" data-meal="' + m.id + '" aria-label="Ajouter ' + m.to + '">' + ic('i-plus') + '</button></div>' +
        '<div class="mbar"><i style="width:' + (target > 0 ? clamp(k / target, 0, 1) * 100 : 0).toFixed(1) + '%;background:' + (k > target * 1.15 ? 'var(--burn)' : m.color) + '"></i></div>' +
        (list.length ? '<ul class="entries">' + list.map(entryRow).join('') + '</ul>' :
          (yCount ? '<button class="copyrow" data-act="copyMeal" data-meal="' + m.id + '">' + ic('i-copy', 'sm') + 'Reprendre comme hier (' + yCount + ' aliment' + (yCount > 1 ? 's' : '') + ')</button>' : '')) +
        '</section>';
    }).join('');
  }
  function glassSvg() {
    return '<svg viewBox="0 0 24 32" aria-hidden="true"><path class="gw" d="M4.6 10.5h14.8l-1.6 17.3a1.6 1.6 0 0 1-1.6 1.5H7.8a1.6 1.6 0 0 1-1.6-1.5z"/><path class="gl" d="M3 2.5h18l-2.2 25.4a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z"/></svg>';
  }
  function renderWater() {
    const ml = num(S.water[day]), goal = S.goals.water || 2000;
    const n = clamp(Math.round(goal / 250), 4, 16), filled = Math.floor(ml / 250 + 1e-9);
    const shown = Math.max(n, filled + (filled >= n ? 1 : 0));
    $('#waterCard').innerHTML =
      '<div class="meal-row"><span class="micon" style="--mc:var(--water)">' + ic('i-drop') + '</span>' +
      '<div class="meal-title"><h3>Eau</h3><p class="num">' + fL(ml) + ' / ' + fL(goal) + ' L' + (ml >= goal ? ' · objectif atteint' : '') + '</p></div>' +
      '<button class="iconbtn ghost" data-act="water" data-v="-250" aria-label="Retirer un verre"' + (ml <= 0 ? ' disabled' : '') + '>' + ic('i-minus') + '</button>' +
      '<button class="addbtn water" data-act="water" data-v="250" aria-label="Ajouter un verre de 250 ml">' + ic('i-plus') + '</button></div>' +
      '<div class="glasses">' + Array.from({ length: shown }, (_, i) =>
        '<button class="glass' + (i < filled ? ' full' : i === filled ? ' next' : '') + '" data-act="glass" data-i="' + i + '" aria-label="' + (i + 1) + ' verre' + (i ? 's' : '') + '">' + glassSvg() + '</button>').join('') + '</div>';
  }
  function renderActivity() {
    const list = S.exercises.filter(x => x.date === day);
    const k = list.reduce((a, x) => a + num(x.kcal), 0);
    $('#activityCard').innerHTML =
      '<div class="meal-row"><span class="micon" style="--mc:var(--burn)">' + ic('i-run') + '</span>' +
      '<div class="meal-title"><h3>Activité</h3><p class="num">' + (k ? fk(k) + ' kcal brûlées · ajoutées à ton budget' : 'Ajoute ton sport pour gagner des calories') + '</p></div>' +
      '<button class="addbtn burn" data-act="addExercise" aria-label="Ajouter une activité">' + ic('i-plus') + '</button></div>' +
      (list.length ? '<ul class="entries">' + list.map(x =>
        '<li><button class="entry" data-act="exMenu" data-id="' + esc(x.id) + '"><span class="en">' + esc(x.name) + '</span><span class="es">' + (x.minutes ? r0(x.minutes) + ' min' : 'Saisie libre') +
        '</span><span class="ek num">−' + fk(x.kcal) + '<small>kcal</small></span></button></li>').join('') + '</ul>' : '');
  }

  function setDay(d) {
    if (!d || d > today()) return;
    day = d; weekStart = mondayOf(d); renderJournal();
  }

  /* ================= Couches (fiches, scanner) + bouton retour ================= */
  const layers = [];
  function syncLayers() {
    layers.forEach((l, i) => { l.el.style.zIndex = String(31 + i * 2); });
    const scrim = $('#scrim');
    scrim.style.zIndex = String(30 + Math.max(0, layers.length - 1) * 2);
    scrim.classList.toggle('show', layers.length > 0);
    document.body.classList.toggle('locked', layers.length > 0);
  }
  function mountSheet(inner, opts) {
    opts = opts || {};
    const el = document.createElement('section');
    el.className = 'sheet' + (opts.tall ? ' tall' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<div class="sheet-in' + (opts.foot ? ' has-foot' : '') + '">' + inner + '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    return el;
  }
  function destroyLayer(l) {
    if (l.onClose) { try { l.onClose(); } catch (e) { /* rien */ } }
    if (!l.persistent) { l.el.classList.remove('show'); setTimeout(() => l.el.remove(), 320); }
  }
  function pushLayer(l) { layers.push(l); syncLayers(); try { history.pushState({ nsLayer: layers.length }, ''); } catch (e) { /* rien */ } return l; }
  function swapLayer(l) {
    if (!layers.length) return pushLayer(l);
    destroyLayer(layers.pop()); layers.push(l); syncLayers();
    try { history.replaceState({ nsLayer: layers.length }, ''); } catch (e) { /* rien */ }
    return l;
  }
  function openLayer(l, swap) { return swap ? swapLayer(l) : pushLayer(l); }
  function closeTop() { if (!layers.length) return; if (history.state && history.state.nsLayer === layers.length) history.back(); else { destroyLayer(layers.pop()); syncLayers(); } }
  function closeAll() {
    if (!layers.length) return;
    const n = history.state && history.state.nsLayer === layers.length ? layers.length : 0;
    if (n) history.go(-n); else { while (layers.length) destroyLayer(layers.pop()); syncLayers(); }
  }
  window.addEventListener('popstate', e => {
    const target = (e.state && e.state.nsLayer) || 0;
    while (layers.length > target) destroyLayer(layers.pop());
    syncLayers();
  });
  const topLayer = () => layers[layers.length - 1];
  const head = (title, extra) => '<div class="grab"></div><div class="sheet-head"><h3>' + esc(title) + '</h3>' + (extra || '') +
    '<button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button></div>';

  /* Boutons de confirmation en deux appuis */
  function arm(btn, text) {
    if (btn.classList.contains('armed')) return true;
    const orig = btn.innerHTML;
    btn.classList.add('armed'); btn.textContent = text || btn.dataset.confirm || 'Appuie encore pour confirmer';
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove('armed'); btn.innerHTML = orig; } }, 3500);
    return false;
  }

  /* ---------- Feuille d'actions ---------- */
  function actionSheet(title, items, opts) {
    opts = opts || {};
    const body = opts.grid
      ? '<div class="as-grid">' + items.map((it, i) => '<button class="as-tile" data-i="' + i + '"><span class="micon" style="--mc:' + (it.color || 'var(--brand)') + '">' + ic(it.icon) + '</span>' + esc(it.label) + '</button>').join('') + '</div>'
      : '<div class="as-list">' + items.map((it, i) => '<button class="as-item' + (it.danger ? ' danger' : '') + '" data-i="' + i + '">' +
        (it.icon ? '<span class="micon sm" style="--mc:' + (it.color || 'var(--surface-3)') + ';' + (it.color ? '' : 'color:var(--ink)') + '">' + ic(it.icon) + '</span>' : '') +
        '<span class="min0"><b>' + esc(it.label) + '</b>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span></button>').join('') + '</div>';
    const el = mountSheet('<div class="grab"></div>' + (title ? '<div class="as-title">' + esc(title) + '</div>' : '') + body);
    const layer = pushLayer({ el });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b || topLayer() !== layer) return;
      const it = items[+b.dataset.i];
      if (it.confirm && !arm(b, it.confirm)) return;
      if (it.open) it.open(); else { closeTop(); if (it.run) it.run(); }
    });
    return layer;
  }

  /* ================= Toast ================= */
  let toastT;
  function toast(t) {
    const el = $('#toast'); el.textContent = t;
    el.classList.toggle('top', layers.length > 0);
    el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2300);
  }

  /* ================= Ajouter un aliment ================= */
  let AF = null;
  function openAddFood(meal, swap) {
    AF = { meal: MEAL[meal] ? meal : defaultMeal(), q: '', tab: 'recent', off: [], offState: 'idle', req: 0, added: 0, flash: null, t: 0 };
    const el = mountSheet(
      '<div class="grab"></div>' +
      '<div class="af-head"><button class="iconbtn ghost" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button>' +
      '<button class="meal-pick" data-act="afMealPick" id="afMealBtn"></button><span></span></div>' +
      '<div class="searchbox">' + ic('i-search', 'sm') +
      '<input id="afInput" type="search" placeholder="Aliment, marque ou code-barres" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" aria-label="Rechercher un aliment">' +
      '<button class="sb-btn" id="afClear" data-act="afClear" aria-label="Effacer" hidden>' + ic('i-x', 'sm') + '</button>' +
      '<button class="sb-btn scan" data-act="afScan" aria-label="Scanner un code-barres">' + ic('i-scan', 'sm') + '</button></div>' +
      '<div class="af-quick" id="afQuick">' +
      '<button data-act="afScan">' + ic('i-scan') + 'Scanner</button>' +
      '<button data-act="afQuickAdd">' + ic('i-bolt') + 'Ajout rapide</button>' +
      '<button data-act="afCreate">' + ic('i-edit') + 'Créer un aliment</button></div>' +
      '<div class="tabs" id="afTabs" role="tablist">' +
      '<button data-act="afTab" data-t="recent" role="tab">Récents</button><button data-act="afTab" data-t="fav" role="tab">Favoris</button><button data-act="afTab" data-t="mine" role="tab">Mes aliments</button><button data-act="afTab" data-t="common" role="tab">Courants</button></div>' +
      '<div id="afList"></div><div id="afFoot"></div>', { tall: true, foot: true });
    AF.el = el;
    openLayer({ el, kind: 'addfood', onClose: () => { if (AF && AF.el === el) { clearTimeout(AF.t); AF = null; } } }, swap);
    const inp = $('#afInput', el);
    inp.addEventListener('input', () => {
      if (!AF) return;
      AF.q = inp.value; AF.req++; AF.off = []; AF.offState = 'idle';
      $('#afClear', el).hidden = !AF.q;
      clearTimeout(AF.t);
      const q = AF.q.trim();
      if (q.length >= 3 && !/^\d+$/.test(q) && navigator.onLine) { if (SEARCH_CACHE.has(q)) offSearch(q); else AF.t = setTimeout(() => offSearch(q), 650); }
      renderAF();
    });
    inp.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !AF) return;
      e.preventDefault(); clearTimeout(AF.t);
      const q = inp.value.trim();
      if (/^\d{8,14}$/.test(q)) lookupCode(q);
      else if (q.length >= 2) { offSearch(q); inp.blur(); }
    });
    renderAF();
  }
  function renderAF() {
    if (!AF) return;
    const el = AF.el, m = MEAL[AF.meal], q = AF.q.trim();
    $('#afMealBtn', el).innerHTML = '<span class="micon sm" style="--mc:' + m.color + '">' + ic(m.icon) + '</span>' + esc(m.label) + ic('i-down', 'sm');
    $('#afQuick', el).hidden = !!q;
    $('#afTabs', el).hidden = !!q;
    $$('#afTabs button', el).forEach(b => { const on = b.dataset.t === AF.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    $('#afList', el).innerHTML = q ? searchHTML(q) : tabHTML();
    $('#afFoot', el).innerHTML = AF.added ? '<div class="sticky-foot"><button class="btn primary" data-act="close">' + ic('i-check') + 'Terminé · ' + AF.added + ' ajouté' + (AF.added > 1 ? 's' : '') + '</button></div>' : '<div style="height:20px"></div>';
  }
  const imgTag = p => p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
  function thumbHTML(p) {
    return '<span class="thumb">' + esc((p.name || '?').charAt(0).toUpperCase()) + imgTag(p) + '</span>';
  }
  function rowHTML(p) {
    const d = defaultAmountOf(p), g = gramsFrom(p, d.unitIdx, d.amount), k = calc(p, g).kcal;
    const amt = d.unitIdx > 0 ? portionText(portionsOf(p)[d.unitIdx - 1].label, d.amount) : f1(g) + ' ' + (p.unit || 'g');
    const done = AF && AF.flash === p.key;
    return '<div class="row"><button class="row-main" data-act="afOpen" data-k="' + esc(p.key) + '">' + thumbHTML(p) +
      '<span class="rt"><b>' + esc(p.name) + halalPill(p) + '</b><small>' + esc((p.brand ? p.brand + ' · ' : '') + amt) + ' · ' + fk(k) + ' kcal</small></span></button>' +
      '<button class="qadd' + (done ? ' done' : '') + '" data-act="afAdd1" data-k="' + esc(p.key) + '" aria-label="Ajouter ' + esc(p.name) + '">' + ic(done ? 'i-check' : 'i-plus', 'sm') + '</button></div>';
  }
  const listHTML = list => '<div class="list">' + list.map(rowHTML).join('') + '</div>';
  function emptyHTML(icon, title, text, btn) {
    return '<div class="empty">' + ic(icon) + '<b>' + esc(title) + '</b><span>' + esc(text) + '</span>' + (btn || '') + '</div>';
  }
  function tabHTML() {
    if (AF.tab === 'recent') {
      const list = S.recents.map(getP).filter(Boolean).slice(0, 30);
      return list.length ? listHTML(list) : emptyHTML('i-search', 'Pas encore d’aliments', 'Cherche un aliment, scanne un code-barres ou choisis dans « Courants ».');
    }
    if (AF.tab === 'fav') {
      const list = S.favorites.map(getP).filter(Boolean);
      return list.length ? listHTML(list) : emptyHTML('i-star', 'Aucun favori', 'Ouvre un aliment et touche l’étoile pour le retrouver ici en un clic.');
    }
    if (AF.tab === 'mine') {
      const list = Object.values(S.products).filter(p => p.source === 'custom').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      return list.length ? listHTML(list) : emptyHTML('i-edit', 'Aucun aliment perso', 'Crée tes plats maison ou un produit introuvable.', '<button class="btn primary" data-act="afCreate">Créer un aliment</button>');
    }
    return listHTML(GEN);
  }
  function matchList(list, q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return list.map(p => {
      const s = p.s || norm(p.name + ' ' + (p.brand || ''));
      if (!words.every(w => s.includes(w))) return null;
      const n = norm(p.name);
      return { p, score: (n.startsWith(words[0]) ? 0 : 1) + n.length / 100 };
    }).filter(Boolean).sort((a, b) => a.score - b.score).map(x => x.p);
  }
  function searchHTML(q) {
    let html = '';
    if (/^\d{8,14}$/.test(q)) {
      html += '<div class="list"><div class="row"><button class="row-main" data-act="afCode">' + '<span class="thumb">' + ic('i-scan', 'sm') + '</span><span class="rt"><b>Chercher le code-barres</b><small class="num">' + esc(q) + '</small></span></button></div></div>';
      return html;
    }
    const mine = matchList(Object.values(S.products).filter(p => p.source !== 'gen'), q).slice(0, 6);
    const gen = matchList(GEN, q).slice(0, 8);
    const shown = new Set(mine.map(p => p.key));
    if (mine.length) html += '<p class="sect">Mes aliments</p>' + listHTML(mine);
    if (gen.length) html += '<p class="sect">Aliments courants</p>' + listHTML(gen);
    html += '<p class="sect">Produits du commerce</p>';
    if (!navigator.onLine) html += '<p class="hint">Hors ligne : seuls tes aliments et les aliments courants sont disponibles. La recherche dans les produits du commerce reviendra avec Internet.</p>';
    else if (q.length < 3) html += '<p class="hint">Tape au moins 3 lettres pour chercher dans 3 millions de produits.</p>';
    else if (AF.offState === 'loading' || AF.offState === 'idle') html += '<div class="loading"><div class="spin"></div>Recherche des produits…</div>';
    else if (AF.offState === 'error') html += '<div class="msg err">La recherche ne répond pas (connexion, ou trop de recherches d’affilée). <button class="linkbtn" data-act="afRetry">Réessayer</button></div>';
    else {
      const off = AF.off.filter(p => !shown.has(p.key));
      html += off.length ? listHTML(off) : '<p class="hint">Aucun produit trouvé. Essaie la marque, ou <button class="linkbtn" data-act="afCreate">crée l’aliment</button>.</p>';
    }
    return html;
  }
  async function offSearch(q) {
    if (!AF) return;
    track('search', { q: q.slice(0, 60) });
    const id = ++AF.req;
    if (SEARCH_CACHE.has(q)) { AF.off = SEARCH_CACHE.get(q); AF.offState = 'done'; renderAF(); return; }
    AF.offState = 'loading'; renderAF();
    try {
      const url = OFF_SEARCH + '/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=' + FIELDS;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = (data.products || []).map(p => normalizeOff(p)).filter(p => p && p.hasNutri && p.name !== 'Produit sans nom');
      list.forEach(p => { if (!S.products[p.key]) TMP.set(p.key, p); });
      SEARCH_CACHE.set(q, list);
      if (!AF || id !== AF.req) return;
      AF.off = list; AF.offState = 'done';
    } catch (e) {
      if (!AF || id !== AF.req) return;
      AF.offState = 'error';
    }
    renderAF();
  }
  function quickAddDefault(p) {
    if (!p) return;
    const d = defaultAmountOf(p), g = gramsFrom(p, d.unitIdx, d.amount), meal = AF ? AF.meal : defaultMeal();
    addEntry(p, { meal, unitIdx: d.unitIdx, amount: d.amount, grams: g });
    if (AF) {
      AF.added++; AF.flash = p.key; renderAF();
      const k = p.key; setTimeout(() => { if (AF && AF.flash === k) { AF.flash = null; renderAF(); } }, 1400);
    }
    toast(p.name + ' ajouté · ' + fk(calc(p, g).kcal) + ' kcal');
  }

  /* ================= Entrées ================= */
  function addEntry(p, o) {
    track('product_add', { source: p.source || 'off' });
    const t = calc(p, o.grams);
    S.entries.push({ id: uid(), date: day, ts: Date.now(), mt: now(), meal: o.meal, key: p.key, name: p.name, brand: p.brand || '', amount: o.amount, unitIdx: o.unitIdx, unit: p.unit || 'g', grams: o.grams, kcal: t.kcal, p: t.p, c: t.c, f: t.f });
    remember(p); save(); renderAll();
  }
  function editEntry(id) {
    const e = S.entries.find(x => x.id === id); if (!e) return;
    if (e.pending || e.unknown) {
      actionSheet(e.unknown ? 'Produit inconnu' : 'En attente de connexion', [
        { label: e.unknown ? 'Créer ce produit' : 'Saisir les valeurs à la main', sub: 'Avec l’étiquette du paquet · code ' + e.key, icon: 'i-edit', color: 'var(--brand)', open: () => openCreate({ code: e.key, swap: true }) },
        { label: 'Supprimer du journal', icon: 'i-trash', color: 'var(--danger)', danger: true, confirm: 'Appuie encore pour supprimer', run: () => { removeEntries(x => x.id === id); save(); renderAll(); toast('Supprimé'); } }
      ]);
      return;
    }
    if (e.key === 'quick') { openQuick({ entry: e }); return; }
    openProduct(getP(e.key) || rebuildFromEntry(e), { entry: e });
  }
  function copyMeal(meal) {
    const y = addDays(day, -1);
    const list = S.entries.filter(e => e.date === y && e.meal === meal);
    if (!list.length) return;
    list.forEach((e, i) => S.entries.push(Object.assign({}, e, { id: uid(), date: day, ts: now() + i, mt: now() })));
    save(); renderAll();
    toast(list.length + ' aliment' + (list.length > 1 ? 's' : '') + ' repris d’hier');
  }
  function openMealMenu(meal) {
    const m = MEAL[meal], has = S.entries.some(e => e.date === day && e.meal === meal);
    const y = addDays(day, -1), yHas = S.entries.some(e => e.date === y && e.meal === meal);
    const items = [
      { label: 'Ajouter un aliment', icon: 'i-search', color: 'var(--brand)', open: () => openAddFood(meal, true) },
      { label: 'Scanner un produit', icon: 'i-scan', color: 'var(--brand)', open: () => openAddFoodThenScan(meal) },
      { label: 'Ajout rapide', sub: 'Juste les calories (restaurant, plat maison…)', icon: 'i-bolt', color: 'var(--carb)', open: () => openQuick({ meal, swap: true }) }
    ];
    if (yHas) items.push({ label: 'Reprendre le repas d’hier', icon: 'i-copy', color: 'var(--water)', run: () => copyMeal(meal) });
    if (has) items.push({ label: 'Vider ce repas', icon: 'i-trash', color: 'var(--danger)', danger: true, confirm: 'Appuie encore pour tout supprimer', run: () => {
      removeEntries(e => e.date === day && e.meal === meal); save(); renderAll(); toast(m.label + ' vidé');
    } });
    actionSheet(m.label, items);
  }
  function openAddFoodThenScan(meal) { openAddFood(meal, true); openScanner(); }

  /* ================= Fiche produit ================= */
  function openProduct(p, opts) {
    opts = opts || {};
    const el = mountSheet('', { tall: true, foot: true });
    const layer = openLayer({ el, kind: 'product' }, opts.swap);
    fillProduct(layer, p, opts);
    return layer;
  }
  function fillProduct(layer, p, opts) {
    opts = opts || {};
    const entry = opts.entry || null;
    let meal0 = entry ? entry.meal : (opts.meal || (AF && AF.meal) || defaultMeal());
    if (!MEAL[meal0]) meal0 = defaultMeal();
    const ps = { p, entry, meal: meal0 };
    const portions = portionsOf(p);
    if (entry) { ps.unitIdx = Math.min(entry.unitIdx || 0, portions.length); ps.amount = ps.unitIdx > 0 ? entry.amount : entry.grams; }
    else { const d = defaultAmountOf(p); ps.unitIdx = d.unitIdx; ps.amount = d.amount; }
    const box = $('.sheet-in', layer.el);
    box.innerHTML = productHTML(ps);
    layer.el.scrollTop = 0;
    wireProduct(box, ps);
    if (opts.fromScan && !needsDetails(p)) vibrateFor(p);
    if (needsDetails(p)) {
      fetchOff(p.code).then(np => {
        if (!np) { p.ing = p.ing || ''; return; }
        ['ing', 'ingTags', 'additives', 'labels', 'analysis', 'traces', 'allergens'].forEach(k => { p[k] = np[k]; });
        if (!p.image) p.image = np.image;
        if (!p.nutri) p.nutri = np.nutri;
        if (S.products[p.key]) { S.products[p.key] = p; save(); }
        if (box.isConnected) { $('#psHalal', box).innerHTML = halalCardHTML(p); $('#psExtra', box).innerHTML = extraHTML(p); if (opts.fromScan) vibrateFor(p); }
        if (AF) renderAF();
        renderMeals();
      }).catch(() => {});
    }
  }
  function productHTML(ps) {
    const p = ps.p, n = p.per100, u = p.unit || 'g', portions = portionsOf(p);
    const isFav = S.favorites.includes(p.key);
    const src = p.source === 'gen' ? 'Aliment courant' : p.source === 'custom' ? 'Mon aliment' : 'Produit';
    const img = '<div class="ps-img">' + esc(p.name.charAt(0).toUpperCase()) + imgTag(p) + '</div>';
    const units = '<button class="chip" data-u="0">' + u + '</button>' + portions.map((x, i) => '<button class="chip" data-u="' + (i + 1) + '">' + esc(x.label) + ' · ' + f1(x.g) + ' ' + u + '</button>').join('');
    const row = (label, key, sub) => n[key] == null ? '' : '<div class="tr' + (sub ? ' sub' : '') + '"><span>' + label + '</span><span class="num">' + f1(n[key]) + (key === 'kcal' ? '' : ' g') + '</span><span class="num" data-q="' + key + '"></span></div>';
    return '<div class="grab"></div>' +
      '<div class="ps-top"><button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button><span class="ps-src">' + src + '</span>' +
      '<button class="iconbtn star' + (isFav ? ' on' : '') + '" data-pa="fav" aria-label="' + (isFav ? 'Retirer des favoris' : 'Ajouter aux favoris') + '" aria-pressed="' + isFav + '">' + ic('i-star') + '</button></div>' +
      '<div class="ps-head">' + img + '<div class="min0"><h3 class="ps-name">' + esc(p.name) + '</h3><p class="ps-brand">' + esc([p.brand, p.qty].filter(Boolean).join(' · ') || (p.source === 'gen' ? 'Valeurs moyennes' : '')) + '</p>' +
      (p.nutri ? '<span class="ns">Nutri-Score <b style="background:' + NUTRI_COLORS[p.nutri] + '">' + p.nutri + '</b></span>' : '') + '</div></div>' +
      '<div id="psHalal">' + halalCardHTML(p) + '</div>' +
      (p.hasNutri === false ? '<div class="msg err">Les valeurs nutritionnelles de ce produit ne sont pas encore disponibles. Tu peux le recréer avec « Créer un aliment ».</div>' : '') +
      '<div class="amt-row"><span class="flabel">Quantité</span><div class="amt"><button data-pa="minus" aria-label="Moins">' + ic('i-minus') + '</button>' +
      '<input id="psAmt" inputmode="decimal" aria-label="Quantité" autocomplete="off"><button data-pa="plus" aria-label="Plus">' + ic('i-plus') + '</button></div>' +
      '<div class="chips" id="psUnits">' + units + '</div></div>' +
      '<div class="ps-sum"><div class="donut"><svg viewBox="0 0 100 100" id="psDonut"></svg><div class="c"><b class="num" id="psK">0</b><span>kcal</span></div></div>' +
      '<div class="min0">' + MACROS.map(m => '<div class="pm"><i style="background:' + m.color + '"></i><span>' + m.label + '</span><b class="num" id="ps_' + m.k + '">0 g</b><em id="pse_' + m.k + '"></em></div>').join('') + '</div></div>' +
      '<p class="goalnote" id="psGoal"></p>' +
      '<div><span class="flabel">Repas</span><div class="seg" id="psMeal" style="margin-top:6px">' + MEALS.map(m => '<button data-meal="' + m.id + '">' + m.short + '</button>').join('') + '</div></div>' +
      '<div id="psExtra" style="display:flex;flex-direction:column;gap:14px">' + extraHTML(p) + '</div>' +
      '<div class="nt"><div class="tr th"><span>Valeurs</span><span>100 ' + u + '</span><span id="psQh">Quantité</span></div>' +
      row('Énergie (kcal)', 'kcal') + row('Protéines', 'p') + row('Glucides', 'c') + row('dont sucres', 'sugar', true) + row('Lipides', 'f') + row('dont saturés', 'sfat', true) + row('Fibres', 'fiber') + row('Sel', 'salt') + '</div>' +
      (p.code ? '<p class="hint center num">Code-barres ' + esc(p.code) + '</p>' : '') +
      '<div class="sticky-foot">' + (ps.entry ? '<button class="btn danger" data-pa="del" aria-label="Supprimer cet aliment du journal">' + ic('i-trash') + '</button>' : '') +
      '<button class="btn primary" data-pa="save" id="psSave">Ajouter</button></div>';
  }
  function donutSvg(parts, r, w) {
    const C = 2 * Math.PI * r, total = parts.reduce((a, x) => a + x.v, 0);
    let out = '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="' + w + '"/>';
    if (total <= 0) return out;
    let off = 0; const gap = parts.filter(x => x.v > 0).length > 1 ? 1.5 : 0;
    parts.forEach(x => {
      if (x.v <= 0) return;
      const len = Math.max(0, x.v / total * C - gap);
      out += '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + x.color + '" stroke-width="' + w + '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"/>';
      off += x.v / total * C;
    });
    return out;
  }
  function wireProduct(box, ps) {
    const p = ps.p, inp = $('#psAmt', box);
    const portions = portionsOf(p);
    const grams = () => gramsFrom(p, ps.unitIdx, ps.amount);
    const setInput = () => { inp.value = String(Math.round(ps.amount * 100) / 100).replace('.', ','); };
    function update() {
      const g = grams(), t = calc(p, g);
      $('#psK', box).textContent = fk(t.kcal);
      MACROS.forEach(m => {
        $('#ps_' + m.k, box).textContent = f1(t[m.k]) + ' g';
        const goal = S.goals[m.k]; $('#pse_' + m.k, box).textContent = goal > 0 ? r0(t[m.k] / goal * 100) + ' % de ton objectif' : '';
      });
      $('#psDonut', box).innerHTML = donutSvg(MACROS.map(m => ({ v: t[m.k] * m.kcal, color: m.color })), 40, 11);
      const pct = S.goals.kcal > 0 ? t.kcal / S.goals.kcal * 100 : 0;
      $('#psGoal', box).innerHTML = 'Soit <b>' + r0(pct) + ' %</b> de ton objectif du jour';
      $$('[data-q]', box).forEach(c => { const k = c.dataset.q, v = p.per100[k]; c.textContent = v == null ? '' : f1(v * g / 100) + (k === 'kcal' ? '' : ' g'); });
      $('#psQh', box).textContent = f1(g) + ' ' + (p.unit || 'g');
      $$('#psUnits .chip', box).forEach(c => c.classList.toggle('on', +c.dataset.u === ps.unitIdx));
      $$('#psMeal button', box).forEach(b => { const on = b.dataset.meal === ps.meal; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      $('#psSave', box).textContent = ps.entry ? 'Enregistrer' : 'Ajouter ' + MEAL[ps.meal].to;
      $('#psSave', box).disabled = !(g > 0);
    }
    inp.addEventListener('input', () => { ps.amount = Math.max(0, num(inp.value)); update(); });
    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    box.addEventListener('click', e => {
      const u = e.target.closest('[data-u]');
      if (u) {
        const ni = +u.dataset.u; if (ni === ps.unitIdx) return;
        const g = grams();
        ps.unitIdx = ni;
        ps.amount = ni === 0 ? Math.round(g * 10) / 10 || 100 : (ps.unitIdx > 0 && g > 0 && portions[ni - 1] ? Math.max(0.5, Math.round(g / portions[ni - 1].g * 2) / 2) : 1);
        setInput(); update(); return;
      }
      const mb = e.target.closest('[data-meal]'); if (mb) { ps.meal = mb.dataset.meal; update(); return; }
      const a = e.target.closest('[data-pa]'); if (!a) return;
      const act = a.dataset.pa;
      if (act === 'minus' || act === 'plus') {
        const step = ps.unitIdx > 0 ? 0.5 : (ps.amount >= 100 ? 10 : 5);
        ps.amount = Math.max(0, Math.round((ps.amount + (act === 'plus' ? step : -step)) * 100) / 100);
        setInput(); update();
      } else if (act === 'fav') {
        const i = S.favorites.indexOf(p.key);
        if (i >= 0) { S.favorites.splice(i, 1); S.tomb['f:' + p.key] = now(); } else { S.favorites.unshift(p.key); delete S.tomb['f:' + p.key]; const c = Object.assign({}, p); delete c.s; S.products[p.key] = S.products[p.key] || c; }
        save(); const on = i < 0;
        a.classList.toggle('on', on); a.setAttribute('aria-pressed', on);
        toast(on ? 'Ajouté aux favoris' : 'Retiré des favoris');
        if (AF) renderAF();
      } else if (act === 'del') {
        if (!arm(a, 'Supprimer ?')) return;
        removeEntries(x => x.id === ps.entry.id); save(); closeTop(); renderAll(); toast('Supprimé du journal');
      } else if (act === 'save') {
        const g = grams(); if (!(g > 0)) { toast('Indique une quantité'); return; }
        if (ps.entry) {
          const e2 = S.entries.find(x => x.id === ps.entry.id), t = calc(p, g);
          if (e2) Object.assign(e2, { meal: ps.meal, amount: ps.amount, unitIdx: ps.unitIdx, unit: p.unit || 'g', grams: g, kcal: t.kcal, p: t.p, c: t.c, f: t.f, name: p.name, brand: p.brand || '', mt: now(), pending: false, unknown: false });
          remember(p); save(); closeTop(); renderAll(); toast('Modifié');
        } else {
          if (AF) AF.meal = ps.meal;
          closeTop();
          addEntry(p, { meal: ps.meal, unitIdx: ps.unitIdx, amount: ps.amount, grams: g });
          if (AF) { AF.added++; renderAF(); }
          toast(p.name + ' ajouté · ' + fk(calc(p, g).kcal) + ' kcal');
        }
      }
    });
    setInput(); update();
  }

  /* ================= Code-barres ================= */
  async function lookupCode(raw, opts) {
    opts = opts || {};
    const code = String(raw || '').replace(/\D/g, '');
    if (code.length < 6) { toast('Ce code-barres ne semble pas valide'); return; }
    const local = S.products[code] || Object.values(S.products).find(p => p.code === code) || TMP.get(code);
    if (local) { openProduct(local, { swap: opts.swap, fromScan: opts.fromScan }); return; }
    const el = mountSheet('<div class="grab"></div><div class="sheet-head"><h3>Recherche du produit</h3><button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button></div>' +
      '<div class="loading"><div class="spin"></div>Code <b class="num">' + esc(code) + '</b> : recherche du produit…</div>');
    const layer = openLayer({ el, kind: 'product' }, opts.swap);
    let data = null, failed = false;
    try {
      const ctrl = new AbortController(); const tm = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(OFF + '/api/v2/product/' + code + '.json?fields=' + FIELDS, { signal: ctrl.signal });
      clearTimeout(tm);
      data = await res.json().catch(() => null);
      if (!res.ok && !(data && data.status === 0)) failed = true;
    } catch (e) { failed = true; }
    if (!layers.includes(layer)) return;
    const box = $('.sheet-in', el);
    if (data && data.status === 1 && data.product) {
      const p = normalizeOff(data.product, code); p.key = code; p.code = code;
      TMP.set(code, p);
      el.classList.add('tall'); $('.sheet-in', el).classList.add('has-foot');
      fillProduct(layer, p, opts);
      return;
    }
    if (failed) { offlineScan(layer, code, opts); return; }
    track('scan_unknown', { code, scan: !!opts.fromScan });
    box.innerHTML = head('Produit inconnu') +
      '<div class="msg">Le code <b class="num">' + esc(code) + '</b> n’est pas encore dans la base. Crée-le en 30 secondes avec l’étiquette du paquet : il sera reconnu à chaque prochain scan.</div>' +
      '<div class="row-btns"><button class="btn primary" data-act="createCode" data-code="' + esc(code) + '">Créer ce produit</button><button class="btn outline" data-act="rescan">Scanner un autre</button></div>';
  }

  /* Hors ligne : on garde le produit scanné et on le complète au retour d'Internet */
  function offlineScan(layer, code, opts) {
    track('scan_offline', { code, online: navigator.onLine });
    let meal = (opts && opts.meal) || (AF && AF.meal) || defaultMeal();
    const box = $('.sheet-in', layer.el);
    box.innerHTML = head(navigator.onLine ? 'Connexion trop lente' : 'Tu es hors ligne') +
      '<div class="msg">Impossible de lire la fiche du code <b class="num">' + esc(code) + '</b> pour l’instant. Ajoute-le quand même : ses calories, ses ingrédients et ses avertissements seront <b>complétés automatiquement</b> dès le retour d’Internet.</div>' +
      '<div class="field"><label for="olG">Quantité</label><div class="unit-input"><input id="olG" inputmode="decimal" value="100"><span>g</span></div></div>' +
      '<div><span class="flabel">Repas</span><div class="seg" id="olMeal" style="margin-top:6px">' + MEALS.map(m => '<button data-meal="' + m.id + '">' + m.short + '</button>').join('') + '</div></div>' +
      '<button class="btn primary" data-ol="add">Ajouter, à compléter plus tard</button>' +
      '<div class="row-btns"><button class="btn outline" data-act="retryCode" data-code="' + esc(code) + '">Réessayer</button><button class="btn outline" data-act="createCode" data-code="' + esc(code) + '">Saisir à la main</button></div>';
    const setMeal = () => $$('#olMeal button', box).forEach(b => b.classList.toggle('on', b.dataset.meal === meal));
    setMeal();
    box.onclick = ev => {
      const mb = ev.target.closest('[data-meal]'); if (mb) { meal = mb.dataset.meal; setMeal(); return; }
      if (!ev.target.closest('[data-ol]')) return;
      const g = num($('#olG', box).value);
      if (!(g > 0)) { toast('Indique une quantité'); return; }
      S.entries.push({ id: uid(), date: day, ts: Date.now(), mt: now(), meal, key: code, name: 'Produit scanné · ' + code, brand: '', amount: g, unitIdx: 0, unit: 'g', grams: g, kcal: 0, p: 0, c: 0, f: 0, pending: true });
      save(); closeTop(); renderAll();
      if (AF) { AF.added++; renderAF(); }
      toast('Ajouté : il sera complété dès que tu seras en ligne');
    };
  }
  let resolving = false;
  async function resolvePending() {
    const codes = [...new Set(S.entries.filter(e => e.pending).map(e => e.key))];
    if (!codes.length || resolving) return;
    resolving = true;
    let done = 0, unknown = 0;
    for (const code of codes) {
      let p = S.products[code] || TMP.get(code) || null, notFound = false;
      if (!p) {
        if (!navigator.onLine) break;
        try {
          const res = await fetch(OFF + '/api/v2/product/' + code + '.json?fields=' + FIELDS);
          const data = await res.json().catch(() => null);
          if (data && data.status === 1 && data.product) { p = normalizeOff(data.product, code); p.key = code; p.code = code; }
          else if (data && data.status === 0) notFound = true;
          else break;
        } catch (e) { break; }
      }
      S.entries.forEach(e => {
        if (!e.pending || e.key !== code) return;
        if (p) { const t = calc(p, e.grams); Object.assign(e, { name: p.name, brand: p.brand || '', unit: p.unit || 'g', kcal: t.kcal, p: t.p, c: t.c, f: t.f, pending: false, unknown: false, mt: now() }); }
        else if (notFound) Object.assign(e, { name: 'Produit inconnu · ' + code, pending: false, unknown: true, mt: now() });
      });
      if (p) { remember(p); done++; } else if (notFound) unknown++;
    }
    resolving = false;
    if (done || unknown) {
      save(); renderAll();
      toast(done ? done + ' produit' + (done > 1 ? 's' : '') + ' scanné' + (done > 1 ? 's' : '') + ' hors ligne complété' + (done > 1 ? 's' : '') : 'Un produit scanné est inconnu : touche-le dans ton journal pour le créer');
    }
  }

  /* ================= Scanner ================= */
  /* Lecteur principal : API BarcodeDetector (native sur Android, moteur ZXing en WebAssembly sur iPhone).
     On lit la zone du cadre en haute définition, on vérifie la clé de contrôle du code-barres,
     et on garde l'ancien lecteur (html5-qrcode) en secours. */
  const SC = { stream: null, track: null, running: false, handled: false, torch: false, zoom: false, caps: null, starting: false,
    det: null, engine: '', timer: 0, busy: false, n: 0, t0: 0, inst: null, legacy: false, last: '', lastN: 0 };
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  const DET_URLS = ['https://cdn.jsdelivr.net/npm/barcode-detector@3.0.7/dist/iife/ponyfill.min.js', 'https://fastly.jsdelivr.net/npm/barcode-detector@3.0.7/dist/iife/ponyfill.min.js', 'https://unpkg.com/barcode-detector@3.0.7/dist/iife/ponyfill.min.js'];
  const LEGACY_URLS = ['https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js', 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js'];
  const loaded = {};
  function loadScript(urls, ready) {
    const key = urls[0];
    if (ready()) return Promise.resolve();
    if (loaded[key]) return loaded[key];
    loaded[key] = urls.reduce((p, url) => p.catch(() => new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (ready() ? res() : rej(new Error('lib'))); s.onerror = () => { s.remove(); rej(new Error('net')); };
      document.head.appendChild(s);
    })), Promise.reject(new Error('start'))).catch(e => { loaded[key] = null; throw e; });
    return loaded[key];
  }
  async function getDetector() {
    if (SC.det) return SC.det;
    if ('BarcodeDetector' in window) {
      try {
        const sup = await window.BarcodeDetector.getSupportedFormats();
        if (sup.includes('ean_13')) { SC.det = new window.BarcodeDetector({ formats: FORMATS.filter(f => sup.includes(f)) }); SC.engine = 'natif'; return SC.det; }
      } catch (e) { /* on passe au moteur WebAssembly */ }
    }
    await loadScript(DET_URLS, () => !!(window.BarcodeDetectionAPI && window.BarcodeDetectionAPI.BarcodeDetector));
    SC.det = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMATS });
    SC.engine = 'zxing';
    return SC.det;
  }
  // Prépare le lecteur en avance (et le met en cache pour le mode hors ligne)
  function warmScanner() { getDetector().then(d => { const c = document.createElement('canvas'); c.width = c.height = 8; return d.detect(c).catch(() => {}); }).catch(() => {}); }
  // Clé de contrôle GTIN (EAN-8, EAN-13, UPC-A)
  function validGTIN(code) {
    if (!/^\d+$/.test(code)) return false;
    if (code.length === 12) code = '0' + code;
    if (code.length !== 8 && code.length !== 13) return false;
    const d = code.split('').map(Number), check = d.pop();
    let sum = 0; d.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - sum % 10) % 10 === check;
  }
  const scannerOpen = () => layers.some(l => l.kind === 'scanner');
  function scanMsg(t, err) { const m = $('#scMsg'); m.textContent = t; m.classList.toggle('err', !!err); }
  function showManual() { $('#scManualForm').hidden = false; }
  function openScanner(swap) {
    const el = $('#scanner');
    el.hidden = false; requestAnimationFrame(() => el.classList.add('show'));
    $('#scManualForm').hidden = true; $('#scCode').value = '';
    $('#scFrame').classList.remove('ok');
    $('#scTorch').hidden = true; $('#scTap').hidden = true; $('#scTorchSpacer').hidden = false; $('#scZoom').hidden = true;
    $('#scTorch').classList.remove('on'); $('#scZoom').classList.remove('on');
    SC.torch = false; SC.zoom = false;
    openLayer({ el, kind: 'scanner', persistent: true, onClose: () => {
      if ((SC.running || SC.starting) && !SC.handled) track('scan_cancel', { ms: Date.now() - (SC.t0 || Date.now()), engine: SC.engine, reads: SC.n });
      stopScan(); el.classList.remove('show');
      setTimeout(() => { if (!scannerOpen()) el.hidden = true; }, 220);
    } }, swap);
    startScan();
  }
  function cameraError(e) {
    const m = String((e && (e.name || e.message)) || e);
    track('camera_error', { name: e && e.name, message: String(e && e.message || m).slice(0, 200) });
    if (/NotAllowed|Permission|denied/i.test(m)) scanMsg('Accès à la caméra refusé. Autorise-le dans les réglages du navigateur pour ce site, ou tape le code.', true);
    else if (/NotFound|Overconstrained|no camera/i.test(m)) scanMsg('Aucune caméra trouvée. Tape le code-barres.', true);
    else if (/NotReadable|in use/i.test(m)) scanMsg('La caméra est utilisée par une autre appli. Ferme-la puis réessaie.', true);
    else scanMsg('Impossible d’ouvrir la caméra. Tape le code-barres.', true);
    showManual();
  }
  async function startScan() {
    scanMsg('Place le code-barres dans le cadre');
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      scanMsg('La caméra n’est pas disponible ici (il faut ouvrir l’appli depuis son lien https). Tape le code-barres.', true); showManual(); return;
    }
    if (SC.starting || SC.running) return;
    SC.starting = true; SC.handled = false; SC.legacy = false; SC.hinted = false; SC.n = 0; SC.last = ''; SC.lastN = 0;
    let det = null;
    try { det = await getDetector(); } catch (e) { det = null; }
    if (!scannerOpen()) { SC.starting = false; return; }
    if (!det) { SC.starting = false; startLegacy(); return; }
    try {
      SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      try { SC.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment' } }); }
      catch (e2) { SC.starting = false; cameraError(e2); return; }
    }
    if (!scannerOpen()) { SC.starting = false; stopScan(); return; }
    const v = $('#camVideo');
    v.hidden = false; $('#reader').hidden = true;
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', ''); v.setAttribute('autoplay', '');
    v.muted = true; v.playsInline = true;
    v.srcObject = SC.stream;
    try { await v.play(); } catch (e) { /* relancé par le bouton si besoin */ }
    SC.track = SC.stream.getVideoTracks()[0];
    SC.running = true; SC.starting = false; SC.t0 = Date.now();
    setupCamFeatures();
    track('scan_start', { engine: SC.engine });
    setTimeout(checkVideo, 1600);
    loop();
  }
  function setupCamFeatures() {
    let caps = {};
    try { caps = SC.track && SC.track.getCapabilities ? SC.track.getCapabilities() : {}; } catch (e) { caps = {}; }
    SC.caps = caps;
    const adv = [];
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) adv.push({ focusMode: 'continuous' });
    if (adv.length) SC.track.applyConstraints({ advanced: adv }).catch(() => {});
    $('#scTorch').hidden = !caps.torch; $('#scTorchSpacer').hidden = !!caps.torch;
    $('#scZoom').hidden = !(caps.zoom && caps.zoom.max >= 1.8);
  }
  // Zone du cadre, convertie en pixels de la vidéo (la vidéo est affichée en « cover »)
  function frameRegion(v) {
    const vw = v.videoWidth, vh = v.videoHeight, sw = window.innerWidth, sh = window.innerHeight;
    const scale = Math.max(sw / vw, sh / vh);
    const ox = (vw * scale - sw) / 2, oy = (vh * scale - sh) / 2;
    const r = $('#scFrame').getBoundingClientRect();
    const padX = r.width * 0.12, padY = r.height * 0.35;
    let x = (r.left - padX + ox) / scale, y = (r.top - padY + oy) / scale, w = (r.width + 2 * padX) / scale, h = (r.height + 2 * padY) / scale;
    x = clamp(x, 0, vw); y = clamp(y, 0, vh); w = clamp(w, 1, vw - x); h = clamp(h, 1, vh - y);
    return { x, y, w, h };
  }
  const scanCanvas = document.createElement('canvas');
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  function loop() {
    if (!SC.running) return;
    SC.timer = setTimeout(async () => {
      if (!SC.running) return;
      const v = $('#camVideo');
      if (!SC.busy && v.readyState >= 2 && v.videoWidth) {
        SC.busy = true;
        try {
          // 3 lectures sur 4 dans la zone du cadre en pleine définition, 1 sur 4 sur toute l'image
          let reg = (SC.n++ % 4 === 3) ? { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight } : frameRegion(v);
          const maxW = 1600, k = Math.min(1, maxW / reg.w);
          scanCanvas.width = Math.round(reg.w * k); scanCanvas.height = Math.round(reg.h * k);
          scanCtx.drawImage(v, reg.x, reg.y, reg.w, reg.h, 0, 0, scanCanvas.width, scanCanvas.height);
          if (!SC.hinted && Date.now() - SC.t0 > 7000) { SC.hinted = true; scanMsg('Pas encore lu ? Recule le téléphone (15 à 20 cm), le code bien à plat' + (SC.caps && (SC.caps.torch || SC.caps.zoom) ? ', ou essaie la lampe / le zoom.' : '.')); }
          const found = await SC.det.detect(scanCanvas);
          for (const b of found || []) {
            const code = String(b.rawValue || '').replace(/\D/g, '');
            if (b.format === 'upc_e' || code.length < 8) {
              // UPC-E : pas de clé de contrôle simple, on demande deux lectures identiques
              if (code.length >= 6) { if (SC.last === code) SC.lastN++; else { SC.last = code; SC.lastN = 1; } if (SC.lastN >= 2) { onDecode(code); break; } }
            } else if (validGTIN(code)) { onDecode(code); break; }
          }
        } catch (e) { /* image suivante */ }
        SC.busy = false;
      }
      loop();
    }, 80);
  }
  function checkVideo() {
    if (!scannerOpen() || !SC.running) return;
    const v = SC.legacy ? $('#reader video') : $('#camVideo');
    const box = v && v.getBoundingClientRect();
    const black = !v || v.paused || !v.videoWidth || !box || box.height < 50;
    $('#scTap').hidden = !black;
    if (black) { scanMsg('La caméra ne s’affiche pas ? Touche le bouton ci-dessous.', false); track('camera_black', { engine: SC.engine }); }
  }
  async function stopScan() {
    SC.running = false; SC.starting = false;
    clearTimeout(SC.timer);
    if (SC.stream) { SC.stream.getTracks().forEach(t => { try { t.stop(); } catch (e) { /* rien */ } }); SC.stream = null; SC.track = null; }
    const v = $('#camVideo'); if (v) { try { v.pause(); } catch (e) { /* rien */ } v.srcObject = null; }
    if (SC.inst) { try { if (SC.inst.isScanning) await SC.inst.stop(); } catch (e) { /* déjà arrêté */ } }
  }
  function onDecode(text) {
    if (SC.handled) return;
    const code = String(text).replace(/\D/g, '');
    if (code.length < 6) return;
    SC.handled = true;
    track('scan_ok', { code, ms: Date.now() - SC.t0, engine: SC.legacy ? 'html5-qrcode' : SC.engine });
    $('#scFrame').classList.add('ok');
    if (navigator.vibrate) { try { navigator.vibrate(70); } catch (e) { /* rien */ } }
    stopScan().then(() => { if (scannerOpen()) lookupCode(code, { swap: true, fromScan: true }); });
  }
  // Lecteur de secours (si le lecteur principal ne se charge pas)
  async function startLegacy() {
    try { await loadScript(LEGACY_URLS, () => !!window.Html5Qrcode); } catch (e) { scanMsg('Le module de scan n’a pas pu se charger (connexion ?). Tape le code-barres.', true); showManual(); return; }
    if (!scannerOpen()) return;
    $('#camVideo').hidden = true; $('#reader').hidden = false;
    try {
      if (!SC.inst) {
        const F = window.Html5QrcodeSupportedFormats;
        SC.inst = new window.Html5Qrcode('reader', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E], experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false });
      }
      SC.legacy = true; SC.engine = 'html5-qrcode';
      await SC.inst.start({ facingMode: 'environment' }, { fps: 12, disableFlip: true, qrbox: (w, h) => ({ width: Math.floor(w * 0.9), height: Math.floor(Math.min(h * 0.5, w * 0.6)) }) }, onDecode, () => {});
      SC.running = true; SC.t0 = Date.now();
      track('scan_start', { engine: SC.engine });
      const v = $('#reader video'); if (v) { v.setAttribute('playsinline', ''); v.muted = true; try { await v.play(); } catch (e) { /* rien */ } }
      setTimeout(checkVideo, 1600);
    } catch (e) { cameraError(e); }
  }

  /* ================= Ajout rapide ================= */
  function openQuick(opts) {
    opts = opts || {};
    const e = opts.entry || null;
    let meal = e ? e.meal : (opts.meal || (AF && AF.meal) || defaultMeal());
    const el = mountSheet(head(e ? 'Modifier l’ajout rapide' : 'Ajout rapide') +
      '<p class="hint">Pour un repas au resto ou un plat dont tu connais juste les calories.</p>' +
      '<div class="field"><label for="qK">Calories</label><div class="unit-input"><input id="qK" inputmode="decimal" placeholder="0" autocomplete="off"><span>kcal</span></div></div>' +
      '<div class="grid3">' + MACROS.map(m => '<div class="field"><label for="q' + m.k + '">' + m.label + '</label><div class="unit-input"><input id="q' + m.k + '" inputmode="decimal" placeholder="0" autocomplete="off"><span>g</span></div></div>').join('') + '</div>' +
      '<div class="field"><label for="qN">Nom (facultatif)</label><input id="qN" type="text" placeholder="ex. Menu burger" autocomplete="off"></div>' +
      '<div><span class="flabel">Repas</span><div class="seg" id="qMeal" style="margin-top:6px">' + MEALS.map(m => '<button data-meal="' + m.id + '">' + m.short + '</button>').join('') + '</div></div>' +
      '<div class="sticky-foot">' + (e ? '<button class="btn danger" data-qa="del" aria-label="Supprimer">' + ic('i-trash') + '</button>' : '') + '<button class="btn primary" data-qa="save">' + (e ? 'Enregistrer' : 'Ajouter') + '</button></div>', { foot: true });
    openLayer({ el }, opts.swap);
    if (e) { $('#qK', el).value = r0(e.kcal); MACROS.forEach(m => { if (e[m.k]) $('#q' + m.k, el).value = f1(e[m.k]); }); $('#qN', el).value = e.name === 'Ajout rapide' ? '' : e.name; }
    const setMeal = () => $$('#qMeal button', el).forEach(b => b.classList.toggle('on', b.dataset.meal === meal));
    setMeal();
    el.addEventListener('click', ev => {
      const mb = ev.target.closest('[data-meal]'); if (mb) { meal = mb.dataset.meal; setMeal(); return; }
      const a = ev.target.closest('[data-qa]'); if (!a) return;
      if (a.dataset.qa === 'del') { if (!arm(a, 'Supprimer ?')) return; removeEntries(x => x.id === e.id); save(); closeTop(); renderAll(); toast('Supprimé'); return; }
      const kcal = num($('#qK', el).value);
      if (!(kcal > 0)) { toast('Indique les calories'); $('#qK', el).focus(); return; }
      const vals = { kcal, p: num($('#qp', el).value), c: num($('#qc', el).value), f: num($('#qf', el).value) };
      const name = $('#qN', el).value.trim() || 'Ajout rapide';
      if (e) { Object.assign(S.entries.find(x => x.id === e.id) || {}, vals, { name, meal, mt: now() }); }
      else S.entries.push(Object.assign({ id: uid(), date: day, ts: Date.now(), mt: now(), meal, key: 'quick', name, brand: '', amount: 1, unitIdx: 0, unit: '', grams: 0 }, vals));
      save(); closeTop(); renderAll();
      if (AF && !e) { AF.added++; renderAF(); }
      toast(e ? 'Modifié' : fk(kcal) + ' kcal ajoutées');
    });
    if (!e) setTimeout(() => { const k = $('#qK', el); if (k && el.isConnected) k.focus(); }, 320);
  }

  /* ================= Créer / modifier un aliment ================= */
  function openCreate(opts) {
    opts = opts || {};
    const p = opts.product || null;
    let unit = p ? p.unit || 'g' : 'g';
    const v = (x) => x == null ? '' : String(x).replace('.', ',');
    const n = p ? p.per100 : {};
    const por = p ? portionsOf(p)[0] : null;
    const el = mountSheet(head(p ? 'Modifier l’aliment' : 'Créer un aliment') +
      '<div class="field"><label for="cN">Nom</label><input id="cN" type="text" placeholder="ex. Lasagnes maison" value="' + esc(p ? p.name : '') + '" autocomplete="off"></div>' +
      '<div class="grid2"><div class="field"><label for="cB">Marque (facultatif)</label><input id="cB" type="text" value="' + esc(p ? p.brand : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cCode">Code-barres</label><input id="cCode" inputmode="numeric" placeholder="facultatif" value="' + esc(p ? p.code : (opts.code || '')) + '" autocomplete="off"' + (p && p.code ? ' readonly' : '') + '></div></div>' +
      '<div><span class="flabel">Unité</span><div class="seg" id="cUnit" style="margin-top:6px"><button data-unit="g">Solide (g)</button><button data-unit="ml">Liquide (ml)</button></div></div>' +
      '<p class="flabel" id="cPer">Valeurs pour 100 g (regarde le tableau sur l’emballage)</p>' +
      '<div class="grid2">' +
      '<div class="field"><label for="cK">Énergie</label><div class="unit-input"><input id="cK" inputmode="decimal" placeholder="0" value="' + v(p && r0(n.kcal)) + '"><span>kcal</span></div></div>' +
      '<div class="field"><label for="cP">Protéines</label><div class="unit-input"><input id="cP" inputmode="decimal" placeholder="0" value="' + v(p && n.p) + '"><span>g</span></div></div>' +
      '<div class="field"><label for="cC">Glucides</label><div class="unit-input"><input id="cC" inputmode="decimal" placeholder="0" value="' + v(p && n.c) + '"><span>g</span></div></div>' +
      '<div class="field"><label for="cS">dont sucres</label><div class="unit-input"><input id="cS" inputmode="decimal" placeholder="—" value="' + v(p && n.sugar) + '"><span>g</span></div></div>' +
      '<div class="field"><label for="cF">Lipides</label><div class="unit-input"><input id="cF" inputmode="decimal" placeholder="0" value="' + v(p && n.f) + '"><span>g</span></div></div>' +
      '<div class="field"><label for="cSel">Sel</label><div class="unit-input"><input id="cSel" inputmode="decimal" placeholder="—" value="' + v(p && n.salt) + '"><span>g</span></div></div></div>' +
      '<p class="flabel">Portion habituelle (facultatif)</p>' +
      '<div class="grid2"><div class="field"><label for="cPl">Nom</label><input id="cPl" type="text" placeholder="ex. part, pot, tranche" value="' + esc(por ? por.label : '') + '" autocomplete="off"></div>' +
      '<div class="field"><label for="cPg">Poids</label><div class="unit-input"><input id="cPg" inputmode="decimal" placeholder="0" value="' + v(por && por.g) + '"><span id="cPu">g</span></div></div></div>' +
      '<div class="sticky-foot">' + (p ? '<button class="btn danger" data-ca="del" aria-label="Supprimer l’aliment">' + ic('i-trash') + '</button>' : '') + '<button class="btn primary" data-ca="save">' + (p ? 'Enregistrer' : 'Créer et ajouter') + '</button></div>', { tall: true, foot: true });
    openLayer({ el }, opts.swap);
    const setUnit = () => { $$('#cUnit button', el).forEach(b => b.classList.toggle('on', b.dataset.unit === unit)); $('#cPer', el).textContent = 'Valeurs pour 100 ' + unit + ' (regarde le tableau sur l’emballage)'; $('#cPu', el).textContent = unit; };
    setUnit();
    el.addEventListener('click', ev => {
      const ub = ev.target.closest('[data-unit]'); if (ub) { unit = ub.dataset.unit; setUnit(); return; }
      const a = ev.target.closest('[data-ca]'); if (!a) return;
      if (a.dataset.ca === 'del') {
        if (!arm(a, 'Supprimer ?')) return;
        delete S.products[p.key]; S.favorites = S.favorites.filter(k => k !== p.key); S.recents = S.recents.filter(k => k !== p.key);
        save(); closeTop(); renderAll(); if (AF) renderAF(); toast('Aliment supprimé'); return;
      }
      const name = $('#cN', el).value.trim(), kcal = $('#cK', el).value.trim();
      if (!name) { toast('Donne un nom à l’aliment'); $('#cN', el).focus(); return; }
      if (kcal === '') { toast('Indique les calories pour 100 ' + unit); $('#cK', el).focus(); return; }
      const code = $('#cCode', el).value.replace(/\D/g, '');
      const opt = id => { const s = $(id, el).value.trim(); return s === '' ? null : num(s); };
      const pl = $('#cPl', el).value.trim(), pg = num($('#cPg', el).value);
      const prod = {
        key: p ? p.key : (code || 'c-' + uid()), code, name, brand: $('#cB', el).value.trim(), qty: '', image: p ? p.image || '' : '', unit,
        portions: pg > 0 ? [{ label: pl || 'portion', g: pg }] : [], nutri: p ? p.nutri || '' : '',
        per100: { kcal: num(kcal), p: num($('#cP', el).value), c: num($('#cC', el).value), f: num($('#cF', el).value), sugar: opt('#cS'), sfat: null, fiber: null, salt: opt('#cSel') },
        hasNutri: true, source: 'custom'
      };
      S.products[prod.key] = prod; TMP.delete(prod.key);
      S.entries.forEach(e => { if ((e.pending || e.unknown) && e.key === prod.key) { const t = calc(prod, e.grams); Object.assign(e, { name: prod.name, brand: prod.brand, kcal: t.kcal, p: t.p, c: t.c, f: t.f, pending: false, unknown: false, mt: now() }); } });
      if (p) {
        S.entries.forEach(e => { if (e.key === prod.key) { const t = calc(prod, e.grams); Object.assign(e, { name: prod.name, brand: prod.brand, kcal: t.kcal, p: t.p, c: t.c, f: t.f }); } });
        save(); closeTop(); renderAll(); if (AF) renderAF(); toast('Aliment modifié');
      } else { save(); if (AF) renderAF(); openProduct(prod, { swap: true }); }
    });
    if (!p) setTimeout(() => { const i = $('#cN', el); if (i && el.isConnected) i.focus(); }, 320);
  }

  /* ================= Activité ================= */
  function openExercise(swap) {
    const w = latestWeight() || 70;
    let act = ACTIVITIES[0], minutes = 30, manual = false;
    const el = mountSheet(head('Ajouter une activité') +
      '<div class="chips" id="exActs">' + ACTIVITIES.map(a => '<button class="chip" data-ex="' + a.id + '">' + esc(a.label) + '</button>').join('') + '</div>' +
      '<div class="field"><label for="exMin">Durée</label><div class="unit-input"><input id="exMin" inputmode="numeric" value="30"><span>min</span></div></div>' +
      '<div class="chips">' + [15, 30, 45, 60, 90].map(m => '<button class="chip" data-min="' + m + '">' + m + ' min</button>').join('') + '</div>' +
      '<div class="field"><label for="exK">Calories brûlées</label><div class="unit-input"><input id="exK" inputmode="numeric" autocomplete="off"><span>kcal</span></div></div>' +
      '<p class="hint">Estimation calculée avec ton poids (' + fkg(w) + ' kg). Tu peux la corriger, par exemple avec la valeur de ta montre.</p>' +
      '<div class="sticky-foot"><button class="btn primary" data-xa="save">Ajouter</button></div>', { foot: true });
    openLayer({ el }, swap);
    const est = () => Math.round(act.met * w * minutes / 60);
    const sync = () => {
      $$('[data-ex]', el).forEach(b => b.classList.toggle('on', b.dataset.ex === act.id));
      $$('[data-min]', el).forEach(b => b.classList.toggle('on', +b.dataset.min === minutes));
      if (!manual) $('#exK', el).value = est();
    };
    $('#exMin', el).addEventListener('input', ev => { minutes = Math.max(0, num(ev.target.value)); sync(); });
    $('#exK', el).addEventListener('input', () => { manual = true; });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ex]'); if (b) { act = ACTIVITIES.find(a => a.id === b.dataset.ex) || act; manual = false; sync(); return; }
      const m = ev.target.closest('[data-min]'); if (m) { minutes = +m.dataset.min; $('#exMin', el).value = minutes; manual = false; sync(); return; }
      if (ev.target.closest('[data-xa]')) {
        const kcal = num($('#exK', el).value);
        if (!(kcal > 0)) { toast('Indique une durée ou des calories'); return; }
        S.exercises.push({ id: uid(), date: day, name: act.label, minutes, kcal: Math.round(kcal), mt: now() });
        save(); closeTop(); renderAll(); toast('+' + fk(kcal) + ' kcal ajoutées à ton budget');
      }
    });
    sync();
  }
  function openExMenu(id) {
    const x = S.exercises.find(e => e.id === id); if (!x) return;
    actionSheet(x.name + ' · ' + fk(x.kcal) + ' kcal', [
      { label: 'Supprimer cette activité', icon: 'i-trash', color: 'var(--danger)', danger: true, confirm: 'Appuie encore pour supprimer', run: () => { S.exercises = S.exercises.filter(e => e.id !== id); S.tomb['x:' + id] = now(); save(); renderAll(); toast('Activité supprimée'); } }
    ]);
  }

  /* ================= Eau ================= */
  function setWater(ml) { S.water[day] = clamp(Math.round(ml), 0, 10000); if (!S.water[day]) delete S.water[day]; S.waterT[day] = now(); save(); renderWater(); }
  function tapGlass(i) {
    const filled = Math.floor(num(S.water[day]) / 250 + 1e-9);
    setWater((i + 1 === filled ? i : i + 1) * 250);
  }

  /* ================= Poids ================= */
  function openWeight(swap) {
    const cur = S.weights.find(w => w.date === day);
    let kg = cur ? cur.kg : (latestWeight() || 70);
    const el = mountSheet(head('Mon poids') +
      '<p class="hint">' + esc(dayLabel(day)) + (cur ? ' · déjà noté, tu peux le corriger' : '') + '</p>' +
      '<div class="amt"><button data-wa="-" aria-label="Moins 100 g">' + ic('i-minus') + '</button><input id="wKg" inputmode="decimal" aria-label="Poids en kg"><button data-wa="+" aria-label="Plus 100 g">' + ic('i-plus') + '</button></div>' +
      '<p class="hint center">kg</p>' +
      '<div class="sticky-foot">' + (cur ? '<button class="btn danger" data-wa="del" aria-label="Supprimer">' + ic('i-trash') + '</button>' : '') + '<button class="btn primary" data-wa="save">Enregistrer</button></div>', { foot: true });
    openLayer({ el }, swap);
    const inp = $('#wKg', el);
    const show = () => { inp.value = String(Math.round(kg * 10) / 10).replace('.', ','); };
    inp.addEventListener('input', () => { kg = num(inp.value); });
    el.addEventListener('click', ev => {
      const a = ev.target.closest('[data-wa]'); if (!a) return;
      const t = a.dataset.wa;
      if (t === '-' || t === '+') { kg = Math.max(0, Math.round((kg + (t === '+' ? 0.1 : -0.1)) * 10) / 10); show(); return; }
      if (t === 'del') { if (!arm(a, 'Supprimer ?')) return; S.weights = S.weights.filter(w => w.date !== day); S.tomb['w:' + day] = now(); save(); closeTop(); renderAll(); toast('Pesée supprimée'); return; }
      if (!(kg >= 25 && kg <= 350)) { toast('Indique un poids valide'); return; }
      S.weights = S.weights.filter(w => w.date !== day).concat([{ date: day, kg: Math.round(kg * 10) / 10, mt: now() }]).sort((a2, b) => a2.date < b.date ? -1 : 1);
      if (S.profile && S.weights[S.weights.length - 1].date === day) S.profile.weight = Math.round(kg * 10) / 10;
      save(); closeTop(); renderAll(); toast('Poids enregistré : ' + fkg(kg) + ' kg');
    });
    show();
  }

  /* ================= Objectifs ================= */
  function openGoals() {
    const g = S.goals;
    const el = mountSheet(head('Mes objectifs du jour') +
      '<div class="field"><label for="gK">Calories</label><div class="unit-input"><input id="gK" inputmode="numeric" value="' + r0(g.kcal) + '"><span>kcal</span></div></div>' +
      '<div class="grid3">' + MACROS.map(m => '<div class="field"><label for="g' + m.k + '">' + m.label + '</label><div class="unit-input"><input id="g' + m.k + '" inputmode="numeric" value="' + r0(g[m.k]) + '"><span>g</span></div></div>').join('') + '</div>' +
      '<p class="hint" id="gSplit"></p>' +
      '<div class="field"><label for="gW">Eau</label><div class="unit-input"><input id="gW" inputmode="numeric" value="' + r0(g.water) + '"><span>ml</span></div></div>' +
      (S.profile ? '<button class="btn outline" data-ga="recalc">Recalculer avec mes infos</button>' : '') +
      '<div class="sticky-foot"><button class="btn primary" data-ga="save">Enregistrer</button></div>', { foot: true });
    openLayer({ el });
    const split = () => {
      const k = num($('#gK', el).value) || 1;
      const parts = MACROS.map(m => num($('#g' + m.k, el).value) * m.kcal);
      const sum = parts.reduce((a, b) => a + b, 0);
      $('#gSplit', el).textContent = 'Répartition : ' + MACROS.map((m, i) => m.short + ' ' + r0(parts[i] / k * 100) + ' %').join(' · ') +
        (Math.abs(sum - k) > k * 0.08 ? ' — les macros font ' + fk(sum) + ' kcal' : '');
    };
    el.addEventListener('input', split);
    el.addEventListener('click', ev => {
      const a = ev.target.closest('[data-ga]'); if (!a) return;
      if (a.dataset.ga === 'recalc') { closeAll(); setTimeout(() => openOnboarding(true), 60); return; }
      const kcal = num($('#gK', el).value);
      if (!(kcal >= 800 && kcal <= 6000)) { toast('Objectif calorique entre 800 et 6 000 kcal'); return; }
      S.goals = { kcal: r0(kcal), p: r0(num($('#gp', el).value)), c: r0(num($('#gc', el).value)), f: r0(num($('#gf', el).value)), water: clamp(r0(num($('#gW', el).value)) || 2000, 500, 6000) };
      touchMeta();
      save(); closeTop(); renderAll(); toast('Objectifs enregistrés');
    });
    split();
  }

  /* ================= Menu + ================= */
  function openFab() {
    actionSheet('Ajouter', [
      { label: 'Aliment', icon: 'i-search', color: 'var(--brand)', open: () => openAddFood(defaultMeal(), true) },
      { label: 'Scanner', icon: 'i-scan', color: '#2D8F86', open: () => openScanner(true) },
      { label: 'Ajout rapide', icon: 'i-bolt', color: 'var(--carb)', open: () => openQuick({ swap: true }) },
      { label: 'Eau', icon: 'i-drop', color: 'var(--water)', run: () => { setWater(num(S.water[day]) + 250); toast('+250 ml · ' + fL(S.water[day]) + ' L aujourd’hui'); } },
      { label: 'Activité', icon: 'i-run', color: 'var(--burn)', open: () => openExercise(true) },
      { label: 'Poids', icon: 'i-scale', color: 'var(--fat)', open: () => openWeight(true) }
    ], { grid: true });
  }

  /* ================= Progrès ================= */
  function renderProgress() {
    const el = $('#screen-progress');
    const t = today();
    const days = Array.from({ length: range }, (_, i) => addDays(t, i - range + 1));
    const tot = days.map(totals), L = loggedDays();
    const logged = days.filter(d => L.has(d));
    const avg = logged.length ? logged.reduce((a, d) => a + totals(d).kcal, 0) / logged.length : 0;
    const inGoal = logged.filter(d => { const k = totals(d).kcal, b = S.goals.kcal + burnedOf(d); return Math.abs(k - b) <= S.goals.kcal * 0.1; }).length;
    const avgM = MACROS.map(m => logged.length ? logged.reduce((a, d) => a + totals(d)[m.k], 0) / logged.length : 0);
    const mk = avgM.map((v, i) => v * MACROS[i].kcal), mkSum = mk.reduce((a, b) => a + b, 0);
    const w = S.weights, cw = latestWeight(), sw = w.length ? w[0].kg : cw;
    const gw = S.profile && num(S.profile.goalWeight);
    const h = S.profile && num(S.profile.height);
    const bmi = h > 0 && cw > 0 ? cw / Math.pow(h / 100, 2) : 0;
    const bmiCat = bmi < 18.5 ? 'Insuffisance pondérale' : bmi < 25 ? 'Corpulence normale' : bmi < 30 ? 'Surpoids' : 'Obésité';
    const diff = cw && sw ? cw - sw : 0;
    el.innerHTML =
      '<header class="pg-head"><h1 class="page-title">Progrès</h1><div class="seg"><button data-act="range" data-r="7"' + (range === 7 ? ' class="on"' : '') + '>7 jours</button><button data-act="range" data-r="30"' + (range === 30 ? ' class="on"' : '') + '>30 jours</button></div></header>' +
      '<section class="card"><div class="card-title"><h2>Calories</h2></div>' +
      '<div class="kpis"><div class="kpi"><b class="num">' + (logged.length ? fk(avg) : '—') + '</b><span>moyenne / jour</span></div>' +
      '<div class="kpi"><b class="num">' + inGoal + ' / ' + logged.length + '</b><span>jours dans l’objectif</span></div>' +
      '<div class="kpi"><b class="num">' + fk(S.goals.kcal) + '</b><span>objectif</span></div></div>' +
      '<div class="chart" id="kcalChart"></div></section>' +
      '<section class="card"><div class="card-title"><h2>Macros moyennes</h2></div>' +
      (mkSum > 0 ? '<div class="macro-split"><div class="donut"><svg viewBox="0 0 100 100">' + donutSvg(MACROS.map((m, i) => ({ v: mk[i], color: m.color })), 40, 12) + '</svg><div class="c"><b class="num">' + fk(avg) + '</b><span>kcal/jour</span></div></div>' +
        '<div class="min0">' + MACROS.map((m, i) => '<div class="pm"><i style="background:' + m.color + '"></i><span>' + m.label + '</span><b class="num">' + f1(avgM[i]) + ' g</b><em>' + r0(mk[i] / mkSum * 100) + ' % des kcal · obj. ' + r0(S.goals[m.k]) + ' g</em></div>').join('') + '</div></div>'
        : '<p class="hint">Note quelques repas pour voir ta répartition protéines / glucides / lipides.</p>') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Poids</h2><button class="linkbtn" data-act="addWeight">+ Ajouter</button></div>' +
      '<div class="kpis"><div class="kpi"><b class="num">' + (cw ? fkg(cw) + ' kg' : '—') + '</b><span>actuel</span></div>' +
      '<div class="kpi"><b class="num">' + (w.length > 1 ? (diff > 0 ? '+' : diff < 0 ? '−' : '') + fkg(Math.abs(diff)) + ' kg' : '—') + '</b><span>depuis le début</span></div>' +
      '<div class="kpi"><b class="num">' + (gw ? fkg(gw) + ' kg' : '—') + '</b><span>objectif</span></div></div>' +
      '<div class="chart" id="weightChart"></div>' +
      (bmi ? '<div class="bmi"><span>IMC</span><b class="num">' + f1(bmi) + ' · ' + bmiCat + '</b></div>' : '') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Régularité</h2></div><div class="kpis">' +
      '<div class="kpi"><b class="num" style="color:var(--burn)">' + streakCount() + '</b><span>jours d’affilée</span></div>' +
      '<div class="kpi"><b class="num">' + L.size + '</b><span>jours suivis au total</span></div>' +
      '<div class="kpi"><b class="num">' + fk(S.entries.length) + '</b><span>aliments notés</span></div></div></section>';
    drawKcalChart($('#kcalChart', el), days, tot);
    drawWeightChart($('#weightChart', el), gw);
  }
  function drawKcalChart(box, days, tot) {
    const W = Math.max(260, box.clientWidth || 320), H = 150, top = 8, bottom = 22, left = 4, right = 4;
    const vals = tot.map(t => t.kcal), goal = S.goals.kcal;
    const max = Math.max(goal * 1.2, ...vals, 1);
    const n = days.length, slot = (W - left - right) / n, bw = Math.max(3, Math.min(26, slot * 0.62));
    const y = v => top + (H - top - bottom) * (1 - v / max);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '" role="img" aria-label="Calories par jour">';
    s += '<line x1="0" x2="' + W + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--line)"/>';
    days.forEach((d, i) => {
      const v = vals[i], x = left + slot * i + (slot - bw) / 2, yy = y(v), hh = Math.max(v > 0 ? 3 : 0, y(0) - yy);
      const over = v > goal + burnedOf(d) + goal * 0.1;
      if (v > 0) s += '<rect x="' + x.toFixed(1) + '" y="' + (y(0) - hh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="' + Math.min(6, bw / 2).toFixed(1) + '" fill="' + (over ? 'var(--burn)' : 'var(--brand)') + '"/>';
      const every = n <= 7 ? 1 : 5;
      if ((n - 1 - i) % every === 0) {
        const lab = n <= 7 ? cap(parseYmd(d).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')).slice(0, 3) : parseYmd(d).getDate() + '/' + (parseYmd(d).getMonth() + 1);
        s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + lab + '</text>';
      }
    });
    s += '<line x1="0" x2="' + W + '" y1="' + y(goal).toFixed(1) + '" y2="' + y(goal).toFixed(1) + '" stroke="var(--muted)" stroke-dasharray="4 4" opacity=".7"/>';
    s += '<text x="' + (W - 2) + '" y="' + (y(goal) - 4).toFixed(1) + '" text-anchor="end">objectif</text></svg>';
    box.innerHTML = s;
  }
  function drawWeightChart(box, gw) {
    const pts = S.weights.slice(-60);
    if (pts.length < 2) { box.innerHTML = '<p class="hint">' + (pts.length ? 'Note ton poids un autre jour pour voir ta courbe.' : 'Pèse-toi le matin et note ton poids pour suivre ta courbe.') + '</p>'; return; }
    const W = Math.max(260, box.clientWidth || 320), H = 160, top = 14, bottom = 22, left = 34, right = 8;
    const t0 = parseYmd(pts[0].date).getTime(), t1 = parseYmd(pts[pts.length - 1].date).getTime() || t0 + 1;
    let lo = Math.min(...pts.map(p => p.kg)), hi = Math.max(...pts.map(p => p.kg));
    if (gw > 0 && Math.abs(gw - lo) < 8 || gw > 0 && Math.abs(gw - hi) < 8) { lo = Math.min(lo, gw); hi = Math.max(hi, gw); }
    lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
    const x = t => left + (W - left - right) * (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0));
    const y = v => top + (H - top - bottom) * (1 - (v - lo) / (hi - lo));
    const P = pts.map(p => [x(parseYmd(p.date).getTime()), y(p.kg)]);
    const line = P.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" height="' + H + '" role="img" aria-label="Évolution du poids"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--brand);stop-opacity:.28"/><stop offset="1" style="stop-color:var(--brand);stop-opacity:0"/></linearGradient></defs>';
    [lo, (lo + hi) / 2, hi].forEach(v => { s += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--line)"/><text x="' + (left - 6) + '" y="' + (y(v) + 3).toFixed(1) + '" text-anchor="end">' + fkg(v) + '</text>'; });
    if (gw > 0 && gw >= lo && gw <= hi) s += '<line x1="' + left + '" x2="' + (W - right) + '" y1="' + y(gw).toFixed(1) + '" y2="' + y(gw).toFixed(1) + '" stroke="var(--brand)" stroke-dasharray="4 4" opacity=".8"/><text x="' + (W - right) + '" y="' + (y(gw) - 4).toFixed(1) + '" text-anchor="end">objectif</text>';
    s += '<path d="' + line + ' L' + P[P.length - 1][0].toFixed(1) + ' ' + y(lo).toFixed(1) + ' L' + P[0][0].toFixed(1) + ' ' + y(lo).toFixed(1) + ' Z" fill="url(#wg)"/>';
    s += '<path d="' + line + '" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    const last = P[P.length - 1];
    s += '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="5" fill="var(--brand)" stroke="var(--surface)" stroke-width="2.5"/>';
    const fmtD = d => parseYmd(d).getDate() + '/' + (parseYmd(d).getMonth() + 1);
    s += '<text x="' + left + '" y="' + (H - 5) + '">' + fmtD(pts[0].date) + '</text><text x="' + (W - right) + '" y="' + (H - 5) + '" text-anchor="end">' + fmtD(pts[pts.length - 1].date) + '</text></svg>';
    box.innerHTML = s;
  }

  /* ================= Profil ================= */
  function renderProfile() {
    const el = $('#screen-profile'), P = S.profile, g = S.goals;
    const lvl = P ? ACT_LEVELS.find(a => a.id === P.activity) : null;
    const nCustom = Object.values(S.products).filter(p => p.source === 'custom').length;
    el.innerHTML =
      '<header class="p-head"><div class="avatar">' + esc(((P && P.name) || 'N').charAt(0).toUpperCase()) + '</div><div class="min0"><h1 class="page-title">' + esc((P && P.name) || 'Mon profil') + '</h1>' +
      '<p>' + (P ? esc(GOALS[P.goal] || '') + (P.goal !== 'maintain' && P.rate ? ' · ' + String(P.rate).replace('.', ',') + ' kg/sem.' : '') : 'Objectifs par défaut') + '</p></div></header>' +
      (P ? '' : '<section class="card"><div class="card-title"><h2>Calcule tes besoins</h2></div><p class="hint" style="margin-bottom:12px">4 questions pour avoir un objectif de calories et de protéines adapté à toi.</p><button class="btn primary block" data-act="editProfile">Commencer</button></section>') +
      '<section class="card"><div class="card-title"><h2>Objectifs du jour</h2><button class="linkbtn" data-act="editGoals">Modifier</button></div>' +
      '<div class="goals5"><div class="tile"><b class="num">' + fk(g.kcal) + '</b><span>kcal</span></div>' +
      MACROS.map(m => '<div class="tile"><b class="num" style="color:' + m.color + '">' + r0(g[m.k]) + '</b><span>' + m.short + ' (g)</span></div>').join('') +
      '<div class="tile"><b class="num" style="color:var(--water)">' + fL(g.water) + '</b><span>Eau (L)</span></div></div></section>' +
      (P ? '<section class="card"><div class="card-title"><h2>Mes infos</h2><button class="linkbtn" data-act="editProfile">Modifier</button></div>' +
        '<div class="kv"><span>Sexe</span><b>' + (P.sex === 'f' ? 'Femme' : 'Homme') + '</b></div>' +
        '<div class="kv"><span>Âge</span><b>' + r0(P.age) + ' ans</b></div>' +
        '<div class="kv"><span>Taille</span><b>' + r0(P.height) + ' cm</b></div>' +
        '<div class="kv"><span>Poids actuel</span><b>' + fkg(latestWeight()) + ' kg</b></div>' +
        (P.goal !== 'maintain' && P.goalWeight ? '<div class="kv"><span>Poids visé</span><b>' + fkg(P.goalWeight) + ' kg</b></div>' : '') +
        '<div class="kv"><span>Activité</span><b>' + esc(lvl ? lvl.label : '') + '</b></div></section>' : '') +
      accountHTML() +
      halalSettingsHTML() +
      '<section class="card"><div class="card-title"><h2>Apparence</h2></div><div class="seg">' +
      [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(t => '<button data-act="theme" data-t="' + t[0] + '"' + (S.theme === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>').join('') + '</div></section>' +
      '<section class="card"><div class="menu">' +
      '<button data-act="myFoods">' + ic('i-edit') + '<span class="grow">Mes aliments</span><small>' + nCustom + '</small>' + ic('i-right', 'sm') + '</button>' +
      '<button data-act="favList">' + ic('i-star') + '<span class="grow">Mes favoris</span><small>' + S.favorites.length + '</small>' + ic('i-right', 'sm') + '</button>' +
      '<button data-act="about">' + ic('i-help') + '<span class="grow">À propos et confidentialité</span>' + ic('i-right', 'sm') + '</button>' +
      '<button data-act="exportData">' + ic('i-download') + '<span class="grow">Sauvegarder mes données</span></button>' +
      '<button data-act="importData">' + ic('i-upload') + '<span class="grow">Restaurer une sauvegarde</span></button>' +
      '<button class="danger" data-act="wipe" data-confirm="Appuie encore : tout sera effacé">' + ic('i-trash') + '<span class="grow">Effacer toutes mes données</span></button></div></section>' +
      '<p class="credit">NutriScan ' + VERSION + '</p>';
  }
  /* ================= Compte ================= */
  function syncText() {
    if (syncState === 'saving') return 'Sauvegarde en cours…';
    if (syncState === 'offline') return 'Hors ligne : sauvegarde dès le retour du réseau.';
    if (syncState === 'error') return 'Erreur de sauvegarde : ' + syncError;
    if (SYNC.pending) return 'Modifications en attente de sauvegarde…';
    if (SYNC.lastPush) {
      const d = new Date(SYNC.lastPush), t = today();
      const day0 = ymd(d) === t ? 'aujourd’hui' : ymd(d) === addDays(t, -1) ? 'hier' : 'le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return 'Sauvegardé ' + day0 + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    return 'Pas encore sauvegardé';
  }
  function refreshAccountStatus() { const el = $('#acctStatus'); if (el) { el.textContent = syncText(); el.className = 'hint' + (syncState === 'error' ? ' err' : ''); } }
  function accountHTML() {
    if (!C.enabled) return '';
    const u = C.session && C.session.user;
    if (!u) return '<section class="card"><div class="card-title"><h2>Compte</h2></div>' +
      '<p class="hint" style="margin-bottom:12px">Crée un compte gratuit pour sauvegarder tes données en ligne et les retrouver si tu changes de téléphone.</p>' +
      '<div class="row-btns"><button class="btn primary" data-act="auth" data-m="signup">Créer un compte</button><button class="btn outline" data-act="auth" data-m="login">Se connecter</button></div></section>';
    return '<section class="card"><div class="card-title"><h2>Compte</h2>' + (SYNC.admin ? '<a class="linkbtn" href="admin.html">Panneau admin</a>' : '') + '</div>' +
      '<div class="kv"><span>E-mail</span><b>' + esc(u.email || '') + '</b></div>' +
      '<p class="hint" id="acctStatus" style="margin:4px 0 12px">' + esc(syncText()) + '</p>' +
      '<div class="menu">' +
      '<button data-act="syncNow">' + ic('i-upload') + '<span class="grow">Sauvegarder maintenant</span></button>' +
      '<button data-act="syncPull">' + ic('i-download') + '<span class="grow">Récupérer ma sauvegarde en ligne</span></button>' +
      '<button data-act="newPassword">' + ic('i-edit') + '<span class="grow">Changer de mot de passe</span></button>' +
      '<button data-act="privacy">' + ic('i-help') + '<span class="grow">Confidentialité</span></button>' +
      '<button data-act="logout">' + ic('i-left') + '<span class="grow">Se déconnecter</span></button>' +
      '<button class="danger" data-act="deleteAccount" data-confirm="Appuie encore : compte et sauvegarde supprimés">' + ic('i-trash') + '<span class="grow">Supprimer mon compte</span></button>' +
      '</div></section>';
  }
  const PRIVACY = '<p>Quand tu crées un compte, NutriScan enregistre en ligne (base hébergée en Europe) : ton e-mail et toutes les données de l’appli (repas, aliments, poids, eau, activités, objectifs, réglages, y compris tes réglages d’avertissements).</p>' +
    '<p>But : sauvegarder ton compte et le restaurer si tu perds ton téléphone ou tes données.</p>' +
    '<p>Qui peut les voir : toi, et l’administrateur de l’appli, uniquement pour gérer les sauvegardes et restaurer un compte. Elles ne sont ni vendues ni partagées.</p>' +
    '<p>Tes droits : tu peux télécharger tes données (Profil → Sauvegarder mes données) et supprimer ton compte à tout moment (Profil → Supprimer mon compte). La suppression efface aussi toutes les versions sauvegardées.</p>' +
    '<p>Sans compte, tout reste uniquement sur ton téléphone.</p>';
  function openAbout() {
    const seg = '<div class="seg">' + [['true', 'Activés'], ['false', 'Désactivés']].map(o => '<button data-ab="' + o[0] + '"' + (String(consent === true) === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>';
    const el = mountSheet(head('À propos') +
      '<div class="setrow" style="border-top:0;padding-top:0"><span>Rapports d’erreurs et statistiques d’utilisation</span>' + seg + '</div>' +
      '<p class="hint">Ils servent à repérer et corriger les bugs (caméra, scans ratés, erreurs). Rien sur tes quantités, ton poids ou ta santé.</p>' +
      '<div class="prose">' + PRIVACY + '</div>' +
      '<p class="hint">NutriScan ' + VERSION + '<br>Données produits : Open Food Facts, licence ODbL.</p>');
    openLayer({ el });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-ab]'); if (!b) return;
      setConsent(b.dataset.ab === 'true');
      $$('[data-ab]', el).forEach(x => x.classList.toggle('on', x === b));
      toast(consent ? 'Merci ! Rapports activés' : 'Rapports désactivés');
    });
  }
  function askConsent() {
    if (consent !== null || !C.enabled || layers.length || OB) return;
    const el = mountSheet('<div class="grab"></div><div class="sheet-head"><h3>Aider à améliorer NutriScan ?</h3></div>' +
      '<p class="prose">Avec ton accord, l’appli envoie des <b>rapports d’erreurs</b> et des <b>statistiques d’utilisation</b> : ouvertures de l’appli, codes-barres scannés et produits introuvables, recherches, problèmes de caméra, modèle de ton téléphone. Si tu as un compte, ils sont liés à ton compte.</p>' +
      '<p class="hint">Rien sur tes quantités, ton poids ou ta santé. Tu peux changer d’avis à tout moment dans Profil → À propos.</p>' +
      '<div class="row-btns"><button class="btn outline" data-cs="0">Non merci</button><button class="btn primary" data-cs="1">J’accepte</button></div>');
    openLayer({ el });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-cs]'); if (!b) return;
      setConsent(b.dataset.cs === '1');
      if (consent) track('app_open', openInfo());
      closeTop();
    });
  }
  function openInfo() {
    return { standalone: !!((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone), online: navigator.onLine, lang: navigator.language, w: screen.width, h: screen.height, logged: !!(C.session) };
  }
  let lastMsgCheck = 0;
  async function checkMessages() {
    if (!C.enabled || !C.session || !navigator.onLine) return;
    lastMsgCheck = Date.now();
    try {
      const me = C.session.user.id;
      const [msgs, reads] = await Promise.all([
        C.req('/rest/v1/messages?select=id,title,body,created_at&order=created_at.desc&limit=20', { auth: true }),
        C.req('/rest/v1/message_reads?select=message_id&user_id=eq.' + me, { auth: true })
      ]);
      const seen = new Set((reads || []).map(r => r.message_id));
      const unread = (msgs || []).filter(m => !seen.has(m.id));
      if (!unread.length || layers.length || OB) return;
      const el = mountSheet(head(unread.length > 1 ? unread.length + ' nouveaux messages' : 'Nouveau message') +
        unread.map(m => '<div class="msg"><b>' + esc(m.title) + '</b><p style="margin-top:6px;white-space:pre-wrap">' + esc(m.body) + '</p><p class="hint" style="margin-top:8px">' +
          esc(new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })) + '</p></div>').join('') +
        '<button class="btn primary" data-act="close">OK</button>');
      openLayer({ el, onClose: () => {
        C.req('/rest/v1/message_reads', { method: 'POST', auth: true, headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: unread.map(m => ({ message_id: m.id, user_id: me })) }).catch(() => {});
      } });
    } catch (e) { /* pas de messages */ }
  }
  function openPrivacy(swap) {
    const el = mountSheet(head('Confidentialité') + '<div class="prose">' + PRIVACY + '</div>');
    openLayer({ el }, swap);
  }
  function openAuth(mode) {
    const signup = mode === 'signup';
    const el = mountSheet(head(signup ? 'Créer un compte' : 'Se connecter') +
      (window.NS_CLOUD && window.NS_CLOUD.google ? '<button type="button" class="btn outline" data-am="google" style="width:100%">' + ic('i-user', 'sm') + 'Continuer avec Google</button><p class="hint center">ou avec ton e-mail</p>' : '') +
      '<form id="authForm" class="stack" autocomplete="on" novalidate>' +
      '<div class="field"><label for="aEmail">E-mail</label><input id="aEmail" type="email" inputmode="email" autocomplete="email" placeholder="toi@exemple.com" required></div>' +
      '<div class="field"><label for="aPass">Mot de passe</label><input id="aPass" type="password" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" placeholder="' + (signup ? '8 caractères minimum' : '') + '" required></div>' +
      '<label class="check"><input type="checkbox" id="aConsent"><span>' + (signup ? '' : 'Première connexion ? ') + 'J’accepte que mes données NutriScan (repas, poids, objectifs, réglages) soient sauvegardées en ligne et consultables par l’administrateur de l’appli pour pouvoir restaurer mon compte. Je peux supprimer mon compte à tout moment. <button type="button" class="linkbtn" data-act="privacyPush">En savoir plus</button></span></label>' +
      '<p class="hint err" id="aErr" hidden></p>' +
      '<button class="btn primary" type="submit" id="aSubmit">' + (signup ? 'Créer mon compte' : 'Se connecter') + '</button>' +
      (signup ? '<button type="button" class="linkbtn" data-am="login">Déjà un compte ? Se connecter</button>' :
        '<div class="row-btns"><button type="button" class="linkbtn" data-am="signup">Créer un compte</button><button type="button" class="linkbtn" data-am="forgot">Mot de passe oublié ?</button></div>') +
      '</form>');
    openLayer({ el }, mode && mode.swap);
    const f = $('#authForm', el), err = $('#aErr', el), btn = $('#aSubmit', el);
    const showErr = m => { err.textContent = m; err.hidden = !m; };
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-am]'); if (!b) return;
      if (b.dataset.am === 'forgot') {
        const email = $('#aEmail', el).value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { showErr('Tape ton e-mail au-dessus, puis touche « Mot de passe oublié ? ».'); return; }
        C.recover(email, location.origin + location.pathname).then(() => { showErr(''); toast('E-mail envoyé : ouvre le lien pour choisir un nouveau mot de passe'); }).catch(e => showErr(e.message));
        return;
      }
      if (b.dataset.am === 'google') {
        if (!$('#aConsent', el).checked) { showErr('Coche la case pour accepter la sauvegarde en ligne.'); return; }
        SYNC.consentAt = new Date().toISOString(); saveSync();
        track('login_start', { provider: 'google' }); flushTrack();
        C.oauth('google', location.origin + location.pathname);
        return;
      }
      closeTop(); setTimeout(() => openAuth(b.dataset.am), 60);
    });
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const email = $('#aEmail', el).value.trim(), pass = $('#aPass', el).value;
      if (!/^\S+@\S+\.\S+$/.test(email)) { showErr('Adresse e-mail invalide.'); return; }
      if (signup && pass.length < 8) { showErr('Choisis un mot de passe d’au moins 8 caractères.'); return; }
      if (!pass) { showErr('Tape ton mot de passe.'); return; }
      if (signup && !$('#aConsent', el).checked) { showErr('Coche la case pour accepter la sauvegarde en ligne.'); return; }
      btn.disabled = true; showErr('');
      try {
        if (signup) {
          SYNC.consentAt = new Date().toISOString(); saveSync();
          track('signup', { provider: 'email' });
          const ok = await C.signUp(email, pass, { name: (S.profile && S.profile.name) || '' });
          if (!ok) { $('.sheet-in', el).innerHTML = head('Vérifie tes e-mails') + '<div class="msg">On t’a envoyé un e-mail à <b>' + esc(email) + '</b>. Ouvre le lien pour activer ton compte : tu seras connecté automatiquement.</div><button class="btn primary" data-act="close">OK</button>'; return; }
        } else { await C.signIn(email, pass); track('login', { provider: 'email' }); }
        closeTop();
        await afterLogin();
      } catch (e) { showErr(e.message); btn.disabled = false; }
    });
    setTimeout(() => { const i = $('#aEmail', el); if (i && el.isConnected) i.focus(); }, 320);
  }
  function openNewPassword() {
    const el = mountSheet(head('Nouveau mot de passe') +
      '<form id="npForm" class="stack"><div class="field"><label for="npPass">Nouveau mot de passe</label><input id="npPass" type="password" autocomplete="new-password" placeholder="8 caractères minimum"></div>' +
      '<p class="hint err" id="npErr" hidden></p><button class="btn primary" type="submit">Enregistrer</button></form>');
    openLayer({ el });
    $('#npForm', el).addEventListener('submit', async ev => {
      ev.preventDefault();
      const pw = $('#npPass', el).value, er = $('#npErr', el);
      if (pw.length < 8) { er.textContent = 'Au moins 8 caractères.'; er.hidden = false; return; }
      try { await C.updatePassword(pw); closeTop(); toast('Mot de passe modifié'); } catch (e) { er.textContent = e.message; er.hidden = false; }
    });
  }
  async function checkAdmin() {
    try { const rows = await C.req('/rest/v1/admins?select=user_id&user_id=eq.' + C.session.user.id, { auth: true }); SYNC.admin = !!(rows && rows.length); }
    catch (e) { SYNC.admin = false; }
    saveSync(); if (tab === 'profile') renderProfile();
  }
  function mergeStates(a, b) {
    a = fixState(a); b = fixState(b);
    const tomb = Object.assign({}, b.tomb);
    Object.keys(a.tomb).forEach(k => { tomb[k] = Math.max(tomb[k] || 0, a.tomb[k]); });
    // Pour chaque élément, la version modifiée le plus récemment gagne ; un élément supprimé après sa dernière modification reste supprimé
    const pick = (x, y, keyOf, prefix) => {
      const m = new Map();
      y.concat(x).forEach(e => { const k = keyOf(e), prev = m.get(k); if (!prev || (e.mt || 0) >= (prev.mt || 0)) m.set(k, e); });
      return [...m.values()].filter(e => { const t = tomb[prefix + keyOf(e)]; return !t || (e.mt || 0) > t; });
    };
    const o = fixState(a);
    o.tomb = tomb;
    o.entries = pick(a.entries, b.entries, e => e.id, 'e:');
    o.exercises = pick(a.exercises, b.exercises, e => e.id, 'x:');
    o.weights = pick(a.weights, b.weights, w => w.date, 'w:').sort((x, y) => x.date < y.date ? -1 : 1);
    o.water = {}; o.waterT = {};
    new Set(Object.keys(a.water).concat(Object.keys(b.water), Object.keys(a.waterT), Object.keys(b.waterT))).forEach(d => {
      const ta = a.waterT[d] || 0, tb = b.waterT[d] || 0;
      const v = ta >= tb ? (a.water[d] != null ? a.water[d] : (ta ? 0 : b.water[d])) : b.water[d];
      if (num(v) > 0) o.water[d] = num(v);
      if (ta || tb) o.waterT[d] = Math.max(ta, tb);
    });
    o.products = Object.assign({}, b.products, a.products);
    o.recents = [...new Set(a.recents.concat(b.recents))].slice(0, 40);
    o.favorites = [...new Set(a.favorites.concat(b.favorites))].filter(k => !tomb['f:' + k] || (a.favorites.includes(k) && !a.tomb['f:' + k]));
    const latest = (a.metaT || 0) >= (b.metaT || 0) ? a : b;
    o.profile = latest.profile || a.profile || b.profile;
    o.goals = latest.profile || !(a.profile || b.profile) ? latest.goals : (a.profile ? a.goals : b.goals);
    o.warn = latest.warn; o.theme = latest.theme;
    o.metaT = Math.max(a.metaT || 0, b.metaT || 0);
    o.skipSetup = !!(a.skipSetup || b.skipSetup);
    return fixState(o);
  }
  function applyRemote(data, merge, remoteAt) {
    suppressPush = true;
    S = merge ? mergeStates(S, fixState(data)) : fixState(data);
    halalVersion++; save(); suppressPush = false;
    if (remoteAt) { SYNC.lastPush = remoteAt; saveSync(); }
    applyTheme(); renderAll();
    if (OB && (S.profile || S.skipSetup)) closeOB();
    sync({ push: true, force: true, quiet: true });
  }
  function offerRemote(r, fromLogin) {
    const d = new Date(r.updated_at);
    const n = (r.data && Array.isArray(r.data.entries)) ? r.data.entries.length : 0;
    const when = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const title = r.device === 'admin' ? 'Ton compte a été mis à jour par l’administrateur' : fromLogin ? 'Une sauvegarde existe déjà' : 'Sauvegarde plus récente trouvée';
    actionSheet(title, [
      { label: 'Récupérer la sauvegarde en ligne', sub: 'Du ' + when + ' · ' + n + ' aliment' + (n > 1 ? 's' : '') + ' · remplace ce téléphone', icon: 'i-download', color: 'var(--brand)', run: () => { applyRemote(r.data, false, r.updated_at); toast('Sauvegarde récupérée'); } },
      { label: 'Fusionner les deux', sub: 'Garde tout ce qui est sur ce téléphone et en ligne', icon: 'i-copy', color: 'var(--water)', run: () => { applyRemote(r.data, true, r.updated_at); toast('Données fusionnées'); } },
      { label: 'Garder ce téléphone', sub: 'Remplace la sauvegarde en ligne par ce téléphone', icon: 'i-upload', color: 'var(--muted)', run: () => { sync({ force: true }).then(ok => ok && toast('Sauvegarde en ligne mise à jour')); } }
    ]);
  }
  async function afterLogin() {
    let r = null;
    try { r = await C.pull(); } catch (e) { toast(e.message); }
    const localHas = S.entries.length > 0 || !!S.profile;
    if (!r) { const ok = await sync({ force: true }); toast(ok ? 'Compte prêt : tes données sont sauvegardées en ligne' : 'Connecté'); }
    else if (!localHas) { applyRemote(r.data, false, r.updated_at); toast('Connecté : ta sauvegarde a été récupérée'); }
    else offerRemote(r, true);
    renderAll();
    checkAdmin();
  }
  async function cloudStart() {
    if (!C.enabled) return;
    const link = await C.fromLink();
    if (link && link.error) toast(link.error);
    else if (link && link.type === 'recovery') { renderAll(); openNewPassword(); return; }
    else if (link) { toast(link.type === 'oauth' ? 'Connecté avec Google' : 'Adresse confirmée : tu es connecté'); track('login', { provider: link.type === 'oauth' ? 'google' : 'email-link' }); await afterLogin(); checkMessages(); return; }
    if (!C.session) return;
    await sync({ push: !SYNC.lastPush });
    setTimeout(checkMessages, 800);
    if (navigator.onLine) checkAdmin();
  }

  function halalSettingsHTML() {
    const hs = S.warn;
    const seg = (k, opts) => '<div class="seg">' + opts.map(o => '<button data-act="halalSet" data-k="' + k + '" data-v="' + o[0] + '"' + (String(hs[k]) === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>').join('') + '</div>';
    const lv = [['red', 'Rouge'], ['orange', 'Orange'], ['off', 'Masquer']];
    const show = [['on', 'Afficher'], ['off', 'Masquer']];
    return '<section class="card"><div class="card-title"><h2>Avertissements</h2></div>' +
      '<div class="setrow"><span>Avertissements sur les produits</span>' + seg('on', [['true', 'Activés'], ['false', 'Désactivés']]) + '</div>' +
      (hs.on ? '<div class="setrow"><span>Viande (abattage non précisé)</span>' + seg('meat', lv) + '</div>' +
        '<div class="setrow"><span>Alcool en trace (vinaigre de vin, extrait de vanille…)</span>' + seg('alcohol', lv) + '</div>' +
        '<div class="setrow"><span>Origine animale possible (E471, présure, carmin…)</span>' + seg('unc', [['orange', 'Orange'], ['off', 'Masquer']]) + '</div>' +
        '<div class="setrow"><span>Additifs controversés, huile de palme, édulcorants</span>' + seg('adds', show) + '</div>' +
        '<div class="setrow"><span>Allergènes</span>' + seg('allerg', show) + '</div>' +
        '<p class="hint">Porc, gélatine, sang et boissons alcoolisées sont toujours signalés en rouge.</p>' : '') +
      '</section>';
  }
  function openFoodList(kind) {
    const list = kind === 'fav' ? S.favorites.map(getP).filter(Boolean) : Object.values(S.products).filter(p => p.source === 'custom').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const el = mountSheet(head(kind === 'fav' ? 'Mes favoris' : 'Mes aliments') +
      (list.length ? '<div class="list">' + list.map(p => '<div class="row"><button class="row-main" data-fl="' + esc(p.key) + '">' + thumbHTML(p) + '<span class="rt"><b>' + esc(p.name) + halalPill(p) + '</b><small>' + esc(p.brand ? p.brand + ' · ' : '') + fk(p.per100.kcal) + ' kcal / 100 ' + (p.unit || 'g') + '</small></span></button>' + ic('i-right', 'sm') + '</div>').join('') + '</div>'
        : emptyHTML(kind === 'fav' ? 'i-star' : 'i-edit', kind === 'fav' ? 'Aucun favori' : 'Aucun aliment perso', kind === 'fav' ? 'Touche l’étoile sur la fiche d’un aliment.' : 'Crée un aliment depuis « Ajouter un aliment ».')) +
      (kind === 'fav' ? '' : '<button class="btn primary" data-fl="new">Créer un aliment</button>'), { tall: true });
    openLayer({ el });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-fl]'); if (!b) return;
      if (b.dataset.fl === 'new') { openCreate({ swap: true }); return; }
      const p = getP(b.dataset.fl); if (!p) return;
      if (kind === 'fav' || p.source !== 'custom') openProduct(p, { swap: true }); else openCreate({ product: p, swap: true });
    });
  }
  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nutriscan-sauvegarde-' + today() + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Sauvegarde téléchargée');
    } catch (e) { toast('Impossible de créer la sauvegarde'); }
  }
  $('#importFile').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.entries)) throw new Error('format');
        S = fixState(data); halalVersion++; suppressPush = true; save(); suppressPush = false; if (C.session) sync({ force: true, quiet: true }); applyTheme(); renderAll(); toast('Sauvegarde restaurée (' + S.entries.length + ' aliments)');
      } catch (e) { toast('Ce fichier n’est pas une sauvegarde NutriScan'); }
    };
    r.readAsText(f);
  });

  /* ================= Onboarding ================= */
  let OB = null;
  function openOnboarding(edit) {
    const p = S.profile || {};
    OB = { edit: !!edit, step: edit ? 1 : 0, d: {
      name: p.name || '', goal: p.goal || 'lose', sex: p.sex || 'm', age: p.age || '', height: p.height || '',
      weight: (edit ? latestWeight() : p.weight) || '', goalWeight: p.goalWeight || '', rate: p.rate || 0.5, activity: p.activity || 'light'
    } };
    $('#onboard').hidden = false; document.body.classList.add('locked');
    renderOB();
  }
  function obSteps() { return ['welcome', 'goal', 'body', OB.d.goal === 'maintain' ? null : 'target', 'activity', 'result'].filter(Boolean); }
  function computePlan(d) {
    const w = num(d.weight), h = num(d.height), a = num(d.age);
    const bmr = 10 * w + 6.25 * h - 5 * a + (d.sex === 'f' ? -161 : 5);
    const lvl = ACT_LEVELS.find(x => x.id === d.activity) || ACT_LEVELS[1];
    const tdee = bmr * lvl.f;
    let delta = 0;
    if (d.goal === 'lose') delta = d.rate >= 0.5 ? -550 : -275;
    if (d.goal === 'gain') delta = d.rate >= 0.5 ? 450 : 250;
    const floor = d.sex === 'f' ? 1200 : 1500;
    const kcal = Math.max(floor, Math.round((tdee + delta) / 10) * 10);
    const p = Math.round(Math.min(w * (d.goal === 'maintain' ? 1.6 : 1.8), kcal * 0.35 / 4));
    const f = Math.round(kcal * 0.28 / 9);
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    const water = clamp(Math.round(w * 33 / 250) * 250, 1500, 3500);
    const gw = num(d.goalWeight);
    const weeks = d.goal !== 'maintain' && gw > 0 && d.rate > 0 ? Math.abs(w - gw) / d.rate : 0;
    return { kcal, p, c, f, water, tdee: Math.round(tdee), weeks, floored: kcal === floor && tdee + delta < floor };
  }
  function obValid(step) {
    const d = OB.d;
    if (step === 'body') return num(d.age) >= 10 && num(d.age) <= 110 && num(d.height) >= 100 && num(d.height) <= 250 && num(d.weight) >= 25 && num(d.weight) <= 350;
    if (step === 'target') {
      const gw = num(d.goalWeight), w = num(d.weight);
      if (!(gw >= 25 && gw <= 350)) return false;
      return d.goal === 'lose' ? gw < w : gw > w;
    }
    return true;
  }
  function renderOB() {
    const steps = obSteps(), step = steps[OB.step], d = OB.d, box = $('#onboard');
    const prog = OB.step / (steps.length - 1) * 100;
    const opt = (key, val, icon, color, title, sub) => '<button class="opt' + (d[key] === val ? ' on' : '') + '" data-ob-set="' + key + '" data-val="' + val + '">' +
      (icon ? '<span class="micon" style="--mc:' + color + '">' + ic(icon) + '</span>' : '') + '<span class="min0"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
    const inputF = (key, label, unit, ph, mode) => '<div class="field"><label for="ob_' + key + '">' + label + '</label><div class="unit-input"><input id="ob_' + key + '" data-ob-in="' + key + '" inputmode="' + (mode || 'decimal') + '" placeholder="' + ph + '" value="' + esc(d[key]) + '" autocomplete="off"><span>' + unit + '</span></div></div>';
    let body = '', title = '', lead = '', btn = 'Continuer';
    if (step === 'welcome') {
      body = '';
      title = 'Bienvenue sur NutriScan';
      lead = 'Scanne tes produits, suis tes calories et tes protéines, et atteins ton objectif. On commence par calculer tes besoins : 4 questions.';
      body += '<div class="field"><label for="ob_name">Ton prénom (facultatif)</label><input id="ob_name" type="text" data-ob-in="name" value="' + esc(d.name) + '" placeholder="ex. Sarah" autocomplete="given-name"></div>';
      btn = 'Commencer';
    } else if (step === 'goal') {
      title = 'Quel est ton objectif ?';
      body = opt('goal', 'lose', 'i-target', 'var(--burn)', 'Perdre du poids', 'Déficit calorique raisonnable') +
        opt('goal', 'maintain', 'i-heart', 'var(--brand)', 'Garder mon poids', 'Manger équilibré, rester stable') +
        opt('goal', 'gain', 'i-run', 'var(--prot)', 'Prendre du muscle', 'Léger surplus et plus de protéines');
    } else if (step === 'body') {
      title = 'Parle-nous de toi';
      lead = 'Ça sert à estimer combien de calories ton corps dépense.';
      body = '<div class="seg">' + ['m', 'f'].map(s => '<button data-ob-set="sex" data-val="' + s + '"' + (d.sex === s ? ' class="on"' : '') + '>' + (s === 'm' ? 'Homme' : 'Femme') + '</button>').join('') + '</div>' +
        '<div class="grid3">' + inputF('age', 'Âge', 'ans', '20', 'numeric') + inputF('height', 'Taille', 'cm', '175', 'numeric') + inputF('weight', 'Poids', 'kg', '70') + '</div>';
    } else if (step === 'target') {
      title = d.goal === 'lose' ? 'Quel poids vises-tu ?' : 'Jusqu’à quel poids ?';
      body = inputF('goalWeight', 'Poids visé', 'kg', d.goal === 'lose' ? String(Math.max(40, r0(num(d.weight) - 5))) : String(r0(num(d.weight) + 5))) +
        '<p class="hint err" id="obTargetErr" hidden>' + (d.goal === 'lose' ? 'Le poids visé doit être plus bas que ton poids actuel.' : 'Le poids visé doit être plus haut que ton poids actuel.') + '</p>' +
        '<span class="flabel">À quel rythme ?</span>' +
        opt('rate', 0.25, null, '', d.goal === 'lose' ? '0,25 kg par semaine' : '0,25 kg par semaine', 'Doux, facile à tenir') +
        opt('rate', 0.5, null, '', '0,5 kg par semaine', d.goal === 'lose' ? 'Recommandé' : 'Plus rapide, un peu plus de gras');
    } else if (step === 'activity') {
      title = 'Ton niveau d’activité';
      lead = 'Hors sport noté dans l’appli, sur une semaine normale.';
      body = ACT_LEVELS.map(a => opt('activity', a.id, null, '', a.label, a.sub)).join('');
    } else if (step === 'result') {
      const r = computePlan(d);
      title = (d.name ? d.name + ', voici' : 'Voici') + ' ton plan';
      lead = 'Tu dépenses environ ' + fk(r.tdee) + ' kcal par jour.' + (r.floored ? ' On ne descend pas sous ' + fk(d.sex === 'f' ? 1200 : 1500) + ' kcal pour rester en bonne santé.' : '');
      let eta = '';
      if (r.weeks > 0) { const dt = new Date(); dt.setDate(dt.getDate() + Math.round(r.weeks * 7)); eta = 'Objectif de ' + fkg(num(d.goalWeight)) + ' kg vers ' + dt.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + ' (estimation)'; }
      body = '<div class="result"><span>Objectif quotidien</span><div class="big num">' + fk(r.kcal) + '</div><span>kcal par jour</span></div>' +
        '<div class="tiles">' + MACROS.map(m => '<div class="tile"><b class="num" style="color:' + m.color + '">' + r[m.k] + ' g</b><span>' + m.short + '</span></div>').join('') +
        '<div class="tile"><b class="num" style="color:var(--water)">' + fL(r.water) + ' L</b><span>Eau</span></div></div>' +
        (eta ? '<p class="hint center">' + esc(eta) + '</p>' : '') +
        '<p class="hint center">Tu pourras tout ajuster plus tard dans Profil.</p>';
      btn = OB.edit ? 'Appliquer' : 'C’est parti';
    }
    box.innerHTML = '<div class="ob"><div class="ob-top">' +
      (OB.step > 0 && !(OB.edit && OB.step === 1) ? '<button class="iconbtn ghost" data-ob="back" aria-label="Retour">' + ic('i-left') + '</button>' : (OB.edit ? '<button class="iconbtn ghost" data-ob="quit" aria-label="Fermer">' + ic('i-x') + '</button>' : '<span></span>')) +
      '<div class="ob-prog"' + (step === 'welcome' ? ' style="visibility:hidden"' : '') + '><i style="width:' + prog + '%"></i></div><span></span></div>' +
      (step === 'welcome' ? '<div class="logo-big">' + ic('i-scan') + '</div>' : '') +
      '<div><h1>' + esc(title) + '</h1>' + (lead ? '<p class="lead" style="margin-top:8px">' + esc(lead) + '</p>' : '') + '</div>' +
      '<div class="ob-body">' + body + '</div>' +
      '<div class="ob-foot"><button class="btn primary block" data-ob="next" id="obNext">' + btn + '</button>' +
      (step === 'welcome' && !OB.edit ? '<button class="btn outline block" data-ob="skip">Plus tard</button>' : '') + '</div></div>';
    box.scrollTop = 0;
    obUpdateBtn();
  }
  function obUpdateBtn() {
    const steps = obSteps(), step = steps[OB.step];
    const ok = obValid(step);
    const b = $('#obNext'); if (b) b.disabled = !ok;
    const err = $('#obTargetErr');
    if (err) { const gw = num(OB.d.goalWeight); err.hidden = !(gw >= 25) || ok; }
  }
  function finishOB() {
    const d = OB.d, r = computePlan(d);
    const prof = { name: d.name.trim(), goal: d.goal, sex: d.sex, age: r0(num(d.age)), height: r0(num(d.height)), weight: Math.round(num(d.weight) * 10) / 10,
      goalWeight: d.goal === 'maintain' ? null : Math.round(num(d.goalWeight) * 10) / 10, rate: d.rate, activity: d.activity };
    S.profile = prof; S.skipSetup = false; touchMeta();
    S.goals = { kcal: r.kcal, p: r.p, c: r.c, f: r.f, water: r.water };
    const t = today(), lw = latestWeight();
    if (!S.weights.length || Math.abs(lw - prof.weight) > 0.01) {
      S.weights = S.weights.filter(w => w.date !== t).concat([{ date: t, kg: prof.weight, mt: now() }]).sort((a, b) => a.date < b.date ? -1 : 1);
    }
    const edit = OB.edit;
    save(); closeOB(); renderAll();
    toast(edit ? 'Objectifs mis à jour : ' + fk(r.kcal) + ' kcal' : 'C’est parti ! Objectif : ' + fk(r.kcal) + ' kcal');
  }
  function closeOB() { OB = null; $('#onboard').hidden = true; $('#onboard').innerHTML = ''; document.body.classList.toggle('locked', layers.length > 0); setTimeout(askConsent, 900); }
  $('#onboard').addEventListener('click', e => {
    if (!OB) return;
    const s = e.target.closest('[data-ob-set]');
    if (s) { const k = s.dataset.obSet; OB.d[k] = k === 'rate' ? num(s.dataset.val) : s.dataset.val; renderOB(); return; }
    const a = e.target.closest('[data-ob]'); if (!a) return;
    const steps = obSteps();
    if (a.dataset.ob === 'back') { OB.step = Math.max(0, OB.step - 1); renderOB(); }
    else if (a.dataset.ob === 'quit') closeOB();
    else if (a.dataset.ob === 'skip') { S.skipSetup = true; save(); closeOB(); renderAll(); }
    else if (a.dataset.ob === 'next') {
      if (!obValid(steps[OB.step])) return;
      if (OB.step >= steps.length - 1) finishOB(); else { OB.step++; renderOB(); }
    }
  });
  $('#onboard').addEventListener('input', e => {
    const i = e.target.closest('[data-ob-in]'); if (!i || !OB) return;
    OB.d[i.dataset.obIn] = i.value; obUpdateBtn();
  });
  $('#onboard').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); const b = $('#obNext'); if (b && !b.disabled) b.click(); }
  });

  /* ================= Onglets + thème ================= */
  function switchTab(t) {
    if (!['journal', 'progress', 'profile'].includes(t)) return;
    tab = t;
    $$('.screen').forEach(s => { s.hidden = s.id !== 'screen-' + t; });
    $$('.tab[data-tab]').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
    renderAll();
  }
  function renderAll() {
    renderJournal();
    if (tab === 'progress') renderProgress();
    if (tab === 'profile') renderProfile();
  }
  function applyTheme() {
    if (S.theme === 'light' || S.theme === 'dark') document.documentElement.setAttribute('data-theme', S.theme);
    else document.documentElement.removeAttribute('data-theme');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) $('#themeColor').setAttribute('content', bg);
  }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { /* vieux navigateur */ }

  /* ================= Actions (délégation des clics) ================= */
  const ACTS = {
    close: () => closeTop(),
    tab: b => switchTab(b.dataset.tab),
    fab: () => openFab(),
    scan: () => openScanner(),
    day: b => setDay(b.dataset.d),
    wPrev: () => setDay(addDays(day, -7)),
    wNext: () => { const d = addDays(day, 7), t = today(); setDay(d > t ? t : d); },
    addFood: b => openAddFood(b.dataset.meal),
    mealMenu: b => openMealMenu(b.dataset.meal),
    copyMeal: b => copyMeal(b.dataset.meal),
    editEntry: b => editEntry(b.dataset.id),
    water: b => setWater(num(S.water[day]) + num(b.dataset.v)),
    glass: b => tapGlass(+b.dataset.i),
    addExercise: () => openExercise(false),
    exMenu: b => openExMenu(b.dataset.id),
    addWeight: () => openWeight(false),
    range: b => { range = +b.dataset.r; renderProgress(); },
    editGoals: () => openGoals(),
    editProfile: () => openOnboarding(!!S.profile),
    theme: b => { S.theme = b.dataset.t; touchMeta(); save(); applyTheme(); renderProfile(); },
    halalSet: b => {
      const k = b.dataset.k, v = b.dataset.v;
      S.warn[k] = k === 'on' ? v === 'true' : v; touchMeta();
      halalVersion++; save(); renderAll();
    },
    myFoods: () => openFoodList('mine'),
    favList: () => openFoodList('fav'),
    exportData: () => exportData(),
    importData: () => $('#importFile').click(),
    auth: b => openAuth(b.dataset.m),
    privacy: () => openPrivacy(),
    about: () => openAbout(),
    privacyPush: () => openPrivacy(),
    syncNow: () => { sync({ push: true }).then(ok => toast(ok ? 'Sauvegardé en ligne' : (navigator.onLine ? (syncError || 'Sauvegarde impossible pour l’instant') : 'Hors ligne : ce sera envoyé au retour d’Internet'))); },
    syncPull: async () => { try { const r = await C.pull(); if (r) offerRemote(r); else toast('Aucune sauvegarde en ligne pour l’instant'); } catch (e) { toast(e.message); } },
    newPassword: () => openNewPassword(),
    logout: async () => { await C.signOut(); SYNC.admin = false; SYNC.pending = false; saveSync(); renderAll(); toast('Déconnecté : tes données restent sur ce téléphone'); },
    deleteAccount: async () => {
      try { await C.deleteAccount(); SYNC.lastPush = null; SYNC.admin = false; SYNC.pending = false; SYNC.consentAt = null; saveSync(); renderAll(); toast('Compte et sauvegarde en ligne supprimés'); }
      catch (e) { toast(e.message); }
    },
    wipe: () => {
      const theme = S.theme, warn = S.warn; S = fixState({ theme, warn, metaT: now() }); suppressPush = true; save(); suppressPush = false; if (C.session) sync({ force: true, quiet: true }); TMP.clear(); setDay(today()); switchTab('journal'); toast('Toutes les données ont été effacées'); openOnboarding(false);
    },
    afMealPick: () => {
      if (!AF) return;
      actionSheet('Ajouter au…', MEALS.map(m => ({ label: m.label, icon: m.icon, color: m.color, run: () => { if (AF) { AF.meal = m.id; renderAF(); } } })));
    },
    afTab: b => { if (AF) { AF.tab = b.dataset.t; renderAF(); } },
    afClear: () => { if (!AF) return; const i = $('#afInput', AF.el); i.value = ''; i.dispatchEvent(new Event('input')); i.focus(); },
    afScan: () => openScanner(),
    afQuickAdd: () => openQuick({ meal: AF ? AF.meal : undefined }),
    afCreate: () => openCreate({}),
    afOpen: b => { const p = getP(b.dataset.k); if (p) openProduct(p, { meal: AF ? AF.meal : undefined }); },
    afAdd1: b => quickAddDefault(getP(b.dataset.k)),
    afCode: () => { if (AF) lookupCode(AF.q.trim()); },
    afRetry: () => { if (AF) { SEARCH_CACHE.delete(AF.q.trim()); offSearch(AF.q.trim()); } },
    retryCode: b => lookupCode(b.dataset.code, { swap: true }),
    createCode: b => openCreate({ code: b.dataset.code, swap: true }),
    rescan: () => openScanner(true),
    scTorch: async b => {
      if (!SC.track) return;
      try { await SC.track.applyConstraints({ advanced: [{ torch: !SC.torch }] }); SC.torch = !SC.torch; b.classList.toggle('on', SC.torch); } catch (e) { toast('Lampe indisponible'); }
    },
    scZoom: async b => {
      if (!SC.track || !SC.caps || !SC.caps.zoom) return;
      try { const z = !SC.zoom; await SC.track.applyConstraints({ advanced: [{ zoom: z ? Math.min(2, SC.caps.zoom.max) : (SC.caps.zoom.min || 1) }] }); SC.zoom = z; b.classList.toggle('on', z); } catch (e) { toast('Zoom indisponible'); }
    },
    scManual: () => { showManual(); setTimeout(() => $('#scCode').focus(), 50); },
    scTap: async () => {
      const v = SC.legacy ? $('#reader video') : $('#camVideo');
      if (v) { v.muted = true; v.setAttribute('playsinline', ''); try { await v.play(); } catch (e) { /* rien */ } }
      setTimeout(() => {
        const ok = v && !v.paused && v.videoWidth > 0;
        $('#scTap').hidden = !!ok;
        if (ok) scanMsg('Place le code-barres dans le cadre');
        else { scanMsg('La caméra reste noire : ferme et rouvre le scanner, ou ouvre l’appli dans Safari / Chrome.', true); stopScan().then(() => startScan()); }
      }, 400);
    }
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.confirm && !arm(b, b.dataset.confirm)) return;
    const fn = ACTS[b.dataset.act];
    if (fn) fn(b, e);
  });
  $('#scrim').addEventListener('click', () => closeTop());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !OB) closeTop(); });
  $('#scManualForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('#scCode').value.replace(/\D/g, '');
    if (code.length < 6) { toast('Tape les chiffres sous le code-barres'); return; }
    $('#scCode').blur();
    stopScan().then(() => lookupCode(code, { swap: true, fromScan: true }));
  });

  // Connexion : indicateur, synchronisation et produits à compléter au retour du réseau
  function renderNet() { const b = $('#netBadge'); if (b) b.hidden = navigator.onLine; }
  window.addEventListener('offline', () => { renderNet(); refreshAccountStatus(); toast('Hors ligne : tout reste enregistré sur ton téléphone'); });
  window.addEventListener('online', () => {
    flushTrack();
    renderNet();
    toast('De retour en ligne');
    resolvePending();
    sync();
    if (AF && AF.q.trim().length >= 3) offSearch(AF.q.trim());
  });

  // Changement de jour pendant que l'appli reste ouverte + coupure caméra en arrière-plan
  let lastToday = today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (scannerOpen()) stopScan(); flushTrack(); return; }
    const t = today();
    if (t !== lastToday) { if (day === lastToday) { day = t; weekStart = mondayOf(t); } lastToday = t; renderAll(); }
    if (scannerOpen() && !SC.running && !SC.handled && topLayer() && topLayer().kind === 'scanner') startScan();
    if (navigator.onLine) { resolvePending(); if (C.session) { sync({ quiet: false }); if (Date.now() - lastMsgCheck > 600000) setTimeout(checkMessages, 1500); } }
  });
  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (tab === 'progress') renderProgress(); }, 200); });

  /* ================= Démarrage ================= */
  try { if (history.state && history.state.nsLayer) history.replaceState(null, ''); } catch (e) { /* rien */ }
  applyTheme();
  renderAll();
  if (!S.profile && !S.skipSetup && !/access_token=/.test(location.hash)) openOnboarding(false);
  else setTimeout(askConsent, 1500);
  track('app_open', openInfo());
  cloudStart();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
  renderNet();
  if (navigator.onLine) setTimeout(resolvePending, 1500);
  setTimeout(warmScanner, 2000);

  // Accès pour les tests automatisés
  window.__ns = { get state() { return S; }, lookupCode, openAddFood, openProduct, setDay, flush: flushTrack, sync };
})();
