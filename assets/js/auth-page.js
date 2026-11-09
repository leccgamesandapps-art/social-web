(function () {
  const loader = document.getElementById('loader');
  const root = document.getElementById('auth-root');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const loginErr = document.getElementById('login-error');
  const regErr = document.getElementById('reg-error');

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      formLogin.classList.toggle('hidden', tab !== 'login');
      formRegister.classList.toggle('hidden', tab !== 'register');
      loginErr.textContent = '';
      regErr.textContent = '';
    });
  });

  async function boot() {
    // Show ban/suspend message if redirected from restricted session
    const restrictMsg = sessionStorage.getItem('sw_restrict_msg');
    if (restrictMsg) {
      sessionStorage.removeItem('sw_restrict_msg');
      loginErr.textContent = restrictMsg;
    }

    try {
      const r = await SW.auth.me();
      if (r.ok && r.user) {
        window.location.replace('/dashboard#home');
        return;
      }
      if (r.code === 'RESTRICTED') {
        loginErr.textContent = r.error || 'Your account is restricted';
      }
    } catch (_) {}
    loader.classList.add('hidden');
    root.classList.remove('hidden');
  }

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    const username = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pass').value;
    try {
      const r = await SW.auth.login(username, password);
      if (!r.ok) {
        loginErr.textContent = r.error || 'Login failed';
        btn.disabled = false;
        return;
      }
      window.location.replace('/dashboard#home');
    } catch (err) {
      loginErr.textContent = err.message || 'Network error';
      btn.disabled = false;
    }
  });

  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    regErr.textContent = '';
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    const username = document.getElementById('reg-user').value.trim().toLowerCase();
    const displayName = document.getElementById('reg-display').value.trim();
    const password = document.getElementById('reg-pass').value;
    const password2 = document.getElementById('reg-pass2').value;

    if (password !== password2) {
      regErr.textContent = 'Passwords do not match';
      btn.disabled = false;
      return;
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      regErr.textContent = 'Username: letters, numbers, _ only';
      btn.disabled = false;
      return;
    }

    try {
      const r = await SW.auth.register(username, password, displayName);
      if (!r.ok) {
        regErr.textContent = r.error || 'Register failed';
        btn.disabled = false;
        return;
      }
      window.location.replace('/dashboard#home');
    } catch (err) {
      regErr.textContent = err.message || 'Network error';
      btn.disabled = false;
    }
  });

  setTimeout(boot, 700);
})();
