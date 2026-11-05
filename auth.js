// Auth UI handlers for main.html

document.addEventListener('DOMContentLoaded', () => {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const loginError = document.getElementById('login-error');
  const regError = document.getElementById('reg-error');

  if (!tabLogin) return; // not on main page

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    loginError.textContent = '';
    regError.textContent = '';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    loginError.textContent = '';
    regError.textContent = '';
  });

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const result = DB.login(username, password);
    if (result.ok) {
      window.location.replace('/dashboard');
    } else {
      loginError.textContent = result.error;
    }
  });

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    regError.textContent = '';
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const displayName = document.getElementById('reg-displayname').value.trim();

    if (password !== confirm) {
      regError.textContent = 'Passwords do not match';
      return;
    }

    const result = DB.register(username, password, displayName);
    if (result.ok) {
      // auto login after register
      DB.login(username, password);
      window.location.replace('/dashboard');
    } else {
      regError.textContent = result.error;
    }
  });
});
