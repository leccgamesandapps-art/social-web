// Dashboard app logic + route protection

(function () {
  const session = DB.getSession();
  if (!session) {
    window.location.replace('/main');
    return;
  }

  document.getElementById('guard').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const currentUser = session.username;
  const displayName = session.displayName || currentUser;
  const initial = (displayName[0] || 'U').toUpperCase();

  document.getElementById('mini-name').textContent = displayName;
  const av = document.getElementById('sidebar-avatar');
  if (av) av.textContent = initial;

  const views = document.querySelectorAll('.view');
  const navItems = document.querySelectorAll('.nav-item');

  function show showView(name) {
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    document.querySelectorAll(`[data-view="${name}"]`).forEach(n => n.classList.add('active'));

    if (name === 'home') renderFeed();
    if (name === 'profile') renderProfile(currentUser);
    if (name === 'friends') renderFriends();
    if (name === 'notifications') renderNotifications();
    if (name === 'settings') loadSettings();
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      showView(item.dataset.view);
    });
  });

  function doLogout() {
    DB.logout();
    window.location.replace('/main');
  }
  document.getElementById('logout-btn').addEventListener('click', doLogout);
  const mobileLogout = document.getElementById('logout-btn-mobile');
  if (mobileLogout) mobileLogout.addEventListener('click', doLogout);

  function renderFeed() {
    const feed = document.getElementById('feed');
    const posts = DB.getPosts();
    if (!posts.length) {
      feed.innerHTML = `
        <div class="empty">
          <div class="empty-icon">📝</div>
          <p>No posts yet</p>
          <p class="sub">Be the first to share something!</p>
          <button class="btn primary" style="margin-top:18px" onclick="document.querySelectorAll('[data-view=create]')[0].click()">Create Post</button>
        </div>`;
      return;
    }
    feed.innerHTML = posts.map(p => postCard(p)).join('');
    bindPostActions();
  }

  function postCard(p) {
    const time = new Date(p.createdAt).toLocaleString();
    const isOwner = p.author === currentUser;
    const letter = (p.author[0] || 'U').toUpperCase();
    return `
      <article class="post-card" data-id="${p.id}">
        <div class="post-header">
          <div class="avatar">${letter}</div>
          <div class="post-meta">
            <strong>@${p.author}</strong>
            <span class="time">${time}</span>
          </div>
        </div>
        <p class="post-content">${escapeHtml(p.content)}</p>
        <div class="post-actions">
          <button class="btn small view-btn" data-id="${p.id}">💬 ${p.comments.length}</button>
          ${isOwner ? `
            <button class="btn small edit-btn" data-id="${p.id}">Edit</button>
            <button class="btn small danger del-btn" data-id="${p.id}">Delete</button>
          ` : ''}
        </div>
      </article>
    `;
  }

  function bindPostActions() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.onclick = () => openPost(btn.dataset.id);
    });
    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.onclick = () => openEdit(btn.dataset.id);
    });
    document.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = () => {
        if (confirm('Delete this post?')) {
          DB.deletePost(btn.dataset.id, currentUser);
          renderFeed();
        }
      };
    });
  }

  let currentPostId = null;

  function openPost(id) {
    currentPostId = id;
    const post = DB.getPost(id);
    if (!post) return;
    showView('post');
    document.getElementById('single-post').innerHTML = postCard(post);
    const list = document.getElementById('comments-list');
    list.innerHTML = post.comments.length
      ? post.comments.map(c => `
          <div class="comment">
            <strong>@${c.author}</strong>
            <span class="time">${new Date(c.createdAt).toLocaleString()}</span>
            <p>${escapeHtml(c.text)}</p>
          </div>
        `).join('')
      : '<div class="empty" style="padding:24px"><div class="empty-icon">💬</div><p>No comments yet</p></div>';
  }

  document.getElementById('back-btn').addEventListener('click', () => showView('home'));

  document.getElementById('comment-submit').addEventListener('click', () => {
    const text = document.getElementById('comment-input').value.trim();
    if (!text || !currentPostId) return;
    DB.addComment(currentPostId, currentUser, text);
    document.getElementById('comment-input').value = '';
    openPost(currentPostId);
    updateNotifBadge();
  });

  document.getElementById('post-submit').addEventListener('click', () => {
    const content = document.getElementById('post-content').value.trim();
    if (!content) return;
    DB.createPost(currentUser, content);
    document.getElementById('post-content').value = '';
    showView('home');
  });

  let editingId = null;
  function openEdit(id) {
    const post = DB.getPost(id);
    if (!post || post.author !== currentUser) return;
    editingId = id;
    document.getElementById('edit-content').value = post.content;
    showView('edit');
  }

  document.getElementById('edit-save').addEventListener('click', () => {
    const content = document.getElementById('edit-content').value.trim();
    if (content && editingId) {
      DB.updatePost(editingId, content, currentUser);
      editingId = null;
      showView('home');
    }
  });
  document.getElementById('edit-cancel').addEventListener('click', () => {
    editingId = null;
    showView('home');
  });

  function renderProfile(username) {
    const user = DB.getUser(username);
    if (!user) return;
    const letter = ((user.displayName || user.username)[0] || 'U').toUpperCase();
    document.getElementById('profile-header').innerHTML = `
      <div class="profile-card">
        <div class="avatar">${letter}</div>
        <h2>${escapeHtml(user.displayName || user.username)}</h2>
        <p class="handle">@${user.username}</p>
        <p class="bio">${escapeHtml(user.bio || 'No bio yet')}</p>
        <p class="meta">Joined ${new Date(user.createdAt).toLocaleDateString()} • ${user.friends.length} friends</p>
      </div>
    `;
    const posts = DB.getPosts().filter(p => p.author === username);
    document.getElementById('profile-posts').innerHTML = posts.length
      ? posts.map(p => postCard(p)).join('')
      : '<div class="empty"><div class="empty-icon">📝</div><p>No posts yet</p></div>';
    bindPostActions();
  }

  function renderFriends() {
    const user = DB.getUser(currentUser);
    const list = document.getElementById('friends-list');
    if (!user.friends.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">👥</div>
          <p>No friends yet</p>
          <p class="sub">Search and add people you know</p>
        </div>`;
      return;
    }
    list.innerHTML = user.friends.map(f => {
      const u = DB.getUser(f);
      const letter = (f[0] || 'U').toUpperCase();
      return `<div class="list-item">
        <div class="avatar" style="width:36px;height:36px;font-size:0.85rem">${letter}</div>
        <div style="flex:1">
          <strong>@${f}</strong>
          ${u ? `<span style="color:var(--muted);font-size:0.85rem"> · ${u.displayName}</span>` : ''}
        </div>
        <button class="btn small" onclick="showUserProfile('${f}')">View</button>
      </div>`;
    }).join('');
  }

  window.showUserProfile = function (username) {
    renderProfile(username);
    showView('profile');
  };

  function renderNotifications() {
    const notifs = DB.getNotifications(currentUser);
    DB.markNotifsRead(currentUser);
    updateNotifBadge();
    const list = document.getElementById('notif-list');
    if (!notifs.length) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-icon">🔔</div>
          <p>No notifications</p>
        </div>`;
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="list-item ${n.read ? '' : 'unread'}">
        <div style="flex:1">
          <p>${escapeHtml(n.message)}</p>
          <span class="time">${new Date(n.createdAt).toLocaleString()}</span>
        </div>
        ${n.postId ? `<button class="btn small" onclick="openPost('${n.postId}')">View</button>` : ''}
      </div>
    `).join('');
  }

  function updateNotifBadge() {
    const notifs = DB.getNotifications(currentUser).filter(n => !n.read);
    const badges = [
      document.getElementById('notif-badge'),
      document.getElementById('notif-badge-m')
    ];
    badges.forEach(badge => {
      if (!badge) return;
      if (notifs.length) {
        badge.textContent = notifs.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });
  }

  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value;
    const results = DB.search(q);
    const box = document.getElementById('search-results');
    let html = '';
    if (results.users.length) {
      html += '<h3>Users</h3>';
      html += results.users.map(u => {
        const letter = (u.username[0] || 'U').toUpperCase();
        return `
        <div class="list-item">
          <div class="avatar" style="width:36px;height:36px;font-size:0.85rem">${letter}</div>
          <div style="flex:1">
            <strong>@${u.username}</strong>
            <span style="color:var(--muted);font-size:0.85rem"> · ${escapeHtml(u.displayName)}</span>
          </div>
          <button class="btn small" onclick="showUserProfile('${u.username}')">View</button>
          ${u.username !== currentUser ? `<button class="btn small" onclick="addFriend('${u.username}')">Add</button>` : ''}
        </div>`;
      }).join('');
    }
    if (results.posts.length) {
      html += '<h3>Posts</h3>';
      html += results.posts.map(p => postCard(p)).join('');
    }
    if (!html) html = '<div class="empty"><div class="empty-icon">🔍</div><p>No results</p></div>';
    box.innerHTML = html;
    bindPostActions();
  });

  window.addFriend = function (friend) {
    if (DB.addFriend(currentUser, friend)) {
      alert('Friend added!');
      updateNotifBadge();
    }
  };

  window.openPost = openPost;

  function loadSettings() {
    const user = DB.getUser(currentUser);
    document.getElementById('set-displayname').value = user.displayName || '';
  }

  document.getElementById('save-profile').addEventListener('click', () => {
    const name = document.getElementById('set-displayname').value.trim();
    if (name) {
      DB.updateUser(currentUser, { displayName: name });
      document.getElementById('mini-name').textContent = name;
      const av = document.getElementById('sidebar-avatar');
      if (av) av.textContent = name[0].toUpperCase();
      alert('Saved');
    }
  });

  document.getElementById('save-pass').addEventListener('click', () => {
    const pass = document.getElementById('set-newpass').value;
    if (DB.changePassword(currentUser, pass)) {
      document.getElementById('set-newpass').value = '';
      alert('Password updated');
    } else {
      alert('Password too short (min 6)');
    }
  });

  document.getElementById('clear-data').addEventListener('click', () => {
    if (confirm('This will erase all local accounts and posts on this device. Continue?')) {
      DB.clearAll();
      window.location.replace('/main');
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  updateNotifBadge();
  showView('home');
})();
