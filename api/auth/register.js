const { sql, hasDatabase, ensureSchema } = require('../lib/db');
const { hashPassword, signSession, setSessionCookie, readBody, json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED', mode: 'local_fallback' });
  try {
    const body = await readBody(req);
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    const displayName = String(body.displayName || username).trim();
    if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20 chars' });
    if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Username: letters numbers _ only' });
    if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6 characters' });
    await ensureSchema();
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.rows.length) return json(res, 409, { ok: false, error: 'Username taken' });
    await sql`INSERT INTO users (username, password_hash, display_name) VALUES (${username}, ${hashPassword(password)}, ${displayName})`;
    const token = signSession({ username, displayName });
    setSessionCookie(res, token);
    return json(res, 201, { ok: true, user: { username, displayName } });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'register failed' });
  }
};
