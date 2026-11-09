(function () {
  const guard = document.getElementById('guard');
  const app = document.getElementById('app');
  const menuOverlay = document.getElementById('menu-overlay');
  let currentUser = null;

  function parseHash() {
    const raw = (location.hash || '#home').replace(/^#/, '').trim();
    if (!raw) return { view: 'home', params: {} };

    // Patterns: home | profile | profile=edit | friends | friends=requests |
    // notifications | notifications=activity | user=username | search |
    // create | post=id | settings | share=p!_id | etc.
    const parts = raw.split('=');
    const view = parts[0] || 'home';
    const params = {};
    if (parts.length > 1) params.arg = parts.slice(1).join('=');
    return { view, params, raw };
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => {
      v.classList.toggle('active', v.dataset.view === name);
    });
    document.querySelectorAll('.bottom-nav .nav-item').forEach(n => {
      const nav = n.dataset.nav;
      n.classList.toggle('active', nav === name || (name === 'home' && nav === 'home'));
    });
  }

  function route() {
    const { view, params, raw } = parseHash();
    const known = new Set([
      'home', 'search', 'create', 'profile', 'profile-edit', 'friends',
      'notifications', 'settings', 'user', 'post', 'error'
    ]);

    // Map profile=edit → profile-edit
    if (view === 'profile' && params.arg === 'edit') {
      showView('profile-edit');
      loadProfileEdit();
      return;
    }
    if (view === 'user' && params.arg) {
      showView('user');
      loadUser(params.arg);
      return;
    }
    if (view === 'post' && params.arg) {
      showView('post');
      loadPost(params.arg);
      return;
    }
    if (view === 'friends') {
      showView('friends');
      return;
    }
    if (view === 'notifications') {
      showView('notifications');
      return;
    }
    if (known.has(view)) {
      showView(view);
      if (view === 'profile') loadProfile();
      if (view === 'settings') loadSettings();
      if (view === 'home') loadFeed();
      return;
    }
    showView('error');
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
    const content = String(p.content || '').replace(/</g, '&lt;');
    return `<article class="post-card" style="background:rgba(18,22,34,.75);border:1px solid var(--border);border-radius:14px;padding:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <strong>@${p.author || '?'}</strong>
        <span style="color:var(--text-muted);font-size:.75rem">${p.created_at ? new Date(p.created_at).toLocaleString() : ''}</span>
      </div>
      <div style="white-space:pre-wrap;line-height:1.45">${content}</div>
      <div style="margin-top:10px"><a href="#post=${p.id}" style="font-size:.8rem">View</a></div>
    </article>`;
  }

  function loadProfile() {
    const card = document.getElementById('profile-card');
    if (!currentUser) return;
    card.innerHTML = `
      <div style="display:flex;gap:14px;align-items:center">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a78bfa);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem">
          ${(currentUser.displayName || currentUser.username || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight:750;font-size:1.1rem">${esc(currentUser.displayName || currentUser.username)}</div>
          <div style="color:var(--text-muted);font-size:.85rem">@${esc(currentUser.username)} · ${esc(currentUser.roleLabel || 'user')}</div>
        </div>
      </div>
      <p style="margin:14px 0 0;color:var(--text-muted)">${esc(currentUser.bio || 'No bio yet')}</p>
      <div style="margin-top:14px">
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
      `<div class="empty-state">Loading @${esc(username)}…</div>`;
  }

  function loadPost(id) {
    document.getElementById('single-post').innerHTML =
      `<div class="empty-state">Loading post…</div>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
