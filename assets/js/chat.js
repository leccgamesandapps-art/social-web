(function () {
  const guard = document.getElementById('guard');
  const app = document.getElementById('app');
  let currentUser = null;

  document.querySelectorAll('.ctab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      // Future: filter list by chat / gc / community
    });
  });

  async function boot() {
    currentUser = await SW.requireAuth();
    if (!currentUser) return;
    guard.classList.add('hidden');
    app.classList.remove('hidden');
  }

  boot();
})();
