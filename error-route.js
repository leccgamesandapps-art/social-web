// Error route override - loads after app.js
(function(){
  function parseRoute2() {
    var raw = (location.hash || '#home').slice(1);
    var parts = raw.split('=').filter(Boolean).map(function(p){ return decodeURIComponent(p); });
    return { root: parts[0] || 'home', param: parts[1] || '', parts: parts, raw: raw };
  }
  var known = {
    home:1, main:1, profile:1, friends:1, notifications:1, user:1, search:1,
    create:1, settings:1, post:1, edit:1, chat:1, communities:1, community:1,
    spaces:1, share:1, more:1, error:1, '':1
  };
  function showError() {
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    var el = document.getElementById('view-error');
    if (el) el.classList.add('active');
    var path = document.getElementById('error-path');
    var unknown = sessionStorage.getItem('sw_unknown_hash') || (location.hash||'').slice(1) || '(empty)';
    if (path) path.textContent = 'Unknown route: #' + unknown;
    var btn = document.getElementById('error-home-btn');
    if (btn) btn.onclick = function(){ sessionStorage.removeItem('sw_unknown_hash'); location.hash = '#home'; };
  }
  window.addEventListener('hashchange', function(){
    var r = parseRoute2();
    if (!known[r.root]) {
      if (location.hash !== '#error') {
        sessionStorage.setItem('sw_unknown_hash', (location.hash||'').slice(1));
        location.hash = '#error';
      } else {
        showError();
      }
    } else if (r.root === 'error') {
      showError();
    }
  }, true);
  setTimeout(function(){
    var r0 = parseRoute2();
    if (!known[r0.root]) {
      sessionStorage.setItem('sw_unknown_hash', (location.hash||'').slice(1));
      location.hash = '#error';
    } else if (r0.root === 'error') {
      showError();
    }
  }, 50);
})();
