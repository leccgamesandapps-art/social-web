(function () {
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dash-view');
  const main = document.getElementById('owner-main');
  const errEl = document.getElementById('owner-error');
  let me = null;

  function showError(msg) {
    errEl.textContent = msg || '';
    errEl.classList.toggle('hidden', !msg);
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function statusBadge(u) {
    const st = u.status || 'active';
    let extra = u.statusUntil ? ' until ' + new Date(u.statusUntil).toLocaleString() : '';
    return `<span class="status-badge ${esc(st)}">${esc(st)}${esc(extra)}</span>`;
  }
  function parseHash() {
    const h = (location.hash || '#dashboard').replace(/^#/, '');
    if (h.startsWith('user_') || h.startsWith('user=')) return { view: 'user', username: h.replace(/^user[_=]/, '') };
    if (h.startsWith('admin_') || h.startsWith('admin=')) return { view: 'admin', username: h.replace(/^admin[_=]/, '') };
    return { view: 'dashboard' };
  }

  async function trySession() {
    try {
      const r = await SW.api('/api/auth?action=panel-me');
      if (r.ok && r.user && r.user.role === 1) {
        me = r.user;
        enterDash();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function enterDash() {
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');
    document.getElementById('owner-who').textContent = '@' + me.username + ' · owner';
    route();
  }

  document.getElementById('owner-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const password = document.getElementById('owner-pass').value;
    try {
      const r = await SW.api('/api/auth', {
        method: 'POST',
        body: { action: 'panel-login', panel: 'owner', password }
      });
      if (!r.ok) { showError(r.error || 'Wrong password'); return; }
      me = r.user;
      enterDash();
    } catch (err) { showError(err.message || 'Network error'); }
  });

  document.getElementById('owner-logout').addEventListener('click', async () => {
    await SW.api('/api/auth?action=panel-logout', { method: 'POST', body: {} });
    location.reload();
  });

  function route() {
    const { view, username } = parseHash();
    if (view === 'user' && username) renderUser(username);
    else if (view === 'admin' && username) renderAdmin(username);
    else renderDashboard();
  }
  window.addEventListener('hashchange', route);

  async function renderDashboard() {
    main.innerHTML = `
      <section class="panel-section">
        <h2>Add Admin</h2>
        <form id="add-admin-form" class="inline-form">
          <input type="text" id="new-admin-user" placeholder="username" required />
          <input type="password" id="new-admin-pass" placeholder="password" required />
          <button type="submit" class="btn primary">Add Admin</button>
        </form>
        <p id="add-admin-msg" class="form-error hidden"></p>
      </section>
      <section class="panel-section"><h2>Admins</h2><div class="user-list" id="admin-list">Loading…</div></section>
      <section class="panel-section"><h2>Members (users)</h2><div class="user-list" id="member-list">Loading…</div></section>`;

    document.getElementById('add-admin-form').onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById('add-admin-msg');
      msg.classList.add('hidden');
      const username = document.getElementById('new-admin-user').value.trim().toLowerCase();
      const password = document.getElementById('new-admin-pass').value;
      const r = await SW.api('/api/admin?action=add-admin', { method: 'POST', body: { username, password } });
      if (!r.ok) { msg.textContent = r.error || 'Failed'; msg.classList.remove('hidden'); return; }
      renderDashboard();
    };

    try {
      const r = await SW.api('/api/admin?action=list');
      if (!r.ok) throw new Error(r.error);
      const members = r.users || [];
      const admins = r.admins || [];

      document.getElementById('admin-list').innerHTML = admins.length
        ? admins.map(u => `
          <div class="user-row">
            <span class="name">${esc(u.displayName || u.username)}</span>
            <span class="meta">@${esc(u.username)}</span>
            <span class="role-badge admin">admin</span>
            ${statusBadge(u)}
            <div class="actions"><button type="button" class="btn ghost" data-view-admin="${esc(u.username)}">View</button></div>
          </div>`).join('')
        : '<div class="user-row"><span class="meta">No admins (use panel passwords admin1/admin2 or Add Admin)</span></div>';

      document.getElementById('member-list').innerHTML = members.length
        ? members.map(u => `
          <div class="user-row">
            <span class="name">${esc(u.displayName || u.username)}</span>
            <span class="meta">@${esc(u.username)}</span>
            <span class="role-badge user">user</span>
            ${statusBadge(u)}
            <div class="actions"><button type="button" class="btn ghost" data-view-user="${esc(u.username)}">View</button></div>
          </div>`).join('')
        : '<div class="user-row"><span class="meta">No members yet — register on the main site</span></div>';

      main.querySelectorAll('[data-view-user]').forEach(btn => {
        btn.onclick = () => { location.hash = 'user_' + btn.dataset.viewUser; };
      });
      main.querySelectorAll('[data-view-admin]').forEach(btn => {
        btn.onclick = () => { location.hash = 'admin_' + btn.dataset.viewAdmin; };
      });
    } catch (e) {
      document.getElementById('admin-list').textContent = e.message;
      document.getElementById('member-list').textContent = e.message;
    }
  }

  async function renderAdmin(username) {
    main.innerHTML = `<div class="view-head"><button type="button" class="btn ghost" id="btn-back">← Back</button><h2>Admin @${esc(username)}</h2></div><div id="admin-detail">Loading…</div>`;
    document.getElementById('btn-back').onclick = () => { location.hash = 'dashboard'; };
    try {
      const r = await SW.api('/api/admin?action=user&username=' + encodeURIComponent(username));
      if (!r.ok) { document.getElementById('admin-detail').textContent = r.error; return; }
      const u = r.user;
      document.getElementById('admin-detail').innerHTML = `
        <div class="mod-card">
          <div class="label">Admin account</div>
          <div><strong>${esc(u.displayName)}</strong> · @${esc(u.username)}</div>
          <div class="mod-actions" style="margin-top:14px">
            <button type="button" class="btn danger" id="btn-remove-admin">Remove admin</button>
            <button type="button" class="btn ghost" id="btn-back2">Back</button>
          </div>
        </div>`;
      document.getElementById('btn-back2').onclick = () => { location.hash = 'dashboard'; };
      document.getElementById('btn-remove-admin').onclick = async () => {
        if (!confirm('Remove admin @' + username + '?')) return;
        const r2 = await SW.api('/api/admin?action=remove-admin', { method: 'POST', body: { username } });
        if (!r2.ok) { alert(r2.error); return; }
        location.hash = 'dashboard';
      };
    } catch (e) { document.getElementById('admin-detail').textContent = e.message; }
  }

  async function renderUser(username) {
    main.innerHTML = `<div class="view-head"><button type="button" class="btn ghost" id="btn-back">← Back</button><h2>@${esc(username)}</h2></div><div id="user-detail">Loading…</div>`;
    document.getElementById('btn-back').onclick = () => { location.hash = 'dashboard'; };
    try {
      const r = await SW.api('/api/admin?action=user&username=' + encodeURIComponent(username));
      if (!r.ok) { document.getElementById('user-detail').textContent = r.error; return; }
      const u = r.user;
      const logs = r.logs || [];
      document.getElementById('user-detail').innerHTML = `
        <div class="mod-card"><div class="label">Account</div>
          <div><strong>${esc(u.displayName)}</strong> · @${esc(u.username)}</div>
          <div class="meta" style="margin-top:6px">${statusBadge(u)}</div></div>
        <div class="mod-card"><div class="label">Ban</div>
          <div class="mod-actions">
            <button type="button" class="btn danger" data-act="ban">Ban permanent</button>
            <button type="button" class="btn danger" data-act="ban_timer">Ban with timer</button>
            <button type="button" class="btn ok" data-act="unban">Unban</button>
          </div>
          <div class="timer-row hidden" id="ban-timer">
            <input type="number" id="ban-amount" value="1" min="1" />
            <select id="ban-unit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="minutes">minutes</option></select>
            <button type="button" class="btn danger" id="ban-timer-go">Apply</button>
          </div></div>
        <div class="mod-card"><div class="label">Suspend</div>
          <div class="mod-actions">
            <button type="button" class="btn warn" data-act="suspend">Suspend permanent</button>
            <button type="button" class="btn warn" data-act="suspend_timer">Suspend with timer</button>
            <button type="button" class="btn ok" data-act="unsuspend">Unsuspend</button>
          </div>
          <div class="timer-row hidden" id="sus-timer">
            <input type="number" id="sus-amount" value="1" min="1" />
            <select id="sus-unit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="minutes">minutes</option></select>
            <button type="button" class="btn warn" id="sus-timer-go">Apply</button>
          </div></div>
        <div class="mod-card"><div class="label">Report log</div>
          <div class="log-list">${logs.length ? logs.map(l => `<div class="log-item"><div><strong>${esc(l.action)}</strong> by ${esc(l.by_role)} @${esc(l.by_name)}</div><div>${esc(l.note || '')}</div><div class="when">${l.created_at ? new Date(l.created_at).toLocaleString() : ''}</div></div>`).join('') : '<div class="meta">No logs yet</div>'}</div></div>`;
      main.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = async () => {
          const act = btn.dataset.act;
          if (act === 'ban_timer') { document.getElementById('ban-timer').classList.remove('hidden'); return; }
          if (act === 'suspend_timer') { document.getElementById('sus-timer').classList.remove('hidden'); return; }
          await doMod(username, act);
        };
      });
      document.getElementById('ban-timer-go').onclick = () => doMod(username, 'ban_timer', { amount: document.getElementById('ban-amount').value, unit: document.getElementById('ban-unit').value });
      document.getElementById('sus-timer-go').onclick = () => doMod(username, 'suspend_timer', { amount: document.getElementById('sus-amount').value, unit: document.getElementById('sus-unit').value });
    } catch (e) { document.getElementById('user-detail').textContent = e.message; }
  }

  async function doMod(username, modAction, extra) {
    if (!confirm('Confirm: ' + modAction + ' @' + username + '?')) return;
    const r = await SW.api('/api/admin?action=moderate', { method: 'POST', body: Object.assign({ username, modAction }, extra || {}) });
    if (!r.ok) { alert(r.error || 'Failed'); return; }
    renderUser(username);
  }

  trySession();
})();
