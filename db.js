// Social Web Database - expanded Facebook Lite style (localStorage)

const DB = {
  _key: 'sw_db_v2',
  _sessionKey: 'sw_session',

  _load() {
    try {
      let raw = localStorage.getItem(this._key);
      if (!raw) {
        const legacy = localStorage.getItem('sw_db');
        if (legacy) { localStorage.setItem(this._key, legacy); raw = legacy; }
      }
      if (!raw) return this._empty();
      const data = JSON.parse(raw);
      data.users = data.users || {};
      data.posts = data.posts || [];
      data.notifications = data.notifications || [];
      data.friendRequests = data.friendRequests || [];
      data.chats = data.chats || {};
      data.communities = data.communities || {};
      data.shares = data.shares || {};
      data.posts.forEach(p => { if (!p.likes) p.likes = []; if (!p.comments) p.comments = []; });
      return data;
    } catch { return this._empty(); }
  },

  _empty() {
    return { users: {}, posts: [], notifications: [], friendRequests: [], chats: {}, communities: {}, shares: {} };
  },

  _save(data) { localStorage.setItem(this._key, JSON.stringify(data)); },

  _id(prefix) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = prefix + '_';
    for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  },

  register(username, password, displayName) {
    const data = this._load();
    const key = username.toLowerCase().trim();
    if (!key || key.length < 3) return { ok: false, error: 'Username too short' };
    if (data.users[key]) return { ok: false, error: 'Username already taken' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };
    data.users[key] = { username: key, password: btoa(password + '::swsalt'), displayName: displayName || key, bio: '', friends: [], avatar: null, createdAt: Date.now() };
    this._save(data);
    return { ok: true };
  },

  login(username, password) {
    const data = this._load();
    const key = username.toLowerCase().trim();
    const user = data.users[key];
    if (!user) return { ok: false, error: 'Account not found' };
    if (user.password !== btoa(password + '::swsalt')) return { ok: false, error: 'Wrong password' };
    const session = { username: user.username, displayName: user.displayName, loginAt: Date.now() };
    localStorage.setItem(this._sessionKey, JSON.stringify(session));
    return { ok: true, user: session };
  },

  getSession() {
    try { const s = localStorage.getItem(this._sessionKey); return s ? JSON.parse(s) : null; } catch { return null; }
  },

  logout() { localStorage.removeItem(this._sessionKey); },

  getUser(username) { return this._load().users[(username || '').toLowerCase()] || null; },

  updateUser(username, updates) {
    const data = this._load();
    const key = username.toLowerCase();
    if (!data.users[key]) return false;
    ['displayName', 'bio', 'avatar'].forEach(k => { if (updates[k] !== undefined) data.users[key][k] = updates[k]; });
    this._save(data);
    const session = this.getSession();
    if (session && session.username === key && updates.displayName) {
      session.displayName = updates.displayName;
      localStorage.setItem(this._sessionKey, JSON.stringify(session));
    }
    return true;
  },

  changePassword(username, newPass) {
    if (newPass.length < 6) return false;
    const data = this._load();
    const key = username.toLowerCase();
    if (!data.users[key]) return false;
    data.users[key].password = btoa(newPass + '::swsalt');
    this._save(data);
    return true;
  },

  createPost(author, content, extras) {
    const data = this._load();
    extras = extras || {};
    const post = {
      id: this._id('p'),
      author,
      content: (content || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
      likes: [],
      attachments: extras.attachments || [],
      featuredLink: extras.featuredLink || null
    };
    data.posts.unshift(post);
    try {
      this._save(data);
    } catch (e) {
      data.posts.shift();
      return { ok: false, error: 'Storage full — try fewer/smaller files' };
    }
    return { ok: true, post };
  },

  getPosts() { return this._load().posts; },
  getPost(id) { return this._load().posts.find(p => p.id === id) || null; },

  updatePost(id, content, author) {
    const data = this._load();
    const post = data.posts.find(p => p.id === id);
    if (!post || post.author !== author) return false;
    post.content = content.trim();
    post.updatedAt = Date.now();
    this._save(data);
    return true;
  },

  deletePost(id, author) {
    const data = this._load();
    const idx = data.posts.findIndex(p => p.id === id && p.author === author);
    if (idx === -1) return false;
    data.posts.splice(idx, 1);
    this._save(data);
    return true;
  },

  toggleLike(postId, username) {
    const data = this._load();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return null;
    const i = post.likes.indexOf(username);
    if (i >= 0) post.likes.splice(i, 1);
    else {
      post.likes.push(username);
      if (post.author !== username) this.addNotification(post.author, username + ' liked your post', 'activity', postId);
    }
    this._save(data);
    return post;
  },

  addComment(postId, author, text) {
    const data = this._load();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return null;
    const comment = { id: this._id('c'), author, text: text.trim(), createdAt: Date.now() };
    post.comments.push(comment);
    this._save(data);
    if (post.author !== author) this.addNotification(post.author, author + ' commented on your post', 'activity', postId);
    return comment;
  },

  sendFriendRequest(from, to) {
    const data = this._load();
    from = from.toLowerCase(); to = to.toLowerCase();
    if (!data.users[from] || !data.users[to]) return { ok: false, error: 'User not found' };
    if (from === to) return { ok: false, error: 'Cannot add yourself' };
    if (data.users[from].friends.includes(to)) return { ok: false, error: 'Already friends' };
    const exists = data.friendRequests.find(r => (r.from === from && r.to === to) || (r.from === to && r.to === from));
    if (exists) return { ok: false, error: 'Request already pending' };
    data.friendRequests.push({ id: this._id('fr'), from, to, status: 'pending', createdAt: Date.now() });
    this._save(data);
    this.addNotification(to, from + ' sent you a friend request', 'system');
    return { ok: true };
  },

  acceptFriendRequest(requestId, username) {
    const data = this._load();
    const req = data.friendRequests.find(r => r.id === requestId && r.to === username && r.status === 'pending');
    if (!req) return false;
    req.status = 'accepted';
    const a = data.users[req.from], b = data.users[req.to];
    if (a && !a.friends.includes(req.to)) a.friends.push(req.to);
    if (b && !b.friends.includes(req.from)) b.friends.push(req.from);
    this._save(data);
    this.addNotification(req.from, username + ' accepted your friend request', 'system');
    return true;
  },

  rejectFriendRequest(requestId, username) {
    const data = this._load();
    const req = data.friendRequests.find(r => r.id === requestId && r.to === username && r.status === 'pending');
    if (!req) return false;
    req.status = 'rejected';
    this._save(data);
    return true;
  },

  getFriendRequests(username) { return this._load().friendRequests.filter(r => r.to === username && r.status === 'pending'); },
  getPendingSent(username) { return this._load().friendRequests.filter(r => r.from === username && r.status === 'pending'); },
  getFriends(username) { const u = this.getUser(username); return u ? u.friends : []; },

  addNotification(toUser, message, type, refId) {
    const data = this._load();
    data.notifications.unshift({ id: this._id('n'), to: toUser, message, type: type || 'system', refId: refId || null, read: false, createdAt: Date.now() });
    this._save(data);
  },

  getNotifications(username, type) {
    let list = this._load().notifications.filter(n => n.to === username);
    if (type) list = list.filter(n => n.type === type);
    return list;
  },

  markNotifsRead(username, type) {
    const data = this._load();
    data.notifications.forEach(n => { if (n.to === username && (!type || n.type === type)) n.read = true; });
    this._save(data);
  },

  getOrCreateChat(userA, userB) {
    const data = this._load();
    const key = [userA, userB].map(u => u.toLowerCase()).sort().join('__');
    if (!data.chats[key]) {
      data.chats[key] = { id: key, type: 'dm', members: [userA.toLowerCase(), userB.toLowerCase()], messages: [], createdAt: Date.now() };
      this._save(data);
    }
    return data.chats[key];
  },

  sendMessage(chatId, from, text) {
    const data = this._load();
    const chat = data.chats[chatId];
    if (!chat) return null;
    const msg = { id: this._id('m'), from: from.toLowerCase(), text: text.trim(), createdAt: Date.now() };
    chat.messages.push(msg);
    this._save(data);
    chat.members.forEach(m => { if (m !== from.toLowerCase()) this.addNotification(m, from + ' sent you a message', 'activity', chatId); });
    return msg;
  },

  getChat(chatId) { return this._load().chats[chatId] || null; },

  listChats(username) {
    const data = this._load();
    const u = username.toLowerCase();
    return Object.values(data.chats).filter(c => (c.members || []).includes(u)).sort((a, b) => {
      const aT = a.messages.length ? a.messages[a.messages.length - 1].createdAt : a.createdAt;
      const bT = b.messages.length ? b.messages[b.messages.length - 1].createdAt : b.createdAt;
      return bT - aT;
    });
  },

  createCommunity(owner, name, description) {
    const data = this._load();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || this._id('com');
    if (data.communities[slug]) return { ok: false, error: 'Name already taken' };
    const o = owner.toLowerCase();
    data.communities[slug] = {
      id: slug, name, description: description || '', owner: o, members: [o],
      roles: { owner: { id: 'owner', name: 'Owner', permissions: ['all'] }, member: { id: 'member', name: 'Member', permissions: ['chat', 'view'] } },
      memberRoles: { [o]: 'owner' },
      categories: [{ id: 'general', name: 'General' }],
      chats: { general: { id: 'general', name: 'General', categoryId: 'general', messages: [], createdAt: Date.now() } },
      inviteCode: null,
      createdAt: Date.now()
    };
    this._save(data);
    return { ok: true, community: data.communities[slug] };
  },

  getCommunity(id) {
    const c = this._load().communities[id] || null;
    if (!c) return null;
    if (!c.roles) c.roles = { owner: { id: 'owner', name: 'Owner', permissions: ['all'] }, member: { id: 'member', name: 'Member', permissions: ['chat', 'view'] } };
    if (!c.memberRoles) { c.memberRoles = {}; (c.members || []).forEach(m => { c.memberRoles[m] = m === c.owner ? 'owner' : 'member'; }); }
    if (!c.chats) c.chats = {};
    if (!c.categories) c.categories = [{ id: 'general', name: 'General' }];
    return c;
  },

  listCommunities() { return Object.values(this._load().communities).map(c => this.getCommunity(c.id)); },

  joinCommunity(communityId, username) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c) return false;
    const u = username.toLowerCase();
    if (!c.members.map(m => String(m).toLowerCase()).includes(u)) c.members.push(u);
    if (!c.memberRoles) c.memberRoles = {};
    if (!c.memberRoles[u]) c.memberRoles[u] = 'member';
    if (!c.roles) c.roles = { owner: { id: 'owner', name: 'Owner', permissions: ['all'] }, member: { id: 'member', name: 'Member', permissions: ['chat', 'view'] } };
    this._save(data);
    return true;
  },

  updateCommunity(id, updates, byUser) {
    const data = this._load();
    const c = data.communities[id];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (updates.name !== undefined) c.name = updates.name;
    if (updates.description !== undefined) c.description = updates.description;
    this._save(data);
    return true;
  },

  addCommunityRole(communityId, roleName, permissions, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return { ok: false, error: 'Not allowed' };
    if (!c.roles) c.roles = {};
    const rid = roleName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || this._id('role');
    if (c.roles[rid]) return { ok: false, error: 'Role exists' };
    c.roles[rid] = { id: rid, name: roleName, permissions: permissions || ['view'] };
    this._save(data);
    return { ok: true, role: c.roles[rid] };
  },

  editCommunityRole(communityId, roleId, updates, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (!c.roles || !c.roles[roleId] || roleId === 'owner') return false;
    if (updates.name) c.roles[roleId].name = updates.name;
    if (updates.permissions) c.roles[roleId].permissions = updates.permissions;
    this._save(data);
    return true;
  },

  deleteCommunityRole(communityId, roleId, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (!c.roles || !c.roles[roleId] || roleId === 'owner' || roleId === 'member') return false;
    delete c.roles[roleId];
    if (c.memberRoles) Object.keys(c.memberRoles).forEach(m => { if (c.memberRoles[m] === roleId) c.memberRoles[m] = 'member'; });
    this._save(data);
    return true;
  },

  addCommunityCategory(communityId, name, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return { ok: false, error: 'Not allowed' };
    if (!c.categories) c.categories = [];
    const cid = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || this._id('cat');
    if (c.categories.find(x => x.id === cid)) return { ok: false, error: 'Exists' };
    c.categories.push({ id: cid, name });
    this._save(data);
    return { ok: true, category: { id: cid, name } };
  },

  editCommunityCategory(communityId, categoryId, name, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    const cat = (c.categories || []).find(x => x.id === categoryId);
    if (!cat) return false;
    cat.name = name;
    this._save(data);
    return true;
  },

  deleteCommunityCategory(communityId, categoryId, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (categoryId === 'general') return false;
    c.categories = (c.categories || []).filter(x => x.id !== categoryId);
    this._save(data);
    return true;
  },

  addCommunityChat(communityId, name, categoryId, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return { ok: false, error: 'Not allowed' };
    if (!c.chats) c.chats = {};
    const chatId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || this._id('ch');
    if (c.chats[chatId]) return { ok: false, error: 'Chat exists' };
    c.chats[chatId] = { id: chatId, name, categoryId: categoryId || 'general', messages: [], createdAt: Date.now() };
    this._save(data);
    return { ok: true, chat: c.chats[chatId] };
  },

  editCommunityChat(communityId, chatId, updates, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (!c.chats || !c.chats[chatId]) return false;
    if (updates.name) c.chats[chatId].name = updates.name;
    if (updates.categoryId) c.chats[chatId].categoryId = updates.categoryId;
    this._save(data);
    return true;
  },

  deleteCommunityChat(communityId, chatId, byUser) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || String(c.owner).toLowerCase() !== String(byUser).toLowerCase()) return false;
    if (!c.chats || !c.chats[chatId]) return false;
    delete c.chats[chatId];
    this._save(data);
    return true;
  },

  sendCommunityMessage(communityId, chatId, from, text) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c || !c.chats || !c.chats[chatId]) return null;
    if (!(c.members || []).map(m => String(m).toLowerCase()).includes(from.toLowerCase())) return null;
    const msg = { id: this._id('cm'), from: from.toLowerCase(), text: text.trim(), createdAt: Date.now() };
    c.chats[chatId].messages.push(msg);
    this._save(data);
    return msg;
  },

  inviteToCommunity(communityId, byUser, username) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Community not found' };
    const by = byUser.toLowerCase();
    if (!(c.members || []).map(m => String(m).toLowerCase()).includes(by)) return { ok: false, error: 'You are not a member' };
    const u = username.toLowerCase();
    if (!data.users[u]) return { ok: false, error: 'User not found' };
    if ((c.members || []).map(m => String(m).toLowerCase()).includes(u)) return { ok: false, error: 'Already a member' };
    c.members.push(u);
    if (!c.memberRoles) c.memberRoles = {};
    c.memberRoles[u] = 'member';
    this._save(data);
    this.addNotification(u, by + ' invited you to community "' + c.name + '"', 'system', communityId);
    return { ok: true };
  },

  createGroupChat(owner, name, memberUsernames) {
    const data = this._load();
    const o = owner.toLowerCase();
    const members = [o];
    (memberUsernames || []).forEach(u => {
      u = String(u).toLowerCase();
      if (u && !members.includes(u)) members.push(u);
    });
    if (members.length < 2) return { ok: false, error: 'Need at least 1 friend to create a group' };
    const id = this._id('gc');
    data.chats[id] = { id, type: 'gc', name: name || 'Group Chat', owner: o, members, messages: [], inviteCode: null, createdAt: Date.now() };
    this._save(data);
    members.forEach(m => {
      if (m !== o) this.addNotification(m, o + ' added you to group "' + (name || 'Group Chat') + '"', 'system', id);
    });
    return { ok: true, chat: data.chats[id] };
  },

  inviteToGroup(chatId, byUser, username) {
    const data = this._load();
    const chat = data.chats[chatId];
    if (!chat || chat.type !== 'gc') return { ok: false, error: 'Not a group' };
    const by = byUser.toLowerCase();
    if (!(chat.members || []).includes(by)) return { ok: false, error: 'Not a member' };
    const u = username.toLowerCase();
    if ((chat.members || []).includes(u)) return { ok: false, error: 'Already in group' };
    if (!data.users[u]) return { ok: false, error: 'User not found' };
    chat.members.push(u);
    this._save(data);
    this.addNotification(u, by + ' invited you to group "' + chat.name + '"', 'system', chatId);
    return { ok: true };
  },

  makeShareCode(type, targetId) {
    const t = String(type || '').toLowerCase();
    const id = String(targetId || '').trim();
    if (!id) return null;
    if (t === 'post' || t === 'p') return 'p!_' + id;
    if (t === 'gc' || t === 'g' || t === 'group') return 'g!_' + id;
    if (t === 'community' || t === 'c') return 'c!_' + id;
    return null;
  },

  parseShareCode(shareId) {
    const raw = String(shareId || '').trim();
    if (!raw) return null;
    const m = raw.match(/^([pgc])!_(.+)$/i);
    if (m) {
      const map = { p: 'post', g: 'gc', c: 'community' };
      return { type: map[m[1].toLowerCase()], targetId: m[2] };
    }
    const legacy = this._load().shares[raw.toLowerCase()] || this._load().shares[raw] || null;
    if (legacy) return { type: legacy.type, targetId: legacy.targetId, legacy: true };
    return null;
  },

  createShare(type, targetId, customId) {
    if (customId) {
      const data = this._load();
      let shareId = String(customId).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
      if (!shareId || shareId.length < 3) return { ok: false, error: 'Custom ID too short (min 3)', shareId: null };
      data.shares[shareId] = { type, targetId, createdAt: Date.now(), custom: true };
      this._save(data);
      const result = { ok: true, shareId };
      result.toString = function() { return this.shareId; };
      return result;
    }
    const code = this.makeShareCode(type, targetId);
    if (!code) return { ok: false, error: 'Invalid share target', shareId: null };
    const result = { ok: true, shareId: code };
    result.toString = function() { return this.shareId; };
    return result;
  },

  resolveShare(shareId) {
    return this.parseShareCode(shareId);
  },

  getShareDisplay(shareId) {
    const s = this.parseShareCode(shareId);
    if (!s) return null;
    if (s.type === 'post') {
      const p = this.getPost(s.targetId);
      return p ? { type: 'post', targetId: s.targetId, title: (p.content || 'Post').slice(0, 80), author: p.author } : null;
    }
    if (s.type === 'gc') {
      const chat = this.getChat(s.targetId);
      return chat ? { type: 'gc', targetId: s.targetId, title: chat.name || 'Group Chat' } : null;
    }
    if (s.type === 'community') {
      const c = this.getCommunity(s.targetId);
      return c ? { type: 'community', targetId: s.targetId, title: c.name || s.targetId } : null;
    }
    return null;
  },

  createCommunityInvite(communityId, byUser, customId) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c) return { ok: false, error: 'Community not found' };
    const by = String(byUser).toLowerCase();
    if (!(c.members || []).map(m => String(m).toLowerCase()).includes(by)) {
      return { ok: false, error: 'You must be a member' };
    }
    if (customId) {
      return this.createShare('community', communityId, customId);
    }
    const code = this.makeShareCode('community', communityId);
    c.inviteCode = code;
    this._save(data);
    return { ok: true, shareId: code };
  },

  createGroupInvite(chatId, byUser, customId) {
    const data = this._load();
    const chat = data.chats[chatId];
    if (!chat || chat.type !== 'gc') return { ok: false, error: 'Group not found' };
    const by = String(byUser).toLowerCase();
    if (!(chat.members || []).map(m => String(m).toLowerCase()).includes(by)) {
      return { ok: false, error: 'You must be a member' };
    }
    if (customId) {
      return this.createShare('gc', chatId, customId);
    }
    const code = this.makeShareCode('gc', chatId);
    chat.inviteCode = code;
    this._save(data);
    return { ok: true, shareId: code };
  },

  joinViaShare(shareId, username) {
    const s = this.parseShareCode(shareId);
    if (!s) return { ok: false, error: 'Invalid or expired invite link' };
    const u = String(username).toLowerCase();
    if (s.type === 'community') {
      const c = this.getCommunity(s.targetId);
      if (!c) return { ok: false, error: 'Community not found' };
      const joined = this.joinCommunity(s.targetId, u);
      if (!joined) return { ok: false, error: 'Could not join community' };
      return { ok: true, type: 'community', targetId: s.targetId, title: c.name };
    }
    if (s.type === 'gc') {
      const data = this._load();
      const chat = data.chats[s.targetId];
      if (!chat || chat.type !== 'gc') return { ok: false, error: 'Group not found' };
      if (!(chat.members || []).map(m => String(m).toLowerCase()).includes(u)) {
        chat.members.push(u);
        this._save(data);
        this.addNotification(chat.owner, u + ' joined group "' + chat.name + '" via invite', 'system', s.targetId);
      }
      return { ok: true, type: 'gc', targetId: s.targetId, title: chat.name };
    }
    if (s.type === 'post') {
      const p = this.getPost(s.targetId);
      if (!p) return { ok: false, error: 'Post not found' };
      return { ok: true, type: 'post', targetId: s.targetId, title: (p.content || 'Post').slice(0, 80) };
    }
    return { ok: false, error: 'Unknown invite type' };
  },

  search(query) {
    const data = this._load();
    const q = (query || '').toLowerCase().trim();
    if (!q) return { users: [], posts: [], communities: [] };
    const users = Object.values(data.users).filter(u => u.username.includes(q) || (u.displayName || '').toLowerCase().includes(q)).map(u => ({ username: u.username, displayName: u.displayName }));
    const posts = data.posts.filter(p => p.content.toLowerCase().includes(q));
    const communities = Object.values(data.communities).filter(c => c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
    return { users, posts, communities };
  },

  clearAll() {
    localStorage.removeItem(this._key);
    localStorage.removeItem(this._sessionKey);
    localStorage.removeItem('sw_db');
  }
};
