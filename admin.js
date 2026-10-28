/* Page d'administration : liste des comptes et de leurs sauvegardes, détail, téléchargement, versions, restauration. */
(function () {
  'use strict';
  const C = window.NS_CLOUDAPI;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fk = v => Math.round(v || 0).toLocaleString('fr-FR');
  const dt = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const ago = s => {
    if (!s) return '—';
    const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
    if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + ' min';
    const h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h';
    const d = Math.round(h / 24); return d < 31 ? 'il y a ' + d + ' j' : new Date(s).toLocaleDateString('fr-FR');
  };
  let users = [], current = null, toastT;
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
  const slugName = u => String(u.name || u.email || u.user_id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

  async function start() {
    if (!C || !C.enabled) { notice('La sauvegarde en ligne n’est pas encore configurée : remplis <b>config.js</b> avec l’adresse et la clé publique Supabase.'); return; }
    if (!C.session) { show('login'); return; }
    try {
      const me = C.session.user;
      const rows = await C.req('/rest/v1/admins?select=user_id&user_id=eq.' + me.id, { auth: true });
      if (!rows || !rows.length) {
        $('#who').textContent = me.email;
        notice('Le compte <b>' + esc(me.email) + '</b> n’est pas administrateur. Dans Supabase → SQL Editor, lance :<br><code style="display:block;margin-top:8px;overflow-wrap:anywhere">insert into public.admins (user_id) select id from auth.users where email = \'' + esc(me.email) + '\';</code>');
        $('#topActs').hidden = false;
        return;
      }
      $('#who').textContent = 'Connecté : ' + me.email;
      show('panel');
      await loadUsers();
    } catch (e) {
      if (e.status === 401) { await C.signOut(); show('login'); return; }
      notice(esc(e.message));
    }
  }
  async function loadUsers() {
    users = await C.req('/rest/v1/backups?select=user_id,email,name,entries_count,updated_at,consent_at,device&order=updated_at.desc', { auth: true }) || [];
    const week = Date.now() - 7 * 864e5;
    $('#stats').innerHTML =
      '<div class="stat"><b>' + fk(users.length) + '</b><span>comptes sauvegardés</span></div>' +
      '<div class="stat"><b>' + fk(users.filter(u => new Date(u.updated_at).getTime() > week).length) + '</b><span>actifs ces 7 derniers jours</span></div>' +
      '<div class="stat"><b>' + fk(users.reduce((a, u) => a + (u.entries_count || 0), 0)) + '</b><span>aliments notés au total</span></div>';
    renderList();
    if (current) { const u = users.find(x => x.user_id === current); if (u) openUser(u.user_id); }
  }
  function renderList() {
    const q = $('#q').value.trim().toLowerCase();
    const list = users.filter(u => !q || (String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().includes(q));
    $('#list').innerHTML = list.length ? list.map(u =>
      '<button class="u' + (u.user_id === current ? ' on' : '') + '" data-u="' + esc(u.user_id) + '"><span class="av">' + esc((u.name || u.email || '?').charAt(0).toUpperCase()) + '</span>' +
      '<span class="min0"><b>' + esc(u.name || u.email || 'Sans nom') + '</b><small>' + esc(u.email || '') + ' · ' + fk(u.entries_count) + ' aliment' + (u.entries_count > 1 ? 's' : '') + '</small></span>' +
      '<span class="when">' + esc(ago(u.updated_at)) + '</span></button>').join('')
      : '<p class="empty-d">' + (users.length ? 'Aucun compte ne correspond.' : 'Aucun compte pour l’instant. Ils apparaîtront ici dès qu’un utilisateur créera un compte dans l’appli.') + '</p>';
  }
  async function openUser(id) {
    current = id; renderList();
    const box = $('#detail');
    box.innerHTML = '<div class="loading"><div class="spin"></div>Chargement…</div>';
    try {
      const [rows, hist] = await Promise.all([
        C.req('/rest/v1/backups?select=*&user_id=eq.' + id, { auth: true }),
        C.req('/rest/v1/backup_history?select=id,saved_at,entries_count&user_id=eq.' + id + '&order=saved_at.desc', { auth: true }).catch(() => [])
      ]);
      const u = rows && rows[0]; if (!u) { box.innerHTML = '<p class="empty-d">Sauvegarde introuvable.</p>'; return; }
      const d = u.data || {}, P = d.profile || {}, G = d.goals || {};
      const entries = (d.entries || []).slice().sort((a, b) => (b.date + (b.ts || 0)) > (a.date + (a.ts || 0)) ? 1 : -1);
      const days = new Set((d.entries || []).map(e => e.date)).size;
      const w = (d.weights || []).slice(-1)[0];
      box.innerHTML =
        '<div><h2>' + esc(u.name || P.name || u.email) + '</h2><p class="hint">' + esc(u.email || '') + '</p></div>' +
        '<div class="mini"><div><b>' + fk(entries.length) + '</b><span>aliments notés</span></div><div><b>' + fk(days) + '</b><span>jours suivis</span></div>' +
        '<div><b>' + (w ? String(w.kg).replace('.', ',') + ' kg' : '—') + '</b><span>dernier poids</span></div><div><b>' + fk(G.kcal) + '</b><span>objectif kcal</span></div></div>' +
        '<div class="sec"><h3>Compte</h3>' +
        '<div class="kv"><span>Dernière sauvegarde</span><b>' + esc(dt(u.updated_at)) + '</b></div>' +
        '<div class="kv"><span>Consentement</span><b>' + esc(u.consent_at ? dt(u.consent_at) : 'non enregistré') + '</b></div>' +
        (P.goal ? '<div class="kv"><span>Profil</span><b>' + esc([P.sex === 'f' ? 'Femme' : 'Homme', P.age ? P.age + ' ans' : '', P.height ? P.height + ' cm' : ''].filter(Boolean).join(' · ')) + '</b></div>' : '') + '</div>' +
        '<div class="acts"><button class="btn primary" data-a="dl">' + '<svg class="ic sm"><use href="#i-download"/></svg>Télécharger la sauvegarde</button>' +
        '<button class="btn outline" data-a="up"><svg class="ic sm"><use href="#i-upload"/></svg>Restaurer depuis un fichier</button></div>' +
        '<div class="sec"><h3>Derniers aliments</h3>' + (entries.length ? '<div class="tbl"><table><thead><tr><th>Date</th><th>Aliment</th><th class="num">Quantité</th><th class="num">kcal</th></tr></thead><tbody>' +
          entries.slice(0, 12).map(e => '<tr><td>' + esc(e.date) + '</td><td>' + esc(e.name) + '</td><td class="num">' + (e.key === 'quick' ? '—' : fk(e.grams) + ' ' + esc(e.unit || 'g')) + '</td><td class="num">' + fk(e.kcal) + '</td></tr>').join('') +
          '</tbody></table></div>' : '<p class="hint">Aucun aliment noté.</p>') + '</div>' +
        '<div class="sec"><h3>Versions précédentes</h3>' + ((hist && hist.length) ? hist.map(h =>
          '<div class="ver"><span>' + esc(dt(h.saved_at)) + ' · ' + fk(h.entries_count) + ' aliment' + (h.entries_count > 1 ? 's' : '') + '</span><button class="btn outline" data-a="vdl" data-v="' + h.id + '">Télécharger</button><button class="btn outline" data-a="vrs" data-v="' + h.id + '">Restaurer</button></div>').join('')
          : '<p class="hint">Les versions précédentes apparaissent ici (une toutes les 6 heures au maximum, 30 gardées).</p>') + '</div>' +
        '<button class="btn danger" data-a="del" style="width:100%"><svg class="ic sm"><use href="#i-trash"/></svg>Supprimer cette sauvegarde</button>' +
        '<p class="hint">Restaurer remplace la sauvegarde en ligne ; l’utilisateur reçoit la proposition de la récupérer à sa prochaine ouverture de l’appli. Pour supprimer le compte lui-même : Supabase → Authentication → Users.</p>';
      box.dataset.uid = id;
      box._u = u;
    } catch (e) { box.innerHTML = '<p class="empty-d">' + esc(e.message) + '</p>'; }
  }
  async function restore(id, data, label) {
    await C.req('/rest/v1/backups?user_id=eq.' + id, { method: 'PATCH', auth: true, headers: { Prefer: 'return=minimal' },
      body: { data, entries_count: (data.entries || []).length, device: 'admin', updated_at: new Date().toISOString() } });
    toast(label || 'Sauvegarde restaurée');
    await loadUsers();
  }

  $('#detail').addEventListener('click', async ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const box = $('#detail'), id = box.dataset.uid, u = box._u; if (!id || !u) return;
    const a = b.dataset.a;
    try {
      if (a === 'dl') download('nutriscan-' + slugName(u) + '-' + new Date().toISOString().slice(0, 10) + '.json', u.data);
      else if (a === 'up') { $('#fileIn').dataset.uid = id; $('#fileIn').click(); }
      else if (a === 'vdl' || a === 'vrs') {
        const r = await C.req('/rest/v1/backup_history?select=data,saved_at&id=eq.' + b.dataset.v, { auth: true });
        if (!r || !r[0]) { toast('Version introuvable'); return; }
        if (a === 'vdl') download('nutriscan-' + slugName(u) + '-version-' + r[0].saved_at.slice(0, 10) + '.json', r[0].data);
        else { if (!arm(b, 'Confirmer ?')) return; await restore(id, r[0].data, 'Version du ' + dt(r[0].saved_at) + ' restaurée'); }
      } else if (a === 'del') {
        if (!arm(b, 'Appuie encore pour supprimer définitivement')) return;
        await C.req('/rest/v1/backups?user_id=eq.' + id, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
        current = null; $('#detail').innerHTML = '<p class="empty-d">Sauvegarde supprimée.</p>'; toast('Sauvegarde supprimée'); await loadUsers();
      }
    } catch (e) { toast(e.message); }
  });
  $('#fileIn').addEventListener('change', ev => {
    const f = ev.target.files && ev.target.files[0], id = ev.target.dataset.uid; ev.target.value = '';
    if (!f || !id) return;
    const r = new FileReader();
    r.onload = async () => {
      try { const data = JSON.parse(r.result); if (!data || !Array.isArray(data.entries)) throw new Error('format'); await restore(id, data, 'Fichier restauré'); }
      catch (e) { toast(e.message === 'format' ? 'Ce fichier n’est pas une sauvegarde NutriScan' : e.message); }
    };
    r.readAsText(f);
  });
  $('#list').addEventListener('click', ev => { const b = ev.target.closest('[data-u]'); if (b) openUser(b.dataset.u); });
  $('#q').addEventListener('input', renderList);
  $('#reload').addEventListener('click', () => loadUsers().then(() => toast('Liste à jour')).catch(e => toast(e.message)));
  $('#logout').addEventListener('click', async () => { await C.signOut(); users = []; current = null; $('#who').textContent = 'Sauvegardes des comptes'; show('login'); });
  $('#login').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = $('#lErr');
    try { err.hidden = true; await C.signIn($('#lEmail').value.trim(), $('#lPass').value); await start(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  });
  start();
})();
