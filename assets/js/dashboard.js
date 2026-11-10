(function () {
  const guard = document.getElementById('guard');
  const app = document.getElementById('app');
  const menuOverlay = document.getElementById('menu-overlay');
  const reportOverlay = document.getElementById('report-overlay');
  let currentUser = null;
  let reportUsername = null;

  function parseHash() {
    const raw = (location.hash || '#home').replace(/^#/, '').trim();
    if (!raw) return { view: 'home', params: {}, raw: 'home' };
    const eq = raw.indexOf('=');
    if (eq === -1) return { view: raw, params: {}, raw };
    return { view: raw.slice(0, eq), params: { arg: raw.slice(eq + 1) }, raw };
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
        (['friends', 'notifications', 'settings', 'profile', 'user'].includes(name) && nav === 'menu');
      n.classList.toggle('active', !!active && nav !== 'chat');
    });
  }

  function route() {
    const { view, params } = parseHash();
    if (view === 'profile' && params.arg === 'edit') { showView('profile-edit'); loadProfileEdit(); return; }
    if (view === 'friends') { showView('friends'); setSubtab('friends', params.arg || 'list'); return; }
    if (view === 'notifications') { showView('notifications'); setSubtab('notifications', params.arg || 'all'); return; }
    if (view === 'user' && params.arg) { showView('user'); loadUser(params.arg); return; }
    if (view === 'post' && params.arg) { showView('post'); loadPost(params.arg); return; }
    if (view === 'share') { showView('home'); return; }

    const known = new Set(['home', 'search', 'create', 'profile', 'profile-edit', 'friends', 'notifications', 'settings', 'user', 'post', 'error']);
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
    const target = (map[section] && map[section][which]) || which;
    const root = section === 'friends'
      ? document.querySelector('[data-view="friends"]')
      : document.querySelector('[data-view="notifications"]');
    if (!root) return;
    root.querySelectorAll('.subtab').forEach(t => t.classList.toggle('active', t.dataset.sub === target));
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
    const when = p.createdAt || p.created_at || '';
    return `<article class="post-card">
      <div class="post-meta">
        <a href="#user=${esc(p.author)}"><strong>@${esc(p.author || '?')}</strong></a>
        <span class="time">${when ? new Date(when).toLocaleString() : ''}</span>
      </div>
      <div class="post-body">${esc(p.content || '')}</div>
      <div class="post-actions"><a href="#post=${esc(p.id)}">View</a></div>
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
      <div class="profile-actions"><a href="#profile=edit" class="btn ghost">Edit profile</a></div>`;
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

  async function loadUser(username) {
    document.getElementById('user-title').textContent = '@' + username;
    const card = document.getElementById('user-card');
    card.innerHTML = '<div class="empty-state">Loading…</div>';

    const isSelf = currentUser && currentUser.username === username;

    // Public profile from posts author + basic info via search-like fallback
    card.innerHTML = `
      <div class="profile-row">
        <div class="avatar">${esc((username || '?')[0].toUpperCase())}</div>
        <div>
          <div class="name">${esc(username)}</div>
          <div class="handle">@${esc(username)}</div>
        </div>
      </div>
      <div class="profile-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
        ${isSelf ? '<a href="#profile" class="btn ghost">My profile</a>' : `
          <button type="button" class="btn ghost" id="btn-add-friend">Add friend</button>
          <button type="button" class="btn danger" id="btn-report-user">Report</button>
        `}
      </div>`;

    if (!isSelf) {
      const btnReport = document.getElementById('btn-report-user');
      if (btnReport) {
        btnReport.onclick = () => openReport(username);
      }
      const btnFriend = document.getElementById('btn-add-friend');
      if (btnFriend) {
        btnFriend.onclick = () => alert('Friends system coming next');
      }
    }
  }

  function openReport(username) {
    reportUsername = username;
    document.getElementById('report-target').textContent = 'Reporting @' + username;
    document.getElementById('report-detail').value = '';
    document.getElementById('report-msg').classList.add('hidden');
    reportOverlay.classList.remove('hidden');
  }

  document.getElementById('report-close').onclick = () => reportOverlay.classList.add('hidden');
  reportOverlay.addEventListener('click', (e) => {
    if (e.target === reportOverlay) reportOverlay.classList.add('hidden');
  });
  document.getElementById('report-submit').onclick = async () => {
    const msg = document.getElementById('report-msg');
    msg.classList.add('hidden');
    const reason = document.getElementById('report-reason').value;
    const detail = document.getElementById('report-detail').value.trim();
    try {
      const r = await SW.api('/api/report', {
        method: 'POST',
        body: { username: reportUsername, reason, detail }
      });
      if (!r.ok) {
        msg.textContent = r.error || 'Failed';
        msg.classList.remove('hidden');
        return;
      }
      reportOverlay.classList.add('hidden');
      alert('Report submitted. Moderators will review it.');
    } catch (e) {
      msg.textContent = e.message || 'Network error';
      msg.classList.remove('hidden');
    }
  };

  function loadPost(id) {
    document.getElementById('single-post').innerHTML =
      `<div class="empty-state">Loading post ${esc(id)}…</div>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  const btnPost = document.getElementById('btn-post');
  if (btnPost) {
    btnPost.addEventListener('click', async () => {
      const ta = document.getElementById('post-content');
      const content = (ta.value || '').trim();
      if (!content) { alert('Write something first'); return; }
      btnPost.disabled = true;
      btnPost.textContent = 'Posting…';
      try {
        const r = await SW.api('/api/posts', { method: 'POST', body: { content } });
        if (!r.ok) { alert(r.error || 'Failed to post'); btnPost.disabled = false; btnPost.textContent = 'Post'; return; }
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

  const btnSaveProfile = document.getElementById('btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      alert('Profile save API coming next.');
      location.hash = 'profile';
    });
  }

  document.getElementById('btn-menu').addEventListener('click', () => menuOverlay.classList.remove('hidden'));
  document.getElementById('btn-menu-close').addEventListener('click', () => menuOverlay.classList.add('hidden'));
  menuOverlay.addEventListener('click', (e) => { if (e.target === menuOverlay) menuOverlay.classList.add('hidden'); });
  document.querySelectorAll('.menu-item').forEach(btn => {
    btn.addEventListener('click', () => {
      menuOverlay.classList.add('hidden');
      location.hash = btn.dataset.goto;
    });
  });

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

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await SW.auth.logout();
    location.replace('/');
  });
  document.getElementById('btn-error-home').addEventListener('click', () => { location.hash = 'home'; });
  document.getElementById('btn-back-post').addEventListener('click', () => history.back());

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem('sw_theme', btn.dataset.theme);
      document.documentElement.dataset.theme = btn.dataset.theme || 'dark';
    });
  });
  document.documentElement.dataset.theme = localStorage.getItem('sw_theme') || 'dark';

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
