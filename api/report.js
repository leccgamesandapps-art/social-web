const crypto = require('crypto');
const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json } = require('./lib/crypto');

module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const token = getCookie(req, 'sw_session');
  const session = verifySession(token);
  if (!session) return json(res, 401, { ok: false, error: 'Login required' });

  try {
    await ensureSchema();
    const sb = adminClient();

    if (req.method === 'POST') {
      const body = await readBody(req);
      const target = String(body.username || '').toLowerCase().trim();
      const reason = String(body.reason || '').trim().slice(0, 500);
      const detail = String(body.detail || '').trim().slice(0, 1000);

      if (!target) return json(res, 400, { ok: false, error: 'username required' });
      if (target === session.username) return json(res, 400, { ok: false, error: 'Cannot report yourself' });
      if (!reason) return json(res, 400, { ok: false, error: 'Reason required' });

      const { data: u } = await sb.from('users').select('username').eq('username', target).maybeSingle();
      if (!u) return json(res, 404, { ok: false, error: 'User not found' });

      await sb.from('moderation_logs').insert({
        username: target,
        action: 'user_report',
        by_role: 'user',
        by_name: session.username,
        note: reason + (detail ? ' — ' + detail : '')
      });

      return json(res, 201, { ok: true });
    }

    return json(res, 405, { ok: false, error: 'POST only' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'report failed' });
  }
};
