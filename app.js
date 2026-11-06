// Social Web - Facebook Lite style (routes use = not /)
(function () {
  const session = DB.getSession();
  if (!session) { window.location.replace('/main'); return; }

  document.getElementById('guard').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const me = session.username;
  let displayName = session.displayName || me;

  (function ensureUser() {
    let u = DB.getUser(me);
    if (!u) {
      const data = DB._load();
      data.users[me] = { username: me, password: '', displayName: displayName, bio: '', friends: [], avatar: null, createdAt: Date.now() };
      DB._save(data);
      u = data.users[me];
    }
    displayName = u.displayName || me;
  })();

  document.getElementById('mini-name').textContent = displayName;
  const av = document.getElementById('sidebar-avatar');
  if (av) av.textContent = (displayName[0] || 'U').toUpperCase();

  function parseRoute() {
    const raw = (location.hash || '#home').slice(1);
    const parts = raw.split('=').filter(Boolean).map(p => {
      try { return decodeURIComponent(p); } catch { return p; }
    });
    return { root: parts[0] || 'home', param: parts[1] || '', parts, raw };
  }

  function navigate(path) {
    location.hash = path.startsWith('#') ? path : '#' + path;
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navMap = { 'profile-edit': 'profile', user: 'profile', post: 'home', edit: 'home', 'chat-dm': 'chat', community: 'more', 'community-settings': 'more', 'community-chat': 'more', communities: 'more', friends: 'more', notifications: 'more', settings: 'more', error: 'home' };
    const nav = navMap[name] || name;
    document.querySelectorAll('[data-view="' + nav + '"]').forEach(n => n.classList.add('active'));
    if (['home','search','create','chat','profile'].includes(name)) {
      document.querySelectorAll('[data-view="' + name + '"]').forEach(n => n.classList.add('active'));
    }
  }

  function route() {
    const { root, param, parts } = parseRoute();
    if (root === 'home' || root === 'main' || root === '') { showView('home'); renderFeed(); return; }
    if (root === 'profile' && param === 'edit') { showView('profile-edit'); loadProfileEdit(); return; }
    if (root === 'profile') { showView('profile'); renderProfile(me); return; }
    if (root === 'friends') { showView('friends'); renderFriends(param || 'list'); return; }
    if (root === 'notifications') { showView('notifications'); renderNotifications(param || 'all'); return; }
    if (root === 'user' && param) { showView('user'); renderUser(param); return; }
    if (root === 'search') { showView('search'); return; }
    if (root === 'create') { showView('create'); return; }
    if (root === 'settings') { showView('settings'); return; }
    if (root === 'post' && param) { showView('post'); openPost(param); return; }
    if (root === 'edit' && param) { showView('edit'); openEdit(param); return; }
    if (root === 'chat' && param === 'gc' && parts[2]) { showView('chat-dm'); return; }
    if (root === 'chat' && param) { showView('chat-dm'); openChat(param); return; }
    if (root === 'chat') { showView('chat'); renderChatList(); return; }
    if (root === 'communities') { showView('communities'); renderCommunities(); return; }
    if (root === 'community' && param) {
      const sub = (parts && parts[2]) || '';
      const sub2 = (parts && parts[3]) || '';
      if (sub === 'settings') { showView('community-settings'); return; }
      if (sub === 'chat' && sub2) { showView('community-chat'); return; }
      showView('community');
      renderCommunity(param);
      return;
    }
    if (root === 'share' && param) { resolveShareRoute(param); return; }
    if (root === 'more') { openMoreSheet(); return; }
    if (root === 'error') { showView('error'); return; }
    if (location.hash && location.hash !== '#error') {
      try { sessionStorage.setItem('sw_unknown_hash', (location.hash || '').slice(1)); } catch(e) {}
      navigate('error');
      return;
    }
    showView('error');
  }

  window.addEventListener('hashchange', route);

  document.querySelectorAll('[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const v = item.dataset.view;
      if (v === 'more') { openMoreSheet(); return; }
      const map = { home:'home', profile:'profile', friends:'friends', notifications:'notifications', chat:'chat', search:'search', create:'create', settings:'settings', communities:'communities' };
      navigate(map[v] || 'home');
    });
  });

  function doLogout() { DB.logout(); window.location.replace('/main'); }
  document.getElementById('logout-btn').onclick = doLogout;
  const ml = document.getElementById('logout-btn-mobile');
  if (ml) ml.onclick = doLogout;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function letter(name) { return ((name || 'U')[0] || 'U').toUpperCase(); }
  function time(ts) { try { return new Date(ts).toLocaleString(); } catch { return ''; } }

  function openMoreSheet() {
    closeMoreSheet();
    const sheet = document.createElement('div');
    sheet.id = 'more-sheet';
    sheet.innerHTML =
      '<div class="sheet-backdrop"></div>' +
      '<div class="sheet-panel">' +
      '<div class="sheet-handle"></div>' +
      '<h3>Menu</h3>' +
      '<button type="button" class="sheet-item" data-go="home">🏠 Home</button>' +
      '<button type="button" class="sheet-item" data-go="profile">👤 My Profile</button>' +
      '<button type="button" class="sheet-item" data-go="friends">👥 Friends</button>' +
      '<button type="button" class="sheet-item" data-go="notifications">🔔 Notifications</button>' +
      '<button type="button" class="sheet-item" data-go="communities">🌐 Communities</button>' +
      '<button type="button" class="sheet-item" data-go="chat">💬 Chat</button>' +
      '<button type="button" class="sheet-item" data-go="search">🔍 Search</button>' +
      '<button type="button" class="sheet-item" data-go="create">✏️ Create Post</button>' +
      '<button type="button" class="sheet-item" data-go="settings">⚙️ Settings</button>' +
      '<button type="button" class="sheet-item danger" data-go="logout">Logout</button>' +
      '</div>';
    document.body.appendChild(sheet);
    const backdrop = sheet.querySelector('.sheet-backdrop');
    if (backdrop) backdrop.addEventListener('click', function(e){ e.preventDefault(); closeMoreSheet(); });
    sheet.querySelectorAll('.sheet-item').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const go = btn.getAttribute('data-go');
        closeMoreSheet();
        if (go === 'logout') { doLogout(); return; }
        navigate(go);
      });
    });
    void sheet.offsetHeight;
    requestAnimationFrame(function() {
      sheet.classList.add('open');
    });
  }
  function closeMoreSheet() {
    const s = document.getElementById('more-sheet');
    if (!s) return;
    s.classList.remove('open');
    setTimeout(function(){ if (s.parentNode) s.parentNode.removeChild(s); }, 280);
  }

  function postCard(p) {
    const isOwner = p.author === me;
    const liked = (p.likes || []).includes(me);
    return '<article class="post-card" data-id="' + p.id + '"><div class="post-header"><div class="avatar">' + letter(p.author) + '</div><div class="post-meta"><strong><a href="#user=' + encodeURIComponent(p.author) + '" style="color:inherit;text-decoration:none">@' + esc(p.author) + '</a></strong><span class="time">' + time(p.createdAt) + '</span></div></div><p class="post-content">' + esc(p.content) + '</p><div class="post-actions"><button class="btn small like-btn" data-id="' + p.id + '">' + (liked ? '♥' : '♡') + ' ' + (p.likes || []).length + '</button><button class="btn small view-btn" data-id="' + p.id + '">💬 ' + (p.comments || []).length + '</button><button class="btn small share-btn" data-id="' + p.id + '">↗ Share</button>' + (isOwner ? '<button class="btn small edit-btn" data-id="' + p.id + '">Edit</button><button class="btn small danger del-btn" data-id="' + p.id + '">Delete</button>' : '') + '</div></article>';
  }

  function bindPostActions(root) {
    const r = root || document;
    r.querySelectorAll('.view-btn').forEach(b => b.onclick = () => navigate('post=' + b.dataset.id));
    r.querySelectorAll('.edit-btn').forEach(b => b.onclick = () => navigate('edit=' + b.dataset.id));
    r.querySelectorAll('.del-btn').forEach(b => b.onclick = () => { if (confirm('Delete this post?')) { DB.deletePost(b.dataset.id, me); route(); } });
    r.querySelectorAll('.like-btn').forEach(b => b.onclick = () => { DB.toggleLike(b.dataset.id, me); route(); });
    r.querySelectorAll('.share-btn').forEach(b => b.onclick = () => { const sid = DB.createShare('post', b.dataset.id); prompt('Share link (copy):', location.origin + '/dashboard#share=' + sid); });
  }

  function renderFeed() {
    const feed = document.getElementById('feed');
    const posts = DB.getPosts();
    if (!posts.length) {
      feed.innerHTML = '<div class="empty"><div class="empty-icon">📝</div><p>No posts yet</p><p class="sub">Be the first to share something!</p><button class="btn primary" style="margin-top:18px" id="empty-create">Create Post</button></div>';
      const btn = document.getElementById('empty-create');
      if (btn) btn.onclick = () => navigate('create');
      return;
    }
    feed.innerHTML = posts.map(postCard).join('');
    bindPostActions(feed);
  }

  function openPost(id) {
    const post = DB.getPost(id);
    if (!post) { navigate('home'); return; }
    document.getElementById('single-post').innerHTML = postCard(post);
    bindPostActions(document.getElementById('single-post'));
    const list = document.getElementById('comments-list');
    const comments = post.comments || [];
    list.innerHTML = comments.length ? comments.map(c => '<div class="comment"><strong>@' + esc(c.author) + '</strong><span class="time">' + time(c.createdAt) + '</span><p>' + esc(c.text) + '</p></div>').join('') : '<div class="empty" style="padding:24px"><div class="empty-icon">💬</div><p>No comments yet</p></div>';
  }

  document.getElementById('back-btn').onclick = () => navigate('home');
  document.getElementById('comment-submit').onclick = () => {
    const text = document.getElementById('comment-input').value.trim();
    const { param } = parseRoute();
    if (!text || !param) return;
    DB.addComment(param, me, text);
    document.getElementById('comment-input').value = '';
    openPost(param);
    updateNotifBadge();
  };

  document.getElementById('post-submit').onclick = () => {
    const content = document.getElementById('post-content').value.trim();
    if (!content) return;
    DB.createPost(me, content);
    document.getElementById('post-content').value = '';
    navigate('home');
  };

  let editingId = null;
  function openEdit(id) {
    const post = DB.getPost(id);
    if (!post || post.author !== me) { navigate('home'); return; }
    editingId = id;
    document.getElementById('edit-content').value = post.content;
  }
  document.getElementById('edit-save').onclick = () => {
    const content = document.getElementById('edit-content').value.trim();
    if (content && editingId) { DB.updatePost(editingId, content, me); editingId = null; navigate('home'); }
  };
  document.getElementById('edit-cancel').onclick = () => { editingId = null; navigate('home'); };

  function renderProfile(username) {
    const user = DB.getUser(username) || { username: username, displayName: username, bio: '', friends: [], createdAt: Date.now() };
    const isMe = username === me;
    document.getElementById('profile-header').innerHTML = '<div class="profile-card"><div class="avatar">' + letter(user.displayName || user.username) + '</div><h2>' + esc(user.displayName || user.username) + '</h2><p class="handle">@' + esc(user.username) + '</p><p class="bio">' + esc(user.bio || 'No bio yet') + '</p><p class="meta">Joined ' + new Date(user.createdAt).toLocaleDateString() + ' • ' + (user.friends || []).length + ' friends</p>' + (isMe ? '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn primary" id="go-edit-profile">Edit Profile</button><button class="btn" id="go-settings">Settings</button><button class="btn" id="go-friends">Friends</button></div>' : '') + '</div>';
    if (isMe) {
      const b1 = document.getElementById('go-edit-profile');
      const b2 = document.getElementById('go-settings');
      const b3 = document.getElementById('go-friends');
      if (b1) b1.onclick = () => navigate('profile=edit');
      if (b2) b2.onclick = () => navigate('settings');
      if (b3) b3.onclick = () => navigate('friends');
    }
    const posts = DB.getPosts().filter(p => p.author === username);
    const pp = document.getElementById('profile-posts');
    pp.innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="empty"><div class="empty-icon">📝</div><p>No posts yet</p></div>';
    bindPostActions(pp);
  }

  function loadProfileEdit() {
    const user = DB.getUser(me) || { displayName: me, bio: '' };
    document.getElementById('edit-displayname').value = user.displayName || '';
    document.getElementById('edit-bio').value = user.bio || '';
  }
  document.getElementById('save-profile-edit').onclick = () => {
    const name = document.getElementById('edit-displayname').value.trim();
    const bio = document.getElementById('edit-bio').value.trim();
    if (name) {
      DB.updateUser(me, { displayName: name, bio });
      document.getElementById('mini-name').textContent = name;
      if (av) av.textContent = name[0].toUpperCase();
      alert('Profile saved');
      navigate('profile');
    }
  };

  function renderUser(username) {
    const user = DB.getUser(username);
    if (!user) {
      document.getElementById('user-header').innerHTML = '<div class="empty"><div class="empty-icon">👤</div><p>User not found</p></div>';
      document.getElementById('user-posts').innerHTML = '';
      return;
    }
    const isFriend = (user.friends || []).includes(me);
    let actions = '';
    if (username !== me) {
      if (isFriend) actions = '<button class="btn small" onclick="location.hash=\'#chat=' + encodeURIComponent(username) + '\'">Message</button>';
      else actions = '<button class="btn small primary" id="add-friend-btn">Add Friend</button>';
    }
    document.getElementById('user-header').innerHTML = '<div class="profile-card"><div class="avatar">' + letter(user.displayName || user.username) + '</div><h2>' + esc(user.displayName || user.username) + '</h2><p class="handle">@' + esc(user.username) + '</p><p class="bio">' + esc(user.bio || 'No bio yet') + '</p><p class="meta">' + (user.friends || []).length + ' friends</p><div style="margin-top:14px;display:flex;gap:8px;justify-content:center">' + actions + '</div></div>';
    const af = document.getElementById('add-friend-btn');
    if (af) af.onclick = () => { const r = DB.sendFriendRequest(me, username); alert(r.ok ? 'Friend request sent!' : r.error); updateNotifBadge(); };
    const posts = DB.getPosts().filter(p => p.author === username);
    document.getElementById('user-posts').innerHTML = posts.length ? posts.map(postCard).join('') : '<div class="empty"><div class="empty-icon">📝</div><p>No posts yet</p></div>';
    bindPostActions(document.getElementById('user-posts'));
  }

  document.querySelectorAll('[data-ftab]').forEach(t => {
    t.onclick = () => { document.querySelectorAll('[data-ftab]').forEach(x => x.classList.remove('active')); t.classList.add('active'); renderFriends(t.dataset.ftab); };
  });

  function renderFriends(tab) {
    tab = tab || 'list';
    const panel = document.getElementById('friends-panel');
    document.querySelectorAll('[data-ftab]').forEach(x => x.classList.toggle('active', x.dataset.ftab === tab));
    if (tab === 'requests') {
      const reqs = DB.getFriendRequests(me);
      if (!reqs.length) { panel.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><p>No friend requests</p></div>'; return; }
      panel.innerHTML = reqs.map(r => '<div class="list-item"><div class="avatar" style="width:36px;height:36px">' + letter(r.from) + '</div><div style="flex:1"><strong>@' + esc(r.from) + '</strong></div><button class="btn small primary accept-fr" data-id="' + r.id + '">Accept</button><button class="btn small reject-fr" data-id="' + r.id + '">Reject</button></div>').join('');
      panel.querySelectorAll('.accept-fr').forEach(b => b.onclick = () => { DB.acceptFriendRequest(b.dataset.id, me); renderFriends('requests'); updateNotifBadge(); });
      panel.querySelectorAll('.reject-fr').forEach(b => b.onclick = () => { DB.rejectFriendRequest(b.dataset.id, me); renderFriends('requests'); });
      return;
    }
    if (tab === 'pending') {
      const sent = DB.getPendingSent(me);
      if (!sent.length) { panel.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><p>No pending requests</p></div>'; return; }
      panel.innerHTML = sent.map(r => '<div class="list-item"><div class="avatar" style="width:36px;height:36px">' + letter(r.to) + '</div><div style="flex:1"><strong>@' + esc(r.to) + '</strong><span class="time"> Pending</span></div></div>').join('');
      return;
    }
    const friends = DB.getFriends(me);
    if (!friends.length) { panel.innerHTML = '<div class="empty"><div class="empty-icon">👥</div><p>No friends yet</p><p class="sub">Search and add people</p></div>'; return; }
    panel.innerHTML = friends.map(f => {
      const u = DB.getUser(f);
      return '<div class="list-item"><div class="avatar" style="width:36px;height:36px">' + letter(f) + '</div><div style="flex:1"><strong>@' + esc(f) + '</strong>' + (u ? '<span style="color:var(--muted);font-size:0.85rem"> · ' + esc(u.displayName) + '</span>' : '') + '</div><button class="btn small" onclick="location.hash=\'#user=' + encodeURIComponent(f) + '\'">View</button><button class="btn small" onclick="location.hash=\'#chat=' + encodeURIComponent(f) + '\'">Chat</button></div>';
    }).join('');
  }

  document.querySelectorAll('[data-ntab]').forEach(t => {
    t.onclick = () => { document.querySelectorAll('[data-ntab]').forEach(x => x.classList.remove('active')); t.classList.add('active'); renderNotifications(t.dataset.ntab); };
  });

  function renderNotifications(type) {
    type = type || 'all';
    document.querySelectorAll('[data-ntab]').forEach(x => x.classList.toggle('active', x.dataset.ntab === type));
    const filter = type === 'all' ? null : type;
    const notifs = DB.getNotifications(me, filter);
    DB.markNotifsRead(me, filter);
    updateNotifBadge();
    const list = document.getElementById('notif-list');
    if (!notifs.length) { list.innerHTML = '<div class="empty"><div class="empty-icon">🔔</div><p>No notifications</p></div>'; return; }
    list.innerHTML = notifs.map(n => '<div class="list-item ' + (n.read ? '' : 'unread') + '"><div style="flex:1"><p>' + esc(n.message) + '</p><span class="time">' + time(n.createdAt) + ' · ' + esc(n.type) + '</span></div></div>').join('');
  }

  function updateNotifBadge() {
    const count = DB.getNotifications(me).filter(n => !n.read).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (count) { badge.textContent = count; badge.classList.remove('hidden'); }
      else badge.classList.add('hidden');
    }
  }

  document.getElementById('search-input').addEventListener('input', e => {
    const results = DB.search(e.target.value);
    const box = document.getElementById('search-results');
    let html = '';
    if (results.users.length) {
      html += '<h3>Users</h3>';
      html += results.users.map(u => '<div class="list-item"><div class="avatar" style="width:36px;height:36px">' + letter(u.username) + '</div><div style="flex:1"><strong>@' + esc(u.username) + '</strong><span style="color:var(--muted);font-size:0.85rem"> · ' + esc(u.displayName) + '</span></div><button class="btn small" onclick="location.hash=\'#user=' + encodeURIComponent(u.username) + '\'">View</button></div>').join('');
    }
    if (results.posts.length) {
      html += '<h3>Posts</h3>';
      html += results.posts.map(p => '<div class="list-item"><div style="flex:1"><strong>@' + esc(p.author) + '</strong><p style="margin:0;font-size:0.9rem">' + esc(p.content.slice(0, 80)) + '</p></div><button class="btn small" onclick="location.hash=\'#post=' + encodeURIComponent(p.id) + '\'">Open</button></div>').join('');
    }
    if (results.communities.length) {
      html += '<h3>Communities</h3>';
      html += results.communities.map(c => '<div class="list-item"><div style="flex:1"><strong>' + esc(c.name) + '</strong><span class="time"> · ' + c.members.length + ' members</span></div><button class="btn small" onclick="location.hash=\'#community=' + encodeURIComponent(c.id) + '\'">Open</button></div>').join('');
    }
    if (!html) html = '<div class="empty"><p>No results</p></div>';
    box.innerHTML = html;
  });

  document.getElementById('save-pass').onclick = () => {
    const p = document.getElementById('set-newpass').value;
    if (p.length < 6) { alert('Min 6 characters'); return; }
    if (DB.changePassword(me, p)) { alert('Password updated'); document.getElementById('set-newpass').value = ''; }
    else alert('Failed');
  };
  document.getElementById('clear-data').onclick = () => {
    if (confirm('This clears ALL local data including accounts. Continue?')) {
      DB.clearAll();
      window.location.replace('/main');
    }
  };

  function renderChatList() {
    const chats = DB.listChats(me);
    const list = document.getElementById('chat-list');
    if (!chats.length) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>No chats yet</p><p class="sub">Message a friend from their profile</p></div>';
      return;
    }
    list.innerHTML = chats.map(c => {
      if (c.type === 'gc') {
        const last = c.messages.length ? c.messages[c.messages.length - 1] : null;
        return '<div class="list-item" style="cursor:pointer" onclick="location.hash=\'#chat=gc=' + encodeURIComponent(c.id) + '\'"><div class="avatar" style="width:36px;height:36px;background:linear-gradient(135deg,#8b7cff,#a78bfa)">G</div><div style="flex:1"><strong>' + esc(c.name || 'Group') + '</strong><p style="font-size:0.8rem;color:var(--muted);margin:0">' + c.members.length + ' members' + (last ? ' · ' + esc(last.text.slice(0,30)) : '') + '</p></div></div>';
      }
      const other = c.members.find(m => m !== me) || c.members[0];
      const last = c.messages.length ? c.messages[c.messages.length - 1] : null;
      return '<div class="list-item" style="cursor:pointer" onclick="location.hash=\'#chat=' + encodeURIComponent(other) + '\'"><div class="avatar" style="width:36px;height:36px">' + letter(other) + '</div><div style="flex:1"><strong>@' + esc(other) + '</strong>' + (last ? '<p style="font-size:0.85rem;color:var(--muted);margin:0">' + esc(last.text.slice(0, 40)) + '</p>' : '') + '</div></div>';
    }).join('');
  }

  let currentChatId = null;
  function openChat(withUser) {
    const chat = DB.getOrCreateChat(me, withUser);
    currentChatId = chat.id;
    document.getElementById('chat-title').textContent = '@' + withUser;
    renderMessages(chat);
  }

  function renderMessages(chat) {
    const box = document.getElementById('chat-messages');
    if (!chat.messages.length) {
      box.innerHTML = '<div class="empty" style="padding:24px"><p>No messages yet. Say hi!</p></div>';
      return;
    }
    box.innerHTML = chat.messages.map(m =>
      '<div class="chat-bubble ' + (m.from === me ? 'mine' : 'theirs') + '">' +
      '<div class="chat-text">' + esc(m.text) + '</div>' +
      '<div class="chat-time">' + time(m.createdAt) + '</div></div>'
    ).join('');
    box.scrollTop = box.scrollHeight;
  }

  document.getElementById('chat-back').onclick = () => navigate('chat');
  document.getElementById('chat-send').onclick = () => {
    const text = document.getElementById('chat-input').value.trim();
    if (!text || !currentChatId) return;
    DB.sendMessage(currentChatId, me, text);
    document.getElementById('chat-input').value = '';
    renderMessages(DB.getChat(currentChatId));
    updateNotifBadge();
  };
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('chat-send').click();
  });

  function renderCommunities() {
    const list = DB.listCommunities();
    const el = document.getElementById('communities-list');
    if (!list.length) {
      el.innerHTML = '<div class="empty"><div class="empty-icon">🌐</div><p>No communities yet</p></div>';
      return;
    }
    el.innerHTML = list.map(c => '<div class="list-item"><div style="flex:1"><strong>' + esc(c.name) + '</strong><p style="font-size:0.85rem;color:var(--muted);margin:0">' + esc(c.description || '') + ' · ' + c.members.length + ' members</p></div><button class="btn small" onclick="location.hash=\'#community=' + encodeURIComponent(c.id) + '\'">Open</button></div>').join('');
  }

  document.getElementById('create-community-btn').onclick = () => {
    const name = prompt('Community name:');
    if (!name) return;
    const desc = prompt('Description (optional):') || '';
    const r = DB.createCommunity(me, name, desc);
    if (r.ok) { alert('Created!'); navigate('community=' + r.community.id); } else alert(r.error);
  };

  function renderCommunity(id) {
    const c = DB.getCommunity(id);
    if (!c) { navigate('communities'); return; }
    const isOwner = String(c.owner || '').toLowerCase() === String(me || '').toLowerCase();
    const isMember = (c.members || []).map(m => String(m).toLowerCase()).includes(String(me || '').toLowerCase());
    document.getElementById('community-header').innerHTML =
      '<div class="profile-card"><h2>' + esc(c.name) + '</h2><p class="bio">' + esc(c.description || '') + '</p>' +
      '<p class="meta">' + c.members.length + ' members · Owner @' + esc(c.owner) + '</p>' +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      (!isMember ? '<button class="btn primary" id="join-com">Join</button>' : '<span class="meta">You are a member</span>') +
      (isMember ? '<button class="btn" id="com-invite-btn">Invite</button>' : '') +
      (isOwner ? '<button class="btn primary" id="com-open-settings">⚙️ Settings</button>' : '') +
      '</div></div>';
    const join = document.getElementById('join-com');
    if (join) join.onclick = () => { DB.joinCommunity(id, me); renderCommunity(id); };
    const setBtn = document.getElementById('com-open-settings');
    if (setBtn) setBtn.onclick = () => navigate('community=' + encodeURIComponent(id) + '=settings');
    const invBtn = document.getElementById('com-invite-btn');
    if (invBtn) invBtn.onclick = () => {
      const friends = (DB.getFriends(me) || []).filter(f => !(c.members || []).map(x => String(x).toLowerCase()).includes(String(f).toLowerCase()));
      if (!friends.length) { alert('No friends to invite'); return; }
      const pick = prompt('Invite friend (username):\n' + friends.join(', '));
      if (!pick) return;
      if (typeof DB.inviteToCommunity === 'function') {
        const r = DB.inviteToCommunity(id, me, pick.trim());
        alert(r.ok ? 'Invited!' : (r.error || 'Failed'));
      } else {
        DB.joinCommunity(id, pick.trim().toLowerCase());
        alert('Added');
      }
      renderCommunity(id);
    };
    const cats = c.categories || [];
    const chats = Object.values(c.chats || {});
    let body = '';
    cats.forEach(cat => {
      body += '<h3 style="margin:16px 0 8px;font-size:0.85rem;color:var(--muted);text-transform:uppercase">' + esc(cat.name) + '</h3>';
      const catChats = chats.filter(ch => ch.categoryId === cat.id);
      if (!catChats.length) body += '<p class="meta" style="margin-bottom:8px">No chats — add in Settings</p>';
      else body += catChats.map(ch =>
        '<div class="list-item" style="cursor:pointer" onclick="location.hash=\'#community=' + encodeURIComponent(id) + '=chat=' + encodeURIComponent(ch.id) + '\'">' +
        '<div style="flex:1"><strong>#' + esc(ch.name) + '</strong></div></div>'
      ).join('');
    });
    document.getElementById('community-body').innerHTML = body || '<p class="meta">No categories</p>';
  }
  document.getElementById('com-back').onclick = () => navigate('communities');

  function resolveShareRoute(shareId) {
    const s = DB.resolveShare(shareId);
    if (!s) { alert('Share link invalid'); navigate('home'); return; }
    if (s.type === 'post') navigate('post=' + s.targetId);
    else if (s.type === 'community') navigate('community=' + s.targetId);
    else navigate('home');
  }

  const moreBtn = document.getElementById('more-btn-mobile');
  if (moreBtn) {
    moreBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openMoreSheet();
    });
  }

  updateNotifBadge();
  route();
})();
