// Simple local user + content database (localStorage)
// This is the "user database" for register/login detection

const DB = {
  _key: 'sw_db_v1',
  _sessionKey: 'sw_session',

  _load() {
    try {
      const raw = localStorage.getItem(this._key);
      return raw ? JSON.parse(raw) : { users: {}, posts: [], notifications: [] };
    } catch {
      return { users: {}, posts: [], notifications: [] };
    }
  },

  _save(data) {
    localStorage.setItem(this._key, JSON.stringify(data));
  },

  // ---- Users ----
  register(username, password, displayName) {
    const data = this._load();
    const key = username.toLowerCase().trim();
    if (!key || key.length < 3) return { ok: false, error: 'Username too short' };
    if (data.users[key]) return { ok: false, error: 'Username already taken' };
    if (password.length < 6) return { ok: false, error: 'Password must be at least 6 characters' };

    data.users[key] = {
      username: key,
      password: btoa(password + '::swsalt'), // very basic obfuscation (not real security)
      displayName: displayName || key,
      bio: '',
      friends: [],
      createdAt: Date.now()
    };
    this._save(data);
    return { ok: true };
  },

  login(username, password) {
    const data = this._load();
    const key = username.toLowerCase().trim();
    const user = data.users[key];
    if (!user) return { ok: false, error: 'Account not found' };
    const encoded = btoa(password + '::swsalt');
    if (user.password !== encoded) return { ok: false, error: 'Wrong password' };

    const session = {
      username: user.username,
      displayName: user.displayName,
      loginAt: Date.now()
    };
    localStorage.setItem(this._sessionKey, JSON.stringify(session));
    return { ok: true, user: session };
  },

  getSession() {
    try {
      const s = localStorage.getItem(this._sessionKey);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem(this._sessionKey);
  },

  getUser(username) {
    const data = this._load();
    return data.users[username.toLowerCase()] || null;
  },

  updateUser(username, updates) {
    const data = this._load();
    const key = username.toLowerCase();
    if (!data.users[key]) return false;
    Object.assign(data.users[key], updates);
    this._save(data);
    // refresh session displayName if needed
    const session = this.getSession();
    if (session && session.username === key && updates.displayName) {
      session.displayName = updates.displayName;
      localStorage.setItem(this._sessionKey, JSON.stringify(session));
    }
    return true;
  },

  changePassword(username, newPass) {
    if (newPass.length < 6) return false;
    return this.updateUser(username, { password: btoa(newPass + '::swsalt') });
  },

  // ---- Posts ----
  createPost(author, content) {
    const data = this._load();
    const post = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      author,
      content: content.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      comments: [],
      likes: []
    };
    data.posts.unshift(post);
    this._save(data);
    return post;
  },

  getPosts() {
    return this._load().posts;
  },

  getPost(id) {
    return this._load().posts.find(p => p.id === id) || null;
  },

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

  addComment(postId, author, text) {
    const data = this._load();
    const post = data.posts.find(p => p.id === postId);
    if (!post) return null;
    const comment = {
      id: 'c_' + Date.now(),
      author,
      text: text.trim(),
      createdAt: Date.now()
    };
    post.comments.push(comment);
    this._save(data);

    // notify post author
    if (post.author !== author) {
      this.addNotification(post.author, `${author} commented on your post`, postId);
    }
    return comment;
  },

  // ---- Notifications ----
  addNotification(toUser, message, postId) {
    const data = this._load();
    data.notifications.unshift({
      id: 'n_' + Date.now(),
      to: toUser,
      message,
      postId: postId || null,
      read: false,
      createdAt: Date.now()
    });
    this._save(data);
  },

  getNotifications(username) {
    return this._load().notifications.filter(n => n.to === username);
  },

  markNotifsRead(username) {
    const data = this._load();
    data.notifications.forEach(n => {
      if (n.to === username) n.read = true;
    });
    this._save(data);
  },

  // ---- Friends (simple) ----
  addFriend(username, friendName) {
    const data = this._load();
    const user = data.users[username.toLowerCase()];
    const friend = data.users[friendName.toLowerCase()];
    if (!user || !friend) return false;
    if (!user.friends.includes(friend.username)) {
      user.friends.push(friend.username);
      this.addNotification(friend.username, `${username} added you as a friend`);
    }
    this._save(data);
    return true;
  },

  search(query) {
    const data = this._load();
    const q = query.toLowerCase().trim();
    if (!q) return { users: [], posts: [] };
    const users = Object.values(data.users)
      .filter(u => u.username.includes(q) || (u.displayName || '').toLowerCase().includes(q))
      .map(u => ({ username: u.username, displayName: u.displayName }));
    const posts = data.posts.filter(p => p.content.toLowerCase().includes(q));
    return { users, posts };
  },

  clearAll() {
    localStorage.removeItem(this._key);
    localStorage.removeItem(this._sessionKey);
  }
};
