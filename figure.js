/* Animations des exercices : une silhouette neutre (sans visage, sans détails), dessinée en SVG.
   Chaque position = hanche, inclinaison du buste, et pour chaque membre soit des angles, soit un point de contact
   (main sur la barre, pied au sol…) résolu automatiquement. L'animation passe d'une position à l'autre en douceur. */
(function () {
  'use strict';
  const L = { T: 40, N: 3, HR: 8, UA: 21, FA: 19, TH: 28, SH: 27, FT: 10 };
  const W = 240, H = 160, FL = 148;           // taille du dessin, niveau du sol
  const AY = FL - 4;                           // hauteur de la cheville quand le pied est à plat
  const rad = d => d * Math.PI / 180;
  // Angles : 0 = vers le bas, 90 = vers l'avant (à droite), 180 = vers le haut, -90 = vers l'arrière
  const go = (p, a, len) => [p[0] + Math.sin(rad(a)) * len, p[1] + Math.cos(rad(a)) * len];
  const angOf = (p, q) => Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI;
  const lerp = (a, b, k) => a + (b - a) * k;
  // Membre à deux segments qui doit atteindre un point : s = sens de pliage (+1 ou -1)
  function ik(root, to, a, b, s) {
    const dx = to[0] - root[0], dy = to[1] - root[1];
    const d = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, Math.hypot(dx, dy)));
    const base = angOf(root, to);
    const alpha = Math.acos((a * a + d * d - b * b) / (2 * a * d)) * 180 / Math.PI;
    const mid = go(root, base + s * alpha, a);
    return [mid, go(mid, angOf(mid, to), b)];
  }
  function limb(root, spec, a, b) {
    if (Array.isArray(spec)) { const m = go(root, spec[0], a); return [m, go(m, spec[1], b)]; }
    return ik(root, spec.to, a, b, spec.s == null ? 1 : spec.s);
  }
  /* ---------- Vue de profil ---------- */
  function solveSide(P) {
    const hip = P.hip, sh = go(hip, P.t, L.T), head = go(sh, P.t + (P.hd || 0), L.N + L.HR);
    const neckS = go(hip, P.t, L.T - 3);
    const [e1, h1] = limb(neckS, P.a1, L.UA, L.FA), [e2, h2] = limb(neckS, P.a2 || P.a1, L.UA, L.FA);
    const leg = sp => {
      const [k, an] = limb(hip, sp, L.TH, L.SH);
      const ft = Array.isArray(sp) ? (sp[2] != null ? sp[2] : sp[1] + 90) : (sp.ft != null ? sp.ft : 90);
      return [k, an, go(an, ft, L.FT * 0.8), go(an, ft + 180, L.FT * 0.25)];
    };
    const [k1, an1, to1, he1] = leg(P.l1), [k2, an2, to2, he2] = leg(P.l2 || P.l1);
    return { side: true, hip, sh: neckS, head, e1, h1, e2, h2, k1, an1, to1, he1, k2, an2, to2, he2, t: P.t };
  }
  /* ---------- Vue de face (élévations latérales, jumping jacks…) ---------- */
  function solveFront(P) {
    const hip = P.hip, neck = [hip[0] + Math.sin(rad(P.t || 180)) * L.T, hip[1] + Math.cos(rad(P.t || 180)) * L.T];
    const head = [neck[0], neck[1] - L.N - L.HR];
    const side = (dir, root, spec, a, b) => {
      if (!Array.isArray(spec)) return ik(root, spec.to, a, b, spec.s == null ? 1 : spec.s);
      const m = [root[0] + dir * Math.sin(rad(spec[0])) * a, root[1] + Math.cos(rad(spec[0])) * a];
      return [m, [m[0] + dir * Math.sin(rad(spec[1])) * b, m[1] + Math.cos(rad(spec[1])) * b]];
    };
    const sy = P.shy || 0, shR = [neck[0] + 12, neck[1] + 4 + sy], shL = [neck[0] - 12, neck[1] + 4 + sy];
    const hpR = [hip[0] + 7, hip[1]], hpL = [hip[0] - 7, hip[1]];
    const [eR, hR] = side(1, shR, P.aR, L.UA, L.FA), [eL, hL] = side(-1, shL, P.aL || P.aR, L.UA, L.FA);
    const [kR, anR] = side(1, hpR, P.lR, L.TH, L.SH), [kL, anL] = side(-1, hpL, P.lL || P.lR, L.TH, L.SH);
    return { side: false, hip, neck, head, shR, shL, hpR, hpL, eR, hR, eL, hL, kR, anR, kL, anL };
  }
  function mix(A, B, k) {
    const o = {};
    for (const key of Object.keys(A)) {
      const a = A[key], b = B[key] != null ? B[key] : a;
      if (typeof a === 'number') o[key] = lerp(a, b, k);
      else if (Array.isArray(a)) o[key] = a.map((x, i) => typeof x === 'number' ? lerp(x, b[i] != null ? b[i] : x, k) : x);
      else if (a && typeof a === 'object') o[key] = mix(a, b, k);
      else o[key] = k < 0.5 ? a : b;
    }
    return o;
  }
  /* ---------- Dessin ---------- */
  const f = n => n.toFixed(1);
  const ln = (p, q, w, c, extra) => '<line x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(q[0]) + '" y2="' + f(q[1]) + '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"' + (extra || '') + '/>';
  const ci = (p, r, c, extra) => '<circle cx="' + f(p[0]) + '" cy="' + f(p[1]) + '" r="' + r + '" fill="' + c + '"' + (extra || '') + '/>';
  const FIG = 'var(--fig)', FIG2 = 'var(--fig2)', PROP = 'var(--prop)', PROP2 = 'var(--prop2)', ACC = 'var(--brand)';
  function at(J, where) {
    if (Array.isArray(where)) return where;
    return J[where] || J.h1 || J.hR;
  }
  // Matériel dessiné derrière la silhouette
  function propBack(J, p) {
    switch (p.type) {
      case 'bench': {
        const a = p.a || 0, c = [p.x, p.y], hw = p.w / 2;
        const l = [c[0] - Math.cos(rad(a)) * hw, c[1] + Math.sin(rad(a)) * hw], r = [c[0] + Math.cos(rad(a)) * hw, c[1] - Math.sin(rad(a)) * hw];
        return ln(l, r, 7, PROP2) + ln([p.x - hw * 0.6 * Math.cos(rad(a)), p.y + 3], [p.x - hw * 0.6, FL], 3, PROP2) + ln([p.x + hw * 0.4, p.y + 3], [p.x + hw * 0.4, FL], 3, PROP2);
      }
      case 'box': return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + (FL - p.y) + '" rx="2" fill="' + PROP2 + '"/>';
      case 'wall': return '<rect x="' + p.x + '" y="0" width="8" height="' + FL + '" fill="' + PROP2 + '"/>';
      case 'bar': return ln([p.x - 22, p.y], [p.x + 22, p.y], 4, PROP) + ln([p.x - 22, p.y], [p.x - 22, 0], 3, PROP2) + ln([p.x + 22, p.y], [p.x + 22, 0], 3, PROP2);
      case 'dipbars': return ln([p.x - 16, p.y], [p.x + 16, p.y], 5, PROP) + ln([p.x - 10, p.y], [p.x - 10, FL], 3, PROP2) + ln([p.x + 10, p.y], [p.x + 10, FL], 3, PROP2);
      case 'table': return ln([p.x - p.w / 2, p.y], [p.x + p.w / 2, p.y], 5, PROP) + ln([p.x - p.w / 2 + 4, p.y], [p.x - p.w / 2 + 4, FL], 3, PROP2) + ln([p.x + p.w / 2 - 4, p.y], [p.x + p.w / 2 - 4, FL], 3, PROP2);
      case 'seat': return ln([p.x - p.w / 2, p.y], [p.x + p.w / 2, p.y], 7, PROP2) + ln([p.x, p.y], [p.x, FL], 4, PROP2) + (p.back != null ? ln([p.x - p.w / 2, p.y - 2], go([p.x - p.w / 2, p.y - 2], p.back, 46), 7, PROP2) : '');
      case 'column': return '<rect x="' + (p.x - 4) + '" y="4" width="8" height="' + (FL - 4) + '" rx="2" fill="' + PROP2 + '"/>' + ci([p.x, p.py], 4.5, PROP);
      case 'mat': return '<rect x="' + p.x + '" y="' + (FL - 2) + '" width="' + p.w + '" height="3" rx="1.5" fill="' + PROP2 + '"/>';
      case 'tread': return '<rect x="' + p.x + '" y="' + (FL - 7) + '" width="' + p.w + '" height="7" rx="3" fill="' + PROP2 + '"/>' + ln([p.x + p.w - 6, FL - 6], [p.x + p.w + 6, FL - 70], 4, PROP2) + ln([p.x + p.w + 6, FL - 70], [p.x + p.w - 12, FL - 72], 4, PROP2);
      case 'bike': return ci([p.x + 34, FL - 16], 14, 'none', ' stroke="' + PROP2 + '" stroke-width="4"') + ln([p.x, p.y + 4], [p.x + 10, FL - 4], 5, PROP2) + ln([p.x + 10, FL - 4], [p.x + 34, FL - 16], 4, PROP2) + ln([p.x - 8, p.y + 2], [p.x + 8, p.y + 2], 6, PROP) + ln([p.x + 10, FL - 4], [p.x + 40, p.y - 26], 4, PROP2) + ln([p.x + 34, p.y - 30], [p.x + 46, p.y - 26], 5, PROP);
      case 'stairs': return [0, 1, 2].map(i => '<rect x="' + (p.x + i * 18) + '" y="' + (FL - 12 - i * 12) + '" width="' + (54 - i * 18) + '" height="' + (12 + i * 12) + '" fill="' + PROP2 + '" opacity="' + (0.9 - i * 0.15) + '"/>').join('');
      case 'ellip': return '<rect x="' + p.x + '" y="' + (FL - 8) + '" width="' + p.w + '" height="8" rx="3" fill="' + PROP2 + '"/>' + ln([p.x + p.w - 6, FL - 8], [p.x + p.w + 2, FL - 80], 4, PROP2);
      case 'rail': return '<rect x="' + p.x + '" y="' + (FL - 8) + '" width="' + p.w + '" height="6" rx="3" fill="' + PROP2 + '"/>' + ci([p.x + p.w - 10, FL - 22], 13, PROP2) + '<rect x="' + f(J.hip[0] - 11) + '" y="' + f(J.hip[1] + 5) + '" width="22" height="6" rx="2" fill="' + PROP + '"/>';
      case 'platform': { const q = at(J, p.at); const a = p.a || 0; return ln(go(q, a + 90, 14), go(q, a - 90, 14), 6, PROP2) + ln(go(q, a + 90, 2), [q[0] + 30, q[1] + 40], 4, PROP2); }
      default: return '';
    }
  }
  // Matériel tenu en main ou posé sur le corps, dessiné devant
  function propFront(J, p) {
    switch (p.type) {
      case 'db': return (p.both ? ci(J.h2 || J.hL, 5.5, PROP2) : '') + ci(at(J, p.at || 'h1'), 5.5, PROP) + (J.side ? '' : (p.both !== false ? ci(J.hL, 5.5, PROP) : ''));
      case 'plate': { const q = at(J, p.at || 'h1'); return ci(q, 12.5, PROP, ' opacity=".92"') + ci(q, 3, 'var(--surface)'); }
      case 'kb': { const q = at(J, p.at || 'h1'); const c = [q[0], q[1] + (p.up ? -8 : 8)]; return '<path d="M' + f(q[0] - 4) + ' ' + f(q[1]) + ' Q' + f(q[0]) + ' ' + f(q[1] + (p.up ? 4 : -4)) + ' ' + f(q[0] + 4) + ' ' + f(q[1]) + '" fill="none" stroke="' + PROP + '" stroke-width="2.5"/>' + ci(c, 7, PROP); }
      case 'band': { const a = at(J, p.from), b = at(J, p.to || 'h1'); const m = [(a[0] + b[0]) / 2 + (p.bow || 0), (a[1] + b[1]) / 2]; return '<path d="M' + f(a[0]) + ' ' + f(a[1]) + ' Q' + f(m[0]) + ' ' + f(m[1]) + ' ' + f(b[0]) + ' ' + f(b[1]) + '" fill="none" stroke="' + ACC + '" stroke-width="3" stroke-linecap="round"/>' + (p.from2 ? (() => { const a2 = at(J, p.from2), b2 = at(J, p.to2); return '<path d="M' + f(a2[0]) + ' ' + f(a2[1]) + ' L' + f(b2[0]) + ' ' + f(b2[1]) + '" stroke="' + ACC + '" stroke-width="3" stroke-linecap="round"/>'; })() : ''); }
      case 'cable': { const q = at(J, p.to || 'h1'); return ln([p.px, p.py], q, 1.6, PROP) + ln([q[0] - 4, q[1]], [q[0] + 4, q[1]], 4, PROP); }
      case 'pad': return ci(at(J, p.at), 5.5, PROP);
      case 'ball': { const q = at(J, p.at); return ci([q[0] + (p.dx || 0), q[1] + (p.dy || 10)], p.r || 12, PROP2); }
      case 'roller': { const q = at(J, p.at || 'h1'); return ci([q[0], q[1] + 3], 6.5, PROP) + ci([q[0], q[1] + 3], 2, 'var(--surface)'); }
      case 'barh': return ln([J.hL[0] - 12, J.hL[1]], [J.hR[0] + 12, J.hR[1]], 4, PROP) + ci([J.hL[0] - 14, J.hL[1]], 6, PROP) + ci([J.hR[0] + 14, J.hR[1]], 6, PROP);
      case 'ropes': { const r = (h, k) => { const m = [(h[0] + p.ax) / 2, (h[1] + p.ay) / 2 + (k ? 14 : -14)]; return '<path d="M' + f(h[0]) + ' ' + f(h[1]) + ' Q' + f(m[0]) + ' ' + f(m[1]) + ' ' + p.ax + ' ' + p.ay + '" fill="none" stroke="' + ACC + '" stroke-width="2.5"/>'; }; return r(J.h1, J.h1[1] > J.h2[1]) + r(J.h2, J.h2[1] > J.h1[1]); }
      case 'handles': return ln([J.h1[0], J.h1[1] - 5], [J.h1[0], J.h1[1] + 5], 4, PROP);
      case 'rope': { const up = J.rope; const a = J.h1, b = J.h2 || J.h1; const T0 = up ? J.head[1] - 20 : FL + 1, yc = (8 * T0 - a[1] - b[1]) / 6; return '<path d="M' + f(a[0]) + ' ' + f(a[1]) + ' C' + f(a[0] + 16) + ' ' + f(yc) + ' ' + f(b[0] + 6) + ' ' + f(yc) + ' ' + f(b[0]) + ' ' + f(b[1]) + '" fill="none" stroke="' + ACC + '" stroke-width="2"/>'; }
      default: return '';
    }
  }
  function drawSide(J, spec) {
    let s = '';
    const far = J.farHidden ? '' : ln(J.sh, J.e2, 7.5, FIG2) + ln(J.e2, J.h2, 6.5, FIG2) + ci(J.h2, 3.4, FIG2) +
      ln(J.hip, J.k2, 10.5, FIG2) + ln(J.k2, J.an2, 8.5, FIG2) + ln(J.he2, J.to2, 5, FIG2);
    s += far;
    s += ln(J.hip, J.sh, 17, FIG) + ci(J.hip, 7.5, FIG);
    s += ln(J.hip, J.k1, 10.5, FIG) + ln(J.k1, J.an1, 8.5, FIG) + ln(J.he1, J.to1, 5, FIG);
    s += ci(J.head, L.HR, FIG);
    s += ln(J.sh, J.e1, 7.5, FIG) + ln(J.e1, J.h1, 6.5, FIG) + ci(J.h1, 3.4, FIG);
    return s;
  }
  function drawFront(J) {
    let s = '';
    s += ln(J.hpL, J.kL, 10, FIG) + ln(J.kL, J.anL, 8.5, FIG) + ln(J.hpR, J.kR, 10, FIG) + ln(J.kR, J.anR, 8.5, FIG);
    s += ln([J.anL[0], J.anL[1] + 2], [J.anL[0] - 5, J.anL[1] + 3], 5, FIG) + ln([J.anR[0], J.anR[1] + 2], [J.anR[0] + 5, J.anR[1] + 3], 5, FIG);
    s += '<path d="M' + f(J.hpL[0] - 2) + ' ' + f(J.hip[1] + 2) + ' L' + f(J.shL[0]) + ' ' + f(J.shL[1] - 1) + ' L' + f(J.shR[0]) + ' ' + f(J.shR[1] - 1) + ' L' + f(J.hpR[0] + 2) + ' ' + f(J.hip[1] + 2) + 'Z" fill="' + FIG + '" stroke="' + FIG + '" stroke-width="7" stroke-linejoin="round"/>';
    s += ci(J.head, L.HR, FIG);
    s += ln(J.shL, J.eL, 7.5, FIG) + ln(J.eL, J.hL, 6.5, FIG) + ci(J.hL, 3.4, FIG);
    s += ln(J.shR, J.eR, 7.5, FIG) + ln(J.eR, J.hR, 6.5, FIG) + ci(J.hR, 3.4, FIG);
    return s;
  }
  function frameSVG(spec, P) {
    const J = spec.front ? solveFront(P) : solveSide(P);
    if (P.rope != null) J.rope = P.rope > 0.5;
    if (spec.farHidden) J.farHidden = true;
    const props = (spec.props || []).concat(P.props || []);
    let s = ln([6, FL + 1.5], [W - 6, FL + 1.5], 2, 'var(--line)');
    props.forEach(p => { if (!/^(db|plate|kb|band|cable|pad|ball|roller|handles|rope|barh|ropes)$/.test(p.type)) s += propBack(J, p); });
    props.forEach(p => { if (p.type === 'band' && p.behind) s += propFront(J, p); });
    s += spec.front ? drawFront(J) : drawSide(J, spec);
    props.forEach(p => { if (/^(db|plate|kb|cable|pad|ball|roller|handles|rope|barh|ropes)$/.test(p.type) || (p.type === 'band' && !p.behind)) s += propFront(J, p); });
    return s;
  }
  const ease = k => 0.5 - Math.cos(Math.PI * k) / 2;
  // Position à l'instant t (en ms) : aller-retour entre 2 positions, ou boucle sur plusieurs
  function poseAt(spec, t) {
    const F = spec.frames, n = F.length;
    const dur = spec.dur || 900, hold = spec.hold == null ? 250 : spec.hold;
    if (n === 1) return F[0];
    if (spec.cycle) {
      const step = dur, total = step * n, x = (t % total) / step, i = Math.floor(x);
      return mix(F[i % n], F[(i + 1) % n], spec.linear ? x - i : ease(x - i));
    }
    const seg = dur + hold, total = seg * 2, x = t % total;
    if (x < dur) return mix(F[0], F[1], ease(x / dur));
    if (x < seg) return F[1];
    if (x < seg + dur) return mix(F[1], F[0], ease((x - seg) / dur));
    return F[0];
  }
  const reduce = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const running = new Set();
  let raf = 0;
  function tick(now) {
    raf = 0;
    running.forEach(r => {
      if (!r.svg.isConnected) { running.delete(r); return; }
      r.g.innerHTML = frameSVG(r.spec, poseAt(r.spec, now - r.t0));
    });
    if (running.size && !document.hidden) raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && running.size && !raf) raf = requestAnimationFrame(tick); });
  function svgOpen(cls) { return '<svg class="fig' + (cls ? ' ' + cls : '') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-hidden="true"><g>'; }
  // Image fixe (listes) : la position « effort » de l'exercice
  function still(spec, i) {
    if (!spec) return '';
    const F = spec.frames;
    return svgOpen('still') + frameSVG(spec, F[i == null ? Math.min(1, F.length - 1) : i]) + '</g></svg>';
  }
  // Animation dans un conteneur
  function play(el, spec) {
    if (!el || !spec) return;
    el.innerHTML = svgOpen() + '</g></svg>';
    const svg = el.firstChild, g = svg.firstChild;
    if (reduce) { g.innerHTML = frameSVG(spec, spec.frames[Math.min(1, spec.frames.length - 1)]); return; }
    running.add({ svg, g, spec, t0: performance.now() });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  /* ================= Mouvements ================= */
  const X = 120;
  const stand = (o) => Object.assign({ hip: [X, AY - 55], t: 180, a1: [4, 4], l1: { to: [X + 2, AY], s: 1 } }, o || {});
  const feet = (x, x2) => ({ l1: { to: [x, AY], s: 1 }, l2: { to: [x2 == null ? x : x2, AY], s: 1 } });
  const T = {};
  // ----- Pompes -----
  T.pushup = o => {
    o = o || {};
    const toe = o.decline ? [52, 106] : o.incline ? [70, FL - 1] : [44, FL - 1], hand = o.incline ? [150, 107] : o.decline ? [146, FL - 3] : [133, FL - 3];
    const props = o.incline ? [{ type: 'bench', x: 158, y: 110, w: 40 }] : o.decline ? [{ type: 'bench', x: 48, y: 109, w: 36 }] : [{ type: 'mat', x: 30, w: 150 }];
    const up = o.incline ? { hip: [112, 101], t: 138 } : o.decline ? { hip: [109, 104], t: 88 } : { hip: [98, 118], t: 110 };
    const dn = o.incline ? { hip: [116, 110], t: 120 } : o.decline ? { hip: [110, 113], t: 74 } : { hip: [101, 131], t: 97 };
    const L1 = { to: [toe[0] + 3, toe[1] - 4], s: 1, ft: 15 };
    const arm = { to: hand, s: -1 };
    return { props, dur: o.fast ? 560 : 900, hold: o.fast ? 120 : 250, frames: [Object.assign({ a1: arm, l1: L1 }, up), Object.assign({ a1: arm, l1: L1 }, dn)] };
  };
  T.plank = () => ({ props: [{ type: 'mat', x: 30, w: 150 }], dur: 1600, hold: 600, frames: [
    { hip: [100, 126], t: 98, a1: { to: [150, FL - 2], s: -1 }, l1: { to: [47, FL - 5], s: 1, ft: 15 } },
    { hip: [100, 124], t: 98.5, a1: { to: [150, FL - 2], s: -1 }, l1: { to: [47, FL - 5], s: 1, ft: 15 } }] });
  T.climber = () => ({ props: [{ type: 'mat', x: 30, w: 150 }], dur: 380, hold: 60, frames: [
    { hip: [104, 117], t: 104, a1: { to: [146, FL - 3], s: -1 }, l1: { to: [118, AY - 6], s: -1, ft: 30 }, l2: { to: [52, FL - 5], s: 1, ft: 15 } },
    { hip: [104, 117], t: 104, a1: { to: [146, FL - 3], s: -1 }, l1: { to: [52, FL - 5], s: 1, ft: 15 }, l2: { to: [118, AY - 6], s: -1, ft: 30 } }] });
  T.hspu = () => ({ props: [{ type: 'wall', x: 62 }], dur: 1100, frames: [
    { hip: [86, 63], t: 2, hd: 0, a1: { to: [92, FL - 3], s: 1 }, l1: [175, 178, 260], l2: [178, 180, 262] },
    { hip: [86, 76], t: 4, a1: { to: [92, FL - 3], s: 1 }, l1: [175, 178, 260], l2: [178, 180, 262] }] });
  // ----- Développé couché -----
  T.bench = o => {
    o = o || {};
    const floor = o.floor, inc = o.incline;
    const hip = floor ? [92, FL - 8] : inc ? [90, 106] : [92, 104];
    const t = inc ? 125 : 90, torsoEnd = go(hip, t, L.T - 3);
    const props = floor ? [{ type: 'mat', x: 34, w: 170 }] : inc ? [{ type: 'bench', x: 106, y: 98, w: 70, a: 35 }] : [{ type: 'bench', x: 112, y: 111, w: 84 }];
    const legs = floor ? { l1: { to: [62, AY], s: -1, ft: 92 } } : { l1: { to: inc ? [64, AY] : [58, AY], s: -1 } };
    const top = [torsoEnd[0] + (inc ? 4 : 0), torsoEnd[1] - 38], low = [torsoEnd[0] - 4, torsoEnd[1] - (floor ? 4 : 2)];
    const w = o.w === 'bb' ? [{ type: 'plate' }] : o.w === 'kb' ? [{ type: 'kb', up: true }] : [{ type: 'db', both: true }];
    return { props: props.concat(w), dur: 1000, frames: [
      Object.assign({ hip, t, a1: { to: top, s: 1 } }, legs), Object.assign({ hip, t, a1: { to: low, s: floor ? -1 : 1 } }, legs)] };
  };
  T.chestpress = () => ({ props: [{ type: 'seat', x: 104, y: 112, w: 30, back: 186 }, { type: 'handles' }], dur: 1000, frames: [
    { hip: [100, 106], t: 184, a1: { to: [124, 72], s: -1 }, l1: { to: [130, AY], s: 1 } },
    { hip: [100, 106], t: 184, a1: { to: [158, 74], s: -1 }, l1: { to: [130, AY], s: 1 } }] });
  T.dips = () => ({ props: [{ type: 'dipbars', x: 120, y: 80 }], dur: 1000, frames: [
    { hip: [116, 98], t: 192, a1: { to: [121, 79], s: 1 }, l1: [-8, -118, -30] },
    { hip: [114, 118], t: 200, a1: { to: [121, 79], s: 1 }, l1: [-8, -118, -30] }] });
  T.benchdip = () => ({ props: [{ type: 'bench', x: 82, y: 100, w: 44 }], dur: 1000, frames: [
    { hip: [96, 84], t: 182, a1: { to: [92, 98], s: -1 }, l1: { to: [160, AY], s: 1, ft: 100 } },
    { hip: [99, 106], t: 184, a1: { to: [92, 98], s: -1 }, l1: { to: [160, AY], s: 1, ft: 100 } }] });
  // ----- Écartés -----
  T.flylying = o => {
    const inc = o && o.incline, hip = inc ? [90, 106] : [92, 104], t = inc ? 125 : 90;
    const bench = inc ? { type: 'bench', x: 106, y: 98, w: 70, a: 35 } : { type: 'bench', x: 112, y: 111, w: 84 };
    const legs = { l1: { to: inc ? [64, AY] : [58, AY], s: -1 } };
    return { props: [bench, { type: 'db', both: true }], dur: 1100, frames: [
      Object.assign({ hip, t, a1: [176, 182] }, legs),
      Object.assign({ hip, t, a1: [214, 226], a2: [140, 128] }, legs)] };
  };
  T.flystand = o => {
    const band = o && o.band;
    const low = o && o.low, py = low ? 140 : 40;
    const p = band ? [{ type: 'band', from: [40, 66], to: 'h1', behind: true }] : [{ type: 'column', x: 34, py }, { type: 'cable', px: 34, py }];
    if (low) return { props: p, dur: 1100, frames: [
      Object.assign(stand({ t: 178 }), { a1: [-40, -30], a2: [-40, -30] }, feet(118, 128)),
      Object.assign(stand({ t: 176 }), { a1: [120, 140], a2: [120, 140] }, feet(118, 128))] };
    return { props: p, dur: 1100, frames: [
      Object.assign(stand({ t: 178 }), { a1: [-60, -40], a2: [-60, -40] }, feet(118, 128)),
      Object.assign(stand({ t: 174 }), { a1: [70, 96], a2: [70, 96] }, feet(118, 128))] };
  };
  // ----- Épaules -----
  T.ohp = o => {
    o = o || {};
    const seated = o.seated;
    const hip = seated ? [112, 104] : [X, AY - 55];
    const legs = seated ? { l1: { to: [146, AY], s: 1 } } : feet(X + 2);
    const props = seated ? [{ type: 'seat', x: 114, y: 110, w: 28, back: 182 }] : [];
    const sh = go(hip, 180, L.T - 3);
    const w = o.w === 'bb' ? [{ type: 'plate' }] : o.w === 'kb' ? [{ type: 'kb', both: true, up: true }] : o.w === 'band' ? [{ type: 'band', from: 'an1', to: 'h1' }] : o.w === 'machine' ? [{ type: 'handles' }] : [{ type: 'db', both: true }];
    return { props: props.concat(w), dur: 1000, frames: [
      Object.assign({ hip, t: 180, a1: { to: [sh[0] + 9, sh[1] - 2], s: -1 } }, legs),
      Object.assign({ hip, t: 180, a1: { to: [sh[0] + 3, sh[1] - 38], s: -1 } }, legs)] };
  };
  T.lateral = o => {
    o = o || {};
    const p = o.w === 'band' ? [{ type: 'band', from: [X + 8, AY + 2], to: 'hR' }, { type: 'band', from: [X - 8, AY + 2], to: 'hL' }]
      : o.w === 'cable' ? [{ type: 'column', x: 196, py: 140 }, { type: 'cable', px: 196, py: 140, to: 'hL' }] : [{ type: 'db', at: 'hR' }];
    const one = o.w === 'cable';
    return { front: true, props: p, dur: 1000, frames: [
      { hip: [X, AY - 55], t: 180, aR: one ? [8, 6] : [8, 6], aL: one ? [-14, -10] : [8, 6], lR: [3, 3], lL: [3, 3] },
      { hip: [X, AY - 55], t: 180, aR: one ? [8, 6] : [84, 90], aL: one ? [84, 90] : [84, 90], lR: [3, 3], lL: [3, 3] }] };
  };
  T.upright = () => ({ front: true, props: [{ type: 'band', from: [X + 6, AY + 2], to: 'hR' }, { type: 'band', from: [X - 6, AY + 2], to: 'hL' }], dur: 1000, frames: [
    { hip: [X, AY - 55], t: 180, aR: [6, -6], aL: [6, -6], lR: [3, 3], lL: [3, 3] },
    { hip: [X, AY - 55], t: 180, aR: [100, 200], aL: [100, 200], lR: [3, 3], lL: [3, 3] }] });
  T.pullapart = () => ({ front: true, props: [{ type: 'band', from: 'hL', to: 'hR' }], dur: 1000, frames: [
    { hip: [X, AY - 55], t: 180, aR: [150, 160], aL: [150, 160], lR: [3, 3], lL: [3, 3] },
    { hip: [X, AY - 55], t: 180, aR: [92, 92], aL: [92, 92], lR: [3, 3], lL: [3, 3] }] });
  T.facepull = o => ({ props: o && o.band ? [{ type: 'band', from: [212, 50], to: 'h1' }] : [{ type: 'column', x: 206, py: 50 }, { type: 'cable', px: 206, py: 50 }], dur: 1000, frames: [
    Object.assign(stand({ hip: [112, AY - 55], t: 176 }), { a1: [104, 96] }, feet(108, 122)),
    Object.assign(stand({ hip: [112, AY - 55], t: 182 }), { a1: [118, 230] }, feet(108, 122))] });
  T.reversefly = () => ({ props: [{ type: 'seat', x: 110, y: 112, w: 28 }, { type: 'db', both: true }], dur: 1000, frames: [
    { hip: [104, 106], t: 122, a1: [10, 6], l1: { to: [140, AY], s: 1 } },
    { hip: [104, 106], t: 122, a1: [-58, -66], l1: { to: [140, AY], s: 1 } }] });
  // ----- Tractions / tirages -----
  T.pullup = o => {
    o = o || {};
    const p = [{ type: 'bar', x: 120, y: 8 }].concat(o.band ? [{ type: 'band', from: [118, 8], to: 'an1' }] : []);
    const top = o.scap ? 86 : 66;
    return { props: p, dur: o.slow ? 2200 : 1100, hold: o.slow ? 150 : 250, frames: [
      { hip: [120, 92], t: 178, a1: { to: [121, 9], s: 1 }, l1: [8, -10, 40], l2: [14, -6, 46] },
      { hip: [120, top], t: o.scap ? 178 : 176, a1: { to: [121, 9], s: 1 }, l1: [10, -12, 40], l2: [16, -8, 46] }] };
  };
  T.pulldown = o => ({ props: o && o.band ? [{ type: 'seat', x: 118, y: 112, w: 30 }, { type: 'band', from: [126, 2], to: 'h1' }] : [{ type: 'seat', x: 118, y: 112, w: 30 }, { type: 'column', x: 60, py: 10 }, { type: 'cable', px: 120, py: 6 }], dur: 1100, frames: [
    { hip: [116, 104], t: 174, a1: { to: [128, 14], s: 1 }, l1: { to: [150, AY], s: 1 } },
    { hip: [116, 104], t: 168, a1: { to: [134, 64], s: 1 }, l1: { to: [150, AY], s: 1 } }] });
  T.rowbench = () => ({ props: [{ type: 'bench', x: 132, y: 104, w: 70 }, { type: 'db' }], farHidden: true, dur: 1000, frames: [
    { hip: [106, 92], t: 96, a1: { to: [128, 132], s: -1 }, a2: { to: [156, 101], s: -1 }, l1: { to: [104, AY], s: 1 }, l2: { to: [128, 100], s: 1, ft: -90 } },
    { hip: [106, 92], t: 98, a1: { to: [112, 104], s: 1 }, a2: { to: [156, 101], s: -1 }, l1: { to: [104, AY], s: 1 }, l2: { to: [128, 100], s: 1, ft: -90 } }] });
  T.rowbent = o => {
    o = o || {};
    const w = o.w === 'bb' ? [{ type: 'plate' }] : o.w === 'kb' ? [{ type: 'kb' }] : [{ type: 'db', both: true }];
    return { props: w, dur: 1000, frames: [
      Object.assign({ hip: [104, 98], t: 128, a1: { to: [124, 132], s: 1 } }, feet(122)),
      Object.assign({ hip: [104, 98], t: 130, a1: { to: [112, 102], s: 1 } }, feet(122))] };
  };
  T.rowseated = o => ({ props: o && o.band ? [{ type: 'mat', x: 60, w: 130 }, { type: 'band', from: 'to1', to: 'h1', bow: -6 }] : [{ type: 'column', x: 214, py: 118 }, { type: 'cable', px: 214, py: 118 }, { type: 'mat', x: 60, w: 130 }], dur: 1100, frames: [
    { hip: [92, FL - 8], t: 160, a1: { to: [168, 120], s: 1 }, l1: { to: [172, AY - 4], s: -1, ft: 170 } },
    { hip: [92, FL - 8], t: 176, a1: { to: [114, 112], s: 1 }, l1: { to: [172, AY - 4], s: -1, ft: 170 } }] });
  T.invrow = () => ({ props: [{ type: 'table', x: 150, y: 82, w: 70 }], dur: 1100, frames: [
    { hip: [100, 128], t: 98, hd: -6, a1: { to: [148, 83], s: 1 }, l1: { to: [46, AY - 2], s: -1, ft: 150 } },
    { hip: [100, 112], t: 104, hd: -6, a1: { to: [148, 83], s: 1 }, l1: { to: [46, AY - 2], s: -1, ft: 150 } }] });
  // ----- Squats -----
  T.squat = o => {
    o = o || {};
    const up = { hip: [X - 2, AY - 54.5], t: 180 }, dn = { hip: [X - 24, AY - 30], t: 146 };
    const LG = feet(X + 2, X + 4);
    let a0, w = [];
    if (o.w === 'bb') w = [{ type: 'plate', at: 'h1' }];
    if (o.w === 'goblet' || o.w === 'kb') { w = o.w === 'kb' ? [{ type: 'kb', both: true, up: true }] : [{ type: 'db' }]; }
    if (o.w === 'db') w = [{ type: 'db', both: true }];
    const F = [Object.assign({}, up, LG), Object.assign({}, dn, LG)];
    const shUp = go(up.hip, 180, L.T - 3), shDn = go(dn.hip, 146, L.T - 3);
    if (o.w === 'bb') { F[0].a1 = { to: [shUp[0] + 6, shUp[1] - 2], s: -1 }; F[1].a1 = { to: [shDn[0] + 7, shDn[1] - 4], s: -1 }; }
    else if (o.w === 'goblet' || o.w === 'kb') { F[0].a1 = { to: [shUp[0] + 14, shUp[1] + 14], s: -1 }; F[1].a1 = { to: [shDn[0] + 16, shDn[1] + 14], s: -1 }; }
    else if (o.w === 'db') { F[0].a1 = [2, 2]; F[1].a1 = [-8, 8]; }
    else { F[0].a1 = [92, 92]; F[1].a1 = [118, 112]; }
    if (o.box) w = w.concat([{ type: 'box', x: 80, y: 124, w: 30 }]);
    return { props: w, dur: 1100, frames: F };
  };
  T.jumpsquat = () => {
    const S = T.squat();
    return { dur: 520, hold: 80, cycle: true, frames: [S.frames[1], Object.assign({}, S.frames[0], { a1: [160, 170] }),
      { hip: [X - 2, AY - 78], t: 180, a1: [170, 178], l1: [4, 2, 130], l2: [2, 0, 128] }, Object.assign({}, S.frames[0], { a1: [120, 120] })] };
  };
  T.tuckjump = () => ({ dur: 480, cycle: true, frames: [
    { hip: [X - 12, AY - 44], t: 162, a1: [-30, -20], l1: { to: [X + 2, AY], s: 1 } },
    { hip: [X - 2, AY - 80], t: 176, a1: [150, 160], l1: [8, 4, 120] },
    { hip: [X - 2, AY - 90], t: 170, a1: [90, 40], l1: [110, -10, 60] },
    { hip: [X - 2, AY - 70], t: 178, a1: [120, 120], l1: [6, 2, 115] }] });
  T.legpress = o => o && o.calf ? { props: [{ type: 'seat', x: 76, y: 118, w: 40, back: 228 }, { type: 'platform', at: 'to1', a: 40 }], dur: 800, hold: 300, frames: [
    { hip: [78, 112], t: 228, a1: [10, 60], l1: { to: [156, 72], s: -1, ft: 128 } },
    { hip: [78, 112], t: 228, a1: [10, 60], l1: { to: [156, 72], s: -1, ft: 162 } }] } : { props: [{ type: 'seat', x: 76, y: 118, w: 40, back: 228 }, { type: 'platform', at: 'an1', a: 40 }], dur: 1100, frames: [
    { hip: [78, 112], t: 228, a1: [10, 60], l1: { to: [160, 70], s: -1, ft: 130 } },
    { hip: [78, 112], t: 228, a1: [10, 60], l1: { to: [128, 84], s: -1, ft: 130 } }] };
  // ----- Charnière de hanche -----
  T.rdl = o => {
    o = o || {};
    if (o.w === 'gm') {
      const h0 = [X - 2, AY - 54], h1 = [X - 20, AY - 52], s0 = go(h0, 180, L.T - 3), s1 = go(h1, 100, L.T - 3);
      return { props: [{ type: 'plate' }], dur: 1200, frames: [
        Object.assign({ hip: h0, t: 180, a1: { to: [s0[0] - 2, s0[1] - 3], s: -1 } }, feet(X + 2)),
        Object.assign({ hip: h1, t: 100, a1: { to: [s1[0] + 1, s1[1] - 4], s: -1 } }, feet(X + 2))] };
    }
    const w = o.w === 'bb' ? [{ type: 'plate' }] : o.w === 'kb' ? [{ type: 'kb' }] : o.w === 'band' ? [{ type: 'band', from: [X - 46, AY - 2], to: 'h1' }]
      : o.w === 'cable' ? [{ type: 'column', x: 30, py: 136 }, { type: 'cable', px: 30, py: 136 }] : [{ type: 'db', both: true }];
    const pt = o.w === 'band' || o.w === 'cable';
    return { props: w, dur: 1200, frames: [
      Object.assign({ hip: [X - 2, AY - 54], t: 180, a1: pt ? [2, -2] : [6, 4] }, feet(X + 2, X + 8)),
      Object.assign({ hip: [X - 22, AY - 50], t: 110, a1: pt ? [-14, -18] : [-6, -4] }, feet(X + 2, X + 8))] };
  };
  T.deadlift = o => ({ props: [o && o.w === 'kb' ? { type: 'kb' } : { type: 'plate' }], dur: 1200, frames: [
    Object.assign({ hip: [X - 22, AY - 36], t: 132, a1: { to: [X + 6, FL - 12], s: 1 } }, feet(X + 2)),
    Object.assign({ hip: [X - 2, AY - 54], t: 180, a1: [6, 4] }, feet(X + 2))] });
  T.swing = () => ({ props: [{ type: 'kb' }], dur: 700, hold: 120, frames: [
    Object.assign({ hip: [X - 24, AY - 44], t: 128, a1: [-30, -34] }, feet(X + 2, X + 6)),
    Object.assign({ hip: [X - 2, AY - 54], t: 182, a1: [92, 94] }, feet(X + 2, X + 6))] });
  T.hyper = () => ({ props: [{ type: 'bench', x: 116, y: 102, w: 40, a: 30 }], dur: 1100, frames: [
    { hip: [114, 90], t: 34, hd: 0, a1: [30, 40], l1: { to: [64, 118], s: 1, ft: -120 } },
    { hip: [114, 90], t: 112, a1: [70, 60], l1: { to: [64, 118], s: 1, ft: -120 } }] });
  T.superman = o => ({ props: [{ type: 'mat', x: 30, w: 170 }], dur: 1100, hold: 500, frames: [
    { hip: [100, FL - 7], t: 90, a1: [90, 90], l1: [-90, -90, -170] },
    o && o.arms ? { hip: [100, FL - 7], t: 93, a1: [110, 112], l1: [-90, -90, -170] } : { hip: [100, FL - 7], t: 100, a1: [104, 106], l1: [-100, -102, -170] }] });
  T.sldl = o => ({ props: o && o.nw ? [] : [{ type: 'kb' }], farHidden: false, dur: 1300, frames: [
    { hip: [X - 2, AY - 54], t: 180, a1: [4, 2], l1: { to: [X + 2, AY], s: 1 }, l2: [-10, -14, 70] },
    { hip: [X - 8, AY - 52], t: 98, a1: [2, 2], l1: { to: [X + 2, AY], s: 1 }, l2: [-80, -84, -10] }] });
  // ----- Fentes -----
  T.lunge = o => {
    o = o || {};
    const bb = o.w === 'bb', w = bb ? [{ type: 'plate' }] : o.w ? [{ type: 'db', both: true }] : [];
    const front = X + 26, back = X - 38, h0 = [X - 4, AY - 54], h1 = [X - 6, AY - 32];
    const arm = h => bb ? (sh => ({ to: [sh[0] + 6, sh[1] - 2], s: -1 }))(go(h, 180, L.T - 3)) : o.w ? [2, 2] : [-6, -4];
    return { props: w, dur: 1100, frames: [
      Object.assign({ hip: h0, t: 180, a1: arm(h0) }, { l1: { to: [X, AY], s: 1 }, l2: { to: [X - 4, AY], s: 1 } }),
      Object.assign({ hip: h1, t: 180, a1: arm(h1) }, { l1: { to: [front, AY], s: 1 }, l2: { to: [back, FL - 5], s: 1, ft: 40 } })] };
  };
  T.bulgarian = () => ({ props: [{ type: 'bench', x: 62, y: 112, w: 36 }], dur: 1100, frames: [
    { hip: [X - 8, AY - 53], t: 182, a1: [-4, -2], l1: { to: [X + 10, AY], s: 1 }, l2: { to: [70, 104], s: 1, ft: -60 } },
    { hip: [X - 14, AY - 32], t: 176, a1: [-4, -2], l1: { to: [X + 10, AY], s: 1 }, l2: { to: [70, 104], s: 1, ft: -60 } }] });
  T.stepup = o => ({ props: [{ type: 'box', x: 118, y: 118, w: 54 }].concat(o && o.nw ? [] : [{ type: 'db', both: true }]), dur: 1200, frames: [
    { hip: [104, AY - 50], t: 178, a1: [2, 2], l1: { to: [132, 114], s: 1 }, l2: { to: [96, AY], s: 1 } },
    { hip: [130, 114 - 54], t: 180, a1: [2, 2], l1: { to: [132, 114], s: 1 }, l2: { to: [138, 114], s: 1 } }] });
  // ----- Fessiers -----
  T.bridge = o => {
    o = o || {};
    return { props: [{ type: 'mat', x: 30, w: 170 }], dur: 1000, hold: 400, frames: [
      Object.assign({ hip: [104, FL - 8], t: -90, hd: 0, a1: [92, 92], l1: { to: [140, AY], s: 1, ft: 90 } }, o.single ? { l2: [150, 150, 240] } : {}),
      Object.assign({ hip: [106, FL - 30], t: -64, a1: [94, 94], l1: { to: [140, AY], s: 1, ft: 90 } }, o.single ? { l2: [116, 116, 206] } : {})] };
  };
  T.hipthrust = o => {
    o = o || {};
    const w = o.single ? [] : o.w === 'db' ? [{ type: 'db', at: 'hip' }] : [{ type: 'plate', at: 'hip' }];
    const L2 = o.single ? { l2: [80, 82, 172] } : {};
    const a0 = o.single ? [-60, -100] : { to: [92, FL - 22], s: 1 }, a1 = o.single ? [-66, -106] : { to: [96, 104], s: 1 };
    return { props: [{ type: 'bench', x: 56, y: 112, w: 40 }].concat(w), dur: 1000, hold: 300, frames: [
      Object.assign({ hip: [92, FL - 16], t: -110, a1: a0, l1: { to: [140, AY], s: 1 } }, L2),
      Object.assign({ hip: [96, 108], t: -86, a1, l1: { to: [140, AY], s: 1 } }, L2)] };
  };
  T.kickquad = () => ({ props: [{ type: 'mat', x: 40, w: 160 }], dur: 1000, frames: [
    { hip: [96, 112], t: 92, a1: { to: [138, FL - 3], s: -1 }, l1: { to: [98, FL - 6], s: -1, ft: -90 }, l2: { to: [100, FL - 6], s: -1, ft: -90 } },
    { hip: [96, 112], t: 94, a1: { to: [138, FL - 3], s: -1 }, l1: [-120, 170, 100], l2: { to: [100, FL - 6], s: -1, ft: -90 } }] });
  T.kickcable = () => ({ props: [{ type: 'column', x: 210, py: 140 }, { type: 'cable', px: 210, py: 140, to: 'an1' }], dur: 1000, frames: [
    { hip: [130, AY - 54], t: 170, a1: { to: [166, 88], s: -1 }, l1: [6, 4], l2: { to: [128, AY], s: 1 } },
    { hip: [130, AY - 54], t: 166, a1: { to: [166, 88], s: -1 }, l1: [-40, -30, 50], l2: { to: [128, AY], s: 1 } }] });
  // ----- Machines jambes -----
  T.legext = o => ({ props: [{ type: 'seat', x: 100, y: 112, w: 36, back: 180 }, o && o.band ? { type: 'band', from: [110, FL - 2], to: 'an1' } : { type: 'pad', at: 'an1' }], dur: 1000, frames: [
    { hip: [96, 104], t: 180, a1: [10, 30], l1: [90, 4, 90] },
    { hip: [96, 104], t: 180, a1: [10, 30], l1: [88, 82, 170] }] });
  T.legcurllying = o => o && o.band ? { props: [{ type: 'mat', x: 20, w: 190 }, { type: 'band', from: [14, FL - 8], to: 'an1' }], dur: 1000, frames: [
    { hip: [104, FL - 8], t: 92, hd: 0, a1: [80, 140], l1: [-90, -90, -170] },
    { hip: [104, FL - 8], t: 92, a1: [80, 140], l1: [-90, 172, -100] }] } : { props: [{ type: 'bench', x: 110, y: 120, w: 110 }, { type: 'pad', at: 'an1' }], dur: 1000, frames: [
    { hip: [114, 112], t: 92, hd: 0, a1: [30, 70], l1: [-92, -92, -170] },
    { hip: [114, 112], t: 92, a1: [30, 70], l1: [-92, 170, -100] }] };
  T.legcurlseated = () => ({ props: [{ type: 'seat', x: 100, y: 112, w: 36, back: 180 }, { type: 'pad', at: 'an1' }], dur: 1000, frames: [
    { hip: [96, 104], t: 180, a1: [10, 30], l1: [90, 86, 170] },
    { hip: [96, 104], t: 180, a1: [10, 30], l1: [90, -10, 80] }] });
  T.ballcurl = () => ({ props: [{ type: 'mat', x: 20, w: 190 }, { type: 'ball', at: 'an1', dy: 11, r: 11 }], dur: 1100, frames: [
    { hip: [100, FL - 26], t: -84, a1: [96, 96], l1: { to: [154, 122], s: 1, ft: 180 } },
    { hip: [104, FL - 40], t: -70, a1: [100, 100], l1: { to: [130, 124], s: 1, ft: 160 } }] });
  T.calf = o => {
    o = o || {};
    return { props: [{ type: 'box', x: X - 6, y: FL - 10, w: 30 }].concat(o.w ? [{ type: 'db', both: true }] : []), dur: 800, hold: 300, frames: [
      Object.assign({ hip: [X - 2, AY - 64], t: 180, a1: [2, 2] }, { l1: { to: [X + 2, AY - 9], s: 1, ft: 95 } }),
      Object.assign({ hip: [X - 2, AY - 72], t: 180, a1: [2, 2] }, { l1: { to: [X + 2, AY - 17], s: 1, ft: 40 } })] };
  };
  T.calfseated = () => ({ props: [{ type: 'seat', x: 100, y: 112, w: 36 }, { type: 'pad', at: 'k1' }], dur: 800, hold: 300, frames: [
    { hip: [96, 104], t: 180, a1: [40, 120], l1: { to: [124, AY], s: 1, ft: 90 } },
    { hip: [96, 104], t: 180, a1: [40, 120], l1: { to: [124, AY - 8], s: 1, ft: 45 } }] });
  // ----- Bras -----
  T.curl = o => {
    o = o || {};
    const w = o.w === 'bb' ? [{ type: 'plate' }] : o.w === 'band' ? [{ type: 'band', from: 'an1', to: 'h1' }] : o.w === 'cable' ? [{ type: 'column', x: 198, py: 140 }, { type: 'cable', px: 198, py: 140 }] : [{ type: 'db', both: true }];
    return { props: w, dur: 900, frames: [
      Object.assign(stand(), { a1: [2, 4] }, feet(X + 2)),
      Object.assign(stand(), { a1: [8, 158] }, feet(X + 2))] };
  };
  T.pushdown = o => ({ props: o && o.band ? [{ type: 'band', from: [166, 6], to: 'h1' }] : [{ type: 'column', x: 166, py: 18 }, { type: 'cable', px: 166, py: 18 }], dur: 900, frames: [
    Object.assign(stand({ t: 172 }), { a1: [10, 120] }, feet(X + 2)),
    Object.assign(stand({ t: 172 }), { a1: [10, 6] }, feet(X + 2))] });
  T.trikick = o => ({ props: o && o.w === 'cable' ? [{ type: 'column', x: 214, py: 140 }, { type: 'cable', px: 214, py: 140 }] : [{ type: 'db' }], dur: 900, frames: [
    Object.assign({ hip: [104, 98], t: 120, a1: [-70, 4] }, feet(124)),
    Object.assign({ hip: [104, 98], t: 120, a1: [-70, -66] }, feet(124))] });
  T.trioverhead = o => {
    o = o || {};
    const w = o.w === 'band' ? [{ type: 'band', from: [70, 26], to: 'h1' }] : o.w === 'cable' ? [{ type: 'column', x: 40, py: 120 }, { type: 'cable', px: 40, py: 120 }] : [{ type: 'db' }];
    return { props: w, dur: 1000, frames: [
      Object.assign(stand(), { a1: [190, 340] }, feet(X + 2)),
      Object.assign(stand(), { a1: [184, 182] }, feet(X + 2))] };
  };
  // ----- Abdos -----
  T.crunch = o => o && o.full ? { props: [{ type: 'mat', x: 30, w: 170 }], dur: 1100, hold: 300, frames: [
    { hip: [104, FL - 8], t: -92, a1: [-150, 40], l1: { to: [146, AY], s: 1 } },
    { hip: [104, FL - 8], t: -166, a1: [-210, -60], l1: { to: [146, AY], s: 1 } }] } : { props: [{ type: 'mat', x: 30, w: 170 }], dur: 900, hold: 300, frames: [
    { hip: [104, FL - 8], t: -92, a1: [-150, 40], l1: { to: [146, AY], s: 1 } },
    { hip: [104, FL - 8], t: -124, a1: [-170, 20], l1: { to: [146, AY], s: 1 } }] };
  T.revcrunch = () => ({ props: [{ type: 'mat', x: 20, w: 180 }], dur: 1000, frames: [
    { hip: [116, FL - 8], t: -90, a1: [-90, -90], l1: [135, 10, 100] },
    { hip: [114, FL - 14], t: -84, a1: [-90, -90], l1: [170, 70, 170] }] });
  T.deadbug = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 1200, frames: [
    { hip: [124, FL - 8], t: -90, a1: [178, 178], l1: [168, 76, 160] },
    { hip: [124, FL - 8], t: -90, a1: [-112, -112], a2: [178, 178], l1: [98, 94, 180], l2: [168, 76, 160] }] });
  T.twist = () => ({ front: true, props: [{ type: 'mat', x: 50, w: 140 }], dur: 700, hold: 120, frames: [
    { hip: [X, FL - 8], t: 166, aR: { to: [X - 24, FL - 34], s: 1 }, aL: { to: [X - 20, FL - 30], s: -1 }, lR: [70, 160], lL: [70, 160] },
    { hip: [X, FL - 8], t: 194, aR: { to: [X + 20, FL - 30], s: 1 }, aL: { to: [X + 24, FL - 34], s: -1 }, lR: [70, 160], lL: [70, 160] }] });
  T.legraise = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 1100, frames: [
    { hip: [100, FL - 8], t: -91, a1: [94, 94], l1: [94, 94, 180] },
    { hip: [100, FL - 8], t: -91, a1: [94, 94], l1: [172, 172, 260] }] });
  T.hangraise = o => ({ props: [{ type: 'bar', x: 120, y: 8 }], dur: 1100, frames: [
    { hip: [120, 92], t: 180, a1: { to: [121, 9], s: 1 }, l1: [4, 0, 60] },
    o && o.straight ? { hip: [126, 88], t: 168, a1: { to: [121, 9], s: 1 }, l1: [92, 92, 182] } : { hip: [124, 90], t: 172, a1: { to: [121, 9], s: 1 }, l1: [100, 10, 100] }] });
  T.cablecrunch = () => ({ props: [{ type: 'column', x: 168, py: 14 }, { type: 'cable', px: 168, py: 14 }, { type: 'mat', x: 50, w: 140 }], dur: 1000, frames: [
    { hip: [100, FL - 34], t: 176, a1: { to: [128, 64], s: -1 }, l1: { to: [94, FL - 6], s: -1, ft: -90 } },
    { hip: [100, FL - 34], t: 116, a1: { to: [138, 108], s: -1 }, l1: { to: [94, FL - 6], s: -1, ft: -90 } }] });
  T.roller = () => ({ props: [{ type: 'mat', x: 30, w: 180 }, { type: 'roller' }], dur: 1400, frames: [
    { hip: [92, 114], t: 126, a1: { to: [112, FL - 9], s: 1 }, l1: { to: [66, FL - 6], s: -1, ft: -90 } },
    { hip: [104, 122], t: 104, a1: { to: [178, FL - 9], s: 1 }, l1: { to: [66, FL - 6], s: -1, ft: -90 } }] });
  // ----- Cardio -----
  T.jacks = () => ({ front: true, dur: 380, hold: 60, frames: [
    { hip: [X, AY - 55], t: 180, aR: [10, 6], aL: [10, 6], lR: [4, 2], lL: [4, 2] },
    { hip: [X, AY - 58], t: 180, aR: [160, 170], aL: [160, 170], lR: [20, 20], lL: [20, 20] }] });
  T.rope = () => ({ props: [{ type: 'rope' }], dur: 420, cycle: true, frames: [
    { hip: [X, AY - 55], t: 180, a1: [20, 60], l1: [4, 2, 110], rope: 0 },
    { hip: [X, AY - 62], t: 180, a1: [20, 60], l1: [6, 2, 125], rope: 1 },
    { hip: [X, AY - 55], t: 180, a1: [20, 60], l1: [4, 2, 110], rope: 0 }] });
  const runFrames = (y) => [
    { hip: [X, y], t: 172, a1: [-40, 40], a2: [40, 110], l1: [36, -20, 70], l2: [-24, -60, 30] },
    { hip: [X, y - 4], t: 172, a1: [0, 70], a2: [0, 70], l1: [10, -60, 30], l2: [0, -4, 90] },
    { hip: [X, y], t: 172, a1: [40, 110], a2: [-40, 40], l1: [-24, -60, 30], l2: [36, -20, 70] },
    { hip: [X, y - 4], t: 172, a1: [0, 70], a2: [0, 70], l1: [0, -4, 90], l2: [10, -60, 30] }];
  T.run = o => ({ props: o && o.tread ? [{ type: 'tread', x: 70, w: 110 }] : [], dur: o && o.fast ? 170 : 230, cycle: true, frames: runFrames(o && o.tread ? AY - 59 : AY - 52) });
  T.bike = () => ({ props: [{ type: 'bike', x: 100, y: 96 }], dur: 450, cycle: true, frames: [
    { hip: [100, 94], t: 158, a1: { to: [146, 72], s: -1 }, l1: { to: [118, 120], s: -1, ft: 100 }, l2: { to: [102, 136], s: -1, ft: 100 } },
    { hip: [100, 94], t: 158, a1: { to: [146, 72], s: -1 }, l1: { to: [102, 136], s: -1, ft: 100 }, l2: { to: [118, 120], s: -1, ft: 100 } }] });
  T.elliptical = () => ({ props: [{ type: 'ellip', x: 72, w: 100 }], dur: 700, cycle: true, frames: [
    { hip: [X, AY - 62], t: 178, a1: [40, 80], a2: [10, 60], l1: { to: [136, AY - 10], s: 1 }, l2: { to: [100, AY - 6], s: 1, ft: 80 } },
    { hip: [X, AY - 62], t: 178, a1: [10, 60], a2: [40, 80], l1: { to: [100, AY - 6], s: 1, ft: 80 }, l2: { to: [136, AY - 10], s: 1 } }] });
  T.stairs = () => ({ props: [{ type: 'stairs', x: 96 }], dur: 700, cycle: true, frames: [
    { hip: [116, 78], t: 176, a1: [10, 40], l1: { to: [130, 112], s: 1 }, l2: { to: [110, 124], s: 1 } },
    { hip: [116, 78], t: 176, a1: [-10, 30], l1: { to: [110, 124], s: 1 }, l2: { to: [130, 112], s: 1 } }] });

  /* ================= Mouvements ajoutés (version 3.1) ================= */
  const shoulderAt = (hip, t) => go(hip, t, L.T - 3);
  // ----- Poussée -----
  T.pushknee = () => {
    const ank = { to: [56, 128], s: 1, ft: -120 }, arm = { to: [133, FL - 3], s: -1 };
    return { props: [{ type: 'mat', x: 30, w: 150 }], dur: 900, frames: [
      { hip: [96, 124], t: 118, a1: arm, l1: ank }, { hip: [95, 130], t: 98, a1: arm, l1: ank }] };
  };
  T.pike = () => {
    const arm = { to: [146, FL - 3], s: -1 }, leg = { to: [78, AY], s: 1 };
    return { props: [{ type: 'mat', x: 40, w: 140 }], dur: 1000, frames: [
      { hip: [108, 80], t: 45, a1: arm, l1: leg }, { hip: [110, 88], t: 62, a1: arm, l1: leg }] };
  };
  T.standpress = o => {
    o = o || {};
    const p = o.cable ? [{ type: 'column', x: 34, py: 60 }, { type: 'cable', px: 34, py: 60 }] : [{ type: 'band', from: [36, 60], to: 'h1', behind: true }];
    const base = Object.assign(stand({ t: 178 }), feet(134, 106));
    return { props: p, dur: 1000, frames: [Object.assign({}, base, { a1: [-40, 92] }), Object.assign({}, base, { a1: [86, 90] })] };
  };
  T.flyseat = o => {
    o = o || {};
    const base = { hip: [100, 106], t: o.reverse ? 176 : 184, l1: { to: [134, AY], s: 1 } };
    const open = Object.assign({}, base, { a1: [-84, -62] }), shut = Object.assign({}, base, { a1: [82, 100] });
    return { props: [{ type: 'seat', x: 104, y: 112, w: 30, back: o.reverse ? null : 186 }, { type: 'handles' }], dur: 1100,
      frames: o.reverse ? [shut, open] : [open, shut] };
  };
  T.pullover = () => ({ props: [{ type: 'bench', x: 112, y: 111, w: 84 }, { type: 'db' }], dur: 1200, frames: [
    { hip: [92, 104], t: 90, a1: [178, 178], l1: { to: [58, AY], s: -1 } },
    { hip: [92, 104], t: 90, a1: [114, 106], l1: { to: [58, AY], s: -1 } }] });
  T.pushpress = () => {
    const up = { hip: [X - 2, AY - 54.5], t: 180 }, dip = { hip: [X - 6, AY - 48], t: 178 };
    const sh = shoulderAt(up.hip, 180), shd = shoulderAt(dip.hip, 178);
    return { props: [{ type: 'plate' }], dur: 600, cycle: true, frames: [
      Object.assign({}, up, feet(X + 2), { a1: { to: [sh[0] + 9, sh[1] - 2], s: -1 } }),
      Object.assign({}, dip, feet(X + 2), { a1: { to: [shd[0] + 9, shd[1] - 2], s: -1 } }),
      Object.assign({}, up, feet(X + 2), { a1: { to: [sh[0] + 3, sh[1] - 38], s: -1 } }),
      Object.assign({}, up, feet(X + 2), { a1: { to: [sh[0] + 3, sh[1] - 38], s: -1 } })] };
  };
  // ----- Épaules -----
  T.frontraise = o => {
    o = o || {};
    const w = o.w === 'band' ? [{ type: 'band', from: 'an1', to: 'h1' }] : [{ type: 'db', both: true }];
    return { props: w, dur: 1000, frames: [Object.assign(stand(), { a1: [6, 4] }, feet(X + 2)), Object.assign(stand(), { a1: [90, 92] }, feet(X + 2))] };
  };
  T.shrug = o => {
    o = o || {};
    const w = o.w === 'bb' ? [{ type: 'barh' }] : [{ type: 'db' }];
    const b = { hip: [X, AY - 55], t: 180, aR: [6, 4], aL: [6, 4], lR: [3, 3], lL: [3, 3] };
    return { front: true, props: w, dur: 700, hold: 500, frames: [Object.assign({ shy: 0 }, b), Object.assign({}, b, { shy: -6 })] };
  };
  // ----- Dos -----
  T.straightpull = () => ({ props: [{ type: 'column', x: 196, py: 16 }, { type: 'cable', px: 196, py: 16 }], dur: 1100, frames: [
    Object.assign(stand({ t: 170 }), { a1: [148, 150] }, feet(112)), Object.assign(stand({ t: 170 }), { a1: [12, 10] }, feet(112))] });
  T.rowsupported = () => {
    const base = { hip: [96, 112], t: 125, l1: { to: [62, AY], s: 1 } };
    return { props: [{ type: 'bench', x: 116, y: 110, w: 64, a: 35 }, { type: 'db', both: true }], dur: 1000, frames: [
      Object.assign({}, base, { a1: [2, 2] }), Object.assign({}, base, { a1: [-62, 6] })] };
  };
  T.machinerow = () => { const s = T.chestpress(); return { props: s.props, dur: s.dur, frames: [s.frames[1], s.frames[0]] }; };
  T.doorrow = () => ({ props: [{ type: 'box', x: 160, y: 4, w: 7 }], dur: 1100, frames: [
    { hip: [131, 92], t: 200, hd: -14, a1: { to: [159, 60], s: -1 }, l1: { to: [150, AY], s: 1 } },
    { hip: [142, 89.5], t: 188, hd: -6, a1: { to: [159, 60], s: -1 }, l1: { to: [150, AY], s: 1 } }] });
  T.renegade = () => {
    const legs = { l1: { to: [47, FL - 5], s: 1, ft: 15 } };
    return { props: [{ type: 'mat', x: 30, w: 150 }, { type: 'db', both: true }], dur: 1000, frames: [
      Object.assign({ hip: [98, 118], t: 110, a1: { to: [133, FL - 6], s: -1 }, a2: { to: [133, FL - 6], s: -1 } }, legs),
      Object.assign({ hip: [98, 118], t: 112, a1: { to: [110, 116], s: 1 }, a2: { to: [133, FL - 6], s: -1 } }, legs)] };
  };
  // ----- Jambes -----
  T.wallsit = () => ({ props: [{ type: 'wall', x: 66 }], dur: 1600, hold: 600, frames: [
    { hip: [82, 117], t: 180, a1: [40, 150], l1: { to: [110, AY], s: 1 } },
    { hip: [82, 118], t: 180, a1: [40, 152], l1: { to: [110, AY], s: 1 } }] });
  T.sidelunge = () => ({ front: true, dur: 1100, frames: [
    { hip: [X, AY - 55], t: 180, aR: [20, -110], aL: [20, -110], lR: { to: [X + 9, AY], s: -1 }, lL: { to: [X - 9, AY], s: 1 } },
    { hip: [X + 14, AY - 36], t: 180, aR: [20, -110], aL: [20, -110], lR: { to: [X + 40, AY], s: -1 }, lL: { to: [X - 22, AY], s: 1 } }] });
  T.jumplunge = () => {
    const front = X + 26, back = X - 38;
    const A1 = { hip: [X - 6, AY - 32], t: 180, a1: [-30, -10], a2: [30, 60], l1: { to: [front, AY], s: 1 }, l2: { to: [back, FL - 5], s: 1, ft: 40 } };
    const B1 = { hip: [X - 6, AY - 32], t: 180, a1: [30, 60], a2: [-30, -10], l1: { to: [back, FL - 5], s: 1, ft: 40 }, l2: { to: [front, AY], s: 1 } };
    const air = (k) => ({ hip: [X - 4, AY - 64], t: 180, a1: [0, 20], a2: [0, 20], l1: { to: [X + (k ? -10 : 14), AY - 10], s: 1 }, l2: { to: [X + (k ? 14 : -10), AY - 10], s: 1 } });
    return { dur: 420, cycle: true, frames: [A1, air(0), B1, air(1)] };
  };
  T.sidewalk = () => {
    const arms = { aR: [30, -120], aL: [30, -120] };
    return { front: true, props: [{ type: 'band', from: 'anL', to: 'anR' }], dur: 700, hold: 150, frames: [
      Object.assign({ hip: [X - 4, AY - 48], t: 178, lR: { to: [X + 10, AY], s: 1 }, lL: { to: [X - 16, AY], s: -1 } }, arms),
      Object.assign({ hip: [X + 4, AY - 47], t: 182, lR: { to: [X + 26, AY], s: 1 }, lL: { to: [X - 10, AY], s: -1 } }, arms)] };
  };
  T.nordic = () => ({ props: [{ type: 'mat', x: 40, w: 150 }, { type: 'pad', at: [84, FL - 10] }], dur: 1600, frames: [
    { hip: [110, 116], t: 180, a1: [40, 150], l1: { to: [84, FL - 5], s: 1, ft: -90 } },
    { hip: [124, 120], t: 150, a1: [70, 110], l1: { to: [84, FL - 5], s: 1, ft: -90 } }] });
  // ----- Bras -----
  T.curlconc = () => ({ props: [{ type: 'seat', x: 96, y: 112, w: 30 }, { type: 'db' }], dur: 1000, frames: [
    { hip: [96, 106], t: 152, a1: [6, 2], l1: { to: [140, AY], s: 1 } },
    { hip: [96, 106], t: 152, a1: [8, 150], l1: { to: [140, AY], s: 1 } }] });
  T.curlincline = () => ({ props: [{ type: 'seat', x: 108, y: 112, w: 30, back: 206 }, { type: 'db', both: true }], dur: 1000, frames: [
    { hip: [104, 106], t: 204, a1: [0, 0], l1: { to: [148, AY], s: 1 } },
    { hip: [104, 106], t: 204, a1: [2, 150], l1: { to: [148, AY], s: 1 } }] });
  T.preacher = () => ({ props: [{ type: 'seat', x: 96, y: 112, w: 30 }, { type: 'bench', x: 112, y: 88, w: 28, a: -40 }, { type: 'db' }], dur: 1000, frames: [
    { hip: [96, 106], t: 178, a1: [50, 52], l1: { to: [134, AY], s: 1 } },
    { hip: [96, 106], t: 178, a1: [50, 168], l1: { to: [134, AY], s: 1 } }] });
  T.skull = () => ({ props: [{ type: 'bench', x: 112, y: 111, w: 84 }, { type: 'plate' }], dur: 1000, frames: [
    { hip: [92, 104], t: 90, a1: [174, 178], l1: { to: [58, AY], s: -1 } },
    { hip: [92, 104], t: 90, a1: [166, 62], l1: { to: [58, AY], s: -1 } }] });
  // ----- Abdos -----
  T.sideplank = () => ({ props: [{ type: 'mat', x: 30, w: 150 }], dur: 1600, hold: 600, frames: [
    { hip: [98, 132], t: 104, a1: [2, 90], a2: [178, 180], l1: { to: [46, FL - 5], s: 1, ft: 15 } },
    { hip: [98, 130], t: 103, a1: [2, 90], a2: [178, 180], l1: { to: [46, FL - 5], s: 1, ft: 15 } }] });
  T.hollow = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 1600, hold: 600, frames: [
    { hip: [110, FL - 8], t: -102, a1: [-112, -116], l1: [100, 100, 190] },
    { hip: [110, FL - 8], t: -104, a1: [-114, -118], l1: [102, 102, 192] }] });
  T.bicycle = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 650, cycle: true, frames: [
    { hip: [110, FL - 8], t: -114, a1: [-150, 40], l1: [150, 40, 130], l2: [100, 100, 190] },
    { hip: [110, FL - 8], t: -114, a1: [-150, 40], l1: [100, 100, 190], l2: [150, 40, 130] }] });
  T.flutter = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 260, cycle: true, frames: [
    { hip: [110, FL - 8], t: -94, a1: [90, 92], l1: [104, 104, 194], l2: [94, 94, 184] },
    { hip: [110, FL - 8], t: -94, a1: [90, 92], l1: [94, 94, 184], l2: [104, 104, 194] }] });
  T.shouldertap = () => {
    const legs = { l1: { to: [44, FL - 5], s: 1, ft: 15 } }, hip = [98, 118], sh = shoulderAt(hip, 110);
    return { props: [{ type: 'mat', x: 30, w: 150 }], dur: 700, hold: 200, frames: [
      Object.assign({ hip, t: 110, a1: { to: [133, FL - 3], s: -1 }, a2: { to: [133, FL - 3], s: -1 } }, legs),
      Object.assign({ hip, t: 110, a1: { to: [sh[0] - 1, sh[1] + 6], s: 1 }, a2: { to: [133, FL - 3], s: -1 } }, legs)] };
  };
  T.birddog = () => {
    const knee = { to: [98, FL - 6], s: -1, ft: -90 };
    return { props: [{ type: 'mat', x: 40, w: 160 }], dur: 1200, hold: 500, frames: [
      { hip: [96, 112], t: 92, a1: { to: [138, FL - 3], s: -1 }, a2: { to: [138, FL - 3], s: -1 }, l1: knee, l2: knee },
      { hip: [96, 112], t: 92, a1: { to: [172, 104], s: -1 }, a2: { to: [138, FL - 3], s: -1 }, l1: { to: [44, 108], s: -1, ft: -170 }, l2: knee }] };
  };
  T.vup = () => ({ props: [{ type: 'mat', x: 20, w: 190 }], dur: 1000, frames: [
    { hip: [114, FL - 8], t: -92, a1: [-92, -92], l1: [92, 92, 182] },
    { hip: [114, FL - 8], t: -140, a1: [140, 140], l1: [140, 140, 230] }] });
  T.chop = () => ({ front: true, props: [{ type: 'column', x: 214, py: 22 }, { type: 'cable', px: 214, py: 22, to: 'hR' }], dur: 1100, frames: [
    { hip: [X, AY - 54], t: 178, aR: { to: [X + 30, 34], s: -1 }, aL: { to: [X + 26, 38], s: 1 }, lR: [10, 8], lL: [10, 8] },
    { hip: [X, AY - 52], t: 184, aR: { to: [X - 22, 100], s: 1 }, aL: { to: [X - 26, 104], s: -1 }, lR: [10, 8], lL: [10, 8] }] });
  // ----- Cardio -----
  const walkFrames = (y, a) => [
    { hip: [X, y], t: 176, a1: a || [-20, -10], a2: a || [20, 40], l1: [22, 4, 104], l2: [-18, -26, 64] },
    { hip: [X, y - 2], t: 176, a1: a || [0, 10], a2: a || [0, 10], l1: [2, -6, 90], l2: [6, -40, 54] },
    { hip: [X, y], t: 176, a1: a || [20, 40], a2: a || [-20, -10], l1: [-18, -26, 64], l2: [22, 4, 104] },
    { hip: [X, y - 2], t: 176, a1: a || [0, 10], a2: a || [0, 10], l1: [6, -40, 54], l2: [2, -6, 90] }];
  T.walk = o => ({ props: o && o.tread ? [{ type: 'tread', x: 70, w: 110 }] : [], dur: 380, cycle: true, frames: walkFrames(o && o.tread ? AY - 60 : AY - 53) });
  T.farmer = () => ({ props: [{ type: 'db', both: true }], dur: 420, cycle: true, frames: walkFrames(AY - 53, [2, 2]) });
  T.burpee = () => {
    const legsUp = feet(X + 2), hands = { to: [X + 26, FL - 3], s: -1 };
    return { dur: 520, cycle: true, frames: [
      Object.assign({ hip: [X - 2, AY - 55], t: 180, a1: [6, 4] }, legsUp),
      Object.assign({ hip: [X - 14, AY - 26], t: 140, a1: hands }, legsUp),
      { hip: [X - 22, 118], t: 106, a1: hands, l1: { to: [X - 74, FL - 5], s: 1, ft: 15 } },
      Object.assign({ hip: [X - 14, AY - 26], t: 140, a1: hands }, legsUp),
      { hip: [X - 2, AY - 74], t: 180, a1: [170, 176], l1: { to: [X + 2, AY - 18], s: 1 } }] };
  };
  T.highknees = () => ({ dur: 230, cycle: true, frames: [
    { hip: [X, AY - 57], t: 178, a1: [-40, 40], a2: [40, 110], l1: [92, 2, 92], l2: [0, 0, 90] },
    { hip: [X, AY - 55], t: 178, a1: [40, 110], a2: [-40, 40], l1: [0, 0, 90], l2: [92, 2, 92] }] });
  T.buttkicks = () => ({ dur: 230, cycle: true, frames: [
    { hip: [X, AY - 57], t: 178, a1: [-30, 50], a2: [30, 110], l1: [-8, -172, -100], l2: [0, 0, 90] },
    { hip: [X, AY - 55], t: 178, a1: [30, 110], a2: [-30, 50], l1: [0, 0, 90], l2: [-8, -172, -100] }] });
  T.skater = () => ({ front: true, dur: 520, hold: 80, frames: [
    { hip: [X + 22, AY - 44], t: 168, aR: [-40, -20], aL: [60, 50], lR: { to: [X + 34, AY], s: -1 }, lL: [-28, -12] },
    { hip: [X - 22, AY - 44], t: 192, aR: [60, 50], aL: [-40, -20], lR: [-28, -12], lL: { to: [X - 34, AY], s: 1 } }] });
  T.boxing = () => {
    const guard = [36, 168], base = Object.assign({ hip: [X - 6, AY - 53], t: 176 }, feet(X + 10, X - 14));
    return { dur: 260, cycle: true, frames: [
      Object.assign({}, base, { a1: guard, a2: guard }), Object.assign({}, base, { t: 172, a1: [88, 92], a2: guard }),
      Object.assign({}, base, { a1: guard, a2: guard }), Object.assign({}, base, { t: 172, a1: guard, a2: [88, 92] })] };
  };
  T.ropes = () => {
    const base = Object.assign({ hip: [X - 14, AY - 44], t: 164 }, feet(X + 4, X + 10));
    return { props: [{ type: 'ropes', ax: 228, ay: FL - 4 }], dur: 260, cycle: true, frames: [
      Object.assign({}, base, { a1: [60, 120], a2: [26, 60] }), Object.assign({}, base, { a1: [26, 60], a2: [60, 120] })] };
  };
  T.boxjump = () => ({ props: [{ type: 'box', x: 122, y: FL - 30, w: 42 }], dur: 520, cycle: true, frames: [
    { hip: [92, AY - 55], t: 180, a1: [4, 4], l1: { to: [94, AY], s: 1 } },
    { hip: [82, AY - 34], t: 146, a1: [-50, -40], l1: { to: [94, AY], s: 1 } },
    { hip: [112, AY - 86], t: 170, a1: [150, 160], l1: { to: [130, AY - 44], s: 1 } },
    { hip: [130, FL - 34 - 36], t: 150, a1: [60, 80], l1: { to: [144, FL - 34], s: 1 } },
    { hip: [140, FL - 34 - 55], t: 180, a1: [4, 4], l1: { to: [144, FL - 34], s: 1 } }] });
  T.rower = () => {
    const foot = { to: [158, FL - 14], s: 1, ft: 150 };
    return { props: [{ type: 'rail', x: 46, w: 170 }, { type: 'cable', px: 204, py: FL - 22 }], dur: 900, frames: [
      { hip: [126, FL - 18], t: 152, a1: { to: [176, 118], s: 1 }, l1: foot },
      { hip: [100, FL - 18], t: 196, a1: { to: [118, 112], s: 1 }, l1: foot }] };
  };

  // Exercice → mouvement + matériel
  const MAP = {
    'pushups': ['pushup'], 'incline-push-up': ['pushup', { incline: true }], 'decline-push-up': ['pushup', { decline: true }], 'push-ups-close-triceps-position': ['pushup'],
    'dumbbell-bench-press': ['bench', { w: 'db' }], 'dumbbell-floor-press': ['bench', { w: 'db', floor: true }], 'barbell-bench-press-medium-grip': ['bench', { w: 'bb' }],
    'incline-dumbbell-press': ['bench', { w: 'db', incline: true }], 'machine-bench-press': ['chestpress'], 'dips-chest-version': ['dips'],
    'dumbbell-flyes': ['flylying'], 'cable-crossover': ['flystand'], 'cross-over-with-bands': ['flystand', { band: true }],
    'dumbbell-shoulder-press': ['ohp', { seated: true }], 'standing-military-press': ['ohp', { w: 'bb' }], 'machine-shoulder-military-press': ['ohp', { seated: true, w: 'machine' }],
    'shoulder-press-with-bands': ['ohp', { w: 'band' }], 'two-arm-kettlebell-military-press': ['ohp', { w: 'kb' }], 'handstand-push-ups': ['hspu'], 'arnold-dumbbell-press': ['ohp', { seated: true }],
    'side-lateral-raise': ['lateral'], 'lateral-raise-with-bands': ['lateral', { w: 'band' }], 'upright-row-with-bands': ['upright'], 'cable-seated-lateral-raise': ['lateral', { w: 'cable' }],
    'face-pull': ['facepull'], 'band-pull-apart': ['pullapart'], 'seated-bent-over-rear-delt-raise': ['reversefly'],
    'pullups': ['pullup'], 'chin-up': ['pullup'], 'band-assisted-pull-up': ['pullup', { band: true }], 'wide-grip-lat-pulldown': ['pulldown'], 'close-grip-front-lat-pulldown': ['pulldown'],
    'one-arm-dumbbell-row': ['rowbench'], 'bent-over-two-dumbbell-row': ['rowbent'], 'bent-over-barbell-row': ['rowbent', { w: 'bb' }], 'seated-cable-rows': ['rowseated'],
    'inverted-row': ['invrow'], 'alternating-kettlebell-row': ['rowbent', { w: 'kb' }],
    'bodyweight-squat': ['squat'], 'goblet-squat': ['squat', { w: 'goblet' }], 'barbell-squat': ['squat', { w: 'bb' }], 'leg-press': ['legpress'],
    'freehand-jump-squat': ['jumpsquat'], 'front-squats-with-two-kettlebells': ['squat', { w: 'kb' }], 'dumbbell-squat': ['squat', { w: 'db' }],
    'romanian-deadlift': ['rdl', { w: 'bb' }], 'stiff-legged-dumbbell-deadlift': ['rdl'], 'barbell-deadlift': ['deadlift'], 'one-arm-kettlebell-swings': ['swing'],
    'hyperextensions-back-extensions': ['hyper'], 'superman': ['superman'], 'kettlebell-one-legged-deadlift': ['sldl'],
    'bodyweight-walking-lunge': ['lunge'], 'dumbbell-lunges': ['lunge', { w: 'db' }], 'dumbbell-rear-lunge': ['lunge', { w: 'db' }], 'split-squats': ['bulgarian'], 'dumbbell-step-ups': ['stepup'],
    'butt-lift-bridge': ['bridge'], 'single-leg-glute-bridge': ['bridge', { single: true }], 'barbell-hip-thrust': ['hipthrust'], 'glute-kickback': ['kickquad'], 'one-legged-cable-kickback': ['kickcable'],
    'leg-extensions': ['legext'], 'lying-leg-curls': ['legcurllying'], 'seated-leg-curl': ['legcurlseated'], 'ball-leg-curl': ['ballcurl'],
    'standing-calf-raises': ['calf'], 'standing-dumbbell-calf-raise': ['calf', { w: 'db' }], 'seated-calf-raise': ['calfseated'],
    'dumbbell-bicep-curl': ['curl'], 'hammer-curls': ['curl'], 'barbell-curl': ['curl', { w: 'bb' }], 'close-grip-ez-bar-curl-with-band': ['curl', { w: 'band' }], 'cable-hammer-curls-rope-attachment': ['curl', { w: 'cable' }],
    'bench-dips': ['benchdip'], 'triceps-pushdown-rope-attachment': ['pushdown'], 'tricep-dumbbell-kickback': ['trikick'], 'standing-dumbbell-triceps-extension': ['trioverhead'], 'band-skull-crusher': ['trioverhead', { w: 'band' }],
    'plank': ['plank'], 'crunches': ['crunch'], 'reverse-crunch': ['revcrunch'], 'dead-bug': ['deadbug'], 'russian-twist': ['twist'], 'flat-bench-lying-leg-raise': ['legraise'],
    'hanging-leg-raise': ['hangraise', { straight: true }], 'cable-crunch': ['cablecrunch'], 'ab-roller': ['roller'], 'mountain-climbers': ['climber'],
    'star-jump': ['jacks'], 'rope-jumping': ['rope'], 'knee-tuck-jump': ['tuckjump'], 'running-treadmill': ['run', { tread: true }], 'bicycling-stationary': ['bike'],
    'elliptical-trainer': ['elliptical'], 'stairmaster': ['stairs'], 'trail-running-walking': ['run'],
    // ajouts
    'knee-push-up': ['pushknee'], 'wide-push-up': ['pushup'], 'archer-push-up': ['pushup'], 'explosive-push-up': ['pushup', { fast: true }],
    'incline-barbell-press': ['bench', { w: 'bb', incline: true }], 'band-chest-press': ['standpress', { band: true }], 'cable-chest-press': ['standpress', { cable: true }],
    'kettlebell-floor-press': ['bench', { w: 'kb', floor: true }], 'pec-deck': ['flyseat'], 'dumbbell-pullover': ['pullover'], 'incline-dumbbell-fly': ['flylying', { incline: true }],
    'low-cable-fly': ['flystand', { low: true }], 'pike-push-up': ['pike'], 'push-press': ['pushpress'], 'front-raise': ['frontraise'], 'band-front-raise': ['frontraise', { w: 'band' }],
    'dumbbell-shrug': ['shrug'], 'barbell-shrug': ['shrug', { w: 'bb' }], 'prone-y-raise': ['superman', { arms: true }], 'band-face-pull': ['facepull', { band: true }],
    'reverse-pec-deck': ['flyseat', { reverse: true }], 'neutral-grip-pull-up': ['pullup'], 'negative-pull-up': ['pullup', { slow: true }], 'scapular-pull-up': ['pullup', { scap: true }],
    'band-lat-pulldown': ['pulldown', { band: true }], 'straight-arm-pulldown': ['straightpull'], 'chest-supported-row': ['rowsupported'], 't-bar-row': ['rowbent', { w: 'bb' }],
    'band-row': ['rowseated', { band: true }], 'machine-row': ['machinerow'], 'door-row': ['doorrow'], 'renegade-row': ['renegade'],
    'sumo-squat': ['squat', { w: 'goblet' }], 'wall-sit': ['wallsit'], 'box-squat': ['squat', { box: true }], 'barbell-front-squat': ['squat', { w: 'bb' }],
    'reverse-lunge': ['lunge'], 'lateral-lunge': ['sidelunge'], 'curtsy-lunge': ['lunge'], 'barbell-lunge': ['lunge', { w: 'bb' }], 'chair-step-up': ['stepup', { nw: true }],
    'good-morning': ['rdl', { w: 'gm' }], 'kettlebell-deadlift': ['deadlift', { w: 'kb' }], 'single-leg-rdl': ['sldl', { nw: true }], 'band-pull-through': ['rdl', { w: 'band' }],
    'cable-pull-through': ['rdl', { w: 'cable' }], 'two-hand-kettlebell-swing': ['swing'], 'sumo-deadlift': ['deadlift'],
    'frog-pump': ['bridge'], 'dumbbell-hip-thrust': ['hipthrust', { w: 'db' }], 'single-leg-hip-thrust': ['hipthrust', { single: true }], 'banded-lateral-walk': ['sidewalk'],
    'band-leg-extension': ['legext', { band: true }], 'nordic-curl': ['nordic'], 'band-leg-curl': ['legcurllying', { band: true }],
    'single-leg-calf-raise': ['calf'], 'leg-press-calf-raise': ['legpress', { calf: true }],
    'concentration-curl': ['curlconc'], 'incline-dumbbell-curl': ['curlincline'], 'preacher-curl': ['preacher'], 'reverse-curl': ['curl', { w: 'bb' }], 'cable-curl': ['curl', { w: 'cable' }],
    'bodyweight-curl': ['invrow'], 'close-grip-bench-press': ['bench', { w: 'bb' }], 'skull-crusher': ['skull'], 'overhead-cable-extension': ['trioverhead', { w: 'cable' }],
    'band-pushdown': ['pushdown', { band: true }], 'cable-triceps-kickback': ['trikick', { w: 'cable' }],
    'side-plank': ['sideplank'], 'hollow-hold': ['hollow'], 'bicycle-crunch': ['bicycle'], 'flutter-kicks': ['flutter'], 'plank-shoulder-tap': ['shouldertap'], 'bird-dog': ['birddog'],
    'v-up': ['vup'], 'sit-up': ['crunch', { full: true }], 'pallof-press': ['standpress', { band: true }], 'cable-woodchopper': ['chop'], 'hanging-knee-raise': ['hangraise'], 'farmer-walk': ['farmer'],
    'burpees': ['burpee'], 'high-knees': ['highknees'], 'butt-kicks': ['buttkicks'], 'skater-jumps': ['skater'], 'shadow-boxing': ['boxing'], 'battle-ropes': ['ropes'],
    'box-jump': ['boxjump'], 'jumping-lunge': ['jumplunge'], 'sprints': ['run', { fast: true }], 'rowing-machine': ['rower'], 'incline-walk': ['walk', { tread: true }], 'stair-climbing': ['stairs']
  };
  const cache = {};
  function specFor(id) {
    if (cache[id]) return cache[id];
    const m = MAP[id]; if (!m || !T[m[0]]) return null;
    return (cache[id] = T[m[0]](m[1]));
  }
  window.NS_FIG = { play, still, specFor, MAP, T };
})();
