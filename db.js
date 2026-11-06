// Social Web Database - expanded Facebook Lite style (localStorage)

const DB = {
  _key: 'sw_db_v2',
  _sessionKey: 'sw_session',

  _load() {
    try {
      let raw = localStorage.getItem(this._key);
      if (!raw) {
        const legacy = localStorage.getItem('sw_db');
        if (legacy) {
          localStorage.setItem(this._key, legacy);
          raw = legacy;
        }
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
    } catch {
      return this._empty();
    }
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

  createPost(author, content) {
    const data = this._load();
    const post = { id: this._id('p'), author, content: content.trim(), createdAt: Date.now(), updatedAt: Date.now(), comments: [], likes: [] };
    data.posts.unshift(post);
    this._save(data);
    return post;
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
    return Object.values(data.chats).filter(c => c.members.includes(u)).sort((a, b) => {
      const aT = a.messages.length ? a.messages[a.messages.length - 1].createdAt : a.createdAt;
      const bT = b.messages.length ? b.messages[b.messages.length - 1].createdAt : b.createdAt;
      return bT - aT;
    });
  },

  createCommunity(owner, name, description) {
    const data = this._load();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || this._id('com');
    if (data.communities[slug]) return { ok: false, error: 'Name already taken' };
    data.communities[slug] = { id: slug, name, description: description || '', owner: owner.toLowerCase(), members: [owner.toLowerCase()], categories: [{ id: 'general', name: 'General' }], chats: {}, createdAt: Date.now() };
    this._save(data);
    return { ok: true, community: data.communities[slug] };
  },

  getCommunity(id) { return this._load().communities[id] || null; },
  listCommunities() { return Object.values(this._load().communities); },
  joinCommunity(communityId, username) {
    const data = this._load();
    const c = data.communities[communityId];
    if (!c) return false;
    const u = username.toLowerCase();
    if (!c.members.includes(u)) c.members.push(u);
    this._save(data);
    return true;
  },

  createShare(type, targetId) {
    const data = this._load();
    const shareId = this._id('s');
    data.shares[shareId] = { type, targetId, createdAt: Date.now() };
    this._save(data);
    return shareId;
  },

  resolveShare(shareId) { return this._load().shares[shareId] || null; },

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
