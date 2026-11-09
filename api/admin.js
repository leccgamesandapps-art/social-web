const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json, hashPassword } = require('./lib/crypto');

function sessionOf(req) {
  const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifySession(token);
}

module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const session = sessionOf(req);
  if (!session) return json(res, 401, { ok: false, error: 'Login required' });

  const role = typeof session.role === 'number' ? session.role : 0;
  // Only owner (1) or admin (2)
  if (role !== 1 && role !== 2) {
    return json(res, 403, { ok: false, error: 'Admin or Owner only' });
  }

  try {
    await ensureSchema();
    const sb = adminClient();
    const url = new URL(req.url, 'http://x');
    const action = (url.searchParams.get('action') || '').toLowerCase();

    // List all users
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const { data, error } = await sb
        .from('users')
        .select('username, display_name, role, status, created_at')
        .order('id', { ascending: true });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, {
        ok: true,
        users: (data || []).map(u => ({
          username: u.username,
          displayName: u.display_name,
          role: u.role,
          status: u.status,
          createdAt: u.created_at
        }))
      });
    }

    // Owner only: create admin account
    if (req.method === 'POST' && action === 'create-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only' });
      const body = await readBody(req);
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20 chars' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Invalid username' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6' });

      const { data: existing } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (existing) return json(res, 409, { ok: false, error: 'Username taken' });

      const { error } = await sb.from('users').insert({
        username,
        password_hash: hashPassword(password),
        display_name: username,
        role: 2,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 201, { ok: true, username, role: 2 });
    }

    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'admin failed' });
  }
};
