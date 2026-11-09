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
    return SW.api('/api/auth?action=login', {
      method: 'POST',
      body: { username, password }
    });
  },
  register(username, password, displayName) {
    return SW.api('/api/auth?action=register', {
      method: 'POST',
      body: { username, password, displayName }
    });
  },
  logout() {
    return SW.api('/api/auth?action=logout', { method: 'POST', body: {} });
  }
};

SW.requireAuth = async function () {
  const r = await SW.auth.me();
  if (!r.ok || !r.user) {
    window.location.replace('/');
    return null;
  }
  return r.user;
};
