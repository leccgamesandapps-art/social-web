// Settings: theme (per device + per account on device), switch account, delete, logout
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var session = DB.getSession();
  var me = session.username;

  function themeKey(user) {
    return 'sw_theme_' + String(user || '').toLowerCase();
  }

  function applyTheme(name) {
    var root = document.documentElement;
    root.setAttribute('data-theme', name || 'dark');
    try { localStorage.setItem(themeKey(me), name || 'dark'); } catch (e) {}
    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme') === name);
    });
  }

  function loadThemeForUser(user) {
    var t = 'dark';
    try { t = localStorage.getItem(themeKey(user)) || 'dark'; } catch (e) {}
    applyTheme(t);
  }

  loadThemeForUser(me);

  function showModal(html) {
    var root = document.getElementById('sw-modal-root');
    if (!root) return;
    root.innerHTML = '<div class="sw-modal-backdrop"></div><div class="sw-modal-panel">' + html + '</div>';
    root.classList.add('open');
    var bd = root.querySelector('.sw-modal-backdrop');
    if (bd) bd.onclick = closeModal;
    root.querySelectorAll('[data-close]').forEach(function (b) {
      b.onclick = closeModal;
    });
  }

  function closeModal() {
    var root = document.getElementById('sw-modal-root');
    if (!root) return;
    root.classList.remove('open');
    root.innerHTML = '';
  }

  window.SWModal = { show: showModal, close: closeModal };

  function wireSettings() {
    var label = document.getElementById('settings-account-label');
    if (label) label.textContent = '@' + me + (session.displayName ? ' · ' + session.displayName : '');

    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.onclick = function () {
        applyTheme(btn.getAttribute('data-theme'));
      };
    });
    var cur = 'dark';
    try { cur = localStorage.getItem(themeKey(me)) || 'dark'; } catch (e) {}
    document.querySelectorAll('.theme-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-theme') === cur);
    });

    var lo = document.getElementById('logout-btn-settings');
    if (lo) lo.onclick = function () {
      DB.logout();
      window.location.replace('/main');
    };

    var sw = document.getElementById('btn-switch-account');
    if (sw) sw.onclick = function () {
      var accounts = typeof DB.listLocalAccounts === 'function' ? DB.listLocalAccounts() : [];
      var list = accounts.map(function (a) {
        var active = a.username === me ? ' · current' : '';
        return '<button type="button" class="sw-modal-item" data-user="' + a.username + '">@' + a.username + (a.displayName ? ' — ' + a.displayName : '') + active + '</button>';
      }).join('') || '<p class="meta">No other accounts on this device</p>';
      showModal(
        '<div class="sw-modal-handle"></div><h3>Switch account</h3>' +
        '<p class="meta">Accounts on this phone. Each account keeps its own theme on this device.</p>' +
        list +
        '<button type="button" class="btn" data-close style="width:100%;margin-top:12px">Cancel</button>' +
        '<button type="button" class="btn primary" id="sw-go-login" style="width:100%;margin-top:8px">Login / Register another</button>'
      );
      var root = document.getElementById('sw-modal-root');
      root.querySelectorAll('[data-user]').forEach(function (b) {
        b.onclick = function () {
          var u = b.getAttribute('data-user');
          if (u === me) { closeModal(); return; }
          var pass = prompt('Password for @' + u + ':');
          if (pass == null) return;
          var r = DB.login(u, pass);
          if (!r.ok) { alert(r.error || 'Login failed'); return; }
          closeModal();
          me = u;
          session = DB.getSession();
          loadThemeForUser(u);
          window.location.replace('/dashboard#home');
          window.location.reload();
        };
      });
      var go = document.getElementById('sw-go-login');
      if (go) go.onclick = function () {
        DB.logout();
        window.location.replace('/main');
      };
    };

    var del = document.getElementById('btn-delete-account');
    if (del) del.onclick = function () {
      showModal(
        '<div class="sw-modal-handle"></div><h3>Delete account</h3>' +
        '<p class="meta">Removes @' + me + ' and their posts from this device. Cannot be undone.</p>' +
        '<input id="del-pass" type="password" placeholder="Confirm password" style="width:100%;margin:12px 0;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text)"/>' +
        '<button type="button" class="btn danger" id="del-confirm" style="width:100%">Delete forever</button>' +
        '<button type="button" class="btn" data-close style="width:100%;margin-top:8px">Cancel</button>'
      );
      document.getElementById('del-confirm').onclick = function () {
        var pass = document.getElementById('del-pass').value;
        var r = DB.deleteUser(me, pass);
        if (!r.ok) { alert(r.error || 'Failed'); return; }
        alert('Account deleted');
        window.location.replace('/main');
      };
    };
  }

  window.addEventListener('hashchange', function () {
    if ((location.hash || '').indexOf('settings') !== -1) setTimeout(wireSettings, 50);
  });
  setTimeout(wireSettings, 200);
})();
