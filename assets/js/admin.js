(function () {
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dash-view');
  const errEl = document.getElementById('admin-error');
  const listEl = document.getElementById('user-list');

  function showError(msg) {
    errEl.textContent = msg || '';
    errEl.classList.toggle('hidden', !msg);
  }

  async function trySession() {
    try {
      const r = await SW.api('/api/auth?action=me');
      if (r.ok && r.user && r.user.role === 2) {
        enterDash(r.user);
        return true;
      }
    } catch (_) {}
    return false;
  }

  function enterDash(user) {
    loginView.classList.add('hidden');
    dashView.classList.remove('hidden');
    document.getElementById('admin-who').textContent = '@' + user.username;
    loadUsers();
  }

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const username = document.getElementById('admin-user').value.trim().toLowerCase();
    const password = document.getElementById('admin-pass').value;
    try {
      const r = await SW.api('/api/auth', {
        method: 'POST',
        body: { action: 'login', username, password }
      });
      if (!r.ok) {
        showError(r.error || 'Login failed');
        return;
      }
      if (r.user.role !== 2) {
        await SW.auth.logout();
        showError('This account is not an admin (role must be 2)');
        return;
      }
      enterDash(r.user);
    } catch (err) {
      showError(err.message || 'Network error');
    }
  });

  document.getElementById('admin-logout').addEventListener('click', async () => {
    await SW.auth.logout();
    location.reload();
  });

  async function loadUsers() {
    listEl.textContent = 'Loading…';
    try {
      const r = await SW.api('/api/admin?action=list');
      if (!r.ok) {
        listEl.textContent = r.error || 'Failed to load';
        return;
      }
      const users = r.users || [];
      if (!users.length) {
        listEl.textContent = 'No users';
        return;
      }
      listEl.innerHTML = users.map(u => {
        const role = u.role === 1 ? 'owner' : u.role === 2 ? 'admin' : 'user';
        return `<div class="user-row">
          <span class="name">${esc(u.displayName || u.username)}</span>
          <span class="meta">@${esc(u.username)}</span>
          <span class="role-badge ${role}">${role}</span>
          <span class="meta">${esc(u.status || 'active')}</span>
          <span class="meta">${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : ''}</span>
        </div>`;
      }).join('');
    } catch (e) {
      listEl.textContent = e.message || 'Error';
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  trySession();
})();
