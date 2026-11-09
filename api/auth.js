const { hasDatabase, adminClient, ensureSchema, dbMode } = require('./lib/db');
const { hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie, readBody, getCookie, verifySession, json } = require('./lib/crypto');

function roleLabel(role) {
  if (role === 1) return 'owner';
  if (role === 2) return 'admin';
  return 'user';
}

// Fixed panel passwords (password-only login)
// Owner: only ONE
const PANEL = {
  owner:  { password: 'swowner26',  username: 'owner',  displayName: 'Owner',  role: 1 },
  admin1: { password: 'swadmin26',  username: 'admin1', displayName: 'Admin 1', role: 2 },
  admin2: { password: 'swadmin123', username: 'admin2', displayName: 'Admin 2', role: 2 }
};

async function ensurePanelAccount(sb, account) {
  const { data: existing } = await sb.from('users').select('username, role').eq('username', account.username).maybeSingle();
  if (existing) {
    // Keep role correct
    if (existing.role !== account.role) {
      await sb.from('users').update({ role: account.role }).eq('username', account.username);
    }
    return;
  }
  await sb.from('users').insert({
    username: account.username,
    password_hash: hashPassword(account.password),
    display_name: account.displayName,
    role: account.role,
    status: 'active'
  });
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (action === 'logout') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  // GET /api/auth?action=me
  if (action === 'me' || (req.method === 'GET' && !action)) {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const session = verifySession(token);
    if (!session) return json(res, 401, { ok: false, error: 'Not logged in' });
    try {
      const sb = adminClient();
      const { data: u, error } = await sb
        .from('users')
        .select('username, display_name, bio, role, status, created_at')
        .eq('username', session.username)
        .maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      if (!u) return json(res, 401, { ok: false, error: 'User missing' });
      return json(res, 200, {
        ok: true,
        user: {
          username: u.username,
          displayName: u.display_name,
          bio: u.bio,
          role: u.role,
          roleLabel: roleLabel(u.role),
          status: u.status,
          createdAt: u.created_at
        }
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED', mode: 'local_fallback' });

  try {
    const body = await readBody(req);
    const act = action || body.action || 'login';

    // ── PANEL LOGIN (password only) ───────────────────────────
    if (act === 'panel-login') {
      const panel = String(body.panel || '').toLowerCase(); // 'owner' | 'admin'
      const password = String(body.password || '');

      await ensureSchema();
      const sb = adminClient();

      // Ensure panel accounts exist
      await ensurePanelAccount(sb, PANEL.owner);
      await ensurePanelAccount(sb, PANEL.admin1);
      await ensurePanelAccount(sb, PANEL.admin2);

      let matched = null;

      if (panel === 'owner') {
        if (password === PANEL.owner.password) matched = PANEL.owner;
      } else if (panel === 'admin') {
        if (password === PANEL.admin1.password) matched = PANEL.admin1;
        else if (password === PANEL.admin2.password) matched = PANEL.admin2;
      } else {
        return json(res, 400, { ok: false, error: 'Invalid panel' });
      }

      if (!matched) {
        return json(res, 401, { ok: false, error: 'Wrong password' });
      }

      // Owner must remain unique
      if (matched.role === 1) {
        const { data: owners } = await sb.from('users').select('username').eq('role', 1);
        const others = (owners || []).filter(o => o.username !== matched.username);
        if (others.length) {
          // demote extras (should not happen)
          for (const o of others) {
            await sb.from('users').update({ role: 0 }).eq('username', o.username);
          }
        }
      }

      setSessionCookie(res, signSession({
        username: matched.username,
        displayName: matched.displayName,
        role: matched.role
      }));

      return json(res, 200, {
        ok: true,
        user: {
          username: matched.username,
          displayName: matched.displayName,
          role: matched.role,
          roleLabel: roleLabel(matched.role)
        }
      });
    }

    // ── REGISTER ──────────────────────────────────────────────
    if (act === 'register') {
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      const displayName = String(body.displayName || username).trim();

      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20 chars' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Username: letters numbers _ only' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6 characters' });

      // Block reserved panel usernames
      if (['owner', 'admin1', 'admin2', 'admin'].includes(username)) {
        return json(res, 400, { ok: false, error: 'Username reserved' });
      }

      await ensureSchema();
      const sb = adminClient();

      const { data: existing } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (existing) return json(res, 409, { ok: false, error: 'Username taken' });

      const { error } = await sb.from('users').insert({
        username,
        password_hash: hashPassword(password),
        display_name: displayName,
        role: 0,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });

      setSessionCookie(res, signSession({ username, displayName, role: 0 }));
      return json(res, 201, {
        ok: true,
        user: { username, displayName, role: 0, roleLabel: 'user' },
        mode: dbMode()
      });
    }

    // ── NORMAL LOGIN (username + password) ────────────────────
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');

    await ensureSchema();
    const sb = adminClient();
    const { data: user, error } = await sb
      .from('users')
      .select('username, password_hash, display_name, role, status, status_until')
      .eq('username', username)
      .maybeSingle();

    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!user) return json(res, 401, { ok: false, error: 'User not found' });
    if (!verifyPassword(password, user.password_hash)) return json(res, 401, { ok: false, error: 'Wrong password' });

    if ((user.status === 'banned' || user.status === 'suspended') && (!user.status_until || new Date(user.status_until) > new Date())) {
      return json(res, 403, { ok: false, error: 'Account restricted (' + user.status + ')' });
    }

    const role = typeof user.role === 'number' ? user.role : 0;
    setSessionCookie(res, signSession({
      username: user.username,
      displayName: user.display_name,
      role
    }));

    return json(res, 200, {
      ok: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        role,
        roleLabel: roleLabel(role)
      },
      mode: dbMode()
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'auth failed', code: e.code || null });
  }
};
