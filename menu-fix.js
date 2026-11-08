// Override Menu items: Spaces only (no Chat / Communities)
(function () {
  var obs = new MutationObserver(function () {
    var sheet = document.getElementById('more-sheet');
    if (!sheet || sheet.getAttribute('data-fixed')) return;
    var panel = sheet.querySelector('.sheet-panel');
    if (!panel) return;
    sheet.setAttribute('data-fixed', '1');
    panel.innerHTML =
      '<div class="sheet-handle"></div><h3>Menu</h3>' +
      '<button type="button" class="sheet-item" data-go="home">🏠 Home</button>' +
      '<button type="button" class="sheet-item" data-go="profile">👤 Profile</button>' +
      '<button type="button" class="sheet-item" data-go="friends">👥 Friends</button>' +
      '<button type="button" class="sheet-item" data-go="notifications">🔔 Alerts</button>' +
      '<button type="button" class="sheet-item" data-go="spaces">◈ Spaces</button>' +
      '<button type="button" class="sheet-item" data-go="search">🔍 Search</button>' +
      '<button type="button" class="sheet-item" data-go="create">✏️ Create</button>' +
      '<button type="button" class="sheet-item" data-go="settings">⚙️ Settings</button>' +
      '<button type="button" class="sheet-item danger" data-go="logout">Logout</button>';
    panel.querySelectorAll('.sheet-item').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var go = btn.getAttribute('data-go');
        var s = document.getElementById('more-sheet');
        if (s) {
          s.classList.remove('open');
          setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 280);
        }
        if (go === 'logout') {
          if (typeof DB !== 'undefined') DB.logout();
          window.location.replace('/main');
          return;
        }
        location.hash = '#' + go;
      };
    });
  });
  if (document.body) obs.observe(document.body, { childList: true, subtree: true });
})();
