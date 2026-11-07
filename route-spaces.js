// Ensure #spaces and legacy chat/communities route correctly
(function () {
  function goSpaces() {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var el = document.getElementById('view-spaces');
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
    document.querySelectorAll('[data-view="spaces"]').forEach(function (n) { n.classList.add('active'); });
    if (window.SpacesUI) window.SpacesUI.render();
  }
  function check() {
    var h = (location.hash || '#home').slice(1);
    var root = h.split('=')[0];
    if (root === 'spaces' || root === 'chat' || root === 'communities') {
      if (root !== 'spaces') location.hash = '#spaces';
      else goSpaces();
    }
  }
  window.addEventListener('hashchange', check);
  setTimeout(check, 100);
})();
