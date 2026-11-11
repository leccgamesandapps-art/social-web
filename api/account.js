const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json, clearSessionCookie } = require('./lib/crypto');

function userSession(req) {
  const token = getCookie(req, 'sw_session');
  return verifySession(token);
}

module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const session = userSession(req);
  if (!session) return json(res, 401, { ok: false, error: 'Login required' });

  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  try {
    await ensureSchema();
    const sb = adminClient();

    // Schedule deletion — 72 hours from now
    if (req.method === 'POST' && action === 'schedule-delete') {
      const body = await readBody(req);
      const confirm = String(body.confirm || '').toLowerCase();
      if (confirm !== 'delete') {
        return json(res, 400, { ok: false, error: 'Type DELETE to confirm' });
      }
      const when = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { error } = await sb.from('users')
        .update({ delete_scheduled_at: when })
        .eq('username', session.username);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, {
        ok: true,
        deleteScheduledAt: when,
        message: 'Account scheduled for deletion in 72 hours. You can cancel anytime before then.'
      });
    }

    // Cancel scheduled deletion
    if (req.method === 'POST' && action === 'cancel-delete') {
      const { error } = await sb.from('users')
        .update({ delete_scheduled_at: null })
        .eq('username', session.username);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, message: 'Deletion cancelled. Your account is safe.' });
    }

    // Status of deletion
    if (req.method === 'GET' && (action === 'status' || !action)) {
      const { data: u } = await sb.from('users')
        .select('username, delete_scheduled_at')
        .eq('username', session.username)
        .maybeSingle();
      if (!u) {
        clearSessionCookie(res);
        return json(res, 401, { ok: false, error: 'Account gone', code: 'DELETED' });
      }
      if (u.delete_scheduled_at && new Date(u.delete_scheduled_at) <= new Date()) {
        await sb.from('users').delete().eq('username', session.username);
        clearSessionCookie(res);
        return json(res, 403, { ok: false, error: 'Account deleted', code: 'DELETED' });
      }
      return json(res, 200, {
        ok: true,
        deletePending: !!u.delete_scheduled_at,
        deleteScheduledAt: u.delete_scheduled_at || null
      });
    }

    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'account failed' });
  }
};
