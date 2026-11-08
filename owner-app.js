(function () {
  var main = document.getElementById('owner-main');
  var logoutBtn = document.getElementById('owner-logout');
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
  function requireOwner() { return AdminDB.getOwnerSession(); }
  function go(hash) { location.hash = hash; }
  function statusBadge(st) {
    var c = st === 'banned' ? 'badge-banned' : (st === 'suspended' ? 'badge-suspended' : 'badge-active');
    return '<span class="badge ' + c + '">' + esc(st) + '</span>';
  }
  function renderLogin() {
    if (logoutBtn) logoutBtn.style.display = 'none';
    main.innerHTML =
      '<div class="admin-card admin-login-box"><h2>Owner Login</h2><p class="meta">Password only</p>' +
      '<input type="password" id="own-pass" placeholder="Owner password" autocomplete="current-password" />' +
      '<button type="button" class="btn primary" id="own-login-btn" style="width:100%">Login</button>' +
      '<p class="meta" id="own-err" style="color:#ff8a8a;margin-top:8px"></p></div>';
    document.getElementById('own-login-btn').onclick = function () {
      var r = AdminDB.ownerLogin(document.getElementById('own-pass').value);
      if (!r.ok) { document.getElementById('own-err').textContent = r.error || 'Failed'; return; }
      go('#dashboard');
    };
    document.getElementById('own-pass').onkeydown = function (e) {
      if (e.key === 'Enter') document.getElementById('own-login-btn').click();
    };
  }
  function renderDashboard(listTab) {
    if (logoutBtn) logoutBtn.style.display = '';
    listTab = listTab || 'members';
    var admins = AdminDB.listAdmins();
    var members = AdminDB.listMembers();
    var adminRows = admins.map(function (a) {
      return '<tr><td>' + esc(a.name) + '</td><td class="pw-cell">' + esc(a.password) + '</td><td>' +
        when(a.createdAt) + '</td><td><button type="button" class="btn small danger" data-rm="' + esc(a.id) + '">Remove</button></td></tr>';
    }).join('') || '<tr><td colspan="4" class="meta">No admins</td></tr>';
    var memberRows = members.map(function (m) {
      return '<tr><td>' + esc(m.displayName) + '</td><td>@' + esc(m.username) + '</td><td class="pw-cell">' +
        esc(m.password) + '</td><td>' + when(m.createdAt) + '</td><td>' + statusBadge(m.status) +
        '</td><td><button type="button" class="btn small" data-view="' + esc(m.username) + '">View</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="meta">No members</td></tr>';
    main.innerHTML =
      '<div class="admin-card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px">' +
      '<h2 style="margin:0;flex:1">Owner dashboard</h2>' +
      '<button type="button" class="btn primary" id="add-admin-btn">+ Add admin</button></div>' +
      '<p class="meta">Admins: ' + admins.length + ' · Members: ' + members.length + '</p></div>' +
      '<div class="admin-nav2 admin-tabs">' +
      '<button type="button" class="' + (listTab === 'members' ? 'active' : '') + '" data-ltab="members">Members</button>' +
      '<button type="button" class="' + (listTab === 'admins' ? 'active' : '') + '" data-ltab="admins">Admins</button></div>' +
      '<div class="admin-card" id="list-panel"></div>';
    function paintList(tab) {
      listTab = tab;
      main.querySelectorAll('[data-ltab]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-ltab') === tab);
      });
      var panel = document.getElementById('list-panel');
      if (tab === 'admins') {
        panel.innerHTML = '<h3>Admins</h3><div style="overflow:auto"><table class="admin-table"><thead><tr>' +
          '<th>Name</th><th>Password</th><th>Created</th><th></th></tr></thead><tbody>' + adminRows + '</tbody></table></div>';
        panel.querySelectorAll('[data-rm]').forEach(function (b) {
          b.onclick = function () {
            if (!confirm('Remove admin?')) return;
            AdminDB.removeAdmin(b.getAttribute('data-rm'));
            renderDashboard('admins');
          };
        });
      } else {
        panel.innerHTML = '<h3>Members</h3><div style="overflow:auto"><table class="admin-table"><thead><tr>' +
          '<th>Name</th><th>Username</th><th>Password</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>' +
          memberRows + '</tbody></table></div>';
        panel.querySelectorAll('[data-view]').forEach(function (b) {
          b.onclick = function () { go('#user=' + encodeURIComponent(b.getAttribute('data-view'))); };
        });
      }
    }
    main.querySelectorAll('[data-ltab]').forEach(function (b) {
      b.onclick = function () { paintList(b.getAttribute('data-ltab')); };
    });
    document.getElementById('add-admin-btn').onclick = function () {
      var name = prompt('Admin name:');
      if (!name) return;
      var pw = prompt('Admin password (min 6):');
      if (!pw) return;
      var r = AdminDB.addAdmin(name, pw);
      if (!r.ok) alert(r.error || 'Failed');
      else renderDashboard('admins');
    };
    paintList(listTab);
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
        var r = AdminDB.applyAction(m.username, act, opts, 'owner', 'owner');
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
    if (!requireOwner()) { go('#login'); return; }
    if (h.root === 'dashboard') { renderDashboard('members'); return; }
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
  if (logoutBtn) logoutBtn.onclick = function () { AdminDB.ownerLogout(); go('#login'); };
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#login';
  else route();
})();
