const { hasDatabase, hasSupabase, adminClient } = require('../lib/db');
const { verifySession, getCookie, json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = verifySession(token);
  if (!session) return json(res, 401, { ok: false, error: 'Not logged in' });
  try {
    if (!hasSupabase()) return json(res, 503, { ok: false, error: 'No supabase' });
    const sb = adminClient();
    const { data: u, error } = await sb.from('users').select('username, display_name, bio, status, created_at').eq('username', session.username).maybeSingle();
    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!u) return json(res, 401, { ok: false, error: 'User missing' });
    return json(res, 200, { ok: true, user: { username: u.username, displayName: u.display_name, bio: u.bio, status: u.status, createdAt: u.created_at } });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
};
