(function () {
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dash-view');
  const errEl = document.getElementById('owner-error');

  function showError(msg) {
    errEl.textContent = msg || '';
    errEl.classList.toggle('hidden', !msg);
  }

  async function trySession() {
    try {
      const r = await SW.api('/api/auth?action=me');
      if (r.ok && r.user && r.user.role === 1) {
        enterDash(r.user);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function enterDash(user) {
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');
    document.getElementById('owner-who').textContent = '@' + user.username + ' · owner';
    loadLists();
  }

  document.getElementById('owner-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const username = document.getElementById('owner-user').value.trim().toLowerCase();
    const password = document.getElementById('owner-pass').value;
    try {
      const r = await SW.api('/api/auth', {
        method: 'POST',
        body: { action: 'login', username, password }
      });
      if (!r.ok) {
        showError(r.error || 'Login failed');
        return;
      }
      if (r.user.role !== 1) {
        await SW.auth.logout();
        showError('This account is not the owner (role must be 1)');
        return;
      }
      enterDash(r.user);
    } catch (err) {
      showError(err.message || 'Network error');
    }
  });

  document.getElementById('owner-logout').addEventListener('click', async () => {
    await SW.auth.logout();
    location.reload();
  });

  document.getElementById('add-admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('add-admin-msg');
    msg.classList.add('hidden');
    const username = document.getElementById('new-admin-user').value.trim().toLowerCase();
    const password = document.getElementById('new-admin-pass').value;
    try {
      const r = await SW.api('/api/admin?action=create-admin', {
        method: 'POST',
        body: { username, password }
      });
      if (!r.ok) {
        msg.textContent = r.error || 'Failed';
        msg.classList.remove('hidden');
        return;
      }
      document.getElementById('new-admin-user').value = '';
      document.getElementById('new-admin-pass').value = '';
      loadLists();
    } catch (err) {
      msg.textContent = err.message || 'Error';
      msg.classList.remove('hidden');
    }
  });

  async function loadLists() {
    const adminList = document.getElementById('admin-list');
    const memberList = document.getElementById('member-list');
    adminList.textContent = 'Loading…';
    memberList.textContent = 'Loading…';
    try {
      const r = await SW.api('/api/admin?action=list');
      if (!r.ok) {
        adminList.textContent = r.error || 'Failed';
        memberList.textContent = r.error || 'Failed';
        return;
      }
      const users = r.users || [];
      const admins = users.filter(u => u.role === 2);
      const members = users.filter(u => u.role === 0);

      adminList.innerHTML = admins.length
        ? admins.map(rowHtml).join('')
        : '<div class="user-row"><span class="meta">No admins yet</span></div>';
      memberList.innerHTML = members.length
        ? members.map(rowHtml).join('')
        : '<div class="user-row"><span class="meta">No members</span></div>';
    } catch (e) {
      adminList.textContent = e.message;
      memberList.textContent = e.message;
    }
  }

  function rowHtml(u) {
    const role = u.role === 1 ? 'owner' : u.role === 2 ? 'admin' : 'user';
    return `<div class="user-row">
      <span class="name">${esc(u.displayName || u.username)}</span>
      <span class="meta">@${esc(u.username)}</span>
      <span class="role-badge ${role}">${role}</span>
      <span class="meta">${esc(u.status || 'active')}</span>
    </div>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  trySession();
})();
