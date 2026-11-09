window.ServerAPI = {
  async status() {
    try { return await (await fetch('/api/db/status', { cache: 'no-store' })).json(); }
    catch (e) { return { ok: false, databaseConfigured: false }; }
  },
  async register(username, password, displayName) {
    return await (await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username, password, displayName }) })).json();
  },
  async login(username, password) {
    return await (await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username, password }) })).json();
  },
  async me() {
    return await (await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })).json();
  },
  async logout() {
    return await (await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })).json();
  },
  async posts() {
    return await (await fetch('/api/posts', { credentials: 'include', cache: 'no-store' })).json();
  },
  async createPost(content) {
    return await (await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ content }) })).json();
  }
};
