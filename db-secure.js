(function () {
  var PUB = (window.SW_PUBLIC && window.SW_PUBLIC.publicKey) || 'sw_pub_le_social_web_v1';
  var SECURE_FLAG = 'sw_secure_v1';
  function utf8ToB64(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { return btoa(str); }
  }
  function b64ToUtf8(str) {
    try { return decodeURIComponent(escape(atob(str))); }
    catch (e) {
      try { return atob(str); } catch (e2) { return ''; }
    }
  }
  function deviceMaterial() {
    var k = localStorage.getItem('sw_device_id');
    if (!k) {
      k = 'd_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('sw_device_id', k);
    }
    return PUB + '|' + k;
  }
  function xorCrypt(text, material) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ material.charCodeAt(i % material.length));
    }
    return out;
  }
  function seal(obj) {
    var json = JSON.stringify(obj);
    var mat = deviceMaterial();
    var body = utf8ToB64(xorCrypt(json, mat));
    var stamp = utf8ToB64(String(json.length) + ':' + PUB.slice(0, 8));
    return JSON.stringify({ v: 1, seal: SECURE_FLAG, stamp: stamp, body: body });
  }
  function unseal(raw) {
    if (!raw) return null;
    try {
      var outer = JSON.parse(raw);
      if (!outer || outer.seal !== SECURE_FLAG || !outer.body) return JSON.parse(raw);
      var mat = deviceMaterial();
      var json = xorCrypt(b64ToUtf8(outer.body), mat);
      return JSON.parse(json);
    } catch (e) {
      try { return JSON.parse(raw); } catch (e2) { return null; }
    }
  }
  var PACKS = {
    main: 'sw_db_v2_secure',
    mainLegacy: 'sw_db_v2',
    admin: 'sw_admin_db_v1_secure',
    adminLegacy: 'sw_admin_db_v1',
    session: 'sw_session_secure',
    sessionLegacy: 'sw_session',
    ownerSession: 'sw_owner_session_secure',
    adminSession: 'sw_admin_session_secure'
  };
  function migrateIfNeeded(legacyKey, secureKey) {
    if (localStorage.getItem(secureKey)) return;
    var leg = localStorage.getItem(legacyKey);
    if (!leg) return;
    try {
      var data = JSON.parse(leg);
      localStorage.setItem(secureKey, seal(data));
    } catch (e) {}
  }
  window.SecurePack = {
    packs: PACKS,
    seal: seal,
    unseal: unseal,
    read: function (packKey, legacyKey) {
      migrateIfNeeded(legacyKey, packKey);
      var raw = localStorage.getItem(packKey);
      if (!raw && legacyKey) raw = localStorage.getItem(legacyKey);
      return unseal(raw);
    },
    write: function (packKey, data) {
      localStorage.setItem(packKey, seal(data));
    },
    hashPassword: function (password) {
      var s = String(password) + '::' + PUB + '::swsalt_v2';
      var h = utf8ToB64(s);
      for (var i = 0; i < 5; i++) h = utf8ToB64(h + PUB + i);
      return 'v2:' + h;
    },
    verifyPassword: function (password, stored) {
      if (!stored) return false;
      if (String(stored).indexOf('v2:') === 0) return this.hashPassword(password) === stored;
      try { return btoa(password + '::swsalt') === stored; } catch (e) { return false; }
    },
    writeSession: function (key, payload, ttlMs) {
      var p = Object.assign({}, payload, {
        exp: Date.now() + (ttlMs || 12 * 60 * 60 * 1000),
        seal: SECURE_FLAG
      });
      localStorage.setItem(key, seal(p));
    },
    readSession: function (key, legacyKey) {
      var data = this.read(key, legacyKey);
      if (!data) return null;
      if (data.exp && Date.now() > data.exp) {
        localStorage.removeItem(key);
        if (legacyKey) localStorage.removeItem(legacyKey);
        return null;
      }
      return data;
    },
    clearSession: function (key, legacyKey) {
      localStorage.removeItem(key);
      if (legacyKey) localStorage.removeItem(legacyKey);
    }
  };
  function patchMainDB() {
    if (typeof DB === 'undefined') return;
    var _save = DB._save.bind(DB);
    DB._load = function () {
      var data = SecurePack.read(PACKS.main, PACKS.mainLegacy);
      if (!data) {
        return { users: {}, posts: [], notifications: [], friendRequests: [], chats: {}, communities: {}, shares: {} };
      }
      data.users = data.users || {};
      data.posts = data.posts || [];
      data.notifications = data.notifications || [];
      data.friendRequests = data.friendRequests || [];
      data.chats = data.chats || {};
      data.communities = data.communities || {};
      data.shares = data.shares || {};
      return data;
    };
    DB._save = function (data) {
      SecurePack.write(PACKS.main, data);
      try { _save(data); } catch (e) {}
    };
    DB.register = function (username, password, displayName) {
      var data = DB._load();
      var key = (username || '').toLowerCase().trim();
      if (!key || key.length < 3) return { ok: false, error: 'Username too short' };
      if (data.users[key]) return { ok: false, error: 'Username taken' };
      if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
      data.users[key] = {
        username: key,
        password: SecurePack.hashPassword(password),
        displayName: displayName || key,
        bio: '',
        friends: [],
        avatar: null,
        createdAt: Date.now()
      };
      DB._save(data);
      return { ok: true };
    };
    DB.login = function (username, password) {
      var data = DB._load();
      var key = (username || '').toLowerCase().trim();
      var user = data.users[key];
      if (!user) return { ok: false, error: 'User not found' };
      if (!SecurePack.verifyPassword(password, user.password)) {
        try {
          if (user.password !== btoa(password + '::swsalt')) return { ok: false, error: 'Wrong password' };
        } catch (e) { return { ok: false, error: 'Wrong password' }; }
      }
      if (typeof AdminDB !== 'undefined' && AdminDB.isUserBlocked && AdminDB.isUserBlocked(key)) {
        return { ok: false, error: 'Account restricted (banned or suspended)' };
      }
      var session = { username: user.username, displayName: user.displayName, loginAt: Date.now() };
      SecurePack.writeSession(PACKS.session, session, 12 * 60 * 60 * 1000);
      try { localStorage.setItem(PACKS.sessionLegacy, JSON.stringify(session)); } catch (e) {}
      return { ok: true, user: session };
    };
    DB.getSession = function () {
      return SecurePack.readSession(PACKS.session, PACKS.sessionLegacy);
    };
    DB.logout = function () {
      SecurePack.clearSession(PACKS.session, PACKS.sessionLegacy);
    };
  }
  function patchAdminDB() {
    if (typeof AdminDB === 'undefined') return;
    AdminDB._load = function () {
      var d = SecurePack.read(PACKS.admin, PACKS.adminLegacy);
      if (!d) return { admins: {}, moderation: {}, reportLogs: {}, ownerPasswordHash: null, bootstrapped: false };
      d.admins = d.admins || {};
      d.moderation = d.moderation || {};
      d.reportLogs = d.reportLogs || {};
      return d;
    };
    AdminDB._save = function (data) {
      SecurePack.write(PACKS.admin, data);
      try { localStorage.setItem(PACKS.adminLegacy, JSON.stringify(data)); } catch (e) {}
    };
    AdminDB._hash = function (pw) { return SecurePack.hashPassword(pw); };
    AdminDB._verify = function (pw, hash) { return SecurePack.verifyPassword(pw, hash); };
    AdminDB.ownerLogin = function (password) {
      AdminDB.bootstrapIfNeeded();
      var d = AdminDB._load();
      if (!AdminDB._verify(password, d.ownerPasswordHash)) return { ok: false, error: 'Wrong password' };
      SecurePack.writeSession(PACKS.ownerSession, { role: 'owner', at: Date.now() }, 8 * 60 * 60 * 1000);
      return { ok: true };
    };
    AdminDB.getOwnerSession = function () {
      return SecurePack.readSession(PACKS.ownerSession, 'sw_owner_session');
    };
    AdminDB.ownerLogout = function () {
      SecurePack.clearSession(PACKS.ownerSession, 'sw_owner_session');
    };
    AdminDB.adminLogin = function (password) {
      AdminDB.bootstrapIfNeeded();
      var d = AdminDB._load();
      var names = Object.keys(d.admins);
      for (var i = 0; i < names.length; i++) {
        var a = d.admins[names[i]];
        if (AdminDB._verify(password, a.passwordHash)) {
          SecurePack.writeSession(PACKS.adminSession, { role: 'admin', name: a.name, id: names[i], at: Date.now() }, 8 * 60 * 60 * 1000);
          return { ok: true, name: a.name };
        }
      }
      return { ok: false, error: 'Wrong password' };
    };
    AdminDB.getAdminSession = function () {
      return SecurePack.readSession(PACKS.adminSession, 'sw_admin_session');
    };
    AdminDB.adminLogout = function () {
      SecurePack.clearSession(PACKS.adminSession, 'sw_admin_session');
    };
    AdminDB.addAdmin = function (name, password) {
      var d = AdminDB._load();
      var id = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || ('admin' + Date.now());
      if (d.admins[id]) return { ok: false, error: 'Admin already exists' };
      if (!password || password.length < 6) return { ok: false, error: 'Password min 6 chars' };
      d.admins[id] = { name: name || id, passwordHash: AdminDB._hash(password), createdAt: Date.now() };
      AdminDB._save(d);
      return { ok: true, id: id };
    };
    AdminDB.listAdmins = function () {
      var d = AdminDB._load();
      return Object.keys(d.admins).map(function (id) {
        var a = d.admins[id];
        return { id: id, name: a.name, password: a.passwordHint ? a.passwordHint : '(hashed — not shown)', createdAt: a.createdAt };
      });
    };
    AdminDB.revealUserPassword = function (stored) {
      if (!stored) return '(none)';
      if (String(stored).indexOf('v2:') === 0) return '(secured hash)';
      return '(legacy encoded — hidden)';
    };
  }
  function apply() { patchMainDB(); patchAdminDB(); }
  window.SecurePackApply = apply;
  apply();
})();
