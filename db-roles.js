(function () {
  if (typeof DB === 'undefined') return;
  var EVERYONE = {
    view_channels: true,
    send_messages: true,
    manage_messages: false,
    manage_channels: false,
    manage_roles: false,
    kick_members: false,
    create_invite: false,
    administrator: false
  };
  var PERM_KEYS = Object.keys(EVERYONE);
  function ensureStructure(c) {
    if (!c.roles) c.roles = {};
    if (!c.memberRoles) c.memberRoles = {};
    Object.keys(c.memberRoles).forEach(function (u) {
      var v = c.memberRoles[u];
      if (v === 'owner' || v === 'admin' || v === 'member') c.memberRoles[u] = [];
      else if (typeof v === 'string') c.memberRoles[u] = v ? [v] : [];
      else if (!Array.isArray(v)) c.memberRoles[u] = [];
    });
  }
  var _getCommunity = DB.getCommunity.bind(DB);
  DB.getCommunity = function (id) {
    var c = _getCommunity(id);
    if (c) ensureStructure(c);
    return c;
  };
  var _joinCommunity = DB.joinCommunity.bind(DB);
  DB.joinCommunity = function (communityId, username) {
    var r = _joinCommunity(communityId, username);
    var data = DB._load();
    var c = data.communities[communityId];
    if (c) {
      var u = String(username || '').toLowerCase();
      if (!c.memberRoles) c.memberRoles = {};
      if (!c.memberRoles[u] || c.memberRoles[u] === 'member') c.memberRoles[u] = [];
      DB._save(data);
    }
    return r;
  };
  var _createCommunity = DB.createCommunity.bind(DB);
  DB.createCommunity = function (owner, name, description) {
    var r = _createCommunity(owner, name, description);
    if (r && r.ok && r.community) {
      var data = DB._load();
      var c = data.communities[r.community.id];
      if (c) {
        c.roles = c.roles || {};
        delete c.roles.owner;
        delete c.roles.admin;
        delete c.roles.member;
        c.memberRoles = {};
        c.memberRoles[String(owner).toLowerCase()] = [];
        DB._save(data);
        r.community = DB.getCommunity(r.community.id);
      }
    }
    return r;
  };
  DB.isCommunityOwner = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    if (!c) return false;
    return String(c.owner || '').toLowerCase() === String(username || '').toLowerCase();
  };
  DB.getMemberRoleIds = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    if (!c) return [];
    var u = String(username || '').toLowerCase();
    var v = (c.memberRoles || {})[u] || [];
    if (typeof v === 'string') return v ? [v] : [];
    return Array.isArray(v) ? v : [];
  };
  DB.getEffectivePerms = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    var perms = {};
    PERM_KEYS.forEach(function (k) { perms[k] = EVERYONE[k]; });
    if (!c) return perms;
    if (DB.isCommunityOwner(communityId, username)) {
      PERM_KEYS.forEach(function (k) { perms[k] = true; });
      return perms;
    }
    var roleIds = DB.getMemberRoleIds(communityId, username);
    roleIds.forEach(function (rid) {
      var role = c.roles && c.roles[rid];
      if (!role || !role.permissions) return;
      PERM_KEYS.forEach(function (k) {
        if (role.permissions[k] === true) perms[k] = true;
      });
    });
    roleIds.forEach(function (rid) {
      var role = c.roles && c.roles[rid];
      if (!role || !role.permissions) return;
      PERM_KEYS.forEach(function (k) {
        if (role.permissions[k] === false) perms[k] = false;
      });
    });
    if (perms.administrator) PERM_KEYS.forEach(function (k) { perms[k] = true; });
    return perms;
  };
  DB.hasCommunityPerm = function (communityId, username, perm) {
    if (DB.isCommunityOwner(communityId, username)) return true;
    var p = DB.getEffectivePerms(communityId, username);
    if (p.administrator) return true;
    return !!p[perm];
  };
  DB.isCommunityAdmin = function (communityId, username) {
    if (DB.isCommunityOwner(communityId, username)) return true;
    var p = DB.getEffectivePerms(communityId, username);
    return !!(p.administrator || p.manage_channels || p.manage_roles);
  };
  DB.createRole = function (communityId, name, permissions, byUser) {
    if (!DB.isCommunityOwner(communityId, byUser) && !DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) {
      return { ok: false, error: 'No permission' };
    }
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    if (!c.roles) c.roles = {};
    var rid = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || DB._id('role');
    if (rid === 'owner' || rid === 'admin' || rid === 'member' || rid === 'everyone') return { ok: false, error: 'Reserved name' };
    if (c.roles[rid]) return { ok: false, error: 'Role exists' };
    var perms = {};
    PERM_KEYS.forEach(function (k) {
      if (permissions && permissions[k] === true) perms[k] = true;
      else if (permissions && permissions[k] === false) perms[k] = false;
    });
    c.roles[rid] = { id: rid, name: name, permissions: perms, createdAt: Date.now() };
    DB._save(data);
    return { ok: true, role: c.roles[rid] };
  };
  DB.updateRole = function (communityId, roleId, updates, byUser) {
    if (!DB.isCommunityOwner(communityId, byUser) && !DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) {
      return { ok: false, error: 'No permission' };
    }
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c || !c.roles || !c.roles[roleId]) return { ok: false, error: 'Role not found' };
    if (updates.name) c.roles[roleId].name = updates.name;
    if (updates.permissions) {
      var perms = c.roles[roleId].permissions || {};
      PERM_KEYS.forEach(function (k) {
        if (updates.permissions[k] === true) perms[k] = true;
        else if (updates.permissions[k] === false) perms[k] = false;
        else if (updates.permissions[k] === null) delete perms[k];
      });
      c.roles[roleId].permissions = perms;
    }
    DB._save(data);
    return { ok: true, role: c.roles[roleId] };
  };
  DB.deleteRole = function (communityId, roleId, byUser) {
    if (!DB.isCommunityOwner(communityId, byUser) && !DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) {
      return { ok: false, error: 'No permission' };
    }
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c || !c.roles || !c.roles[roleId]) return { ok: false, error: 'Not found' };
    delete c.roles[roleId];
    if (c.memberRoles) {
      Object.keys(c.memberRoles).forEach(function (u) {
        var arr = c.memberRoles[u];
        if (Array.isArray(arr)) c.memberRoles[u] = arr.filter(function (id) { return id !== roleId; });
        else if (arr === roleId) c.memberRoles[u] = [];
      });
    }
    DB._save(data);
    return { ok: true };
  };
  DB.giveRole = function (communityId, targetUser, roleId, byUser) {
    if (!DB.isCommunityOwner(communityId, byUser) && !DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) {
      return { ok: false, error: 'No permission' };
    }
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    if (!c.roles || !c.roles[roleId]) return { ok: false, error: 'Role not found' };
    var t = String(targetUser || '').toLowerCase();
    if (String(c.owner).toLowerCase() === t) return { ok: false, error: 'Owner does not use roles' };
    if (!(c.members || []).map(function (m) { return String(m).toLowerCase(); }).includes(t)) {
      return { ok: false, error: 'Not a member' };
    }
    if (!c.memberRoles) c.memberRoles = {};
    var arr = c.memberRoles[t];
    if (!Array.isArray(arr)) arr = [];
    if (arr.indexOf(roleId) < 0) arr.push(roleId);
    c.memberRoles[t] = arr;
    DB._save(data);
    return { ok: true };
  };
  DB.removeRoleFromMember = function (communityId, targetUser, roleId, byUser) {
    if (!DB.isCommunityOwner(communityId, byUser) && !DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) {
      return { ok: false, error: 'No permission' };
    }
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    var t = String(targetUser || '').toLowerCase();
    if (!c.memberRoles) return { ok: true };
    var arr = c.memberRoles[t];
    if (!Array.isArray(arr)) { c.memberRoles[t] = []; DB._save(data); return { ok: true }; }
    c.memberRoles[t] = arr.filter(function (id) { return id !== roleId; });
    DB._save(data);
    return { ok: true };
  };
  DB.leaveCommunity = function (communityId, username) {
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    var u = String(username || '').toLowerCase();
    if (String(c.owner).toLowerCase() === u) return { ok: false, error: 'Owner cannot leave — delete community instead' };
    c.members = (c.members || []).filter(function (m) { return String(m).toLowerCase() !== u; });
    if (c.memberRoles) delete c.memberRoles[u];
    DB._save(data);
    return { ok: true };
  };
  DB.addCommunityCategory = function (communityId, name, byUser) {
    if (!DB.hasCommunityPerm(communityId, byUser, 'manage_channels')) return { ok: false, error: 'Not allowed' };
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    if (!c.categories) c.categories = [];
    var cid = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || DB._id('cat');
    if (c.categories.find(function (x) { return x.id === cid; })) return { ok: false, error: 'Exists' };
    c.categories.push({ id: cid, name: name });
    DB._save(data);
    return { ok: true, category: { id: cid, name: name } };
  };
  DB.addCommunityChat = function (communityId, name, categoryId, byUser) {
    if (!DB.hasCommunityPerm(communityId, byUser, 'manage_channels')) return { ok: false, error: 'Not allowed' };
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    if (!c.chats) c.chats = {};
    var chatId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || DB._id('ch');
    if (c.chats[chatId]) return { ok: false, error: 'Chat exists' };
    c.chats[chatId] = { id: chatId, name: name, categoryId: categoryId || 'general', messages: [], createdAt: Date.now() };
    DB._save(data);
    return { ok: true, chat: c.chats[chatId] };
  };
  var _sendCom = DB.sendCommunityMessage.bind(DB);
  DB.sendCommunityMessage = function (communityId, chatId, from, text) {
    if (!DB.hasCommunityPerm(communityId, from, 'send_messages')) return null;
    if (!DB.hasCommunityPerm(communityId, from, 'view_channels')) return null;
    return _sendCom(communityId, chatId, from, text);
  };
  DB.PERM_KEYS = PERM_KEYS;
  DB.EVERYONE_PERMS = EVERYONE;
})();
