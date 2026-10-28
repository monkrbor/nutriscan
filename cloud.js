/* Comptes et sauvegarde en ligne (Supabase, via son API REST). Utilisé par l'appli et par la page admin. */
(function () {
  'use strict';
  const CFG = window.NS_CLOUD || {};
  const base = String(CFG.url || '').trim().replace(/\/+$/, '');
  const key = String(CFG.key || '').trim();
  const enabled = !!(base && key);
  const AKEY = (window.NS_AUTH_KEY || 'nutriscan.auth');
  let session = read();

  function read() { try { return JSON.parse(localStorage.getItem(AKEY)) || null; } catch (e) { return null; } }
  function write(s) { session = s; try { if (s) localStorage.setItem(AKEY, JSON.stringify(s)); else localStorage.removeItem(AKEY); } catch (e) { /* stockage bloqué */ } }

  const FR = {
    'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
    'Email not confirmed': 'Confirme d’abord ton adresse : ouvre le lien reçu par e-mail.',
    'User already registered': 'Un compte existe déjà avec cet e-mail : connecte-toi.',
    'Password should be at least 6 characters': 'Le mot de passe doit faire au moins 6 caractères.',
    'Unable to validate email address: invalid format': 'Adresse e-mail invalide.',
    'Email rate limit exceeded': 'Trop d’e-mails envoyés : réessaie dans une heure.',
    'For security purposes, you can only request this after': 'Patiente quelques secondes avant de réessayer.'
  };
  function frMsg(m) {
    m = String(m || '');
    for (const k of Object.keys(FR)) if (m.indexOf(k) === 0 || m.indexOf(k) >= 0) return FR[k];
    return m || 'Erreur inconnue';
  }
  async function req(path, opts) {
    opts = opts || {};
    if (!enabled) throw new Error('Sauvegarde en ligne non configurée.');
    const h = { apikey: key, 'Content-Type': 'application/json' };
    if (opts.auth) { const s = await ensure(); if (!s) { const e = new Error('Session expirée : reconnecte-toi.'); e.status = 401; throw e; } h.Authorization = 'Bearer ' + s.access_token; }
    Object.assign(h, opts.headers || {});
    let res;
    try { res = await fetch(base + path, { method: opts.method || 'GET', headers: h, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { const err = new Error('Pas de connexion Internet.'); err.offline = true; throw err; }
    const txt = await res.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) {
      const raw = data && (data.msg || data.error_description || data.message || data.error || data.hint);
      const err = new Error(frMsg(raw) || ('Erreur ' + res.status)); err.status = res.status; err.data = data; throw err;
    }
    return data;
  }
  function setSession(d, user) {
    if (!d || !d.access_token) return null;
    const u = user || d.user || {};
    const s = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (+d.expires_in || 3600)), user: { id: u.id, email: u.email } };
    write(s); return s;
  }
  let refreshing = null;
  async function ensure() {
    if (!session) return null;
    if (session.expires_at - 60 > Math.floor(Date.now() / 1000)) return session;
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const r = await fetch(base + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
          const d = await r.json().catch(() => null);
          if (!r.ok) { if (r.status === 400 || r.status === 401 || r.status === 403) write(null); return null; }
          return setSession(d);
        } catch (e) { return session; } // hors ligne : on garde la session
        finally { refreshing = null; }
      })();
    }
    return refreshing;
  }
  async function signUp(email, password, meta) {
    const d = await req('/auth/v1/signup', { method: 'POST', body: { email, password, data: meta || {} } });
    if (d && d.access_token) { setSession(d); return true; }
    return false; // confirmation par e-mail demandée
  }
  async function signIn(email, password) { setSession(await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); return session; }
  async function signOut() { try { if (session) await req('/auth/v1/logout', { method: 'POST', auth: true }); } catch (e) { /* déjà déconnecté */ } write(null); }
  async function recover(email, redirectTo) { await req('/auth/v1/recover' + (redirectTo ? '?redirect_to=' + encodeURIComponent(redirectTo) : ''), { method: 'POST', body: { email } }); }
  async function updatePassword(password) { await req('/auth/v1/user', { method: 'PUT', auth: true, body: { password } }); }
  // Lien reçu par e-mail (confirmation ou nouveau mot de passe) : #access_token=…&type=…
  async function fromLink() {
    const h = location.hash || '';
    if (!/access_token=/.test(h)) { if (/error_description=/.test(h)) { const p = new URLSearchParams(h.slice(1)); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* rien */ } return { error: (p.get('error_description') || '').replace(/\+/g, ' ') }; } return null; }
    const p = new URLSearchParams(h.slice(1));
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* rien */ }
    const tmp = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600 };
    try {
      const r = await fetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + tmp.access_token } });
      const u = await r.json();
      if (!r.ok) throw new Error('lien');
      setSession(tmp, u);
      return { type: p.get('type') || 'signup' };
    } catch (e) { return { error: 'Ce lien a expiré : demande-en un nouveau.' }; }
  }
  // Sauvegarde
  async function pull() {
    const s = await ensure(); if (!s) return null;
    const rows = await req('/rest/v1/backups?select=data,updated_at,device&user_id=eq.' + s.user.id, { auth: true });
    return rows && rows[0] ? rows[0] : null;
  }
  async function meta() {
    const s = await ensure(); if (!s) return null;
    const rows = await req('/rest/v1/backups?select=updated_at,device&user_id=eq.' + s.user.id, { auth: true });
    return rows && rows[0] ? rows[0] : null;
  }
  async function push(state, meta) {
    const s = await ensure(); if (!s) throw new Error('Pas connecté');
    meta = meta || {};
    const body = { user_id: s.user.id, email: s.user.email, name: (state.profile && state.profile.name) || null, data: state,
      entries_count: (state.entries || []).length, device: meta.device || null, updated_at: new Date().toISOString() };
    if (meta.consentAt) body.consent_at = meta.consentAt;
    await req('/rest/v1/backups?on_conflict=user_id', { method: 'POST', auth: true, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body });
    return body.updated_at;
  }
  async function deleteAccount() { await req('/rest/v1/rpc/delete_my_account', { method: 'POST', auth: true, body: {} }); write(null); }

  window.NS_CLOUDAPI = {
    enabled, req, ensure, signUp, signIn, signOut, recover, updatePassword, fromLink, pull, push, deleteAccount,
    get session() { return session; }, get user() { return session && session.user; }
  };
})();
