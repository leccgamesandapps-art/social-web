(function () {
  const guard = document.getElementById('guard');
  const app = document.getElementById('app');
  const menuOverlay = document.getElementById('menu-overlay');
  let currentUser = null;

  function parseHash() {
    const raw = (location.hash || '#home').replace(/^#/, '').trim();
    if (!raw) return { view: 'home', params: {}, raw: 'home' };

    // Supports: home | profile | profile=edit | friends | friends=requests |
    // notifications | notifications=activity | user=username | search |
    // create | post=id | settings | share=p!_id | community=id | etc.
    const eq = raw.indexOf('=');
    if (eq === -1) return { view: raw, params: {}, raw };
    const view = raw.slice(0, eq);
    const arg = raw.slice(eq + 1);
    return { view, params: { arg }, raw };
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.dataset.view === name);
    });
    document.querySelectorAll('.bottom-nav .nav-item').forEach(n => {
      const nav = n.dataset.nav;
      const active =
        nav === name ||
        (name === 'home' && nav === 'home') ||
        (name === 'profile-edit' && nav === 'menu') ||
        (['friends', 'notifications', 'settings', 'profile'].includes(name) && nav === 'menu');
      n.classList.toggle('active', !!active && nav !== 'chat');
    });
  }

  function route() {
    const { view, params, raw } = parseHash();

    // profile=edit
    if (view === 'profile' && params.arg === 'edit') {
      showView('profile-edit');
      loadProfileEdit();
      return;
    }
    // friends=requests | friends=pending | friends=list
    if (view === 'friends') {
      showView('friends');
      setSubtab('friends', params.arg || 'list');
      return;
    }
    // notifications=activity | notifications=system
    if (view === 'notifications') {
      showView('notifications');
      setSubtab('notifications', params.arg || 'all');
      return;
    }
    // user=username
    if (view === 'user' && params.arg) {
      showView('user');
      loadUser(params.arg);
      return;
    }
    // post=id
    if (view === 'post' && params.arg) {
      showView('post');
      loadPost(params.arg);
      return;
    }
    // share=p!_xxx etc — placeholder for now
    if (view === 'share') {
      showView('home');
      return;
    }

    const known = new Set([
      'home', 'search', 'create', 'profile', 'profile-edit', 'friends',
      'notifications', 'settings', 'user', 'post', 'error'
    ]);

    if (known.has(view)) {
      showView(view);
      if (view === 'profile') loadProfile();
      if (view === 'settings') loadSettings();
      if (view === 'home') loadFeed();
      return;
    }
    showView('error');
  }

  function setSubtab(section, which) {
    const map = {
      friends: { list: 'list', requests: 'requests', pending: 'pending', all: 'list' },
      notifications: { all: 'all', activity: 'activity', system: 'system' }
    };
    const target = (map[section] && map[section][which]) || which || Object.values(map[section] || {})[0];
    const root = section === 'friends'
      ? document.querySelector('[data-view="friends"]')
      : document.querySelector('[data-view="notifications"]');
    if (!root) return;
    root.querySelectorAll('.subtab').forEach(t => {
      t.classList.toggle('active', t.dataset.sub === target);
    });
  }

  async function loadFeed() {
    const feed = document.getElementById('feed');
    feed.innerHTML = '<div class="empty-state">Loading feed…</div>';
    try {
      const r = await SW.api('/api/posts');
      if (!r.ok || !r.posts || !r.posts.length) {
        feed.innerHTML = '<div class="empty-state">No posts yet. Create the first one!</div>';
        return;
      }
      feed.innerHTML = r.posts.map(p => postCard(p)).join('');
    } catch (e) {
      feed.innerHTML = '<div class="empty-state">Could not load feed</div>';
    }
  }

  function postCard(p) {
    const content = esc(p.content || '');
    const when = p.createdAt || p.created_at || '';
    return `<article class="post-card">
      <div class="post-meta">
        <a href="#user=${esc(p.author)}"><strong>@${esc(p.author || '?')}</strong></a>
        <span class="time">${when ? new Date(when).toLocaleString() : ''}</span>
      </div>
      <div class="post-body">${content}</div>
      <div class="post-actions">
        <a href="#post=${esc(p.id)}">View</a>
      </div>
    </article>`;
  }

  function loadProfile() {
    const card = document.getElementById('profile-card');
    if (!currentUser) return;
    card.innerHTML = `
      <div class="profile-row">
        <div class="avatar">${(currentUser.displayName || currentUser.username || 'U').charAt(0).toUpperCase()}</div>
        <div>
          <div class="name">${esc(currentUser.displayName || currentUser.username)}</div>
          <div class="handle">@${esc(currentUser.username)} · ${esc(currentUser.roleLabel || 'user')}</div>
        </div>
      </div>
      <p class="bio">${esc(currentUser.bio || 'No bio yet')}</p>
      <div class="profile-actions">
        <a href="#profile=edit" class="btn ghost">Edit profile</a>
      </div>`;
  }

  function loadProfileEdit() {
    if (!currentUser) return;
    document.getElementById('edit-displayname').value = currentUser.displayName || '';
    document.getElementById('edit-bio').value = currentUser.bio || '';
  }

  function loadSettings() {
    document.getElementById('settings-account').textContent =
      currentUser ? `@${currentUser.username} · ${currentUser.roleLabel || 'user'}` : '—';
  }

  function loadUser(username) {
    document.getElementById('user-title').textContent = '@' + username;
    document.getElementById('user-card').innerHTML =
      `<div class="empty-state">Profile for @${esc(username)} coming next</div>`;
  }

  function loadPost(id) {
    document.getElementById('single-post').innerHTML =
      `<div class="empty-state">Loading post ${esc(id)}…</div>`;
    // Will expand with full post + comments
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Create Post ─────────────────────────────────────────────
  const btnPost = document.getElementById('btn-post');
  if (btnPost) {
    btnPost.addEventListener('click', async () => {
      const ta = document.getElementById('post-content');
      const content = (ta.value || '').trim();
      if (!content) {
        alert('Write something first');
        return;
      }
      btnPost.disabled = true;
      btnPost.textContent = 'Posting…';
      try {
        const r = await SW.api('/api/posts', { method: 'POST', body: { content } });
        if (!r.ok) {
          alert(r.error || 'Failed to post');
          btnPost.disabled = false;
          btnPost.textContent = 'Post';
          return;
        }
        ta.value = '';
        btnPost.disabled = false;
        btnPost.textContent = 'Post';
        location.hash = 'home';
        loadFeed();
      } catch (e) {
        alert(e.message || 'Network error');
        btnPost.disabled = false;
        btnPost.textContent = 'Post';
      }
    });
  }

  // ── Profile save (local for now until profile API exists) ───
  const btnSaveProfile = document.getElementById('btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      // Placeholder — will wire to API next
      alert('Profile save API coming next. Display name & bio will sync to Supabase.');
      location.hash = 'profile';
    });
  }

  // Menu
  document.getElementById('btn-menu').addEventListener('click', () => {
    menuOverlay.classList.remove('hidden');
  });
  document.getElementById('btn-menu-close').addEventListener('click', () => {
    menuOverlay.classList.add('hidden');
  });
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) menuOverlay.classList.add('hidden');
  });
  document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      menuOverlay.classList.add('hidden');
      location.hash = btn.dataset.goto;
    });
  });

  // Subtabs click → update hash
  document.querySelectorAll('[data-view="friends"] .subtab').forEach(t => {
    t.addEventListener('click', () => {
      const sub = t.dataset.sub;
      location.hash = sub === 'list' ? 'friends' : 'friends=' + sub;
    });
  });
  document.querySelectorAll('[data-view="notifications"] .subtab').forEach(t => {
    t.addEventListener('click', () => {
      const sub = t.dataset.sub;
      location.hash = sub === 'all' ? 'notifications' : 'notifications=' + sub;
    });
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await SW.auth.logout();
    location.replace('/');
  });

  document.getElementById('btn-error-home').addEventListener('click', () => {
    location.hash = 'home';
  });
  document.getElementById('btn-back-post').addEventListener('click', () => {
    history.back();
  });

  // Theme (device-local only)
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.theme;
      localStorage.setItem('sw_theme', t);
      applyTheme(t);
    });
  });
  function applyTheme(t) {
    document.documentElement.dataset.theme = t || 'dark';
  }
  applyTheme(localStorage.getItem('sw_theme') || 'dark');

  // Boot
  async function boot() {
    currentUser = await SW.requireAuth();
    if (!currentUser) return;
    guard.classList.add('hidden');
    app.classList.remove('hidden');
    route();
  }

  window.addEventListener('hashchange', route);
  boot();
})();
