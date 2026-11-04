/* NutriScan — langues (français, anglais, arabe).
   L'appli est écrite en français ; dans une autre langue, chaque texte affiché est remplacé à la volée
   par sa traduction (dictionnaire i18n-en.js / i18n-ar.js, chargé dans <head> avant l'appli).
   Les nombres sont repérés automatiquement : « Il te reste # kcal » couvre toutes les valeurs. */
(function () {
  'use strict';
  const KEY = 'nutriscan.lang';
  const LANGS = [['fr', 'Français', 'fr-FR'], ['en', 'English', 'en-GB'], ['ar', 'العربية', 'ar-MA']];
  function detect() {
    let l = '';
    try { l = localStorage.getItem(KEY) || ''; } catch (e) { /* rien */ }
    if (LANGS.some(x => x[0] === l)) return l;
    const n = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase();
    return n.indexOf('ar') === 0 ? 'ar' : n.indexOf('fr') === 0 ? 'fr' : n.indexOf('en') === 0 ? 'en' : 'fr';
  }
  const L = detect();
  const LOC = LANGS.find(x => x[0] === L)[2];
  const R = document.documentElement;
  R.lang = L; R.dir = L === 'ar' ? 'rtl' : 'ltr';

  /* ---------- Dictionnaire ---------- */
  const SRC = window.NS_DICT || { t: {}, re: [] };
  const D = Object.create(null);
  Object.keys(SRC.t || {}).forEach(k => { D[k] = SRC.t[k]; });
  const RE = (SRC.re || []).map(x => [new RegExp(x[0]), x[1]]);
  const NUM = /\d+(?:[   ]\d{3})*(?:[,.]\d+)?/g;
  const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿŒœ]/;
  function fmtNum(x) {
    if (L === 'en') return x.replace(/[   ](?=\d{3})/g, ',').replace(/,(\d{1,2})$/, '.$1');
    return x.replace(/ (?=\d{3})/g, ' ');
  }
  const SEP = L === 'ar' ? '، ' : ', ';
  function fill(t, caps) {
    return t.replace(/\$([tl]?)(\d)/g, (_, k, i) => {
      const v = caps[+i] || '';
      if (k === 't') return tr(v);
      if (k === 'l') return v.split(/,\s*/).map(x => tr(x)).join(SEP);
      return v;
    });
  }
  let depth = 0;
  function tr(s) {
    if (L === 'fr' || s == null) return s;
    s = String(s);
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
    if (!core || !LETTER.test(core)) return s;
    let out = D[core];
    if (out === undefined) {
      const nums = [];
      const tpl = core.replace(NUM, x => { nums.push(x); return '#'; });
      if (nums.length && D[tpl] !== undefined) {
        let i = 0;
        out = D[tpl].replace(/#(\d)?/g, (_, k) => fmtNum(nums[k ? +k - 1 : i++] || ''));
      }
    }
    if (out === undefined && depth < 4) {
      depth++;
      try {
        for (const [re, t] of RE) { const c = re.exec(core); if (c) { out = fill(t, c); break; } }
        // Morceaux séparés par « · » ou phrases : traduits un par un
        if (out === undefined && core.indexOf(' · ') > 0) {
          const parts = core.split(' · '), tp = parts.map(x => tr(x));
          if (tp.some((x, i) => x !== parts[i])) out = tp.join(' · ');
        }
        if (out === undefined) {
          const sent = core.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÝÉ«])/);
          if (sent.length > 1) { const ts = sent.map(x => tr(x)); if (ts.some((x, i) => x !== sent[i])) out = ts.join(' '); }
        }
        // Ponctuation finale, majuscule
        if (out === undefined) {
          const pm = /^(.*?)\s*([:.…?!])$/.exec(core);
          if (pm && pm[1]) { const t = tr(pm[1]); if (t !== pm[1]) out = t + pm[2]; }
        }
        if (out === undefined && /^[a-zà-ÿ]/.test(core)) {
          const up = core.charAt(0).toUpperCase() + core.slice(1), t = tr(up);
          if (t !== up) out = L === 'en' ? t.charAt(0).toLowerCase() + t.slice(1) : t;
        }
      } finally { depth--; }
    }
    return out === undefined ? s : m[1] + out + m[3];
  }

  /* ---------- Traduction de la page ---------- */
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
  const seen = new WeakMap();
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function doText(n) {
    const v = n.nodeValue;
    if (seen.get(n) === v) return;
    const p = n.parentNode;
    if (!p || SKIP[p.nodeName] || (p.closest && p.closest('[data-notr]'))) { seen.set(n, v); return; }
    const t = tr(v);
    if (t !== v) n.nodeValue = t;
    seen.set(n, t);
  }
  function doAttrs(el) {
    for (let i = 0; i < ATTRS.length; i++) {
      const a = ATTRS[i], v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP[root.nodeName]) return; doAttrs(root); }
    const w = document.createTreeWalker(root, 5 /* éléments + textes */, null);
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) doText(n);
      else if (SKIP[n.nodeName]) { /* rien */ }
      else doAttrs(n);
      n = w.nextNode();
    }
  }
  let obs = null;
  function start() {
    if (L === 'fr' || obs) return;
    walk(R);
    obs = new MutationObserver(list => {
      for (const r of list) {
        if (r.type === 'childList') r.addedNodes.forEach(walk);
        else if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') { const v = r.target.getAttribute(r.attributeName); if (v) { const t = tr(v); if (t !== v) r.target.setAttribute(r.attributeName, t); } }
      }
    });
    obs.observe(R, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function set(l) {
    if (!LANGS.some(x => x[0] === l)) return;
    try { localStorage.setItem(KEY, l); } catch (e) { /* rien */ }
    location.reload();
  }
  // Recherche : un mot tapé dans la langue choisie retrouve l'aliment ou la recette français
  function searchText(s) { return L === 'fr' ? s : s + ' ' + tr(s); }

  window.NS_I18N = { lang: L, loc: LOC, langs: LANGS, t: tr, set, start, walk, searchText, rtl: L === 'ar' };
  window.NS_T = tr;
  if (L !== 'fr') start();
})();
