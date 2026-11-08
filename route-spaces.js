// Spaces route - must win over error-route
(function () {
  function goSpaces() {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var el = document.getElementById('view-spaces');
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    document.querySelectorAll('[data-view="spaces"]').forEach(function (n) { n.classList.add('active'); });
    if (window.SpacesUI) {
      try { window.SpacesUI.render(); } catch (e) {}
    }
  }
  function rootOf() {
    var h = (location.hash || '#home').slice(1);
    return (h.split('=')[0] || 'home');
  }
  function check() {
    var root = rootOf();
    if (root === 'chat' || root === 'communities') {
      location.hash = '#spaces';
      return;
    }
    if (root === 'spaces') goSpaces();
  }
  window.addEventListener('hashchange', check, true);
  setTimeout(check, 30);
  setTimeout(check, 120);
  setTimeout(check, 300);
})();
