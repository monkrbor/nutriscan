/* NutriScan — motivation : badges, niveaux, défi de la semaine et bilan de la semaine.
   Tout est calculé à partir des données déjà notées ; seuls les badges obtenus et les défis réussis sont gardés (et synchronisés). */
(function () {
  'use strict';
  const A = window.NS_APP;
  if (!A) return;
  const { esc, fk, f1, r0, ic, $, today, addDays, parseYmd, ymd, num, clamp } = A;
  const mondayOf = d => { const x = parseYmd(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ymd(x); };
  const fkg = v => String(Math.round((v || 0) * 10) / 10).replace('.', ',');
  const M = () => A.S.motiv;

  /* ---------- Statistiques ---------- */
  function stats() {
    const s = A.S, g = s.goals, by = {};
    s.entries.forEach(e => {
      const d = by[e.date] || (by[e.date] = { kcal: 0, p: 0, n: 0, meals: {} });
      d.kcal += num(e.kcal); d.p += num(e.p); d.n++; d.meals[e.meal] = 1;
    });
    const days = Object.keys(by).sort();
    let best = 0, run = 0, prev = null;
    days.forEach(d => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; });
    const t = today();
    let cur = 0, d0 = by[t] ? t : addDays(t, -1);
    while (by[d0] && cur < 3650) { cur++; d0 = addDays(d0, -1); }
    const kcalOk = d => !!by[d] && by[d].n >= 2 && Math.abs(by[d].kcal - (g.kcal + A.burnedOf(d))) <= g.kcal * 0.1;
    const protOk = d => !!by[d] && g.p > 0 && by[d].p >= g.p * 0.95;
    const waterOk = d => g.water > 0 && num(s.water[d]) >= g.water;
    const P = s.profile || {}, W = s.weights;
    const start = W.length ? W[0].kg : num(P.weight), last = A.latestWeight();
    const toward = P.goal === 'gain' ? last - start : P.goal === 'lose' ? start - last : 0;
    const gw = num(P.goalWeight);
    const reached = !!(gw && W.length > 1 && (P.goal === 'lose' ? last <= gw : P.goal === 'gain' ? last >= gw : false));
    return {
      by, days, best, cur, kcalOk, protOk, waterOk,
      entries: s.entries.length,
      scans: new Set(s.entries.map(e => e.key).filter(k => /^\d{8,14}$/.test(String(k)))).size,
      recipes: new Set(s.entries.map(e => String(e.key || '')).filter(k => k.indexOf('rcp-') === 0)).size,
      waterDays: Object.keys(s.water).filter(waterOk).length,
      protDays: days.filter(protOk).length,
      kcalDays: days.filter(kcalOk).length,
      sessions: s.exercises.length,
      weighs: W.length,
      toward: Math.max(0, toward), goal: P.goal || 'maintain', reached,
      chals: Object.keys(M().done).length
    };
  }

  /* ---------- Badges ---------- */
  // [id, nom, ce qu'il faut faire, icône, niveau (1 bronze, 2 argent, 3 or), valeur, objectif]
  const BADGES = [
    ['first', 'Premier pas', 'Note ton premier aliment', 'i-check', 1, x => x.entries, 1],
    ['streak3', 'Bien lancé', '3 jours suivis d’affilée', 'i-flame', 1, x => x.best, 3],
    ['streak7', 'Une semaine', '7 jours suivis d’affilée', 'i-flame', 2, x => x.best, 7],
    ['streak30', 'Un mois entier', '30 jours suivis d’affilée', 'i-flame', 3, x => x.best, 30],
    ['streak100', 'Inarrêtable', '100 jours suivis d’affilée', 'i-flame', 3, x => x.best, 100],
    ['days30', 'Habitué', '30 jours suivis au total', 'i-calendar', 2, x => x.days.length, 30],
    ['days100', 'Fidèle', '100 jours suivis au total', 'i-calendar', 3, x => x.days.length, 100],
    ['foods100', 'Carnet rempli', '100 aliments notés', 'i-book', 2, x => x.entries, 100],
    ['foods1000', 'Encyclopédie', '1 000 aliments notés', 'i-book', 3, x => x.entries, 1000],
    ['scan1', 'Code-barres', 'Ajoute un produit avec son code-barres', 'i-scan', 1, x => x.scans, 1],
    ['scan25', 'Détective', '25 produits différents avec code-barres', 'i-scan', 2, x => x.scans, 25],
    ['recipe1', 'Fait maison', 'Ajoute une recette à ton journal', 'i-chef', 1, x => x.recipes, 1],
    ['recipe10', 'Chef', '10 recettes différentes ajoutées', 'i-chef', 2, x => x.recipes, 10],
    ['water1', 'Bien hydraté', 'Atteins ton objectif d’eau', 'i-drop', 1, x => x.waterDays, 1],
    ['water14', 'Source vive', 'Objectif d’eau atteint 14 jours', 'i-drop', 2, x => x.waterDays, 14],
    ['prot1', 'Protéiné', 'Atteins ton objectif de protéines', 'i-bolt', 1, x => x.protDays, 1],
    ['prot14', 'Bâtisseur', 'Objectif de protéines atteint 14 jours', 'i-bolt', 2, x => x.protDays, 14],
    ['kcal7', 'Équilibré', '7 jours dans ton objectif de calories', 'i-target', 2, x => x.kcalDays, 7],
    ['kcal30', 'Maître du budget', '30 jours dans ton objectif de calories', 'i-target', 3, x => x.kcalDays, 30],
    ['sport1', 'Premier effort', 'Note ta première séance ou activité', 'i-run', 1, x => x.sessions, 1],
    ['sport10', 'Sportif', '10 séances ou activités', 'i-dumbbell', 2, x => x.sessions, 10],
    ['sport50', 'Athlète', '50 séances ou activités', 'i-dumbbell', 3, x => x.sessions, 50],
    ['weigh1', 'Sur la balance', 'Note ton poids', 'i-scale', 1, x => x.weighs, 1],
    ['weigh10', 'Suivi régulier', '10 pesées notées', 'i-scale', 2, x => x.weighs, 10],
    ['kg1', 'Premier kilo', '1 kg vers ton objectif de poids', 'i-heart', 1, x => x.toward, 1, 'w'],
    ['kg5', 'Cinq kilos', '5 kg vers ton objectif de poids', 'i-heart', 2, x => x.toward, 5, 'w'],
    ['kg10', 'Dix kilos', '10 kg vers ton objectif de poids', 'i-heart', 3, x => x.toward, 10, 'w'],
    ['goalw', 'Objectif atteint', 'Atteins ton poids visé', 'i-star', 3, x => x.reached ? 1 : 0, 1, 'w'],
    ['chal1', 'Défi relevé', 'Réussis un défi de la semaine', 'i-star', 1, x => x.chals, 1],
    ['chal5', 'Compétiteur', '5 défis de la semaine réussis', 'i-star', 2, x => x.chals, 5],
    ['chal20', 'Légende', '20 défis de la semaine réussis', 'i-star', 3, x => x.chals, 20]
  ].map(b => ({ id: b[0], name: b[1], desc: b[2], icon: b[3], tier: b[4], val: b[5], target: b[6], weight: b[7] === 'w' }));
  const TIER_XP = [0, 20, 50, 120];
  const visible = x => BADGES.filter(b => !b.weight || x.goal !== 'maintain' || M().badges[b.id]);

  /* ---------- Niveaux ---------- */
  const TITLES = ['Débutant', 'Curieux', 'Motivé', 'Régulier', 'Appliqué', 'Confirmé', 'Solide', 'Expert', 'Champion', 'Légende'];
  function xpOf(x) {
    let xp = x.days.length * 10 + x.sessions * 15 + (x.waterDays + x.protDays + x.kcalDays) * 5 + x.chals * 50;
    Object.keys(M().badges).forEach(id => { const b = BADGES.find(z => z.id === id); if (b) xp += TIER_XP[b.tier]; });
    return xp;
  }
  const need = n => 50 * (n - 1) * n; // XP pour atteindre le niveau n
  function level(xp) {
    let n = 1; while (need(n + 1) <= xp && n < 99) n++;
    return { n, title: TITLES[Math.min(n, TITLES.length) - 1], from: need(n), to: need(n + 1), xp };
  }

  /* ---------- Défi de la semaine ---------- */
  const CHAL = [
    { id: 'log5', name: '5 jours notés', desc: 'Note tes repas 5 jours cette semaine', icon: 'i-book', target: 5, f: (x, w) => w.filter(d => x.by[d]).length },
    { id: 'water4', name: 'Hydratation', desc: 'Atteins ton objectif d’eau 4 jours', icon: 'i-drop', target: 4, f: (x, w) => w.filter(x.waterOk).length },
    { id: 'prot4', name: 'Protéines', desc: 'Atteins ton objectif de protéines 4 jours', icon: 'i-bolt', target: 4, f: (x, w) => w.filter(x.protOk).length },
    { id: 'sport3', name: 'En mouvement', desc: 'Fais 3 séances ou activités', icon: 'i-run', target: 3, f: (x, w) => A.S.exercises.filter(e => w.includes(e.date)).length },
    { id: 'kcal4', name: 'Bon équilibre', desc: 'Reste dans ton objectif de calories 4 jours', icon: 'i-target', target: 4, f: (x, w) => w.filter(x.kcalOk).length },
    { id: 'bk5', name: 'Petit-déjeuner', desc: 'Note ton petit-déjeuner 5 jours', icon: 'i-sunrise', target: 5, f: (x, w) => w.filter(d => x.by[d] && x.by[d].meals.breakfast).length },
    { id: 'weigh2', name: 'Pesée', desc: 'Pèse-toi 2 fois cette semaine', icon: 'i-scale', target: 2, f: (x, w) => A.S.weights.filter(p => w.includes(p.date)).length },
    { id: 'log7', name: 'Semaine complète', desc: 'Note tes repas les 7 jours', icon: 'i-calendar', target: 7, f: (x, w) => w.filter(d => x.by[d]).length }
  ];
  const weekDays = mon => Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  function challengeOf(mon) {
    const done = M().done[mon];
    if (done) { const c = CHAL.find(z => z.id === done); if (c) return c; }
    const i = Math.round((parseYmd(mon) - parseYmd('2024-01-01')) / (7 * 864e5));
    return CHAL[((i % CHAL.length) + CHAL.length) % CHAL.length];
  }
  function challengeState(x, mon) {
    const c = challengeOf(mon), v = Math.min(c.target, c.f(x, weekDays(mon)));
    return { c, v, ok: v >= c.target || !!M().done[mon], left: Math.max(0, 6 - Math.round((parseYmd(today()) - parseYmd(mon)) / 864e5)) };
  }

  /* ---------- Vérification après chaque enregistrement ---------- */
  let checkT = null, queue = [], showing = false;
  function soon() { clearTimeout(checkT); checkT = setTimeout(check, 500); }
  function check() {
    const m = M(); if (!m) return;
    const x = stats(), fresh = [];
    let changed = false;
    const mon = mondayOf(today()), ch = challengeState(x, mon);
    if (ch.v >= ch.c.target && !m.done[mon]) { m.done[mon] = ch.c.id; changed = true; if (m.init) fresh.push({ kind: 'chal', c: ch.c }); }
    x.chals = Object.keys(m.done).length;
    BADGES.forEach(b => {
      if (m.badges[b.id] || b.val(x) < b.target) return;
      m.badges[b.id] = Date.now(); changed = true;
      if (m.init) fresh.push({ kind: 'badge', b });
    });
    const L = level(xpOf(x));
    if (L.n > (m.lvl || 0)) { if (m.init && m.lvl) fresh.push({ kind: 'level', L }); m.lvl = L.n; changed = true; }
    if (!m.init) { m.init = 1; changed = true; }
    if (changed) { m.t = Date.now(); A.save(); if (!document.querySelector('.screen:not([hidden]) input:focus')) A.renderAll(); }
    if (fresh.length > 3) {
      const nb = fresh.filter(f => f.kind === 'badge').length;
      queue.push({ kind: 'many', n: nb, lvl: fresh.find(f => f.kind === 'level') });
    } else queue.push(...fresh);
    if (fresh.length) { A.track('motiv', { n: fresh.length }); pump(); }
  }

  /* ---------- Célébration ---------- */
  const medal = (b, on, pct) => '<span class="medal t' + b.tier + (on ? ' on' : '') + '"' + (on ? '' : ' style="--p:' + r0(pct * 100) + '"') + '>' + ic(b.icon) + '</span>';
  function pump() {
    if (showing || !queue.length) return;
    const ob = $('#onboard');
    if ((ob && !ob.hidden) || document.hidden || document.querySelector('.sheet.show') || !document.getElementById('scanner').hidden) { setTimeout(pump, 1500); return; }
    const f = queue.shift();
    let icon, title, sub;
    if (f.kind === 'badge') { icon = medal(f.b, true); title = 'Badge débloqué'; sub = f.b.name + ' · ' + f.b.desc; }
    else if (f.kind === 'chal') { icon = '<span class="medal t2 on">' + ic(f.c.icon) + '</span>'; title = 'Défi de la semaine réussi'; sub = f.c.name + ' · +50 XP'; }
    else if (f.kind === 'level') { icon = '<span class="lvl-badge">' + f.L.n + '</span>'; title = 'Niveau ' + f.L.n + ' atteint'; sub = f.L.title; }
    else { icon = '<span class="medal t3 on">' + ic('i-star') + '</span>'; title = f.n + ' nouveaux badges'; sub = 'Va voir ta collection dans Progrès'; }
    showing = true;
    const el = document.createElement('div');
    el.className = 'celebrate';
    el.innerHTML = '<i class="cf" aria-hidden="true">' + '<b></b>'.repeat(14) + '</i>' + icon + '<span class="min0"><b>' + esc(title) + '</b><small>' + esc(sub) + '</small></span>';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    if (navigator.vibrate) { try { navigator.vibrate([18, 40, 18]); } catch (e) { /* rien */ } }
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    let gone = false;
    const done = () => { if (gone) return; gone = true; el.classList.remove('show'); setTimeout(() => { el.remove(); showing = false; pump(); }, 350); };
    setTimeout(done, 3500);
  }

  /* ---------- Carte « Motivation » dans Progrès ---------- */
  function progressHTML() {
    if (!M()) return '';
    const x = stats(); x.chals = Object.keys(M().done).length;
    const L = level(xpOf(x)), pct = clamp((L.xp - L.from) / (L.to - L.from), 0, 1);
    const mon = mondayOf(today()), ch = challengeState(x, mon);
    const vis = visible(x), got = vis.filter(b => M().badges[b.id]);
    const recent = got.slice().sort((a, b) => M().badges[b.id] - M().badges[a.id]);
    const next = vis.filter(b => !M().badges[b.id]).map(b => ({ b, p: clamp(b.val(x) / b.target, 0, 1) })).sort((a, b) => b.p - a.p);
    const row = recent.slice(0, 4).map(b => ({ b, on: true })).concat(next.slice(0, Math.max(2, 6 - Math.min(4, recent.length))).map(n => ({ b: n.b, on: false, p: n.p }))).slice(0, 6);
    return '<section class="card mo">' +
      '<div class="card-title"><h2>Motivation</h2><button class="linkbtn" data-act="moReport">Bilan de la semaine</button></div>' +
      '<div class="mo-lvl"><span class="lvl-badge">' + L.n + '</span><div class="min0 grow"><b>Niveau ' + L.n + ' · ' + esc(L.title) + '</b>' +
      '<div class="mo-bar"><i style="width:' + r0(pct * 100) + '%"></i></div><small>' + fk(L.xp) + ' XP · encore ' + fk(L.to - L.xp) + ' XP pour le niveau ' + (L.n + 1) + '</small></div></div>' +
      '<div class="mo-chal' + (ch.ok ? ' ok' : '') + '"><span class="micon sm" style="--mc:' + (ch.ok ? 'var(--brand)' : 'var(--burn)') + '">' + ic(ch.ok ? 'i-check' : ch.c.icon) + '</span>' +
      '<div class="min0 grow"><small>Défi de la semaine</small><b>' + esc(ch.c.name) + '</b><span>' + esc(ch.c.desc) + '</span>' +
      '<div class="mo-bar"><i style="width:' + r0(ch.v / ch.c.target * 100) + '%"></i></div>' +
      '<small>' + (ch.ok ? 'Réussi · +50 XP' : ch.v + ' / ' + ch.c.target + ' · ' + (ch.left === 0 ? 'dernier jour' : ch.left + ' jour' + (ch.left > 1 ? 's' : '') + ' restant' + (ch.left > 1 ? 's' : ''))) + '</small></div></div>' +
      '<button class="mo-row" data-act="moBadges" aria-label="Voir tous les badges">' + row.map(r => medal(r.b, r.on, r.p)).join('') + '</button>' +
      '<button class="btn outline block" data-act="moBadges">Tous les badges · ' + got.length + ' / ' + vis.length + '</button></section>';
  }

  /* ---------- Tous les badges ---------- */
  function openBadges() {
    const x = stats(); x.chals = Object.keys(M().done).length;
    const vis = visible(x), got = vis.filter(b => M().badges[b.id]).length;
    const fmtVal = (b, v) => b.weight ? fkg(Math.min(v, b.target)) + ' / ' + b.target + ' kg' : fk(Math.min(v, b.target)) + ' / ' + fk(b.target);
    const el = A.mountSheet(A.head('Mes badges') +
      '<p class="hint" style="margin:-4px 0 14px">' + got + ' badge' + (got > 1 ? 's' : '') + ' sur ' + vis.length + '. Ils se débloquent tout seuls quand tu notes tes repas, ton eau, ton poids et ton sport.</p>' +
      '<div class="bdg-grid">' + vis.map(b => {
        const t = M().badges[b.id], v = b.val(x), p = clamp(v / b.target, 0, 1);
        return '<div class="bdg' + (t ? ' on' : '') + '">' + medal(b, !!t, p) + '<b>' + esc(b.name) + '</b><small>' + esc(b.desc) + '</small>' +
          '<em>' + (t ? 'Obtenu le ' + new Date(t).toLocaleDateString(A.locale ? A.locale() : 'fr-FR', { day: 'numeric', month: 'short' }) : fmtVal(b, v)) + '</em></div>';
      }).join('') + '</div>', { tall: true });
    A.openLayer({ el });
    A.track('motiv_badges', { got });
  }

  /* ---------- Bilan de la semaine ---------- */
  function weekReport(mon) {
    const x = stats(), s = A.S, g = s.goals, w = weekDays(mon), t = today();
    const logged = w.filter(d => x.by[d]);
    const avg = k => logged.length ? logged.reduce((a, d) => a + x.by[d][k], 0) / logged.length : 0;
    const ws = s.weights.filter(p => p.date >= addDays(mon, -7) && p.date <= w[6]);
    const inW = ws.filter(p => p.date >= mon);
    const before = s.weights.filter(p => p.date < mon).slice(-1)[0];
    const wStart = before ? before.kg : inW.length ? inW[0].kg : 0, wEnd = inW.length ? inW[inW.length - 1].kg : 0;
    const ex = s.exercises.filter(e => w.includes(e.date));
    return {
      mon, w, x, past: w[6] < t, logged: logged.length, avgK: avg('kcal'), avgP: avg('p'),
      kcalDays: w.filter(x.kcalOk).length, protDays: w.filter(x.protOk).length, waterDays: w.filter(x.waterOk).length,
      sessions: ex.length, minutes: ex.reduce((a, e) => a + num(e.minutes), 0), burned: ex.reduce((a, e) => a + num(e.kcal), 0),
      wDiff: wStart && wEnd && (before || inW.length > 1) ? wEnd - wStart : null, wEnd, g, ch: challengeState(x, mon)
    };
  }
  function reportMessage(R, P) {
    const goal = (A.S.profile || {}).goal;
    let m = R.logged >= 7 ? 'Semaine complète : tu as tout noté les 7 jours, bravo !'
      : R.logged >= 5 ? 'Très belle régularité cette semaine.'
      : R.logged >= 2 ? 'Bon début. Essaie de noter un ou deux jours de plus la semaine prochaine.'
      : R.past ? 'Semaine calme. Chaque repas noté compte : on repart lundi !' : 'La semaine commence : note tes repas pour remplir ton bilan.';
    if (P && P.logged && R.logged > P.logged) m += ' Tu as suivi ' + (R.logged - P.logged) + ' jour' + (R.logged - P.logged > 1 ? 's' : '') + ' de plus que la semaine d’avant.';
    let tip = '';
    if (R.logged >= 2) {
      if (R.waterDays < 3 && R.g.water > 0) tip = 'Astuce : garde une bouteille d’eau à portée de main, et bois un verre à chaque repas.';
      else if (R.avgP < R.g.p * 0.8) tip = 'Astuce : ajoute une source de protéines à chaque repas (œufs, skyr, poulet, poisson, lentilles).';
      else if (goal === 'lose' && R.avgK > R.g.kcal * 1.1) tip = 'Tu étais un peu au-dessus de ton objectif en moyenne : regarde du côté des collations et des boissons sucrées.';
      else if (goal === 'gain' && R.avgK < R.g.kcal * 0.9) tip = 'Tu étais un peu en dessous de ton objectif : une collation en plus (fruits secs, skyr, tartine) peut aider.';
      else if (R.sessions === 0) tip = 'Astuce : même 20 minutes de marche rapide comptent. Note-les dans Activité.';
    }
    return { m, tip };
  }
  let RW = null;
  function openReport(mon) {
    const t = today();
    if (!mon) { const cur = mondayOf(t), last = addDays(cur, -7); const R = weekReport(last); mon = (parseYmd(t).getDay() + 6) % 7 <= 2 && R.logged ? last : cur; }
    RW = mon;
    const m = M(); if (m && m.seen !== addDays(mondayOf(t), -7) && mon === addDays(mondayOf(t), -7)) { m.seen = mon; m.t = Date.now(); A.save(); }
    const el = A.mountSheet(A.head('Bilan de la semaine') + '<div id="moRep"></div>', { tall: true });
    A.openLayer({ el, onClose: () => { RW = null; } });
    renderReport(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-rw]'); if (!b || b.disabled) return;
      RW = addDays(RW, +b.dataset.rw * 7); renderReport(el);
    });
    A.track('motiv_report', { mon });
  }
  function renderReport(el) {
    const R = weekReport(RW), P = weekReport(addDays(RW, -7)), L = A.locale ? A.locale() : 'fr-FR';
    const end = parseYmd(R.w[6]), st = parseYmd(R.mon);
    const range = 'Du ' + st.toLocaleDateString(L, { day: 'numeric', month: 'short' }) + ' au ' + end.toLocaleDateString(L, { day: 'numeric', month: 'short' });
    const cmp = (a, b, unit, good) => {
      if (!P.logged || !b) return '';
      const d = a - b; if (Math.abs(d) < (unit === 'kcal' ? 30 : 1)) return '<em class="eq">= semaine d’avant</em>';
      const up = d > 0, cls = good == null ? '' : (up === good ? ' good' : ' bad');
      return '<em class="' + cls.trim() + '">' + (up ? '▲ ' : '▼ ') + fk(Math.abs(d)) + ' ' + unit + '</em>';
    };
    const goal = (A.S.profile || {}).goal;
    const T = (v, lab, sub) => '<div class="rp-k"><b class="num">' + v + '</b><span>' + lab + '</span>' + (sub || '') + '</div>';
    const max = Math.max(R.g.kcal * 1.25, ...R.w.map(d => R.x.by[d] ? R.x.by[d].kcal : 0), 1);
    const letters = R.w.map(d => A.cap ? A.cap(parseYmd(d).toLocaleDateString(L, { weekday: 'short' }).replace('.', '')).slice(0, 3) : '');
    const bars = '<div class="rp-bars" role="img" aria-label="Calories de la semaine">' + R.w.map((d, i) => {
      const v = R.x.by[d] ? R.x.by[d].kcal : 0, h = r0(v / max * 100), ok = R.x.kcalOk(d);
      return '<div class="rp-bar"><div class="rp-col"><i style="height:' + (v ? Math.max(4, h) : 100) + '%"' + (v ? '' : ' class="no"') + (ok ? ' data-ok="1"' : '') + '></i></div><span>' + esc(letters[i]) + '</span></div>';
    }).join('') + '<b class="rp-goal" style="bottom:' + (29 + r0(R.g.kcal / max * 110)) + 'px"></b></div>';
    const msg = reportMessage(R, P);
    const nextOk = addDays(RW, 7) <= mondayOf(today());
    $('#moRep', el).innerHTML =
      '<div class="rp-nav"><button class="iconbtn" data-rw="-1" aria-label="Semaine précédente">' + ic('i-left') + '</button><b>' + esc(range) + '</b>' +
      '<button class="iconbtn" data-rw="1" aria-label="Semaine suivante"' + (nextOk ? '' : ' disabled') + '>' + ic('i-right') + '</button></div>' +
      '<div class="rp-msg"><b>' + esc(msg.m) + '</b>' + (msg.tip ? '<span>' + esc(msg.tip) + '</span>' : '') + '</div>' +
      '<div class="rp-grid">' +
      T(R.logged + ' / 7', 'jours suivis', cmp(R.logged, P.logged, 'j', true)) +
      T(R.logged ? fk(R.avgK) : '—', 'kcal / jour en moyenne', R.logged ? cmp(R.avgK, P.avgK, 'kcal', goal === 'lose' ? false : goal === 'gain' ? true : null) : '') +
      T(R.kcalDays + ' j', 'dans l’objectif de calories') +
      T(R.logged ? fk(R.avgP) + ' g' : '—', 'protéines / jour (obj. ' + fk(R.g.p) + ' g)') +
      T(R.waterDays + ' j', 'objectif d’eau atteint') +
      T(String(R.sessions), 'séance' + (R.sessions > 1 ? 's' : '') + (R.minutes ? ' · ' + fk(R.minutes) + ' min' : '')) +
      (R.wDiff != null ? T((R.wDiff > 0 ? '+' : R.wDiff < 0 ? '−' : '') + fkg(Math.abs(R.wDiff)) + ' kg', 'poids sur la semaine (' + fkg(R.wEnd) + ' kg)') : T('—', 'pas de pesée cette semaine')) +
      T(R.ch.ok ? 'Réussi' : R.ch.v + ' / ' + R.ch.c.target, 'défi : ' + R.ch.c.name.toLowerCase()) +
      '</div>' + bars +
      '<p class="hint" style="margin-top:12px">Barres vertes : jours dans ton objectif de calories (± 10 %). La ligne pointillée montre ton objectif.</p>';
  }

  /* ---------- Carte du journal (lundi → mercredi) ---------- */
  function journalCardHTML() {
    const m = M(); if (!m || !A.S.profile) return '';
    const t = today(), dow = (parseYmd(t).getDay() + 6) % 7, last = addDays(mondayOf(t), -7);
    if (dow > 2 || m.seen === last) return '';
    const R = weekReport(last); if (!R.logged) return '';
    return '<section class="card mo-j"><span class="micon" style="--mc:var(--brand)">' + ic('i-chart') + '</span><div class="min0 grow"><b>Ton bilan de la semaine est prêt</b><small>' + R.logged + ' jour' + (R.logged > 1 ? 's' : '') + ' suivi' + (R.logged > 1 ? 's' : '') + (R.ch.ok ? ' · défi réussi' : '') + '</small></div>' +
      '<button class="btn primary" data-act="moReport" data-mon="' + last + '">Voir</button><button class="iconbtn ghost" data-act="moSeen" aria-label="Masquer">' + ic('i-x') + '</button></section>';
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act^="mo"]'); if (!b || b.disabled) return;
    const a = b.dataset.act;
    if (a === 'moBadges') openBadges();
    else if (a === 'moReport') openReport(b.dataset.mon);
    else if (a === 'moSeen') { const m = M(); m.seen = addDays(mondayOf(today()), -7); m.t = Date.now(); A.save(); A.renderAll(); }
    else if (a === 'motiv') openBadges();
  });

  window.NS_MOTIV = { soon, check, progressHTML, journalCardHTML, openBadges, openReport, stats, level: () => { const x = stats(); x.chals = Object.keys(M().done).length; return level(xpOf(x)); }, BADGES, CHAL };
  A.renderAll();
  setTimeout(check, 1200);
})();
