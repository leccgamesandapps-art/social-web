// Center Menu popup + full-screen slide panels
(function () {
  var root = null;

  function ensureRoot() {
    root = document.getElementById('sw-menu-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'sw-menu-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function closeAll() {
    var r = ensureRoot();
    r.classList.remove('open');
    r.innerHTML = '';
    document.querySelectorAll('[data-view="menu"]').forEach(function (n) {
      n.classList.remove('active');
    });
  }

  function openMenuCenter() {
    var r = ensureRoot();
    r.innerHTML =
      '<div class="sw-menu-backdrop" data-close-all></div>' +
      '<div class="sw-menu-center">' +
      '<div class="sw-menu-handle"></div>' +
      '<h3>Menu</h3>' +
      '<button type="button" class="sw-menu-item" data-panel="profile">👤 My Profile</button>' +
      '<button type="button" class="sw-menu-item" data-panel="friends">👥 Friends</button>' +
      '<button type="button" class="sw-menu-item" data-panel="notifications">🔔 Notifications</button>' +
      '<button type="button" class="sw-menu-item" data-panel="settings">⚙️ Settings</button>' +
      '<button type="button" class="sw-menu-item danger" data-close-all>Close</button>' +
      '</div>';
    r.classList.add('open');
    r.querySelectorAll('[data-close-all]').forEach(function (el) {
      el.onclick = closeAll;
    });
    r.querySelectorAll('[data-panel]').forEach(function (btn) {
      btn.onclick = function () {
        openPanel(btn.getAttribute('data-panel'));
      };
    });
  }

  function panelTitle(name) {
    if (name === 'profile') return 'My Profile';
    if (name === 'friends') return 'Friends';
    if (name === 'notifications') return 'Notifications';
    if (name === 'settings') return 'Settings';
    return name;
  }

  function openPanel(name) {
    var r = ensureRoot();
    var existing = r.querySelector('.sw-menu-panel');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.className = 'sw-menu-panel';
    panel.innerHTML =
      '<div class="sw-menu-panel-bar">' +
      '<button type="button" class="btn small" id="sw-panel-back">← Back to Menu</button>' +
      '<button type="button" class="btn small" id="sw-panel-close">Close</button>' +
      '</div>' +
      '<h2 class="sw-menu-panel-title">' + panelTitle(name) + '</h2>' +
      '<div class="sw-menu-panel-body" id="sw-panel-body"><div class="empty"><p>Loading…</p></div></div>';
    r.appendChild(panel);
    requestAnimationFrame(function () { panel.classList.add('in'); });

    document.getElementById('sw-panel-back').onclick = function () {
      panel.classList.remove('in');
      setTimeout(function () {
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (!r.querySelector('.sw-menu-center')) openMenuCenter();
      }, 280);
    };
    document.getElementById('sw-panel-close').onclick = closeAll;

    var hashMap = {
      profile: '#profile',
      friends: '#friends',
      notifications: '#notifications',
      settings: '#settings'
    };
    location.hash = hashMap[name] || '#home';
    setTimeout(function () {
      var viewId = {
        profile: 'view-profile',
        friends: 'view-friends',
        notifications: 'view-notifications',
        settings: 'view-settings'
      }[name];
      var src = document.getElementById(viewId);
      var body = document.getElementById('sw-panel-body');
      if (src && body) body.innerHTML = src.innerHTML;
      ensureRoot().classList.add('open');
    }, 100);
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[data-view="menu"], #bottom-menu-btn');
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      openMenuCenter();
    }
  }, true);

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').slice(1).split('=')[0];
    if (h === 'menu' || h === 'more') openMenuCenter();
  });

  setTimeout(function () {
    var old = document.getElementById('more-btn-mobile');
    if (old) old.style.display = 'none';
  }, 100);

  window.openMoreSheet = function () { openMenuCenter(); };
  window.SWMenu = { open: openMenuCenter, close: closeAll, openPanel: openPanel };
})();
