/* Shared API helper — talks only to Vercel serverless routes */
window.SW = window.SW || {};

SW.api = async function (path, options = {}) {
  const opts = Object.assign({
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  }, options);

  if (opts.body && typeof opts.body === 'object') {
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { data = { ok: false, error: 'Invalid response' }; }
  return { status: res.status, ...data };
};

SW.auth = {
  me() {
    return SW.api('/api/auth?action=me');
  },
  login(username, password) {
    return SW.api('/api/auth', {
      method: 'POST',
      body: { action: 'login', username, password }
    });
  },
  register(username, password, displayName) {
    return SW.api('/api/auth', {
      method: 'POST',
      body: { action: 'register', username, password, displayName }
    });
  },
  logout() {
    return SW.api('/api/auth?action=logout', { method: 'POST', body: {} });
  }
};

SW.requireAuth = async function () {
  const r = await SW.auth.me();
  if (r.code === 'RESTRICTED' || r.code === 'DELETED') {
    try { await SW.auth.logout(); } catch (_) {}
    const msg = r.error || (r.code === 'DELETED' ? 'This account was deleted.' : 'Your account is restricted');
    sessionStorage.setItem('sw_restrict_msg', msg);
    window.location.replace('/');
    return null;
  }
  if (!r.ok || !r.user) {
    window.location.replace('/');
    return null;
  }
  // Show deletion banner if scheduled
  if (r.user.deletePending) {
    const b = document.getElementById('delete-banner');
    if (b) b.classList.remove('hidden');
  }
  return r.user;
};
