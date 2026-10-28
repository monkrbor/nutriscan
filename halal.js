/* Vérification halal, végan / végétarien et additifs, à partir des ingrédients.
   L'appli ne donne pas de verdict religieux : elle dit ce que contient le produit.
   Couleurs : red = contient un ingrédient sensible, orange = à vérifier, sinon rien de détecté. */
(function () {
  'use strict';
  const ADD = window.NS_ADD || {};
  const DEF = { on: true, meat: 'orange', alcohol: 'red', unc: 'orange' };

  /* ---------- Texte normalisé (sans accents, minuscules) ---------- */
  function normMap(src) {
    src = String(src || '');
    let out = ''; const map = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      let n;
      if (ch === 'œ' || ch === 'Œ') n = 'oe';
      else if (ch === 'æ' || ch === 'Æ') n = 'ae';
      else if (ch === '’' || ch === '`' || ch === 'ʼ') n = "'";
      else if (ch === '_' || ch === '*') n = ' ';
      else n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      for (const c of n) { out += c; map.push(i); }
    }
    map.push(src.length);
    return { out, map };
  }
  const norm = s => normMap(s).out;
  const W = src => new RegExp('(^|[^a-z0-9])(' + src + ')(?=$|[^a-z0-9])', 'g');
  function each(text, re, cb) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(text))) {
      const start = m.index + m[1].length, end = start + m[2].length;
      cb(m[2], start, end);
      if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
    }
  }
  const blank = (text, start, end) => text.slice(0, start) + ' '.repeat(end - start) + text.slice(end);
  const before = (text, start, n) => text.slice(Math.max(0, start - n), start);
  const after = (text, end, n) => text.slice(end, end + n);
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  /* ---------- Listes de mots ---------- */
  const PORK = W("porc|porcs|porcin|porcine|porcins|cochons?|saindoux|couennes?|pancetta|coppa|pepperoni|mortadelle|andouilles?|andouillettes?|rillons|lardo|lard|sanglier|marcassin|pork|pig|pigs|swine|prosciutto|lard de porc");
  const PORKISH = W("jambons?|lardons?|bacon|ham|chorizos?|saucissons?|saucisses?|knacks?|rillettes|boudins?|salamis?|speck|guanciale|cervelas|chipolatas?|francfort|charcuteries?|sausages?");
  const NOT_PORK_AFTER = /^\s*(?:de |d'|a la |au |aux |of |-)?\s*(dinde|poulet|volailles?|boeuf|canard|veau|agneau|mouton|poisson|thon|saumon|turkey|chicken|beef|poultry|lamb|duck)/;
  const NOT_PORK_BEFORE = /(dinde|poulet|volaille|boeuf|turkey|chicken|beef|poultry|lamb|duck)\s*$/;
  const VEG_NEAR = /(vegeta|vegan|soja|soy|plant|facon|halal)/;
  const GEL = W('gelatines?|gelatin|gelatine de porc|gelatine porcine|gelatine bovine|gelatine de boeuf');
  const BLOOD = W('sang|blood');
  const ALC_TRACE = W("vinaigres? (?:de |d')?(?:vin|vins|cidre|alcool|xeres|champagne|malt|biere|riz|framboise|banyuls)|vinaigre balsamique|balsamique|aceto balsamico|wine vinegar|cider vinegar|spirit vinegar|malt vinegar|balsamic vinegar|rice vinegar|extraits? (?:naturels? )?de vanille|vanilla extract");
  const VINEGAR = W('vinaigres?|vinegar');
  const ALC = W("alcools?|ethanol|alcool ethylique|vins?|biere|bieres|rhum|cognac|kirsch|liqueurs?|whisky|whiskey|vodka|calvados|porto|marsala|madere|cidres?|sake|mirin|brandy|armagnac|cointreau|grand marnier|champagne|amaretto|gin|tequila|pastis|xeres|sherry|eaux? de vie|eau-de-vie|spiritueux|vermouth|ratafia|sangria|bourbon|wine|wines|beer|beers|rum|liquor|liqueur|alcohol");
  const NOT_ALC = W("sans alcool|alcool benzylique|alcools? de sucre|sugar alcohols?|alcohol free|non alcoolisee?s?|0 ?% d'alcool");
  const INSECT = W('carmins?|cochenilles?|acide carminique|carminic acid|gomme laque|shellac');
  const MEAT = W("viandes?|boeuf|boeufs|veau|agneau|mouton|poulets?|dinde|volailles?|canard|oie|lapin|cheval|gibier|chevreuil|merguez|kebab|foie|foies|collagene|suif|graisses? animales?|matieres? grasses? animales?|extraits? de viande|bouillon de (?:boeuf|poulet|volaille|viande|veau)|proteines animales|graisses? de (?:boeuf|canard|volaille)|beef|chicken|meat|meats|turkey|lamb|veal|duck|mutton|tallow|animal fats?|bovine?|bovins?|steak|nuggets?|cordon bleu");
  const FISH = W("poissons?|thon|saumon|cabillaud|sardines?|maquereaux?|anchois|crevettes?|surimi|colin|merlu|truite|morue|crabes?|moules?|calamars?|poulpe|fruits de mer|fish|tuna|salmon|anchov(?:y|ies)|shrimps?|prawns?|sushi|huile de foie de morue");
  const PRESURE = W('presures?|rennet');
  const MONO = W("mono ?-? ?et ?-? ?diglycerides?(?: d'acides gras)?|monoglycerides?|diglycerides?|mono ?-? ?and ?-? ?diglycerides?(?: of fatty acids)?");
  const GLYC = W('glycerine|glycerol|glycerin');
  const CYST = W('l ?- ?cysteine|cysteine');
  const STEAR = W('stearates?|acide stearique|stearic acid');
  const DAIRY = W("lait|laits|lactose|lactoserum|petit-lait|creme|cremes|beurre|ghee|fromages?|yaourts?|yogourts?|skyr|emmental|mozzarella|camembert|parmesan|comte|mascarpone|ricotta|feta|gruyere|cheddar|chevre|brebis|biscuits?|caseines?|caseinates?|whey|oeufs?|blanc d'oeuf|jaune d'oeuf|miel|milk|butter|cheese|cream|eggs?|honey|croissant|viennoiseries?|pain au chocolat|pizza|presure|e ?1105|e ?966|e ?901");
  const NOT_DAIRY = W("beurre de cacahuetes?|beurre de cacao|beurre d'arachide|cocoa butter|peanut butter|lait de coco|lait d'amandes?|lait de soja|lait d'avoine|lait de riz|coconut milk|almond milk|soy milk|oat milk|creme de coco|coconut cream|creme de marrons|sans lactose|sans lait");
  const VEGETAL_AFTER = /^[^,;.]{0,40}(vegeta|colza|tournesol|palme|soja|vegetable|sunflower|rapeseed|palm|microbien|microbial)/;

  const ORDER = { orange: 1, red: 2 };
  function lookupAdd(code) {
    if (ADD[code]) return ADD[code];
    const base = code.replace(/(iii|ii|iv|vi|v|i)$/, '');
    if (ADD[base]) return ADD[base];
    const k = Object.keys(ADD).find(x => x.startsWith(base) && /^[a-g]$/.test(x.slice(base.length)));
    return k ? Object.assign({}, ADD[k], { code: base, name: ADD[k].name.replace(/ \(.*\)$/, '') }) : null;
  }

  /* ---------- Additifs présents ---------- */
  function additivesOf(p) {
    const set = new Set();
    (p.additives || []).forEach(t => { const c = String(t).replace(/^[a-z]{2}:/, '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (/^e\d{3,4}[a-g]?(?:i{1,3}|iv|vi?)?$/.test(c)) set.add(c); });
    const t = norm(p.ing || '');
    each(t, /(^|[^a-z0-9])(e ?-?\d{3,4}(?: ?[a-g](?![a-z]))?(?: ?(?:iii|ii|iv|vi|v|i)(?![a-z]))?)(?=$|[^a-z0-9])/g, m => set.add(m.replace(/[^a-z0-9]/g, '')));
    // éviter les doublons du type e450 + e450i
    const codes = [...set];
    const keep = codes.filter(c => !codes.some(o => o !== c && o.startsWith(c) && c.length < o.length && /^[a-g]?(iii|ii|iv|vi|v|i)?$/.test(o.slice(c.length))));
    return keep.sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10) || a.localeCompare(b))
      .map(c => ({ code: c, info: lookupAdd(c) }));
  }

  /* ---------- Analyse ---------- */
  function analyze(p, cfg) {
    cfg = Object.assign({}, DEF, cfg || {});
    const isGen = p.source === 'gen';
    const isCustom = p.source === 'custom';
    const rawIng = isGen ? '' : String(p.ing || '');
    const tags = (p.ingTags || []).map(t => String(t).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).join(', ');
    let text = isGen ? (p.s || norm(p.name)) : norm(rawIng + ' ; ' + tags);
    const hasData = isGen || rawIng.trim().length > 2 || tags.length > 2 || (p.additives && p.additives.length);
    const certified = /halal/.test(norm([p.name, p.brand, (p.labels || []).join(' ')].join(' ')));
    const reasons = new Map();
    const hits = []; // termes trouvés (pour le surlignage)
    function add(key, level, title, why, term, extra) {
      if (!level || level === 'off') return;
      if (certified && level === 'red') { level = 'orange'; why = 'Malgré le label halal : ' + why.charAt(0).toLowerCase() + why.slice(1); }
      const prev = reasons.get(key);
      if (!prev) reasons.set(key, Object.assign({ key, level, title, why, terms: term ? [term] : [] }, extra || {}));
      else {
        if (ORDER[level] > ORDER[prev.level]) { prev.level = level; prev.why = why; prev.title = title; }
        if (term && !prev.terms.includes(term)) prev.terms.push(term);
      }
      if (term) hits.push({ term, level });
    }
    const veg = { meat: false, fish: false, dairy: false, insect: false, maybe: false };

    // 1) Traces (« peut contenir… ») : jamais plus qu'orange
    let traces = '';
    text = text.replace(/(peut contenir|traces? eventuelles?|traces? possibles?|traces? de|may contain|fabrique dans un atelier)[^.;]*/g, m => { traces += ' ' + m; return ' '.repeat(m.length); });
    traces += ' ' + (p.traces || []).map(t => String(t).replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).join(' ');
    traces = norm(traces);
    each(traces, PORK, term => add('traces-porc', 'orange', 'Traces possibles de porc', 'Le fabricant indique de possibles traces de porc.', term));
    each(traces, GEL, term => add('traces-gelatine', 'orange', 'Traces possibles de gélatine', 'Le fabricant indique de possibles traces de gélatine.', term));
    each(traces, ALC, term => add('traces-alcool', cfg.alcohol === 'off' ? null : 'orange', 'Traces possibles d’alcool', 'Le fabricant indique de possibles traces d’alcool.', term));

    // 2) Ce qui n'est pas de l'alcool à boire
    each(text, NOT_ALC, (t, s, e) => { text = blank(text, s, e); });
    // 3) Alcool en trace (vinaigre de vin, extrait de vanille…)
    each(text, ALC_TRACE, (term, s, e) => {
      const isVanilla = /vanill/.test(term);
      add('alcool-trace-' + (isVanilla ? 'vanille' : 'vinaigre'), cfg.alcohol, cap(term),
        isVanilla ? 'Extrait généralement avec de l’alcool.' : 'Fabriqué à partir de vin, de cidre ou d’alcool : peut garder des traces d’alcool.', term);
      text = blank(text, s, e);
    });
    each(text, VINEGAR, (term, s, e) => {
      add('vinaigre', cfg.alcohol === 'off' ? null : 'orange', 'Vinaigre (origine non précisée)', 'Souvent fabriqué à partir d’alcool (vinaigre d’alcool) ou de vin.', term);
      text = blank(text, s, e);
    });
    // 4) Alcool
    each(text, ALC, term => add('alcool', 'red', 'Alcool', 'Contient de l’alcool ou une boisson alcoolisée (' + term + ').', term));
    // 5) Porc
    each(text, PORK, term => { veg.meat = true; add('porc', 'red', 'Porc', 'Contient du porc ou un dérivé (' + term + ').', term); });
    each(text, PORKISH, (term, s, e) => {
      const a = after(text, e, 30), b = before(text, s, 20);
      if (VEG_NEAR.test(a.slice(0, 22)) && !/halal/.test(a.slice(0, 22)) && !NOT_PORK_AFTER.test(a)) { return; }
      if (/halal/.test(a.slice(0, 25)) || /halal\s*$/.test(b)) { veg.meat = true; return; }
      if (NOT_PORK_AFTER.test(a) || NOT_PORK_BEFORE.test(b)) { veg.meat = true; if (!certified) add('viande', cfg.meat, 'Viande sans label halal', 'Contient de la viande et aucun label halal n’a été trouvé : à vérifier.', term); return; }
      veg.meat = true;
      add('porc', 'red', 'Porc (charcuterie)', 'Charcuterie sans autre viande précisée : en général à base de porc (' + term + ').', term);
    });
    // 6) Gélatine
    each(text, GEL, (term, s, e) => {
      const a = after(text, e, 25), b = before(text, s, 15);
      if (/(poisson|fish)/.test(a) || /(fish|poisson)\s*$/.test(b)) { veg.fish = true; return; }
      if (/halal/.test(a) || /halal\s*$/.test(b)) { veg.meat = true; return; }
      veg.meat = true;
      if (/(porc|pork)/.test(term + a) || /pork\s*$/.test(b)) { add('gelatine', 'red', 'Gélatine de porc', 'Contient de la gélatine de porc.', term); return; }
      if (/(bovin|boeuf|beef)/.test(term + a) || /(beef|bovine)\s*$/.test(b)) { if (!certified) add('gelatine', cfg.meat, 'Gélatine de bœuf', 'Gélatine de bœuf sans label halal : à vérifier.', term); return; }
      add('gelatine', 'red', 'Gélatine', 'Origine non précisée : en Europe, la gélatine vient le plus souvent du porc.', term);
    });
    // 7) Sang
    each(text, BLOOD, term => { veg.meat = true; add('sang', 'red', 'Sang', 'Contient du sang.', term); });
    // 8) Insectes
    each(text, INSECT, term => { veg.insect = true; add('insectes', cfg.unc, 'Insectes (carmin / gomme laque)', 'Issu d’insectes : les avis divergent selon les écoles.', term); });
    // 9) Viande sans label
    each(text, MEAT, (term, s, e) => {
      const a = after(text, e, 25), b = before(text, s, 12);
      if (/sans\s*$/.test(b) || /(vegeta|vegan|soja|facon|soy|plant)/.test(b + ' ' + a.slice(0, 15))) return;
      if (/gelatin/.test(before(text, s, 22))) return; // déjà traité avec la gélatine
      if (/^\s*de (morue|poisson|lotte)/.test(a)) { veg.fish = true; return; }
      veg.meat = true;
      if (certified || /halal/.test(a) || /halal\s*$/.test(b)) return;
      add('viande', cfg.meat, 'Viande sans label halal', 'Contient de la viande ou un dérivé et aucun label halal n’a été trouvé : à vérifier (abattage).', term);
    });
    // 10) Origine animale possible
    const vegOk = new Set();
    if (!certified) {
      each(text, PRESURE, (term, s, e) => { if (VEGETAL_AFTER.test(after(text, e, 45)) || /(microbial|vegetal|vegetable)\s*$/.test(before(text, s, 15))) return; veg.maybe = true; add('presure', cfg.unc, 'Présure', 'Peut venir de l’estomac de veau (présure animale) : origine non précisée.', term); });
      each(text, MONO, (term, s, e) => { if (VEGETAL_AFTER.test(after(text, e, 45))) { vegOk.add('e471'); vegOk.add('e472'); return; } veg.maybe = true; add('e471', cfg.unc, 'Mono- et diglycérides d’acides gras (E471)', 'Graisses qui peuvent être animales ou végétales : origine non précisée.', term); });
      each(text, GLYC, (term, s, e) => { if (VEGETAL_AFTER.test(after(text, e, 45))) { vegOk.add('e422'); return; } veg.maybe = true; add('e422', cfg.unc, 'Glycérine (E422)', 'Peut être d’origine animale ou végétale : origine non précisée.', term); });
      each(text, CYST, term => { veg.maybe = true; add('e920', cfg.unc, 'L-cystéine (E920)', 'Peut être fabriquée à partir de plumes ou de poils, ou synthétique.', term); });
      each(text, STEAR, (term, s, e) => { if (VEGETAL_AFTER.test(after(text, e, 45))) { vegOk.add('e570'); vegOk.add('e572'); return; } veg.maybe = true; add('e570', cfg.unc, 'Stéarate / acide stéarique', 'Graisse qui peut être animale ou végétale : origine non précisée.', term); });
    }
    // 11) Additifs E
    const adds = additivesOf(p);
    const fullText = norm(rawIng);
    adds.forEach(a => {
      const info = a.info; if (!info) return;
      const label = 'E' + a.code.slice(1) + ' · ' + info.name;
      const near = vegOk.has(a.code.replace(/[a-g]$/, '')) || vegOk.has(a.code) || new RegExp(a.code.replace(/^e/, 'e ?') + "[^,;.]{0,40}(vegeta|colza|tournesol|palme|soja|halal|poisson)").test(fullText);
      if (info.halal === 'a') add('alcool', 'red', 'Alcool', 'Contient de l’éthanol (E' + a.code.slice(1) + ').', a.code);
      else if (info.halal === 'g') {
        if (/gelatine[^,;.]{0,25}(poisson|halal)|(fish|poisson) gelatin/.test(fullText)) return;
        veg.meat = true;
        add('gelatine', 'red', 'Gélatine', 'Origine non précisée : en Europe, la gélatine vient le plus souvent du porc.', a.code);
      } else if (info.halal === 'i') { veg.insect = true; add('insectes', cfg.unc, 'Insectes (carmin / gomme laque)', 'Issu d’insectes : les avis divergent selon les écoles.', a.code); }
      else if (info.halal === 'b') { veg.meat = true; if (!certified) add('e542', cfg.meat, label, 'Fabriqué à partir d’os d’animaux : à vérifier.', a.code); }
      else if (info.halal === 'u' && !certified && !near) { veg.maybe = true; add(a.code.replace(/[a-g]$/, '') === 'e472' ? 'e472' : a.code, cfg.unc, label, 'Origine animale ou végétale non précisée sur l’étiquette.', a.code); }
      if (/oeuf|lait|abeille/.test(norm(info.origin))) veg.dairy = true;
    });
    // 12) Poisson, produits laitiers (pour le statut végan)
    let vtext = text;
    each(vtext, NOT_DAIRY, (t, s, e) => { vtext = blank(vtext, s, e); });
    each(vtext, FISH, () => { veg.fish = true; });
    each(vtext, DAIRY, () => { veg.dairy = true; });

    if (reasons.has('porc')) reasons.delete('viande');
    const list = [...reasons.values()].sort((a, b) => ORDER[b.level] - ORDER[a.level]);
    const level = list.length ? list[0].level : null;
    let status;
    if (!cfg.on) status = 'off';
    else if (level) status = level;
    else if (certified) status = 'cert';
    else if (!hasData) status = 'unknown';
    else status = 'ok';

    // Végan / végétarien
    let vg = 'unknown';
    const tagsA = (p.analysis || []).map(String);
    if (veg.meat || veg.fish || veg.insect) vg = 'nonveg';
    else if (hasData || isGen) {
      if (tagsA.includes('en:non-vegetarian')) vg = 'nonveg';
      else if (veg.dairy || tagsA.includes('en:non-vegan')) vg = veg.maybe || tagsA.includes('en:maybe-vegetarian') ? 'maybe-veg' : 'vegetarian';
      else if (tagsA.includes('en:vegan') && !veg.maybe) vg = 'vegan';
      else if (veg.maybe || tagsA.includes('en:maybe-vegan') || tagsA.includes('en:maybe-vegetarian')) vg = 'maybe-vegan';
      else vg = isGen ? 'vegan' : (isCustom || !rawIng.trim()) ? 'unknown' : 'maybe-vegan';
    }
    return { status, reasons: list, certified, hasData, veg: vg, additives: adds, hits };
  }

  /* ---------- Surlignage des ingrédients ---------- */
  function highlight(src, hits, esc) {
    src = String(src || '');
    if (!hits || !hits.length) return esc(src);
    const { out, map } = normMap(src);
    const spans = [];
    const lv = {};
    hits.forEach(h => { const k = h.term; if (!lv[k] || ORDER[h.level] > ORDER[lv[k]]) lv[k] = h.level; });
    Object.keys(lv).sort((a, b) => b.length - a.length).forEach(term => {
      const t = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s?');
      each(out, W(t), (m, s, e) => { spans.push([map[s], map[e - 1] + 1, lv[term]]); });
    });
    spans.sort((a, b) => a[0] - b[0]);
    let html = '', pos = 0;
    spans.forEach(([s, e, l]) => {
      if (s < pos) return;
      html += esc(src.slice(pos, s)) + '<mark class="hl-' + l + '">' + esc(src.slice(s, e)) + '</mark>';
      pos = e;
    });
    return html + esc(src.slice(pos));
  }

  /* ---------- Allergènes ---------- */
  const ALLERG = {
    'gluten': 'gluten', 'milk': 'lait', 'eggs': 'œufs', 'nuts': 'fruits à coque', 'peanuts': 'arachides', 'soybeans': 'soja',
    'sesame-seeds': 'sésame', 'celery': 'céleri', 'mustard': 'moutarde', 'fish': 'poisson', 'crustaceans': 'crustacés',
    'molluscs': 'mollusques', 'lupin': 'lupin', 'sulphur-dioxide-and-sulphites': 'sulfites'
  };
  const allergenNames = tags => [...new Set((tags || []).map(t => { const k = String(t).replace(/^[a-z]{2}:/, ''); return ALLERG[k] || k.replace(/-/g, ' '); }))];

  window.NS_HALAL = { DEF, analyze, additivesOf, highlight, allergenNames, norm };
})();
