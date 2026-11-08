(function () {
  var main = document.getElementById('admin-main');
  var logoutBtn = document.getElementById('admin-logout');
  var pub = document.getElementById('pub-key-label');
  if (pub && window.SW_PUBLIC) pub.textContent = 'pk: ' + window.SW_PUBLIC.publicKey;
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  }
  function when(ts) { try { return new Date(ts).toLocaleString(); } catch (e) { return '—'; } }
  function parseHash() {
    var raw = (location.hash || '#login').slice(1);
    if (!raw) return { root: 'login', parts: ['login'] };
    var parts = raw.split('=').filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    return { root: parts[0] || 'login', parts: parts, raw: raw };
  }
  var KNOWN = { login: 1, dashboard: 1, user: 1, error: 1 };
  function requireAdmin() { return AdminDB.getAdminSession(); }
  function go(hash) { location.hash = hash; }
  function statusBadge(st) {
    var c = st === 'banned' ? 'badge-banned' : (st === 'suspended' ? 'badge-suspended' : 'badge-active');
    return '<span class="badge ' + c + '">' + esc(st) + '</span>';
  }
  function renderLogin() {
    if (logoutBtn) logoutBtn.style.display = 'none';
    main.innerHTML =
      '<div class="admin-card admin-login-box"><h2>Admin Login</h2><p class="meta">Password only</p>' +
      '<input type="password" id="adm-pass" placeholder="Admin password" autocomplete="current-password" />' +
      '<button type="button" class="btn primary" id="adm-login-btn" style="width:100%">Login</button>' +
      '<p class="meta" id="adm-err" style="color:#ff8a8a;margin-top:8px"></p></div>';
    document.getElementById('adm-login-btn').onclick = function () {
      var r = AdminDB.adminLogin(document.getElementById('adm-pass').value);
      if (!r.ok) { document.getElementById('adm-err').textContent = r.error || 'Failed'; return; }
      go('#dashboard');
    };
    document.getElementById('adm-pass').onkeydown = function (e) {
      if (e.key === 'Enter') document.getElementById('adm-login-btn').click();
    };
  }
  function renderDashboard() {
    if (logoutBtn) logoutBtn.style.display = '';
    var members = AdminDB.listMembers();
    var rows = members.map(function (m) {
      return '<tr><td>' + esc(m.displayName) + '</td><td>@' + esc(m.username) + '</td><td class="pw-cell">' +
        esc(m.password) + '</td><td>' + when(m.createdAt) + '</td><td>' + statusBadge(m.status) +
        '</td><td><button type="button" class="btn small" data-view="' + esc(m.username) + '">View</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="meta">No members</td></tr>';
    main.innerHTML =
      '<div class="admin-card"><h2>Members</h2><div style="overflow:auto"><table class="admin-table"><thead><tr>' +
      '<th>Name</th><th>Username</th><th>Password</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>' +
      rows + '</tbody></table></div></div>';
    main.querySelectorAll('[data-view]').forEach(function (b) {
      b.onclick = function () { go('#user=' + encodeURIComponent(b.getAttribute('data-view'))); };
    });
  }
  function timerPrompt() {
    var mins = prompt('Duration in minutes (e.g. 60):', '60');
    if (mins == null) return null;
    var n = parseInt(mins, 10);
    if (!n || n < 1) n = 60;
    return n * 60 * 1000;
  }
  function renderUser(username) {
    if (logoutBtn) logoutBtn.style.display = '';
    var m = AdminDB.getMember(username);
    if (!m) {
      main.innerHTML = '<div class="admin-card"><p>User not found</p><button class="btn" id="back-d">Back</button></div>';
      document.getElementById('back-d').onclick = function () { go('#dashboard'); };
      return;
    }
    var sess = requireAdmin();
    main.innerHTML =
      '<div class="admin-card"><button type="button" class="btn small" id="back-d">← Dashboard</button>' +
      '<h2 style="margin-top:12px">@' + esc(m.username) + '</h2>' +
      '<p class="meta">Name: ' + esc(m.displayName) + '</p>' +
      '<p class="meta">Password: <span class="pw-cell">' + esc(m.password) + '</span></p>' +
      '<p class="meta">Created: ' + when(m.createdAt) + '</p>' +
      '<p class="meta">Status: ' + statusBadge(m.status) + (m.until ? ' until ' + when(m.until) : '') + '</p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="btn" data-act="ban_timer">Ban w/ timer</button>' +
      '<button type="button" class="btn danger" data-act="ban_permanent">Ban permanent</button>' +
      '<button type="button" class="btn" data-act="suspend_permanent">Suspend permanent</button>' +
      '<button type="button" class="btn" data-act="suspend_timer">Suspend w/ timer</button>' +
      '<button type="button" class="btn" data-act="warning">Warning</button>' +
      '<button type="button" class="btn primary" data-act="reportlog">Report log</button></div></div>';
    document.getElementById('back-d').onclick = function () { go('#dashboard'); };
    main.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute('data-act');
        if (act === 'reportlog') { go('#user=reportlog_' + encodeURIComponent(m.username)); return; }
        var opts = {};
        if (act === 'ban_timer' || act === 'suspend_timer') {
          var ms = timerPrompt(); if (ms == null) return; opts.timerMs = ms;
        }
        if (act === 'warning') opts.note = prompt('Warning message:') || 'Warning';
        var r = AdminDB.applyAction(m.username, act, opts, 'admin', sess && sess.name);
        if (!r.ok) alert(r.error || 'Failed'); else renderUser(m.username);
      };
    });
  }
  function renderReportLog(username) {
    if (logoutBtn) logoutBtn.style.display = '';
    var logs = AdminDB.getReportLog(username);
    main.innerHTML =
      '<div class="admin-card"><button type="button" class="btn small" id="back-u">← User</button>' +
      '<h2 style="margin-top:12px">Report log · @' + esc(username) + '</h2>' +
      (logs.length ? logs.map(function (e) {
        return '<div class="log-item"><strong>' + esc(e.action) + '</strong> · ' + when(e.at) +
          '<br/><span class="meta">by ' + esc(e.byRole) + ' ' + esc(e.byName || '') +
          (e.note ? ' — ' + esc(e.note) : '') + '</span></div>';
      }).join('') : '<p class="meta">No log entries</p>') + '</div>';
    document.getElementById('back-u').onclick = function () { go('#user=' + encodeURIComponent(username)); };
  }
  function renderError() {
    main.innerHTML =
      '<div class="error-box admin-card"><h2>Error</h2><p class="meta">Unknown route</p>' +
      '<button type="button" class="btn primary" id="err-home">Go Login</button></div>';
    document.getElementById('err-home').onclick = function () { go('#login'); };
  }
  function route() {
    var h = parseHash();
    if (!KNOWN[h.root]) {
      if (location.hash !== '#error') location.hash = '#error';
      else renderError();
      return;
    }
    if (h.root === 'error') { renderError(); return; }
    if (h.root === 'login') { renderLogin(); return; }
    if (!requireAdmin()) { go('#login'); return; }
    if (h.root === 'dashboard') { renderDashboard(); return; }
    if (h.root === 'user') {
      var p1 = h.parts[1] || '';
      if (p1.indexOf('reportlog_') === 0) { renderReportLog(p1.slice(10)); return; }
      if (!p1) {
        main.innerHTML = '<div class="admin-card"><h2>Lookup user</h2><input id="u-in" placeholder="username" />' +
          '<button class="btn primary" id="u-go">Open</button></div>';
        document.getElementById('u-go').onclick = function () {
          var v = document.getElementById('u-in').value.trim();
          if (v) go('#user=' + encodeURIComponent(v));
        };
        return;
      }
      renderUser(p1);
      return;
    }
    renderError();
  }
  if (logoutBtn) logoutBtn.onclick = function () { AdminDB.adminLogout(); go('#login'); };
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#login';
  else route();
})();
