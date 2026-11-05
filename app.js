// Dashboard app logic + route protection

(function () {
  const session = DB.getSession();
  if (!session) {
    // Hard redirect – no bypass
    window.location.replace('/main');
    return;
  }

  // Hide guard, show app
  document.getElementById('guard').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const currentUser = session.username;
  document.getElementById('mini-name').textContent = session.displayName || currentUser;

  // ---- Navigation ----
  const views = document.querySelectorAll('.view');
  const navItems = document.querySelectorAll('.nav-item');

  function showView(name) {
    views.forEach(v => v.classList.remove('active'));
    navItems.forEach(n => n.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    const nav = document.querySelector(`[data-view="${name}"]`);
    if (nav) nav.classList.add('active');

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

  document.getElementById('logout-btn').addEventListener('click', () => {
    DB.logout();
    window.location.replace('/main');
  });

  // ---- Feed ----
  function renderFeed() {
    const feed = document.getElementById('feed');
    const posts = DB.getPosts();
    if (!posts.length) {
      feed.innerHTML = '<p class="empty">No posts yet. Create the first one!</p>';
      return;
    }
    feed.innerHTML = posts.map(p => postCard(p)).join('');
    bindPostActions();
  }

  function postCard(p) {
    const time = new Date(p.createdAt).toLocaleString();
    const isOwner = p.author === currentUser;
    return `
      <article class="post-card" data-id="${p.id}">
        <div class="post-header">
          <strong>@${p.author}</strong>
          <span class="time">${time}</span>
        </div>
        <p class="post-content">${escapeHtml(p.content)}</p>
        <div class="post-actions">
          <button class="btn small view-btn" data-id="${p.id}">View / Comment (${p.comments.length})</button>
          ${isOwner ? `<button class="btn small edit-btn" data-id="${p.id}">Edit</button>
                       <button class="btn small danger del-btn" data-id="${p.id}">Delete</button>` : ''}
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

  // ---- Single Post + Comments ----
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
      : '<p class="empty">No comments yet</p>';
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

  // ---- Create ----
  document.getElementById('post-submit').addEventListener('click', () => {
    const content = document.getElementById('post-content').value.trim();
    if (!content) return;
    DB.createPost(currentUser, content);
    document.getElementById('post-content').value = '';
    showView('home');
  });

  // ---- Edit ----
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

  // ---- Profile ----
  function renderProfile(username) {
    const user = DB.getUser(username);
    if (!user) return;
    document.getElementById('profile-header').innerHTML = `
      <div class="profile-card">
        <h2>${escapeHtml(user.displayName || user.username)}</h2>
        <p>@${user.username}</p>
        <p class="bio">${escapeHtml(user.bio || 'No bio yet')}</p>
        <p class="meta">Joined ${new Date(user.createdAt).toLocaleDateString()} • ${user.friends.length} friends</p>
      </div>
    `;
    const posts = DB.getPosts().filter(p => p.author === username);
    document.getElementById('profile-posts').innerHTML = posts.length
      ? posts.map(p => postCard(p)).join('')
      : '<p class="empty">No posts</p>';
    bindPostActions();
  }

  // ---- Friends ----
  function renderFriends() {
    const user = DB.getUser(currentUser);
    const list = document.getElementById('friends-list');
    if (!user.friends.length) {
      list.innerHTML = '<p class="empty">No friends yet. Search and add some!</p>';
      return;
    }
    list.innerHTML = user.friends.map(f => {
      const u = DB.getUser(f);
      return `<div class="list-item">
        <strong>@${f}</strong> ${u ? `(${u.displayName})` : ''}
        <button class="btn small" onclick="showUserProfile('${f}')">View</button>
      </div>`;
    }).join('');
  }

  window.showUserProfile = function (username) {
    renderProfile(username);
    showView('profile');
  };

  // ---- Notifications ----
  function renderNotifications() {
    const notifs = DB.getNotifications(currentUser);
    DB.markNotifsRead(currentUser);
    updateNotifBadge();
    const list = document.getElementById('notif-list');
    if (!notifs.length) {
      list.innerHTML = '<p class="empty">No notifications</p>';
      return;
    }
    list.innerHTML = notifs.map(n => `
      <div class="list-item ${n.read ? '' : 'unread'}">
        <p>${escapeHtml(n.message)}</p>
        <span class="time">${new Date(n.createdAt).toLocaleString()}</span>
        ${n.postId ? `<button class="btn small" onclick="openPost('${n.postId}')">View</button>` : ''}
      </div>
    `).join('');
  }

  function updateNotifBadge() {
    const notifs = DB.getNotifications(currentUser).filter(n => !n.read);
    const badge = document.getElementById('notif-badge');
    if (notifs.length) {
      badge.textContent = notifs.length;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  // ---- Search ----
  document.getElementById('search-input').addEventListener('input', (e) => {
    const q = e.target.value;
    const results = DB.search(q);
    const box = document.getElementById('search-results');
    let html = '';
    if (results.users.length) {
      html += '<h3>Users</h3>';
      html += results.users.map(u => `
        <div class="list-item">
          <strong>@${u.username}</strong> (${escapeHtml(u.displayName)})
          <button class="btn small" onclick="showUserProfile('${u.username}')">View</button>
          ${u.username !== currentUser ? `<button class="btn small" onclick="addFriend('${u.username}')">Add Friend</button>` : ''}
        </div>
      `).join('');
    }
    if (results.posts.length) {
      html += '<h3>Posts</h3>';
      html += results.posts.map(p => postCard(p)).join('');
    }
    if (!html) html = '<p class="empty">No results</p>';
    box.innerHTML = html;
    bindPostActions();
  });

  window.addFriend = function (friend) {
    if (DB.addFriend(currentUser, friend)) {
      alert('Friend added!');
      updateNotifBadge();
    }
  };

  // ---- Settings ----
  function loadSettings() {
    const user = DB.getUser(currentUser);
    document.getElementById('set-displayname').value = user.displayName || '';
  }

  document.getElementById('save-profile').addEventListener('click', () => {
    const name = document.getElementById('set-displayname').value.trim();
    if (name) {
      DB.updateUser(currentUser, { displayName: name });
      document.getElementById('mini-name').textContent = name;
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

  // ---- Helpers ----
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Init
  updateNotifBadge();
  showView('home');
})();
