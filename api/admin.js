const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json, hashPassword } = require('./lib/crypto');

function sessionOf(req) {
  const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifySession(token);
}

function parseDuration(amount, unit) {
  const n = Math.max(1, parseInt(amount, 10) || 1);
  const ms =
    unit === 'minutes' ? n * 60 * 1000 :
    unit === 'hours' ? n * 60 * 60 * 1000 :
    unit === 'days' ? n * 24 * 60 * 60 * 1000 :
    unit === 'weeks' ? n * 7 * 24 * 60 * 60 * 1000 :
    n * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const session = sessionOf(req);
  if (!session) return json(res, 401, { ok: false, error: 'Login required' });

  const role = typeof session.role === 'number' ? session.role : 0;
  if (role !== 1 && role !== 2) return json(res, 403, { ok: false, error: 'Admin or Owner only' });

  try {
    await ensureSchema();
    const sb = adminClient();
    const url = new URL(req.url, 'http://x');
    const action = (url.searchParams.get('action') || '').toLowerCase();

    // LIST users
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const { data, error } = await sb
        .from('users')
        .select('username, display_name, role, status, status_until, created_at')
        .order('id', { ascending: true });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, {
        ok: true,
        users: (data || []).map(u => ({
          username: u.username,
          displayName: u.display_name,
          role: u.role,
          status: u.status,
          statusUntil: u.status_until,
          createdAt: u.created_at
        }))
      });
    }

    // GET one user + logs
    if (req.method === 'GET' && action === 'user') {
      const username = String(url.searchParams.get('username') || '').toLowerCase();
      if (!username) return json(res, 400, { ok: false, error: 'username required' });
      const { data: u, error } = await sb
        .from('users')
        .select('username, display_name, role, status, status_until, created_at, bio')
        .eq('username', username)
        .maybeSingle();
      if (error) return json(res, 400, { ok: false, error: error.message });
      if (!u) return json(res, 404, { ok: false, error: 'User not found' });

      const { data: logs } = await sb
        .from('moderation_logs')
        .select('id, action, by_role, by_name, note, created_at')
        .eq('username', username)
        .order('created_at', { ascending: false })
        .limit(50);

      return json(res, 200, {
        ok: true,
        user: {
          username: u.username,
          displayName: u.display_name,
          role: u.role,
          status: u.status,
          statusUntil: u.status_until,
          createdAt: u.created_at,
          bio: u.bio
        },
        logs: logs || []
      });
    }

    // MODERATE: ban / unban / suspend / unsuspend
    if (req.method === 'POST' && action === 'moderate') {
      const body = await readBody(req);
      const target = String(body.username || '').toLowerCase().trim();
      const modAction = String(body.modAction || '').toLowerCase();
      const note = String(body.note || '').slice(0, 300);

      if (!target) return json(res, 400, { ok: false, error: 'username required' });

      const { data: u } = await sb.from('users').select('username, role').eq('username', target).maybeSingle();
      if (!u) return json(res, 404, { ok: false, error: 'User not found' });

      // Cannot moderate owner or self; admin cannot moderate other admins
      if (u.role === 1) return json(res, 403, { ok: false, error: 'Cannot moderate owner' });
      if (target === session.username) return json(res, 403, { ok: false, error: 'Cannot moderate yourself' });
      if (role === 2 && u.role === 2) return json(res, 403, { ok: false, error: 'Admin cannot moderate other admins' });

      let status = 'active';
      let statusUntil = null;

      if (modAction === 'ban') {
        status = 'banned';
        statusUntil = null; // permanent
      } else if (modAction === 'ban_timer') {
        status = 'banned';
        statusUntil = parseDuration(body.amount, body.unit);
      } else if (modAction === 'unban') {
        status = 'active';
        statusUntil = null;
      } else if (modAction === 'suspend') {
        status = 'suspended';
        statusUntil = null;
      } else if (modAction === 'suspend_timer') {
        status = 'suspended';
        statusUntil = parseDuration(body.amount, body.unit);
      } else if (modAction === 'unsuspend') {
        status = 'active';
        statusUntil = null;
      } else {
        return json(res, 400, { ok: false, error: 'Unknown modAction' });
      }

      const { error } = await sb.from('users').update({ status, status_until: statusUntil }).eq('username', target);
      if (error) return json(res, 400, { ok: false, error: error.message });

      await sb.from('moderation_logs').insert({
        username: target,
        action: modAction,
        by_role: role === 1 ? 'owner' : 'admin',
        by_name: session.username,
        note: note || (statusUntil ? `until ${statusUntil}` : status)
      });

      return json(res, 200, { ok: true, username: target, status, statusUntil });
    }

    // OWNER: add admin (by promoting existing user OR creating new)
    if (req.method === 'POST' && action === 'add-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only' });
      const body = await readBody(req);
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');

      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Invalid username' });

      const { data: existing } = await sb.from('users').select('username, role').eq('username', username).maybeSingle();

      if (existing) {
        if (existing.role === 1) return json(res, 400, { ok: false, error: 'Cannot change owner' });
        await sb.from('users').update({ role: 2 }).eq('username', username);
        await sb.from('moderation_logs').insert({
          username, action: 'promote_admin', by_role: 'owner', by_name: session.username, note: 'Promoted to admin'
        });
        return json(res, 200, { ok: true, username, role: 2, created: false });
      }

      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6 to create new admin' });
      const { error } = await sb.from('users').insert({
        username,
        password_hash: hashPassword(password),
        display_name: username,
        role: 2,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });
      await sb.from('moderation_logs').insert({
        username, action: 'create_admin', by_role: 'owner', by_name: session.username, note: 'Created admin'
      });
      return json(res, 201, { ok: true, username, role: 2, created: true });
    }

    // OWNER: remove admin (demote to user)
    if (req.method === 'POST' && action === 'remove-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only' });
      const body = await readBody(req);
      const username = String(body.username || '').toLowerCase().trim();
      if (!username) return json(res, 400, { ok: false, error: 'username required' });

      const { data: u } = await sb.from('users').select('username, role').eq('username', username).maybeSingle();
      if (!u) return json(res, 404, { ok: false, error: 'Not found' });
      if (u.role !== 2) return json(res, 400, { ok: false, error: 'Not an admin' });

      await sb.from('users').update({ role: 0 }).eq('username', username);
      await sb.from('moderation_logs').insert({
        username, action: 'remove_admin', by_role: 'owner', by_name: session.username, note: 'Demoted to user'
      });
      return json(res, 200, { ok: true, username, role: 0 });
    }

    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'admin failed' });
  }
};
