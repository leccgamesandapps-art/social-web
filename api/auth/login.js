const { hasDatabase, hasSupabase, adminClient, ensureSchema, dbMode } = require('../lib/db');
const { verifyPassword, signSession, setSessionCookie, readBody, json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED', mode: 'local_fallback' });
  try {
    const body = await readBody(req);
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    await ensureSchema();
    if (!hasSupabase()) return json(res, 503, { ok: false, error: 'Supabase required' });
    const sb = adminClient();
    const { data: user, error } = await sb.from('users').select('username, password_hash, display_name, status, status_until').eq('username', username).maybeSingle();
    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!user) return json(res, 401, { ok: false, error: 'User not found' });
    if (!verifyPassword(password, user.password_hash)) return json(res, 401, { ok: false, error: 'Wrong password' });
    if ((user.status === 'banned' || user.status === 'suspended') && (!user.status_until || new Date(user.status_until) > new Date())) {
      return json(res, 403, { ok: false, error: 'Account restricted (' + user.status + ')' });
    }
    const token = signSession({ username: user.username, displayName: user.display_name });
    setSessionCookie(res, token);
    return json(res, 200, { ok: true, user: { username: user.username, displayName: user.display_name }, mode: dbMode() });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'login failed', code: e.code || null });
  }
};
