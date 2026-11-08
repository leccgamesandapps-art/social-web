(function () {
  if (typeof DB === 'undefined') return;
  var ADMIN_PERMS = ['manage_channels', 'manage_roles', 'invite', 'kick', 'edit_community', 'chat', 'view'];
  function ensureAdminRole(c) {
    if (!c.roles) c.roles = {};
    if (!c.roles.owner) c.roles.owner = { id: 'owner', name: 'Owner', permissions: ['all'] };
    if (!c.roles.admin) c.roles.admin = { id: 'admin', name: 'Admin', permissions: ADMIN_PERMS.slice() };
    if (!c.roles.member) c.roles.member = { id: 'member', name: 'Member', permissions: ['chat', 'view'] };
  }
  var _getCommunity = DB.getCommunity.bind(DB);
  DB.getCommunity = function (id) {
    var c = _getCommunity(id);
    if (c) ensureAdminRole(c);
    return c;
  };
  var _createCommunity = DB.createCommunity.bind(DB);
  DB.createCommunity = function (owner, name, description) {
    var r = _createCommunity(owner, name, description);
    if (r && r.ok && r.community) {
      var data = DB._load();
      var c = data.communities[r.community.id];
      if (c) {
        ensureAdminRole(c);
        DB._save(data);
        r.community = DB.getCommunity(r.community.id);
      }
    }
    return r;
  };
  DB.getMemberRoleId = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    if (!c) return null;
    var u = String(username || '').toLowerCase();
    if (String(c.owner || '').toLowerCase() === u) return 'owner';
    var mr = (c.memberRoles || {})[u] || (c.memberRoles || {})[username];
    return mr || 'member';
  };
  DB.getMemberRole = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    if (!c) return null;
    var rid = DB.getMemberRoleId(communityId, username);
    return (c.roles && c.roles[rid]) || { id: rid, name: rid, permissions: ['view', 'chat'] };
  };
  DB.hasCommunityPerm = function (communityId, username, perm) {
    var c = DB.getCommunity(communityId);
    if (!c) return false;
    var u = String(username || '').toLowerCase();
    if (String(c.owner || '').toLowerCase() === u) return true;
    var role = DB.getMemberRole(communityId, username);
    var perms = role.permissions || [];
    if (perms.indexOf('all') >= 0) return true;
    if (perms.indexOf(perm) >= 0) return true;
    if (role.id === 'admin' && ADMIN_PERMS.indexOf(perm) >= 0) return true;
    return false;
  };
  DB.isCommunityOwner = function (communityId, username) {
    var c = DB.getCommunity(communityId);
    if (!c) return false;
    return String(c.owner || '').toLowerCase() === String(username || '').toLowerCase();
  };
  DB.isCommunityAdmin = function (communityId, username) {
    if (DB.isCommunityOwner(communityId, username)) return true;
    var rid = DB.getMemberRoleId(communityId, username);
    if (rid === 'admin') return true;
    return DB.hasCommunityPerm(communityId, username, 'manage_channels') ||
           DB.hasCommunityPerm(communityId, username, 'manage_roles');
  };
  DB.setMemberRole = function (communityId, targetUser, roleId, byUser) {
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    var by = String(byUser || '').toLowerCase();
    var target = String(targetUser || '').toLowerCase();
    if (String(c.owner).toLowerCase() === target) return { ok: false, error: 'Cannot change owner role' };
    if (roleId === 'owner') return { ok: false, error: 'Use transfer ownership' };
    var byIsOwner = String(c.owner).toLowerCase() === by;
    if (!byIsOwner) {
      if (!DB.hasCommunityPerm(communityId, byUser, 'manage_roles')) return { ok: false, error: 'No permission' };
      if (roleId === 'admin') return { ok: false, error: 'Only owner can assign Admin' };
    }
    ensureAdminRole(c);
    if (roleId !== 'member' && roleId !== 'admin' && !c.roles[roleId]) return { ok: false, error: 'Role missing' };
    if (!c.memberRoles) c.memberRoles = {};
    c.memberRoles[target] = roleId;
    DB._save(data);
    return { ok: true };
  };
  DB.leaveCommunity = function (communityId, username) {
    var data = DB._load();
    var c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Not found' };
    var u = String(username || '').toLowerCase();
    if (String(c.owner).toLowerCase() === u) return { ok: false, error: 'Owner must transfer ownership first' };
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
})();
