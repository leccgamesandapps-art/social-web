const { hasDatabase, adminClient, ensureSchema, dbMode } = require('./lib/db');
const { hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie, readBody, getCookie, verifySession, json } = require('./lib/crypto');

function roleLabel(role) {
  if (role === 1) return 'owner';
  if (role === 2) return 'admin';
  return 'user';
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (action === 'logout') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  // GET /api/auth?action=me  or  GET /api/auth
  if (action === 'me' || req.method === 'GET') {
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

    // ── REGISTER ──────────────────────────────────────────────
    if (act === 'register') {
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      const displayName = String(body.displayName || username).trim();

      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20 chars' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Username: letters numbers _ only' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6 characters' });

      await ensureSchema();
      const sb = adminClient();

      const { data: existing } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (existing) return json(res, 409, { ok: false, error: 'Username taken' });

      // Always create as normal user (role = 0)
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

    // ── LOGIN ─────────────────────────────────────────────────
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
