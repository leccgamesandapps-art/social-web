const { sql, hasDatabase, ensureSchema } = require('../lib/db');
const { verifyPassword, signSession, setSessionCookie, readBody, json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED', mode: 'local_fallback' });
  try {
    const body = await readBody(req);
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    await ensureSchema();
    const result = await sql`SELECT username, password_hash, display_name, status, status_until FROM users WHERE username = ${username}`;
    if (!result.rows.length) return json(res, 401, { ok: false, error: 'User not found' });
    const user = result.rows[0];
    if (!verifyPassword(password, user.password_hash)) return json(res, 401, { ok: false, error: 'Wrong password' });
    if ((user.status === 'banned' || user.status === 'suspended') && (!user.status_until || new Date(user.status_until) > new Date())) {
      return json(res, 403, { ok: false, error: 'Account restricted (' + user.status + ')' });
    }
    const token = signSession({ username: user.username, displayName: user.display_name });
    setSessionCookie(res, token);
    return json(res, 200, { ok: true, user: { username: user.username, displayName: user.display_name } });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'login failed' });
  }
};
