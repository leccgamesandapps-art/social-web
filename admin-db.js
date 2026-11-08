const AdminDB = {
  _key: 'sw_admin_db_v1',
  _ownerSession: 'sw_owner_session',
  _adminSession: 'sw_admin_session',
  _load() {
    try {
      var raw = localStorage.getItem(this._key);
      if (!raw) return this._empty();
      var d = JSON.parse(raw);
      d.admins = d.admins || {};
      d.moderation = d.moderation || {};
      d.reportLogs = d.reportLogs || {};
      d.ownerPasswordHash = d.ownerPasswordHash || null;
      d.bootstrapped = !!d.bootstrapped;
      return d;
    } catch (e) { return this._empty(); }
  },
  _empty() {
    return { admins: {}, moderation: {}, reportLogs: {}, ownerPasswordHash: null, bootstrapped: false };
  },
  _save(data) { localStorage.setItem(this._key, JSON.stringify(data)); },
  _hash(pw) {
    var salt = (window.SW_PUBLIC && window.SW_PUBLIC.publicKey) || 'sw_pub';
    var s = String(pw) + '::' + salt + '::sw_admin';
    try { return btoa(unescape(encodeURIComponent(s))); } catch (e) { return btoa(s); }
  },
  _verify(pw, hash) { return this._hash(pw) === hash; },
  bootstrapIfNeeded() {
    var d = this._load();
    if (d.bootstrapped && d.ownerPasswordHash) return;
    d.ownerPasswordHash = this._hash('OwnerSW2026!');
    if (!d.admins['defaultadmin']) {
      d.admins['defaultadmin'] = {
        name: 'Default Admin',
        passwordHash: this._hash('AdminSW2026!'),
        passwordHint: 'AdminSW2026!',
        createdAt: Date.now()
      };
    }
    d.bootstrapped = true;
    this._save(d);
  },
  ownerLogin(password) {
    this.bootstrapIfNeeded();
    var d = this._load();
    if (!this._verify(password, d.ownerPasswordHash)) return { ok: false, error: 'Wrong password' };
    localStorage.setItem(this._ownerSession, JSON.stringify({ role: 'owner', at: Date.now() }));
    return { ok: true };
  },
  ownerLogout() { localStorage.removeItem(this._ownerSession); },
  getOwnerSession() {
    try { var s = localStorage.getItem(this._ownerSession); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  adminLogin(password) {
    this.bootstrapIfNeeded();
    var d = this._load();
    var names = Object.keys(d.admins);
    for (var i = 0; i < names.length; i++) {
      var a = d.admins[names[i]];
      if (this._verify(password, a.passwordHash)) {
        localStorage.setItem(this._adminSession, JSON.stringify({ role: 'admin', name: a.name, id: names[i], at: Date.now() }));
        return { ok: true, name: a.name };
      }
    }
    return { ok: false, error: 'Wrong password' };
  },
  adminLogout() { localStorage.removeItem(this._adminSession); },
  getAdminSession() {
    try { var s = localStorage.getItem(this._adminSession); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  },
  addAdmin(name, password) {
    var d = this._load();
    var id = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || ('admin' + Date.now());
    if (d.admins[id]) return { ok: false, error: 'Admin already exists' };
    if (!password || password.length < 6) return { ok: false, error: 'Password min 6 chars' };
    d.admins[id] = { name: name || id, passwordHash: this._hash(password), passwordHint: password, createdAt: Date.now() };
    this._save(d);
    return { ok: true, id: id };
  },
  removeAdmin(id) {
    var d = this._load();
    if (!d.admins[id]) return { ok: false, error: 'Not found' };
    delete d.admins[id];
    this._save(d);
    return { ok: true };
  },
  listAdmins() {
    var d = this._load();
    return Object.keys(d.admins).map(function (id) {
      var a = d.admins[id];
      return { id: id, name: a.name, password: a.passwordHint || '(hidden)', createdAt: a.createdAt };
    });
  },
  revealUserPassword(stored) {
    try {
      var raw = atob(stored);
      if (raw.indexOf('::swsalt') >= 0) return raw.split('::swsalt')[0];
      return raw;
    } catch (e) { return '(encrypted)'; }
  },
  listMembers() {
    if (typeof DB === 'undefined') return [];
    var data = DB._load();
    var users = data.users || {};
    var mod = this._load().moderation || {};
    return Object.keys(users).map(function (k) {
      var u = users[k];
      var m = mod[k] || {};
      return {
        username: u.username || k,
        displayName: u.displayName || k,
        password: AdminDB.revealUserPassword(u.password),
        createdAt: u.createdAt || 0,
        status: m.status || 'active',
        until: m.until || null
      };
    }).sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  },
  getMember(username) {
    if (typeof DB === 'undefined') return null;
    var u = DB.getUser(username);
    if (!u) return null;
    var mod = this._load().moderation[username.toLowerCase()] || {};
    return {
      username: u.username,
      displayName: u.displayName,
      password: this.revealUserPassword(u.password),
      bio: u.bio || '',
      createdAt: u.createdAt,
      friends: (u.friends || []).length,
      status: mod.status || 'active',
      until: mod.until || null,
      warnings: mod.warnings || []
    };
  },
  applyAction(username, action, opts, byRole, byName) {
    opts = opts || {};
    var d = this._load();
    var k = String(username || '').toLowerCase();
    if (typeof DB !== 'undefined' && !DB.getUser(k)) return { ok: false, error: 'User not found' };
    if (!d.moderation[k]) d.moderation[k] = { status: 'active', until: null, warnings: [] };
    var m = d.moderation[k];
    var now = Date.now();
    var entry = { id: 'log_' + now, action: action, byRole: byRole, byName: byName || byRole, note: opts.note || '', timerMs: opts.timerMs || null, at: now };
    if (action === 'ban_timer') { m.status = 'banned'; m.until = now + (opts.timerMs || 3600000); }
    else if (action === 'ban_permanent') { m.status = 'banned'; m.until = null; }
    else if (action === 'suspend_timer') { m.status = 'suspended'; m.until = now + (opts.timerMs || 3600000); }
    else if (action === 'suspend_permanent') { m.status = 'suspended'; m.until = null; }
    else if (action === 'warning') {
      m.warnings = m.warnings || [];
      m.warnings.push({ note: opts.note || 'Warning', at: now, by: byName });
    } else if (action === 'unban') { m.status = 'active'; m.until = null; }
    else return { ok: false, error: 'Unknown action' };
    d.moderation[k] = m;
    if (!d.reportLogs[k]) d.reportLogs[k] = [];
    d.reportLogs[k].unshift(entry);
    this._save(d);
    return { ok: true, moderation: m };
  },
  getReportLog(username) {
    var d = this._load();
    return d.reportLogs[String(username || '').toLowerCase()] || [];
  },
  isUserBlocked(username) {
    var d = this._load();
    var m = d.moderation[String(username || '').toLowerCase()];
    if (!m) return false;
    if (m.status === 'active') return false;
    if (m.until && Date.now() > m.until) {
      m.status = 'active'; m.until = null;
      d.moderation[String(username).toLowerCase()] = m;
      this._save(d);
      return false;
    }
    return m.status === 'banned' || m.status === 'suspended';
  }
};
try { AdminDB.bootstrapIfNeeded(); } catch (e) {}
