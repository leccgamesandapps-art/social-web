(function () {
  if (typeof DB === 'undefined') {
    window.location.replace('/main');
    return;
  }
  var session = DB.getSession && DB.getSession();
  if (!session) {
    window.location.replace('/main');
    return;
  }
  var guard = document.getElementById('guard');
  var app = document.getElementById('app');
  if (guard) guard.classList.add('hidden');
  if (app) app.classList.remove('hidden');
})();
