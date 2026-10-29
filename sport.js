/* Section Sport : questionnaire, programme sur mesure selon l'objectif et le matériel, séance guidée (séries, charges, repos),
   progression automatique et historique. Les séances terminées comptent dans les calories brûlées du journal. */
(function () {
  'use strict';
  const A = window.NS_APP, EX = window.NS_EX || [], FIG = window.NS_FIG;
  if (!A) return;
  const { esc, ic, fk, num, uid, today, addDays, parseYmd, toast, arm, $, $$ } = A;
  const EXM = Object.fromEntries(EX.map(e => [e.id, e]));
  const GOALS = [
    ['fat', 'Perdre du gras', 'Séances dynamiques, temps de repos courts et cardio', 'i-flame', 'var(--burn)'],
    ['muscle', 'Prendre du muscle', '8 à 12 répétitions, charges qui progressent', 'i-dumbbell', 'var(--prot)'],
    ['strength', 'Gagner en force', 'Mouvements de base lourds, peu de répétitions', 'i-bolt', 'var(--carb)'],
    ['fit', 'Être en forme', 'Tout le corps, endurance et cardio', 'i-heart', 'var(--brand)']];
  const PLACES = [['gym', 'En salle de sport', 'Machines, poulies, barres, haltères'], ['home', 'À la maison avec du matériel', 'Haltères, élastiques, barre de traction…'], ['body', 'Au poids du corps', 'Sans matériel (une chaise suffit)']];
  const EQUIP = [['db', 'Haltères'], ['bb', 'Barre et disques'], ['bench', 'Banc de musculation'], ['bar', 'Barre de traction'], ['kb', 'Kettlebell'], ['band', 'Élastiques']];
  const LEVELS = [[1, 'Débutant', 'Je commence ou je reprends'], [2, 'Intermédiaire', 'Je m’entraîne depuis plus de 6 mois'], [3, 'Avancé', 'Plus de 2 ans d’entraînement régulier']];
  const PAINS = [['k', 'Genoux'], ['b', 'Bas du dos'], ['s', 'Épaules'], ['w', 'Poignets']];
  const FOCUS = [['none', 'Équilibré'], ['upper', 'Haut du corps'], ['lower', 'Jambes'], ['glutes', 'Fessiers'], ['arms', 'Bras'], ['abs', 'Abdos']];
  const WD = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const GROUPS = [['chest', 'Pectoraux', ['push_h', 'chest_iso']], ['back', 'Dos', ['pull_v', 'pull_h']], ['shoulders', 'Épaules', ['push_v', 'shoulder_iso', 'rear_delt', 'traps']],
    ['arms', 'Bras', ['bi', 'tri']], ['legs', 'Jambes', ['squat', 'lunge', 'quad_iso', 'ham_iso', 'calf']], ['glutes', 'Fessiers et lombaires', ['glute', 'hinge']],
    ['abs', 'Abdos', ['core']], ['cardio', 'Cardio', ['cond', 'cardio']]];
  const S = () => A.S;
  function st() { const s = S(); if (!s.sport || typeof s.sport !== 'object') s.sport = {}; if (!Array.isArray(s.workouts)) s.workouts = []; return s.sport; }
  const save = () => A.save();

  /* ================= Générateur de programme ================= */
  const SPLITS = {
    FA: ['Corps entier A', 'Tout le corps', ['squat', 'push_h', 'pull_v', 'hinge', 'shoulder_iso', 'core', 'bi']],
    FB: ['Corps entier B', 'Tout le corps', ['hinge', 'push_v', 'pull_h', 'lunge', 'tri', 'core', 'calf']],
    FC: ['Corps entier C', 'Tout le corps', ['lunge', 'push_h', 'pull_h', 'glute', 'rear_delt', 'core', 'chest_iso']],
    UA: ['Haut du corps A', 'Pectoraux, dos, épaules, bras', ['push_h', 'pull_h', 'push_v', 'pull_v', 'shoulder_iso', 'bi', 'tri', 'core']],
    UB: ['Haut du corps B', 'Dos, épaules, pectoraux, bras', ['pull_v', 'push_v', 'pull_h', 'push_h', 'rear_delt', 'tri', 'bi', 'core']],
    LA: ['Jambes A', 'Cuisses, fessiers, mollets', ['squat', 'hinge', 'lunge', 'ham_iso', 'calf', 'core', 'glute']],
    LB: ['Jambes B', 'Fessiers, cuisses, abdos', ['hinge', 'squat', 'glute', 'quad_iso', 'lunge', 'calf', 'core']],
    PU: ['Poussée', 'Pectoraux, épaules, triceps', ['push_h', 'push_v', 'push_h', 'chest_iso', 'shoulder_iso', 'tri', 'tri', 'core']],
    PL: ['Tirage', 'Dos, arrière d’épaules, biceps', ['pull_v', 'pull_h', 'pull_h', 'rear_delt', 'bi', 'bi', 'core']],
    LG: ['Jambes', 'Cuisses, fessiers, mollets', ['squat', 'hinge', 'lunge', 'glute', 'ham_iso', 'calf', 'core']]
  };
  const FALLBACK = { push_v: ['push_h'], pull_v: ['pull_h'], pull_h: ['pull_v'], hinge: ['glute'], ham_iso: ['glute', 'hinge'], quad_iso: ['lunge', 'squat'], chest_iso: ['push_h'],
    shoulder_iso: ['push_v'], rear_delt: ['pull_h'], bi: ['pull_h'], tri: ['push_h'], glute: ['hinge'], lunge: ['squat', 'glute'], squat: ['lunge', 'glute'], cond: ['cardio'], calf: [], core: [], cardio: ['cond'] };
  const COMPOUND = new Set(['squat', 'hinge', 'lunge', 'push_h', 'push_v', 'pull_h', 'pull_v']);
  function eqOf(p) {
    if (p.place === 'gym') return new Set(['body', 'bench', 'db', 'bb', 'bar', 'kb', 'band', 'machine', 'cable']);
    if (p.place === 'home') return new Set(['body', 'bench'].concat(p.equip || []));
    return new Set(['body', 'bench']);
  }
  function candidates(pat, p) {
    const eq = eqOf(p), pain = new Set(p.pain || []);
    return EX.filter(e => e.pat === pat && e.eq.every(x => eq.has(x)) && e.lvl <= (p.level || 1) && !e.j.split('').some(j => pain.has(j)))
      // en salle on privilégie les charges et les machines, à la maison le matériel choisi
      .sort((a, b) => score(b, p) - score(a, p));
  }
  function score(e, p) {
    let s = e.lvl * 2;
    if (p.place === 'gym' && e.eq.some(x => x === 'bb' || x === 'db' || x === 'machine' || x === 'cable')) s += 3;
    if (p.place === 'home' && e.eq.some(x => x !== 'body' && x !== 'bench')) s += 3;
    if ((p.level || 1) === 1 && e.lvl === 1) s += 2;
    return s;
  }
  function pick(pat, p, used, turn) {
    const tryPat = [pat].concat(FALLBACK[pat] || []);
    for (const q of tryPat) {
      const list = candidates(q, p).filter(e => !used.has(e.id));
      if (list.length) return list[turn % list.length];
    }
    return null;
  }
  function scheme(e, p, slotIdx) {
    const g = p.goal, lvl = p.level || 1, comp = COMPOUND.has(e.pat);
    if (e.u === 'm') return { sets: 1, reps: g === 'fat' ? 12 : 15, rest: 0 };
    if (e.u === 's') return { sets: 3, reps: lvl === 1 ? 30 : lvl === 2 ? 40 : 50, rest: 45 };
    if (e.pat === 'cond') return { sets: g === 'fat' ? 4 : 3, reps: '12-15', rest: 30 };
    if (e.pat === 'core') return { sets: 3, reps: '12-15', rest: 45 };
    if (g === 'strength') return comp && slotIdx < 3 ? { sets: lvl === 1 ? 4 : 5, reps: '4-6', rest: 150 } : { sets: 3, reps: '8-10', rest: 90 };
    if (g === 'muscle') return comp ? { sets: lvl === 1 ? 3 : 4, reps: '8-12', rest: 90 } : { sets: 3, reps: '10-15', rest: 60 };
    if (g === 'fat') return { sets: 3, reps: comp ? '10-12' : '12-15', rest: 45 };
    return { sets: lvl === 1 ? 2 : 3, reps: '12-15', rest: 45 };
  }
  function splitKeys(p) {
    const n = (p.days || []).length || 3, lvl = p.level || 1, heavy = p.goal === 'muscle' || p.goal === 'strength';
    if (n <= 2) return ['FA', 'FB'];
    if (n === 3) return lvl >= 2 && heavy ? ['PU', 'PL', 'LG'] : ['FA', 'FB', 'FC'];
    if (n === 4) return ['UA', 'LA', 'UB', 'LB'];
    if (n === 5) return ['PU', 'PL', 'LG', 'UA', 'LB'];
    return ['PU', 'PL', 'LG', 'PU', 'PL', 'LG'];
  }
  function focusSlots(slots, f) {
    const add = { upper: ['push_h', 'pull_h'], lower: ['squat', 'lunge'], glutes: ['glute', 'glute'], arms: ['bi', 'tri'], abs: ['core'] }[f];
    return add ? slots.slice(0, 3).concat(add, slots.slice(3)) : slots;
  }
  function generate(p) {
    const keys = splitKeys(p);
    const nEx = { 20: 4, 30: 5, 45: 6, 60: 7, 75: 8 }[p.dur] || 6;
    const cardioFinish = (p.goal === 'fat' || p.goal === 'fit') && p.dur >= 30;
    const seen = {};
    const sessions = keys.map((k, si) => {
      const def = SPLITS[k], used = new Set();
      let slots = focusSlots(def[2], p.focus);
      const items = [];
      for (let i = 0; i < slots.length && items.length < nEx - (cardioFinish ? 1 : 0); i++) {
        const turn = (seen[slots[i]] = (seen[slots[i]] || 0) + 1) - 1 + si;
        const e = pick(slots[i], p, used, turn);
        if (!e) continue;
        used.add(e.id);
        items.push(Object.assign({ ex: e.id }, scheme(e, p, items.length)));
      }
      if (cardioFinish) {
        const c = pick(p.goal === 'fat' && si % 2 === 0 ? 'cond' : 'cardio', p, used, si);
        if (c) items.push(Object.assign({ ex: c.id, finisher: true }, scheme(c, p, 9)));
      }
      const same = keys.filter(x => x === k).length > 1;
      return { key: String.fromCharCode(65 + si), name: def[0] + (same ? ' ' + (keys.slice(0, si + 1).filter(x => x === k).length) : ''), focus: def[1], items };
    });
    return { created: Date.now(), sessions };
  }
  /* ================= Historique et progression ================= */
  function lastSets(exId) {
    const w = (S().workouts || []).slice().sort((a, b) => (b.date + b.end) > (a.date + a.end) ? 1 : -1);
    for (const x of w) { const it = (x.items || []).find(i => i.ex === exId && i.sets && i.sets.some(s => s.done)); if (it) return { date: x.date, sets: it.sets.filter(s => s.done) }; }
    return null;
  }
  const topReps = reps => { const m = String(reps).match(/(\d+)\s*-\s*(\d+)/); return m ? +m[2] : num(reps); };
  const lowReps = reps => { const m = String(reps).match(/(\d+)\s*-\s*(\d+)/); return m ? +m[1] : num(reps); };
  function stepKg(e) { return e.eq.includes('bb') ? 2.5 : e.eq.includes('kb') ? 4 : e.eq.includes('machine') || e.eq.includes('cable') ? 5 : e.eq.includes('db') ? 2 : 0; }
  const usesKg = e => e.u === 'r' && e.eq.some(x => ['db', 'bb', 'kb', 'machine', 'cable'].includes(x));
  function suggestion(item) {
    const e = EXM[item.ex], last = lastSets(item.ex);
    if (!e || !last || e.u === 'm') return null;
    const top = topReps(item.reps), allTop = last.sets.length >= item.sets && last.sets.every(s => num(s.r) >= top);
    const kg = Math.max(...last.sets.map(s => num(s.kg)));
    const txt = 'Dernière fois : ' + last.sets.length + ' × ' + last.sets.map(s => num(s.r)).join('/') + (e.u === 's' ? ' s' : '') + (kg ? ' à ' + String(kg).replace('.', ',') + ' kg' : '');
    if (!allTop) return { txt, kg, r: null, up: '' };
    if (usesKg(e) && kg) { const nk = Math.round((kg + stepKg(e)) * 10) / 10; return { txt, kg: nk, up: 'Tu as tout réussi : passe à ' + String(nk).replace('.', ',') + ' kg' }; }
    return { txt, kg, up: e.u === 's' ? 'Tu as tout réussi : tiens 5 secondes de plus' : 'Tu as tout réussi : fais 1 à 2 répétitions de plus' };
  }
  function nextSession() {
    const p = st().plan; if (!p || !p.sessions.length) return null;
    const done = (S().workouts || []).filter(w => w.plan === p.created).sort((a, b) => (a.date + a.end) < (b.date + b.end) ? 1 : -1)[0];
    const i = done ? (p.sessions.findIndex(s => s.key === done.key) + 1) % p.sessions.length : 0;
    return Object.assign({ idx: i }, p.sessions[i < 0 ? 0 : i]);
  }
  function estMinutes(sess) { return Math.round(sess.items.reduce((a, it) => { const e = EXM[it.ex]; if (!e) return a; return a + (e.u === 'm' ? it.reps * 60 : it.sets * ((e.u === 's' ? it.reps : 40) + (it.rest || 45))); }, 300) / 60 / 5) * 5; }
  function weekDays() { const t = today(), d = parseYmd(t), dow = (d.getDay() + 6) % 7; return Array.from({ length: 7 }, (_, i) => addDays(t, i - dow)); }
  const thumb = id => '<span class="exthumb">' + (FIG ? FIG.still(FIG.specFor(id)) : '') + '</span>';
  const setLabel = (e, it) => e.u === 'm' ? it.reps + ' min' : it.sets + ' × ' + it.reps + (e.u === 's' ? ' s' : '');

  /* ================= Écran Sport ================= */
  function render(el) {
    const sp = st(), p = sp.prefs, plan = sp.plan;
    if (!p || !plan) {
      el.innerHTML = '<header class="page-head"><h1 class="page-title">Sport</h1></header>' +
        '<section class="card sp-hero"><div class="sp-hero-fig">' + (FIG ? FIG.still(FIG.specFor('dumbbell-shoulder-press')) : '') + '</div>' +
        '<h2>Ton programme sur mesure</h2><p class="hint">Réponds à 5 questions (objectif, lieu, matériel, jours, douleurs) : l’appli crée ton programme, te guide pendant chaque séance et fait progresser les charges toute seule.</p>' +
        '<button class="btn primary" data-sp="quiz">Créer mon programme</button></section>' +
        '<section class="card"><div class="card-title"><h2>Tous les exercices</h2></div><p class="hint" style="margin-bottom:10px">' + EX.length + ' exercices animés avec les consignes.</p>' + groupsHTML() + '</section>';
      return;
    }
    const next = nextSession(), wk = weekDays(), t = today();
    const doneDays = new Set((S().workouts || []).map(w => w.date));
    const planned = new Set(p.days || []);
    const month = (S().workouts || []).filter(w => w.date >= t.slice(0, 7) + '-01');
    const hist = (S().workouts || []).slice().sort((a, b) => (a.date + a.end) < (b.date + b.end) ? 1 : -1).slice(0, 6);
    const doneToday = doneDays.has(t);
    el.innerHTML = '<header class="page-head"><h1 class="page-title">Sport</h1><button class="iconbtn" data-sp="quiz" aria-label="Modifier mon programme">' + ic('i-edit') + '</button></header>' +
      '<section class="card sp-week">' + wk.map((d, i) => '<div class="spd' + (d === t ? ' today' : '') + (doneDays.has(d) ? ' done' : planned.has(i + 1) ? ' plan' : '') + '"><span>' + WD[i] + '</span><b>' + (doneDays.has(d) ? ic('i-check', 'sm') : parseYmd(d).getDate()) + '</b></div>').join('') + '</section>' +
      (next ? '<section class="card sp-next"><div class="sp-next-top"><div class="min0"><p class="eyebrow">' + (doneToday ? 'Séance faite aujourd’hui · prochaine' : planned.has(((parseYmd(t).getDay() + 6) % 7) + 1) ? 'Séance du jour' : 'Prochaine séance') + '</p>' +
        '<h2>' + esc(next.name) + '</h2><p class="hint">' + esc(next.focus) + ' · ' + next.items.length + ' exercices · ~' + estMinutes(next) + ' min</p></div></div>' +
        '<div class="sp-thumbs">' + next.items.slice(0, 4).map(it => thumb(it.ex)).join('') + '</div>' +
        '<button class="btn primary block" data-sp="start" data-k="' + next.key + '">' + ic('i-play', 'sm') + 'Démarrer la séance</button></section>' : '') +
      '<section class="card"><div class="card-title"><h2>Mon programme</h2><span class="hint">' + esc(GOALS.find(g => g[0] === p.goal)[1]) + ' · ' + (p.days || []).length + ' j / sem.</span></div>' +
      plan.sessions.map(s => '<details class="sp-sess"><summary><span class="sp-key">' + s.key + '</span><span class="min0"><b>' + esc(s.name) + '</b><small>' + esc(s.focus) + ' · ' + s.items.length + ' exercices</small></span>' + ic('i-down', 'sm') + '</summary>' +
        s.items.map(it => { const e = EXM[it.ex]; return e ? '<button class="sp-ex" data-sp="ex" data-id="' + e.id + '">' + thumb(e.id) + '<span class="min0"><b>' + esc(e.n) + '</b><small>' + esc(setLabel(e, it)) + (it.rest ? ' · repos ' + it.rest + ' s' : '') + '</small></span></button>' : ''; }).join('') +
        '<button class="btn outline block" data-sp="start" data-k="' + s.key + '">' + ic('i-play', 'sm') + 'Faire cette séance</button></details>').join('') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Mes séances</h2></div>' +
      '<div class="tiles"><div class="tile"><b class="num">' + month.length + '</b><span>ce mois-ci</span></div><div class="tile"><b class="num">' + fk(month.reduce((a, w) => a + (w.vol || 0), 0)) + '</b><span>kg soulevés</span></div><div class="tile"><b class="num">' + fk(month.reduce((a, w) => a + (w.kcal || 0), 0)) + '</b><span>kcal brûlées</span></div></div>' +
      (hist.length ? '<ul class="entries" style="margin-top:8px">' + hist.map(w => '<li><button class="entry" data-sp="log" data-id="' + esc(w.id) + '"><span class="en">' + esc(w.name) + '</span><span class="es">' + esc(dayLabel(w.date)) + ' · ' + Math.round((w.dur || 0) / 60) + ' min · ' + (w.items || []).reduce((a, i) => a + (i.sets || []).filter(s => s.done).length, 0) + ' séries</span><span class="ek num">' + fk(w.kcal) + '<small>kcal</small></span></button></li>').join('') + '</ul>'
        : '<p class="hint" style="margin-top:8px">Ta première séance apparaîtra ici.</p>') + '</section>' +
      '<section class="card"><div class="card-title"><h2>Tous les exercices</h2></div>' + groupsHTML() + '</section>';
  }
  function dayLabel(d) { const t = today(); if (d === t) return 'Aujourd’hui'; if (d === addDays(t, -1)) return 'Hier'; return parseYmd(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function groupsHTML() { return '<div class="sp-groups">' + GROUPS.map(g => '<button data-sp="group" data-g="' + g[0] + '">' + esc(g[1]) + '<small>' + EX.filter(e => g[2].includes(e.pat)).length + '</small></button>').join('') + '</div>'; }

  /* ================= Questionnaire ================= */
  function openQuiz() {
    const s = st(), prof = S().profile || {};
    const q = Object.assign({ goal: prof.goal === 'gain' ? 'muscle' : prof.goal === 'lose' ? 'fat' : 'fit', place: 'gym', equip: [], level: 1, days: [1, 3, 5], dur: 45, pain: [], focus: 'none' }, s.prefs || {});
    q.equip = (q.equip || []).slice(); q.days = (q.days || []).slice(); q.pain = (q.pain || []).slice();
    let step = 0;
    const steps = ['goal', 'place', 'level', 'days', 'pain'];
    const el = A.mountSheet('<div class="grab"></div><div class="sheet-head"><h3>Mon programme</h3><button class="iconbtn" data-act="close" aria-label="Fermer">' + ic('i-x') + '</button></div><div id="spq"></div>', { tall: true, foot: true });
    A.openLayer({ el });
    const opt = (key, val, title, sub, on, multi) => '<button class="opt' + (on ? ' on' : '') + '" data-q="' + key + '" data-v="' + val + '"' + (multi ? ' data-m="1"' : '') + '><span class="min0"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (multi ? '<span class="tick">' + ic('i-check', 'sm') + '</span>' : '') + '</button>';
    const chip = (key, val, label, on) => '<button class="chip' + (on ? ' on' : '') + '" data-q="' + key + '" data-v="' + val + '" data-m="1">' + esc(label) + '</button>';
    function draw() {
      const k = steps[step]; let h = '';
      if (k === 'goal') h = '<h2 class="q-t">Ton objectif</h2>' + GOALS.map(g => opt('goal', g[0], g[1], g[2], q.goal === g[0])).join('');
      if (k === 'place') h = '<h2 class="q-t">Où t’entraînes-tu ?</h2>' + PLACES.map(pl => opt('place', pl[0], pl[1], pl[2], q.place === pl[0])).join('') +
        (q.place === 'home' ? '<p class="flabel">Ton matériel</p><div class="chips">' + EQUIP.map(e => chip('equip', e[0], e[1], q.equip.includes(e[0]))).join('') + '</div>' : '');
      if (k === 'level') h = '<h2 class="q-t">Ton niveau</h2>' + LEVELS.map(l => opt('level', l[0], l[1], l[2], q.level === l[0])).join('');
      if (k === 'days') h = '<h2 class="q-t">Quels jours ?</h2><p class="hint">Choisis 2 à 6 jours. Laisse au moins un jour de repos entre deux grosses séances si tu débutes.</p><div class="chips wd">' + WD.map((d, i) => chip('days', i + 1, d, q.days.includes(i + 1))).join('') + '</div>' +
        '<p class="flabel">Durée d’une séance</p><div class="chips">' + [20, 30, 45, 60, 75].map(m => '<button class="chip' + (q.dur === m ? ' on' : '') + '" data-q="dur" data-v="' + m + '">' + m + ' min</button>').join('') + '</div>';
      if (k === 'pain') h = '<h2 class="q-t">Des douleurs ou des gênes ?</h2><p class="hint">Les exercices qui sollicitent ces zones seront remplacés.</p><div class="chips">' + PAINS.map(pp => chip('pain', pp[0], pp[1], q.pain.includes(pp[0]))).join('') + '</div>' +
        '<p class="flabel">Une zone à travailler en priorité ?</p><div class="chips">' + FOCUS.map(f => '<button class="chip' + (q.focus === f[0] ? ' on' : '') + '" data-q="focus" data-v="' + f[0] + '">' + esc(f[1]) + '</button>').join('') + '</div>' +
        '<p class="hint" style="margin-top:10px">En cas de douleur forte ou de problème de santé, demande l’avis d’un médecin avant de commencer.</p>';
      const ok = k !== 'days' || (q.days.length >= 2 && q.days.length <= 6);
      $('#spq', el).innerHTML = '<div class="q-prog"><i style="width:' + ((step + 1) / steps.length * 100) + '%"></i></div><div class="q-body">' + h + '</div>' +
        '<div class="sticky-foot">' + (step ? '<button class="btn outline" data-qn="back">Retour</button>' : '') + '<button class="btn primary" data-qn="next"' + (ok ? '' : ' disabled') + '>' + (step === steps.length - 1 ? 'Créer mon programme' : 'Continuer') + '</button></div>';
    }
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-q]');
      if (b) {
        const key = b.dataset.q, raw = b.dataset.v, v = /^\d+$/.test(raw) ? +raw : raw;
        if (b.dataset.m) { const arr = q[key]; const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); if (key === 'days') arr.sort(); }
        else q[key] = v;
        draw(); return;
      }
      const n = ev.target.closest('[data-qn]'); if (!n) return;
      if (n.dataset.qn === 'back') { step--; draw(); return; }
      if (step < steps.length - 1) { step++; draw(); return; }
      const s2 = st();
      s2.prefs = q; s2.plan = generate(q); s2.t = Date.now(); save();
      A.track('sport_plan', { goal: q.goal, place: q.place, days: q.days.length, level: q.level });
      A.closeTop(); A.renderAll(); toast('Programme créé : ' + s2.plan.sessions.length + ' séances');
    });
    draw();
  }

  /* ================= Fiche exercice ================= */
  function openExercise(id) {
    const e = EXM[id]; if (!e) return;
    const last = lastSets(id);
    const el = A.mountSheet(A.head(e.n) + '<div class="fig-box" id="exFig"></div>' +
      '<div class="tags"><span class="tag">' + esc(e.m) + '</span><span class="tag">' + ['', 'Débutant', 'Intermédiaire', 'Avancé'][e.lvl] + '</span>' + e.eq.filter(x => x !== 'body').map(x => '<span class="tag">' + esc(({ db: 'Haltères', bb: 'Barre', bench: e.eq.includes('body') ? 'Banc ou chaise' : 'Banc', bar: 'Barre de traction', kb: 'Kettlebell', band: 'Élastique', machine: 'Machine', cable: 'Poulie' })[x] || x) + '</span>').join('') + '</div>' +
      '<ol class="steps">' + e.how.map(h => '<li>' + esc(h) + '</li>').join('') + '</ol>' +
      '<div class="msg">' + ic('i-help', 'sm') + ' ' + esc(e.tip) + '</div>' +
      (last ? '<p class="hint">Dernière fois (' + esc(dayLabel(last.date)) + ') : ' + last.sets.map(s => num(s.r) + (num(s.kg) ? ' × ' + String(num(s.kg)).replace('.', ',') + ' kg' : '')).join(' · ') + '</p>' : ''));
    A.openLayer({ el });
    if (FIG) FIG.play($('#exFig', el), FIG.specFor(id));
  }
  function openGroup(g) {
    const G = GROUPS.find(x => x[0] === g); if (!G) return;
    const p = st().prefs, eq = p ? eqOf(p) : null;
    const list = EX.filter(e => G[2].includes(e.pat));
    const mine = eq ? list.filter(e => e.eq.every(x => eq.has(x))) : list;
    const el = A.mountSheet(A.head(G[1]) + (eq && mine.length < list.length ? '<p class="hint">' + mine.length + ' exercices possibles avec ton matériel, ' + (list.length - mine.length) + ' autres en dessous.</p>' : '') +
      '<div class="sp-list">' + mine.concat(list.filter(e => !mine.includes(e))).map(e => '<button class="sp-ex' + (mine.includes(e) ? '' : ' dim') + '" data-sp="ex" data-id="' + e.id + '">' + thumb(e.id) + '<span class="min0"><b>' + esc(e.n) + '</b><small>' + esc(e.m) + '</small></span></button>').join('') + '</div>', { tall: true });
    A.openLayer({ el });
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-sp="ex"]'); if (b) openExercise(b.dataset.id); });
  }

  /* ================= Séance guidée ================= */
  let W = null;
  function startSession(key) {
    const plan = st().plan; const sess = plan && plan.sessions.find(s => s.key === key); if (!sess) return;
    W = { id: uid(), key, plan: plan.created, name: sess.name, start: Date.now(), cur: 0, rest: null, items: sess.items.map(it => {
      const e = EXM[it.ex], sg = suggestion(it), n = e && e.u === 'm' ? 1 : it.sets;
      const r0 = e && e.u === 'm' ? it.reps : e && e.u === 's' ? it.reps : topReps(it.reps);
      return Object.assign({}, it, { sg, sets: Array.from({ length: n }, () => ({ r: r0, kg: sg && sg.kg ? sg.kg : '', done: false })) });
    }) };
    A.track('sport_start', { key });
    const el = A.mountSheet('<div class="grab"></div><div class="sheet-head"><h3 id="wTitle">' + esc(sess.name) + '</h3><span class="w-clock num" id="wClock">0:00</span><button class="iconbtn" data-w="quit" aria-label="Arrêter">' + ic('i-x') + '</button></div><div id="wBody"></div>', { tall: true, foot: true });
    W.el = el;
    A.openLayer({ el, onClose: () => { stopRest(); clearInterval(W && W.clock); W = null; A.renderAll(); } });
    W.clock = setInterval(() => { if (!W) return; const s = Math.floor((Date.now() - W.start) / 1000); const c = $('#wClock', el); if (c) c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
    el.addEventListener('click', onW);
    el.addEventListener('input', ev => {
      const i = ev.target.closest('[data-in]'); if (!i || !W) return;
      const it = W.items[W.cur], idx = +i.dataset.i, s = it.sets[idx]; if (!s) return;
      s[i.dataset.in] = i.value.replace(',', '.');
      // la charge tapée est reprise pour les séries suivantes pas encore faites
      if (i.dataset.in === 'kg') it.sets.forEach((x, j) => { if (j > idx && !x.done) { x.kg = s.kg; const f = $('[data-in="kg"][data-i="' + j + '"]', W.el); if (f) f.value = i.value; } });
    });
    drawW();
  }
  function drawW() {
    if (!W) return;
    const el = W.el, it = W.items[W.cur], e = EXM[it.ex], n = W.items.length;
    const kgOn = usesKg(e);
    const unit = e.u === 's' ? 's' : e.u === 'm' ? 'min' : 'rép.';
    $('#wBody', el).innerHTML =
      '<div class="w-dots">' + W.items.map((x, i) => '<button class="' + (i === W.cur ? 'on' : x.sets.every(s => s.done) ? 'done' : '') + '" data-w="go" data-i="' + i + '" aria-label="Exercice ' + (i + 1) + '"></button>').join('') + '</div>' +
      '<div class="fig-box" id="wFig"></div>' +
      '<div class="w-head"><div class="min0"><p class="eyebrow">Exercice ' + (W.cur + 1) + ' sur ' + n + (it.finisher ? ' · fin de séance' : '') + '</p><h2>' + esc(e.n) + '</h2><p class="hint">' + esc(setLabel(e, it.sets.length ? { sets: it.sets.length, reps: it.reps } : it)) + (it.rest ? ' · repos ' + it.rest + ' s' : '') + '</p></div>' +
      '<button class="iconbtn" data-w="info" aria-label="Consignes">' + ic('i-help') + '</button><button class="iconbtn" data-w="swap" aria-label="Changer d’exercice">' + ic('i-swap') + '</button></div>' +
      (it.sg ? '<div class="msg w-sg">' + esc(it.sg.txt) + (it.sg.up ? '<br><b>' + esc(it.sg.up) + '</b>' : '') + '</div>' : '') +
      '<div class="w-sets">' + it.sets.map((s, i) => '<div class="w-set' + (s.done ? ' done' : '') + '"><span class="w-n">' + (e.u === 'm' ? '' : i + 1) + '</span>' +
        (kgOn ? '<label class="w-in"><input inputmode="decimal" data-in="kg" data-i="' + i + '" value="' + esc(s.kg) + '" placeholder="0"><span>kg</span></label>' : '') +
        '<label class="w-in"><input inputmode="numeric" data-in="r" data-i="' + i + '" value="' + esc(s.r) + '"><span>' + unit + '</span></label>' +
        '<button class="w-ok" data-w="done" data-i="' + i + '" aria-label="Série faite">' + ic('i-check') + '</button></div>').join('') + '</div>' +
      (e.u !== 'm' && it.sets.length < 8 ? '<button class="linkbtn" data-w="addset">+ Ajouter une série</button>' : '') +
      '<div class="sticky-foot">' + (W.cur > 0 ? '<button class="btn outline" data-w="prev">Précédent</button>' : '') +
      (W.cur < n - 1 ? '<button class="btn primary" data-w="next">Exercice suivant</button>' : '<button class="btn primary" data-w="finish">Terminer la séance</button>') + '</div>' +
      '<div class="w-rest" id="wRest" hidden></div>';
    if (FIG) FIG.play($('#wFig', el), FIG.specFor(e.id));
    if (W.rest) drawRest();
  }
  function onW(ev) {
    const b = ev.target.closest('[data-w]'); if (!b || !W) return;
    const a = b.dataset.w, it = W.items[W.cur];
    if (a === 'quit') {
      const done = W.items.some(x => x.sets.some(s => s.done));
      if (done && !arm(b, 'Arrêter ?')) return;
      A.closeTop(); return;
    }
    if (a === 'go') { W.cur = +b.dataset.i; drawW(); return; }
    if (a === 'prev') { W.cur = Math.max(0, W.cur - 1); drawW(); return; }
    if (a === 'next') { W.cur = Math.min(W.items.length - 1, W.cur + 1); drawW(); W.el.querySelector('.sheet-in').scrollTop = 0; return; }
    if (a === 'info') { openExercise(it.ex); return; }
    if (a === 'addset') { const l = it.sets[it.sets.length - 1] || {}; it.sets.push({ r: l.r || '', kg: l.kg || '', done: false }); drawW(); return; }
    if (a === 'swap') {
      const p = st().prefs, e = EXM[it.ex];
      const used = new Set(W.items.map(x => x.ex));
      const alts = candidates(e.pat, p).filter(x => !used.has(x.id)).slice(0, 6);
      if (!alts.length) { toast('Pas d’autre exercice possible avec ton matériel'); return; }
      A.actionSheet('Remplacer par…', alts.map(x => ({ label: x.n, sub: x.m, icon: 'i-swap', run: () => {
        const sc = scheme(x, p, W.cur); Object.assign(it, { ex: x.id, reps: sc.reps, rest: sc.rest }); it.sg = suggestion(it);
        it.sets = it.sets.map(s => ({ r: x.u === 'r' ? topReps(sc.reps) : sc.reps, kg: '', done: false }));
        drawW();
      } })));
      return;
    }
    if (a === 'done') {
      const i = +b.dataset.i, s = it.sets[i];
      s.done = !s.done;
      if (s.done) {
        if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) { /* rien */ } }
        const allDone = it.sets.every(x => x.done);
        if (it.rest && !(allDone && W.cur === W.items.length - 1)) startRest(it.rest, allDone);
        else if (allDone && W.cur < W.items.length - 1) { W.cur++; }
      }
      drawW();
      return;
    }
    if (a === 'rest-skip') { stopRest(); if (W.restNext) { W.restNext = false; if (W.cur < W.items.length - 1) W.cur++; } drawW(); return; }
    if (a === 'rest-plus') { if (W.rest) W.rest.end += 15000; drawRest(); return; }
    if (a === 'rest-minus') { if (W.rest) W.rest.end -= 15000; drawRest(); return; }
    if (a === 'finish') { finish(); }
  }
  function startRest(sec, goNext) {
    stopRest();
    W.rest = { end: Date.now() + sec * 1000 }; W.restNext = goNext;
    W.rest.timer = setInterval(() => {
      if (!W || !W.rest) return;
      if (Date.now() >= W.rest.end) {
        if (navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) { /* rien */ } }
        const nx = W.restNext; stopRest(); W.restNext = false;
        if (nx && W.cur < W.items.length - 1) W.cur++;
        drawW(); toast('C’est reparti !');
        return;
      }
      drawRest();
    }, 250);
  }
  function stopRest() { if (W && W.rest) { clearInterval(W.rest.timer); W.rest = null; } }
  function drawRest() {
    const box = W && $('#wRest', W.el); if (!box || !W.rest) return;
    const left = Math.max(0, Math.ceil((W.rest.end - Date.now()) / 1000));
    box.hidden = false;
    box.innerHTML = '<div class="w-rest-in">' + ic('i-timer') + '<div class="min0"><small>Repos' + (W.restNext ? ' · ensuite exercice suivant' : '') + '</small><b class="num">' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + '</b></div>' +
      '<button class="chip" data-w="rest-minus">−15 s</button><button class="chip" data-w="rest-plus">+15 s</button><button class="btn primary" data-w="rest-skip">Passer</button></div>';
  }
  function finish() {
    stopRest();
    const dur = Math.round((Date.now() - W.start) / 1000);
    const done = W.items.reduce((a, x) => a + x.sets.filter(s => s.done).length, 0);
    if (!done) { toast('Coche au moins une série avant de terminer'); return; }
    const kgW = A.latestWeight() || 70;
    // Calories : 5 MET pour la musculation (7 si objectif perte de gras, séances plus denses), cardio selon l'appareil
    let kcal = 0, cardioMin = 0;
    W.items.forEach(x => { const e = EXM[x.ex]; if (e && e.u === 'm' && x.sets[0].done) { const m = num(x.sets[0].r); cardioMin += m; kcal += ({ 'running-treadmill': 9.8, 'trail-running-walking': 6, 'bicycling-stationary': 7, 'elliptical-trainer': 5, 'stairmaster': 9 }[e.id] || 7) * kgW * m / 60; } });
    const met = (st().prefs || {}).goal === 'fat' ? 7 : 5;
    const workMin = Math.max(dur / 60 - cardioMin, done * 1.5);
    kcal += met * kgW * Math.max(0, workMin) / 60;
    kcal = Math.round(Math.min(kcal, 1500));
    const vol = Math.round(W.items.reduce((a, x) => a + x.sets.filter(s => s.done).reduce((b, s) => b + num(s.kg) * num(s.r), 0), 0));
    const log = { id: W.id, date: today(), end: new Date().toTimeString().slice(0, 5), key: W.key, plan: W.plan, name: W.name, dur, kcal, vol, mt: Date.now(),
      items: W.items.map(x => ({ ex: x.ex, reps: x.reps, sets: x.sets.map(s => ({ r: num(s.r), kg: num(s.kg), done: s.done })) })) };
    const s = A.S;
    s.workouts.push(log);
    s.exercises.push({ id: 'w-' + W.id, date: log.date, name: 'Musculation · ' + W.name, minutes: Math.round(dur / 60), kcal, mt: Date.now() });
    save();
    A.track('sport_done', { key: W.key, dur, sets: done });
    const name = W.name;
    const el = A.mountSheet(A.head('Bravo !') + '<div class="result"><span>' + esc(name) + '</span><div class="big num">' + Math.round(dur / 60) + ' min</div><span>' + done + ' séries · ' + fk(vol) + ' kg soulevés</span></div>' +
      '<div class="tiles"><div class="tile"><b class="num" style="color:var(--burn)">' + fk(kcal) + '</b><span>kcal ajoutées à ton budget du jour</span></div></div>' +
      '<button class="btn primary block" data-act="close">Super</button>');
    A.openLayer({ el }, true);
  }
  function openLog(id) {
    const w = (S().workouts || []).find(x => x.id === id); if (!w) return;
    const el = A.mountSheet(A.head(w.name) + '<p class="hint">' + esc(dayLabel(w.date)) + ' à ' + esc(w.end || '') + ' · ' + Math.round(w.dur / 60) + ' min · ' + fk(w.kcal) + ' kcal · ' + fk(w.vol) + ' kg soulevés</p>' +
      (w.items || []).map(x => { const e = EXM[x.ex]; const sets = (x.sets || []).filter(s => s.done); return e && sets.length ? '<div class="kv"><span>' + esc(e.n) + '</span><b>' + sets.map(s => s.r + (s.kg ? '×' + String(s.kg).replace('.', ',') : '')).join(' · ') + '</b></div>' : ''; }).join('') +
      '<div class="sticky-foot"><button class="btn danger" data-lg="del">' + ic('i-trash') + 'Supprimer</button></div>', { foot: true });
    A.openLayer({ el });
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-lg]'); if (!b) return;
      if (!arm(b, 'Supprimer ?')) return;
      const s = A.S; s.workouts = s.workouts.filter(x => x.id !== id); s.exercises = s.exercises.filter(x => x.id !== 'w-' + id);
      s.tomb['k:' + id] = Date.now(); s.tomb['x:w-' + id] = Date.now();
      save(); A.closeTop(); A.renderAll(); toast('Séance supprimée');
    });
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-sp]'); if (!b || !b.closest('#screen-sport, .sheet')) return;
    const a = b.dataset.sp;
    if (a === 'quiz') openQuiz();
    else if (a === 'start') startSession(b.dataset.k);
    else if (a === 'ex' && b.closest('#screen-sport')) openExercise(b.dataset.id);
    else if (a === 'group') openGroup(b.dataset.g);
    else if (a === 'log') openLog(b.dataset.id);
  });
  window.NS_SPORT = { generate, candidates, suggestion, nextSession, EXM };
  A.register('sport', { render });
})();
