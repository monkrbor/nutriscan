/* Section Repas : questionnaire de goûts, idées selon les calories restantes, recettes pas à pas, menu de la semaine et liste de courses.
   Les recettes viennent de recipes.js : aucune ne contient de porc, d'alcool ou de sang. */
(function () {
  'use strict';
  const A = window.NS_APP, RB = window.NS_RECIPES;
  if (!A || !RB) return;
  const { esc, ic, fk, num, today, addDays, parseYmd, toast, arm, $, $$ } = A;
  const I = RB.I, R = RB.R, RM = Object.fromEntries(R.map(r => [r.id, r]));
  const DIETS = [['omni', 'Je mange de tout', 'Viande, poisson, œufs, laitages (jamais de porc)'], ['pesco', 'Poisson mais pas de viande', ''], ['vege', 'Végétarien', 'Œufs et laitages, pas de viande ni de poisson'], ['vegan', 'Végan', 'Rien d’origine animale']];
  const PROTS = [['poulet', 'Poulet'], ['dinde', 'Dinde'], ['boeuf', 'Bœuf'], ['agneau', 'Agneau'], ['f', 'Poisson'], ['s', 'Fruits de mer'], ['e', 'Œufs']];
  const AVOID = [['d', 'Lait'], ['g', 'Gluten'], ['n', 'Fruits à coque'], ['a', 'Arachide'], ['z', 'Sésame'], ['y', 'Soja'], ['champi', 'Champignons'], ['poivron', 'Poivron'], ['aubergine', 'Aubergine'], ['avocat', 'Avocat'], ['spicy', 'Épicé'], ['coriandre', 'Coriandre'], ['olives', 'Olives'], ['coco', 'Lait de coco']];
  const SLOTS = [['breakfast', 'Petit-déjeuner', 'bf', 0.25], ['lunch', 'Déjeuner', 'main', 0.35], ['dinner', 'Dîner', 'main', 0.30], ['snack', 'Collation', 'snack', 0.10]];
  const SLOT = Object.fromEntries(SLOTS.map(s => [s[0], s]));
  const DIETRANK = { omni: 0, pesco: 1, vege: 2, vegan: 3 };
  const DIETTXT = { omni: '', pesco: 'Poisson', vege: 'Végétarien', vegan: 'Végan' };
  function ck() { const s = A.S; if (!s.cook || typeof s.cook !== 'object') s.cook = {}; return s.cook; }
  function touch() { ck().t = Date.now(); A.save(); }

  /* ---------- Filtres selon les goûts ---------- */
  function allowed(r, p) {
    if (!p) return true;
    if (DIETRANK[r.diet] < DIETRANK[p.diet || 'omni']) return false;
    const prots = new Set(p.prots || []);
    if (p.prots && (p.diet === 'omni' || p.diet === 'pesco')) {
      if (r.meats.some(m => !prots.has(m))) return false;
      if (r.has.includes('f') && !prots.has('f')) return false;
      if (r.has.includes('s') && !prots.has('s')) return false;
      if (r.has.includes('e') && !prots.has('e')) return false;
    }
    for (const a of p.avoid || []) {
      if (a.length === 1 && r.has.includes(a)) return false;
      if (a === 'spicy' && r.ing.some(([k]) => k === 'piment' || k === 'harissa')) return false;
      if (I[a] && r.ing.some(([k]) => k === a)) return false;
    }
    if (p.time && r.time > p.time) return false;
    if (p.budget === 1 && r.budget > 2) return false;
    if (p.noOven && r.tools.includes('four')) return false;
    if (p.noMixer && r.tools.includes('mixeur')) return false;
    return true;
  }
  const pool = (type, p) => R.filter(r => r.type === type && allowed(r, p));
  function liked(r) { return (ck().favs || []).includes(r.id); }

  /* ---------- Quantités affichées ---------- */
  function qty(k, g, shop) {
    const x = I[k], d = x && x[7];
    const grams = v => v >= 1000 ? String(Math.round(v / 100) / 10).replace('.', ',') + ' kg' : (v >= 100 ? Math.round(v / 10) * 10 : Math.max(5, Math.round(v / 5) * 5)) + ' g';
    if (!d) return grams(g);
    if (shop && d[0] === 'cc') return 'à avoir';
    if (shop && d[0] === 'cs' && g > 60) return grams(g);
    if (shop && d[0] === 'ml' && g >= 1000) return String(Math.round(g / 100) / 10).replace('.', ',') + ' L';
    if (d[0] === 'pc') { let n = g / d[1]; n = shop ? Math.ceil(n * 2 - 0.2) / 2 : Math.round(n * 2) / 2; n = Math.max(0.5, n); const t = n === 0.5 ? '½' : String(n).replace('.5', ' ½'); return t + ' ' + (n > 1 ? d[3] : d[2]); }
    if (d[0] === 'cs') { const n = Math.max(0.5, Math.round(g / 10 * 2) / 2); return String(n).replace('.5', ',5') + ' c. à soupe'; }
    if (d[0] === 'cc') { const n = Math.max(0.5, Math.round(g / 3 * 2) / 2); return String(n).replace('.5', ',5') + ' c. à café'; }
    if (d[0] === 'ml') return (g >= 100 ? Math.round(g / 10) * 10 : Math.round(g)) + ' ml';
    return Math.round(g) + ' g';
  }
  const ingName = k => (I[k] ? I[k][0] : k);
  /* ---------- Photos (Pexels) : l'emoji reste dessous si la photo ne charge pas (hors ligne…) ---------- */
  const phUrl = (id, w, h) => 'https://images.pexels.com/photos/' + id + '/pexels-photo-' + id + '.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=' + w + '&h=' + h;
  const thumb = r => '<span class="rc-emo" aria-hidden="true">' + r.emoji + (r.ph ? '<img src="' + phUrl(r.ph, 160, 160) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>';
  document.addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.rc-emo,.rc-hero')) t.remove(); }, true);
  document.addEventListener('load', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.rc-emo,.rc-hero')) t.classList.add('on'); }, true);

  /* ---------- Produit « recette » pour le journal ---------- */
  function asProduct(r) {
    const k = 100 / r.g;
    return { key: 'rcp-' + r.id, code: '', name: r.n, brand: 'Recette', qty: '', image: '', unit: 'g', portions: [{ label: 'portion', g: r.g }], nutri: '',
      per100: { kcal: r.kcal * k, p: r.p * k, c: r.c * k, f: r.f * k, sugar: null, sfat: null, fiber: null, salt: null }, hasNutri: true, source: 'recipe',
      ing: r.ing.map(([x]) => ingName(x)).join(', '), ingTags: [], additives: [], labels: [], analysis: [], traces: [], allergens: [] };
  }
  function addToJournal(r, meal) { A.openProduct(asProduct(r), { meal: meal || A.defaultMeal() }); }

  /* ---------- Calories restantes ---------- */
  function remaining() {
    const S = A.S, d = today(), T = A.totals(d), B = A.burnedOf(d), G = S.goals || {};
    return { kcal: Math.round((G.kcal || 2000) + B - T.kcal), p: Math.round((G.p || 100) - T.p), goal: G };
  }
  function nowSlot() { const m = A.defaultMeal(); return SLOT[m] ? m : 'lunch'; }
  function suggestions(slot, n) {
    const p = ck().prefs, rem = remaining(), s = SLOT[slot], target = Math.min(Math.max(150, rem.kcal), Math.round((rem.goal.kcal || 2000) * s[3] * 1.4));
    const list = pool(s[2], p).map(r => {
      const m = Math.min(1.75, Math.max(0.5, Math.round(target / r.kcal * 4) / 4));
      const kcal = r.kcal * m, prot = r.p * m;
      let sc = -Math.abs(kcal - target) / 40 + (liked(r, p) ? 3 : 0) + (rem.p > 20 ? prot / 8 : 0) + (m === 1 ? 1 : 0);
      if (ck().favs && ck().favs.includes(r.id)) sc += 2;
      return { r, m, kcal, prot, sc };
    }).filter(x => x.kcal <= Math.max(rem.kcal, 200) + 60).sort((a, b) => b.sc - a.sc);
    const seed = parseInt(today().replace(/-/g, ''), 10) % 3;
    return list.slice(seed, seed + n).concat(list.slice(0, seed)).slice(0, n);
  }
  const mtxt = m => m === 1 ? '1 portion' : String(m).replace('.', ',') + ' portion' + (m > 1 ? 's' : '');

  /* ---------- Menu de la semaine ---------- */
  function makeWeek() {
    const c = ck(), p = c.prefs || {}, G = A.S.goals || {}, slots = (p.slots && p.slots.length ? p.slots : ['lunch', 'dinner']);
    const start = today(), days = {}, recent = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i); days[d] = {};
      slots.forEach(sl => {
        const s = SLOT[sl], target = (G.kcal || 2000) * s[3];
        const cands = pool(s[2], p).map(r => {
          const m = Math.min(1.75, Math.max(0.75, Math.round(target / r.kcal * 4) / 4));
          const rep = recent.lastIndexOf(r.id);
          let sc = Math.random() * 3 + (liked(r, p) ? 3 : 0) - Math.abs(r.kcal * m - target) / 80 + r.p * m / 15;
          if (rep >= 0 && recent.length - rep < 8) sc -= 20;
          if (c.favs && c.favs.includes(r.id)) sc += 1.5;
          return { id: r.id, m, sc };
        }).sort((a, b) => b.sc - a.sc);
        if (cands[0]) { days[d][sl] = { id: cands[0].id, m: cands[0].m }; recent.push(cands[0].id); }
      });
    }
    c.week = { start, days, people: p.people || 1 }; c.shop = {}; touch();
    A.track('meal_week', { slots: slots.length });
  }
  function weekDays() { const w = ck().week; if (!w) return []; return Object.keys(w.days).sort().filter(d => d >= today()); }
  function shopping() {
    const w = ck().week; if (!w) return [];
    const ppl = w.people || 1, tot = {};
    weekDays().forEach(d => Object.values(w.days[d]).forEach(x => { const r = RM[x.id]; if (!r) return; r.ing.forEach(([k, g]) => { tot[k] = (tot[k] || 0) + g * x.m * ppl; }); }));
    const by = {};
    Object.keys(tot).forEach(k => { const a = RB.AISLES[I[k][5]] || 'Autres'; (by[a] = by[a] || []).push({ k, g: tot[k] }); });
    return Object.keys(by).map(a => [a, by[a].sort((x, y) => ingName(x.k).localeCompare(ingName(y.k), 'fr'))]);
  }

  /* ================= Écran Repas ================= */
  let filt = 'all', q = '';
  function card(r, m, extra) {
    const kcal = Math.round(r.kcal * (m || 1)), prot = Math.round(r.p * (m || 1)), fav = (ck().favs || []).includes(r.id);
    return '<button class="rc" data-rc="' + r.id + '"' + (m ? ' data-m="' + m + '"' : '') + '>' + thumb(r) + '<span class="min0"><b>' + esc(r.n) + (fav ? ' ' + ic('i-heart', 'sm fav') : '') + '</b>' +
      '<small>' + r.time + ' min · ' + fk(kcal) + ' kcal · ' + prot + ' g prot.' + (m && m !== 1 ? ' · ' + mtxt(m) : '') + (extra ? ' · ' + esc(extra) : '') + '</small></span></button>';
  }
  function render(el) {
    const c = ck(), p = c.prefs, rem = remaining(), slot = nowSlot();
    const sug = suggestions(slot, 3);
    const w = c.week, wd = weekDays(), td = w && w.days[today()];
    let list = R.filter(r => allowed(r, p) || !p);
    if (filt === 'bf') list = list.filter(r => r.type === 'bf');
    else if (filt === 'main') list = list.filter(r => r.type === 'main');
    else if (filt === 'snack') list = list.filter(r => r.type === 'snack' || r.type === 'dessert');
    else if (filt === 'quick') list = list.filter(r => r.time <= 20);
    else if (filt === 'prot') list = list.filter(r => r.p >= 30 || (r.type !== 'main' && r.p >= 15));
    else if (filt === 'fav') list = list.filter(r => (c.favs || []).includes(r.id));
    if (q) { const nq = q.toLowerCase(); list = list.filter(r => (r.n + ' ' + r.ing.map(([k]) => ingName(k)).join(' ')).toLowerCase().includes(nq)); }
    list.sort((a, b) => (liked(b, p) - liked(a, p)) || a.n.localeCompare(b.n, 'fr'));
    el.innerHTML = '<header class="page-head"><h1 class="page-title">Repas</h1><button class="iconbtn" data-ml="quiz" aria-label="Mes goûts">' + ic('i-edit') + '</button></header>' +
      (!p ? '<section class="card ml-hero"><h2>Qu’est-ce qu’on mange ?</h2><p class="hint">Dis-nous ce que tu aimes : on te propose des plats qui rentrent dans tes calories, un menu pour la semaine et la liste de courses. Jamais de porc, d’alcool ni de sang.</p><button class="btn primary" data-ml="quiz">Dire ce que j’aime</button></section>' : '') +
      '<section class="card"><div class="card-title"><h2>' + esc(SLOT[slot][1]) + ' : idées pour toi</h2></div><p class="hint" style="margin-bottom:8px">' + (rem.kcal > 0 ? 'Il te reste ' + fk(rem.kcal) + ' kcal aujourd’hui' + (rem.p > 0 ? ' et ' + rem.p + ' g de protéines' : '') + '.' : 'Ton objectif du jour est atteint : voici des idées légères.') + '</p>' +
      (sug.length ? sug.map(x => card(x.r, x.m)).join('') : '<p class="hint">Aucune recette ne correspond à tes goûts pour ce repas.</p>') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Menu de la semaine</h2>' + (w ? '<button class="linkbtn" data-ml="week">Voir tout</button>' : '') + '</div>' +
      (w && wd.length ? (td ? Object.keys(td).map(sl => { const r = RM[td[sl].id]; return r ? '<p class="flabel">Aujourd’hui · ' + esc(SLOT[sl][1]) + '</p>' + card(r, td[sl].m) : ''; }).join('') : '') +
        '<div class="row-btns"><button class="btn outline" data-ml="shop">' + ic('i-cart', 'sm') + 'Liste de courses</button><button class="btn outline" data-ml="regen">Nouveau menu</button></div>'
        : '<p class="hint" style="margin-bottom:10px">Un menu équilibré pour 7 jours, adapté à ton objectif de ' + fk(rem.goal.kcal || 2000) + ' kcal, avec la liste de courses.</p><button class="btn primary block" data-ml="regen">' + ic('i-calendar', 'sm') + 'Créer mon menu de la semaine</button>') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Recettes</h2><span class="hint">' + list.length + '</span></div>' +
      '<div class="searchbox" style="margin-bottom:10px">' + ic('i-search', 'sm') + '<input id="mlQ" type="search" placeholder="Poulet, pâtes, 15 min…" value="' + esc(q) + '" autocomplete="off" aria-label="Chercher une recette"></div>' +
      '<div class="chips" style="margin-bottom:6px">' + [['all', 'Tout'], ['bf', 'Petit-déj'], ['main', 'Plats'], ['snack', 'Collations'], ['quick', '20 min max'], ['prot', 'Riches en protéines'], ['fav', 'Favoris']].map(f => '<button class="chip' + (filt === f[0] ? ' on' : '') + '" data-mf="' + f[0] + '">' + f[1] + '</button>').join('') + '</div>' +
      (list.length ? list.map(r => card(r, 0)).join('') : '<p class="hint">Aucune recette trouvée.</p>') + '</section>';
  }

  /* ================= Fiche recette ================= */
  function openRecipe(id, m0) {
    const r = RM[id]; if (!r) return;
    let ppl = (ck().prefs && ck().prefs.people) || 1;
    const m = m0 || 1;
    const el = A.mountSheet('<div class="grab"></div><div class="rc-top"><button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button><span class="ps-src">Recette</span><button class="iconbtn star" data-rr="fav" aria-label="Favori">' + ic('i-heart') + '</button></div>' +
      '<div class="rc-hero' + (r.ph ? ' ph' : '') + '"><span aria-hidden="true">' + r.emoji + '</span>' + (r.ph ? '<img src="' + phUrl(r.ph, 800, 460) + '" alt="' + esc(r.n) + '" decoding="async">' : '') + '</div><h2 class="rc-title">' + esc(r.n) + '</h2>' +
      '<div class="tags"><span class="tag">' + ic('i-clock', 'sm') + ' ' + r.time + ' min</span><span class="tag">' + ['', 'Facile', 'Moyen', 'Difficile'][r.lvl] + '</span>' + (DIETTXT[r.diet] ? '<span class="tag">' + DIETTXT[r.diet] + '</span>' : '') + '</div>' +
      '<div class="tiles"><div class="tile"><b class="num">' + fk(r.kcal * m) + '</b><span>kcal</span></div><div class="tile"><b class="num" style="color:var(--prot)">' + Math.round(r.p * m) + ' g</b><span>Protéines</span></div><div class="tile"><b class="num" style="color:var(--carb)">' + Math.round(r.c * m) + ' g</b><span>Glucides</span></div><div class="tile"><b class="num" style="color:var(--fat)">' + Math.round(r.f * m) + ' g</b><span>Lipides</span></div></div>' +
      '<p class="hint center">Pour ' + mtxt(m) + ' (' + fk(r.g * m) + ' g)</p>' +
      '<div class="rc-sec"><div class="rc-sec-h"><h3>Ingrédients</h3><div class="amt sm"><button data-rr="minus" aria-label="Moins de personnes">' + ic('i-minus') + '</button><b id="rcPpl"></b><button data-rr="plus" aria-label="Plus de personnes">' + ic('i-plus') + '</button></div></div><ul class="rc-ing" id="rcIng"></ul></div>' +
      '<div class="rc-sec"><h3>Préparation</h3><ol class="steps">' + r.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol></div>' +
      (r.has.length ? '<p class="hint">Contient : ' + r.has.filter(h => RB.TAGL[h] && !['m', 'f', 's'].includes(h)).map(h => RB.TAGL[h]).join(', ') + '</p>' : '') +
      '<div class="sticky-foot"><button class="btn primary" data-rr="add">' + ic('i-plus', 'sm') + 'Ajouter à mon journal</button></div>', { tall: true, foot: true });
    A.openLayer({ el });
    const draw = () => {
      $('#rcPpl', el).textContent = ppl + ' pers.';
      $('#rcIng', el).innerHTML = r.ing.map(([k, g]) => '<li><span>' + esc(ingName(k)) + '</span><b>' + esc(qty(k, g * m * ppl)) + '</b></li>').join('');
      $('[data-rr="fav"]', el).classList.toggle('on', (ck().favs || []).includes(id));
    };
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-rr]'); if (!b) return;
      const a = b.dataset.rr;
      if (a === 'minus') { ppl = Math.max(1, ppl - 1); draw(); }
      else if (a === 'plus') { ppl = Math.min(12, ppl + 1); draw(); }
      else if (a === 'fav') { const c = ck(); c.favs = c.favs || []; const i = c.favs.indexOf(id); if (i >= 0) c.favs.splice(i, 1); else c.favs.push(id); touch(); draw(); toast(i >= 0 ? 'Retirée des favoris' : 'Ajoutée aux favoris'); }
      else if (a === 'add') addToJournal(r);
    });
    draw();
  }

  /* ================= Questionnaire de goûts ================= */
  function openQuiz() {
    const c = ck();
    const d = Object.assign({ diet: 'omni', prots: PROTS.map(x => x[0]), avoid: [], time: 0, budget: 0, noOven: false, noMixer: false, slots: ['lunch', 'dinner'], people: 1 }, c.prefs || {});
    ['prots', 'avoid', 'slots'].forEach(k => { d[k] = (d[k] || []).slice(); });
    let step = 0;
    const steps = ['diet', 'avoid', 'practical', 'menu'];
    const el = A.mountSheet('<div class="grab"></div><div class="sheet-head"><h3>Mes goûts</h3><button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button></div><div id="mlq"></div>', { tall: true, foot: true });
    A.openLayer({ el });
    const chip = (k, v, label, on) => '<button class="chip' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + v + '">' + esc(label) + '</button>';
    const opt = (k, v, t, sub, on) => '<button class="opt' + (on ? ' on' : '') + '" data-k="' + k + '" data-v="' + v + '" data-one="1"><span class="min0"><b>' + esc(t) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></button>';
    function draw() {
      const k = steps[step]; let h = '';
      if (k === 'diet') h = '<h2 class="q-t">Ton alimentation</h2>' + DIETS.map(x => opt('diet', x[0], x[1], x[2], d.diet === x[0])).join('') +
        (d.diet === 'omni' || d.diet === 'pesco' ? '<p class="flabel">Ce que tu manges (décoche ce que tu n’aimes pas)</p><div class="chips">' + PROTS.filter(x => d.diet === 'omni' || !['poulet', 'dinde', 'boeuf', 'agneau'].includes(x[0])).map(x => chip('prots', x[0], x[1], d.prots.includes(x[0]))).join('') + '</div>' : '') +
        '<p class="hint" style="margin-top:10px">Les recettes ne contiennent jamais de porc, d’alcool ni de sang.</p>';
      if (k === 'avoid') h = '<h2 class="q-t">Allergies et aliments que tu n’aimes pas</h2><p class="hint">Les recettes qui en contiennent seront cachées.</p><div class="chips">' + AVOID.map(x => chip('avoid', x[0], x[1], d.avoid.includes(x[0]))).join('') + '</div>';
      if (k === 'practical') h = '<h2 class="q-t">En cuisine</h2><p class="flabel">Temps maximum pour préparer</p><div class="chips">' + [[15, '15 min'], [30, '30 min'], [45, '45 min'], [0, 'Peu importe']].map(x => '<button class="chip' + (d.time === x[0] ? ' on' : '') + '" data-k="time" data-v="' + x[0] + '" data-one="1">' + x[1] + '</button>').join('') + '</div>' +
        '<p class="flabel">Budget</p><div class="chips">' + [[1, 'Petit budget'], [0, 'Peu importe']].map(x => '<button class="chip' + (d.budget === x[0] ? ' on' : '') + '" data-k="budget" data-v="' + x[0] + '" data-one="1">' + x[1] + '</button>').join('') + '</div>' +
        '<p class="flabel">Matériel que tu n’as pas</p><div class="chips"><button class="chip' + (d.noOven ? ' on' : '') + '" data-k="noOven" data-v="1" data-flag="1">Pas de four</button><button class="chip' + (d.noMixer ? ' on' : '') + '" data-k="noMixer" data-v="1" data-flag="1">Pas de mixeur</button></div>';
      if (k === 'menu') h = '<h2 class="q-t">Ton menu de la semaine</h2><p class="flabel">Les repas à prévoir</p><div class="chips">' + SLOTS.map(x => chip('slots', x[0], x[1], d.slots.includes(x[0]))).join('') + '</div>' +
        '<p class="flabel">Nombre de personnes (pour les courses)</p><div class="chips">' + [1, 2, 3, 4, 5, 6].map(n => '<button class="chip' + (d.people === n ? ' on' : '') + '" data-k="people" data-v="' + n + '" data-one="1">' + n + '</button>').join('') + '</div>';
      const n = R.filter(r => allowed(r, d)).length;
      $('#mlq', el).innerHTML = '<div class="q-prog"><i style="width:' + ((step + 1) / steps.length * 100) + '%"></i></div><div class="q-body">' + h + '<p class="hint" style="margin-top:12px">' + n + ' recettes correspondent.</p></div>' +
        '<div class="sticky-foot">' + (step ? '<button class="btn outline" data-n="back">Retour</button>' : '') + '<button class="btn primary" data-n="next"' + (n ? '' : ' disabled') + '>' + (step === steps.length - 1 ? 'Enregistrer' : 'Continuer') + '</button></div>';
    }
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-k]');
      if (b) {
        const k = b.dataset.k, raw = b.dataset.v, v = /^\d+$/.test(raw) ? +raw : raw;
        if (b.dataset.flag) d[k] = !d[k];
        else if (b.dataset.one) { d[k] = v; if (k === 'diet') d.prots = PROTS.map(x => x[0]); }
        else { const arr = d[k], i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); }
        draw(); return;
      }
      const n = ev.target.closest('[data-n]'); if (!n) return;
      if (n.dataset.n === 'back') { step--; draw(); return; }
      if (step < steps.length - 1) { step++; draw(); return; }
      if (!d.slots.length) d.slots = ['lunch', 'dinner'];
      delete d.cuis;
      const cc = ck(); cc.prefs = d; touch();
      A.track('meal_prefs', { diet: d.diet });
      A.closeTop(); A.renderAll(); toast('Tes goûts sont enregistrés');
    });
    draw();
  }

  /* ================= Menu de la semaine (détail) et courses ================= */
  function openWeek() {
    const el = A.mountSheet(A.head('Menu de la semaine') + '<div id="wkb"></div>', { tall: true });
    A.openLayer({ el });
    const draw = () => {
      const w = ck().week, days = weekDays();
      $('#wkb', el).innerHTML = days.length ? days.map(d => '<div class="wk-day"><h3>' + esc(d === today() ? 'Aujourd’hui' : parseYmd(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })) + '</h3>' +
        Object.keys(w.days[d]).sort((a, b) => Object.keys(SLOT).indexOf(a) - Object.keys(SLOT).indexOf(b)).map(sl => { const x = w.days[d][sl], r = RM[x.id]; return r ? '<div class="wk-slot"><span class="flabel">' + esc(SLOT[sl][1]) + '</span><div class="wk-row">' + card(r, x.m) + '<button class="iconbtn" data-wk="swap" data-d="' + d + '" data-s="' + sl + '" aria-label="Changer">' + ic('i-swap') + '</button></div></div>' : ''; }).join('') + '</div>').join('')
        : '<p class="hint">Ton menu est terminé : crée-en un nouveau.</p>';
    };
    el.addEventListener('click', ev => {
      const sw = ev.target.closest('[data-wk="swap"]');
      if (sw) {
        const w = ck().week, cur = w.days[sw.dataset.d][sw.dataset.s], s = SLOT[sw.dataset.s], p = ck().prefs, G = A.S.goals || {};
        const used = new Set(Object.values(w.days).flatMap(x => Object.values(x).map(y => y.id)));
        const opts = pool(s[2], p).filter(r => r.id !== cur.id && !used.has(r.id));
        const alt = opts[Math.floor(Math.random() * opts.length)] || pool(s[2], p).find(r => r.id !== cur.id);
        if (!alt) { toast('Pas d’autre recette possible'); return; }
        const target = (G.kcal || 2000) * s[3];
        w.days[sw.dataset.d][sw.dataset.s] = { id: alt.id, m: Math.min(1.75, Math.max(0.75, Math.round(target / alt.kcal * 4) / 4)) };
        touch(); draw(); A.renderAll(); return;
      }
      const rc = ev.target.closest('[data-rc]'); if (rc) openRecipe(rc.dataset.rc, num(rc.dataset.m) || 1);
    });
    draw();
  }
  function openShop() {
    const el = A.mountSheet(A.head('Liste de courses') + '<div id="shb"></div>', { tall: true });
    A.openLayer({ el });
    const draw = () => {
      const c = ck(), w = c.week, groups = shopping(), chk = c.shop || {};
      const n = groups.reduce((a, g) => a + g[1].length, 0), done = groups.reduce((a, g) => a + g[1].filter(x => chk[x.k]).length, 0);
      $('#shb', el).innerHTML = '<p class="hint">' + weekDays().length + ' jours · ' + (w.people || 1) + ' personne' + ((w.people || 1) > 1 ? 's' : '') + ' · ' + done + ' / ' + n + ' dans le panier</p>' +
        groups.map(([a, items]) => '<h3 class="sh-a">' + esc(a) + '</h3>' + items.map(x => '<label class="sh-i' + (chk[x.k] ? ' on' : '') + '"><input type="checkbox" data-sh="' + x.k + '"' + (chk[x.k] ? ' checked' : '') + '><span>' + esc(ingName(x.k)) + '</span><b>' + esc(qty(x.k, x.g, true)) + '</b></label>').join('')).join('') +
        '<div class="row-btns" style="margin-top:12px"><button class="btn outline" data-shc="share">Copier la liste</button><button class="btn outline" data-shc="clear">Tout décocher</button></div>';
    };
    el.addEventListener('change', ev => { const i = ev.target.closest('[data-sh]'); if (!i) return; const c = ck(); c.shop = c.shop || {}; if (i.checked) c.shop[i.dataset.sh] = 1; else delete c.shop[i.dataset.sh]; touch(); draw(); });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-shc]'); if (!b) return;
      if (b.dataset.shc === 'clear') { ck().shop = {}; touch(); draw(); return; }
      const txt = shopping().map(([a, items]) => a + '\n' + items.filter(x => !(ck().shop || {})[x.k]).map(x => '- ' + ingName(x.k) + ' : ' + qty(x.k, x.g, true)).join('\n')).join('\n\n');
      const done = () => toast('Liste copiée : colle-la dans tes notes ou un message');
      if (navigator.share) navigator.share({ title: 'Liste de courses', text: txt }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => toast('Copie impossible'));
    });
    draw();
  }

  /* ================= Clics de l'écran ================= */
  document.addEventListener('click', ev => {
    const scr = ev.target.closest('#screen-meals'); if (!scr) return;
    const b = ev.target.closest('[data-ml]');
    if (b) {
      const a = b.dataset.ml;
      if (a === 'quiz') openQuiz();
      else if (a === 'week') openWeek();
      else if (a === 'shop') openShop();
      else if (a === 'regen') { if (ck().week && !arm(b, 'Remplacer le menu ?')) return; makeWeek(); A.renderAll(); toast('Menu de la semaine prêt'); }
      return;
    }
    const f = ev.target.closest('[data-mf]'); if (f) { filt = f.dataset.mf; A.renderAll(); return; }
    const rc = ev.target.closest('[data-rc]'); if (rc) openRecipe(rc.dataset.rc, num(rc.dataset.m) || 1);
  });
  document.addEventListener('input', ev => {
    if (ev.target.id !== 'mlQ') return;
    q = ev.target.value.trim();
    clearTimeout(document.__mlT); document.__mlT = setTimeout(() => { const pos = ev.target.selectionStart; A.renderAll(); const i = $('#mlQ'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* rien */ } } }, 250);
  });
  window.NS_MEALS = { allowed, suggestions, makeWeek, shopping, qty, asProduct };
  A.register('meals', { render });
})();
