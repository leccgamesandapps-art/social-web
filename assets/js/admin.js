(function () {
  const loginView = document.getElementById('login-view');
  const dashView = document.getElementById('dash-view');
  const main = document.getElementById('admin-main');
  const errEl = document.getElementById('admin-error');
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
    const extra = u.statusUntil ? ' until ' + new Date(u.statusUntil).toLocaleString() : '';
    return `<span class="status-badge ${esc(st)}">${esc(st)}${esc(extra)}</span>`;
  }
  function parseHash() {
    const h = (location.hash || '#dashboard').replace(/^#/, '');
    if (h.startsWith('user_') || h.startsWith('user=')) {
      return { view: 'user', username: h.replace(/^user[_=]/, '') };
    }
    return { view: 'dashboard' };
  }

  async function trySession() {
    try {
      const r = await SW.api('/api/auth?action=panel-me');
      if (r.ok && r.user && r.user.role === 2) {
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
    document.getElementById('admin-who').textContent = '@' + me.username;
    route();
  }

  document.getElementById('admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const password = document.getElementById('admin-pass').value;
    try {
      const r = await SW.api('/api/auth', {
        method: 'POST',
        body: { action: 'panel-login', panel: 'admin', password }
      });
      if (!r.ok) {
        showError(r.error || 'Wrong password');
        return;
      }
      me = r.user;
      enterDash();
    } catch (err) {
      showError(err.message || 'Network error');
    }
  });

  document.getElementById('admin-logout').addEventListener('click', async () => {
    await SW.api('/api/auth?action=panel-logout', { method: 'POST', body: {} });
    location.reload();
  });

  function route() {
    const { view, username } = parseHash();
    if (view === 'user' && username) renderUser(username);
    else renderDashboard();
  }
  window.addEventListener('hashchange', route);

  // ADMIN = users table ONLY
  async function renderDashboard() {
    main.innerHTML =
      '<h2>Members</h2>' +
      '<p class="meta" style="font-size:.8rem;color:var(--text-muted);margin:-6px 0 12px">From users table only</p>' +
      '<div class="user-list" id="user-list">Loading…</div>';

    try {
      const r = await SW.api('/api/admin?action=list');
      if (!r.ok) {
        document.getElementById('user-list').textContent = r.error || 'Failed';
        return;
      }

      // Strict: only accountType user / role 0. Never show admins.
      const users = (r.users || []).filter(function (u) {
        return u.accountType === 'user' || u.role === 0;
      });

      if (!users.length) {
        document.getElementById('user-list').innerHTML =
          '<div class="user-row"><span class="meta">No members in users table</span></div>';
        return;
      }

      document.getElementById('user-list').innerHTML = users.map(function (u) {
        return (
          '<div class="user-row">' +
            '<span class="name">' + esc(u.displayName || u.username) + '</span>' +
            '<span class="meta">@' + esc(u.username) + '</span>' +
            '<span class="role-badge user">user</span>' +
            statusBadge(u) +
            '<div class="actions">' +
              '<button type="button" class="btn ghost" data-view="' + esc(u.username) + '">View</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      main.querySelectorAll('[data-view]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          location.hash = 'user_' + btn.getAttribute('data-view');
        });
      });
    } catch (e) {
      document.getElementById('user-list').textContent = e.message || 'Error';
    }
  }

  async function renderUser(username) {
    main.innerHTML =
      '<div class="view-head">' +
        '<button type="button" class="btn ghost" id="btn-back">← Back</button>' +
        '<h2>@' + esc(username) + '</h2>' +
      '</div>' +
      '<div id="user-detail">Loading…</div>';

    document.getElementById('btn-back').onclick = function () {
      location.hash = 'dashboard';
    };

    try {
      const r = await SW.api('/api/admin?action=user&username=' + encodeURIComponent(username));
      if (!r.ok) {
        document.getElementById('user-detail').textContent = r.error || 'Not found';
        return;
      }
      const u = r.user;

      // Admin may only open users-table accounts
      if (u.accountType === 'admin' || u.role === 2 || u.role === 1) {
        document.getElementById('user-detail').innerHTML =
          '<div class="mod-card"><div class="meta">Admins can only moderate accounts from the users table.</div>' +
          '<button type="button" class="btn ghost" id="btn-back2">Back</button></div>';
        document.getElementById('btn-back2').onclick = function () {
          location.hash = 'dashboard';
        };
        return;
      }

      const logs = r.logs || [];
      document.getElementById('user-detail').innerHTML =
        '<div class="mod-card">' +
          '<div class="label">Account</div>' +
          '<div><strong>' + esc(u.displayName) + '</strong> · @' + esc(u.username) + '</div>' +
          '<div class="meta" style="margin-top:6px">' + statusBadge(u) + '</div>' +
        '</div>' +
        '<div class="mod-card">' +
          '<div class="label">Ban</div>' +
          '<div class="mod-actions">' +
            '<button type="button" class="btn danger" data-act="ban">Ban permanent</button>' +
            '<button type="button" class="btn danger" data-act="ban_timer">Ban with timer</button>' +
            '<button type="button" class="btn ok" data-act="unban">Unban</button>' +
          '</div>' +
          '<div class="timer-row hidden" id="ban-timer">' +
            '<input type="number" id="ban-amount" value="1" min="1" />' +
            '<select id="ban-unit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="minutes">minutes</option></select>' +
            '<button type="button" class="btn danger" id="ban-timer-go">Apply ban timer</button>' +
          '</div>' +
        '</div>' +
        '<div class="mod-card">' +
          '<div class="label">Suspend</div>' +
          '<div class="mod-actions">' +
            '<button type="button" class="btn warn" data-act="suspend">Suspend permanent</button>' +
            '<button type="button" class="btn warn" data-act="suspend_timer">Suspend with timer</button>' +
            '<button type="button" class="btn ok" data-act="unsuspend">Unsuspend</button>' +
          '</div>' +
          '<div class="timer-row hidden" id="sus-timer">' +
            '<input type="number" id="sus-amount" value="1" min="1" />' +
            '<select id="sus-unit"><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option><option value="minutes">minutes</option></select>' +
            '<button type="button" class="btn warn" id="sus-timer-go">Apply suspend timer</button>' +
          '</div>' +
        '</div>' +
        '<div class="mod-card">' +
          '<div class="label">Report log</div>' +
          '<div class="log-list">' +
            (logs.length
              ? logs.map(function (l) {
                  return '<div class="log-item"><div><strong>' + esc(l.action) + '</strong> by ' + esc(l.by_role) + ' @' + esc(l.by_name) + '</div><div>' + esc(l.note || '') + '</div><div class="when">' + (l.created_at ? new Date(l.created_at).toLocaleString() : '') + '</div></div>';
                }).join('')
              : '<div class="meta">No logs yet</div>') +
          '</div>' +
        '</div>';

      main.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const act = btn.getAttribute('data-act');
          if (act === 'ban_timer') {
            document.getElementById('ban-timer').classList.remove('hidden');
            return;
          }
          if (act === 'suspend_timer') {
            document.getElementById('sus-timer').classList.remove('hidden');
            return;
          }
          await doMod(username, act);
        });
      });
      document.getElementById('ban-timer-go').onclick = function () {
        doMod(username, 'ban_timer', {
          amount: document.getElementById('ban-amount').value,
          unit: document.getElementById('ban-unit').value
        });
      };
      document.getElementById('sus-timer-go').onclick = function () {
        doMod(username, 'suspend_timer', {
          amount: document.getElementById('sus-amount').value,
          unit: document.getElementById('sus-unit').value
        });
      };
    } catch (e) {
      document.getElementById('user-detail').textContent = e.message || 'Error';
    }
  }

  async function doMod(username, modAction, extra) {
    if (!confirm('Confirm: ' + modAction + ' @' + username + '?')) return;
    const body = Object.assign({ username: username, modAction: modAction }, extra || {});
    const r = await SW.api('/api/admin?action=moderate', { method: 'POST', body: body });
    if (!r.ok) {
      alert(r.error || 'Failed');
      return;
    }
    renderUser(username);
  }

  trySession();
})();
