const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json, hashPassword } = require('./lib/crypto');

function panelSession(req) {
  const token = getCookie(req, 'sw_panel');
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
  const session = panelSession(req);
  if (!session || (session.role !== 1 && session.role !== 2)) {
    return json(res, 401, { ok: false, error: 'Panel login required' });
  }
  const role = session.role;

  try {
    await ensureSchema();
    const sb = adminClient();
    const url = new URL(req.url, 'http://x');
    const action = (url.searchParams.get('action') || '').toLowerCase();

    // LIST
    // Admin (role 2): ONLY users table
    // Owner (role 1): users + admins tables separately
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const { data: members, error: e1 } = await sb
        .from('users')
        .select('username, display_name, status, status_until, created_at')
        .order('id', { ascending: true });
      if (e1) return json(res, 400, { ok: false, error: e1.message });

      const usersOnly = (members || []).map(u => ({
        username: u.username,
        displayName: u.display_name,
        role: 0,
        status: u.status || 'active',
        statusUntil: u.status_until,
        createdAt: u.created_at,
        accountType: 'user'
      }));

      if (role === 2) {
        // ADMIN PANEL — users only, never admins/owner
        return json(res, 200, { ok: true, users: usersOnly });
      }

      // OWNER PANEL
      const { data: ads } = await sb
        .from('admins')
        .select('username, display_name, status, status_until, created_at')
        .order('id');
      const adminList = (ads || []).map(a => ({
        username: a.username,
        displayName: a.display_name,
        role: 2,
        status: a.status || 'active',
        statusUntil: a.status_until,
        createdAt: a.created_at,
        accountType: 'admin'
      }));
      return json(res, 200, { ok: true, users: usersOnly, admins: adminList });
    }

    if (req.method === 'GET' && action === 'user') {
      const username = String(url.searchParams.get('username') || '').toLowerCase();
      if (!username) return json(res, 400, { ok: false, error: 'username required' });

      let { data: u } = await sb
        .from('users')
        .select('username, display_name, status, status_until, created_at, bio')
        .eq('username', username)
        .maybeSingle();
      let accountType = 'user';
      let userRole = 0;

      if (!u && role === 1) {
        const { data: a } = await sb
          .from('admins')
          .select('username, display_name, status, status_until, created_at')
          .eq('username', username)
          .maybeSingle();
        if (a) {
          u = { ...a, bio: null };
          accountType = 'admin';
          userRole = 2;
        }
      }
      if (!u) return json(res, 404, { ok: false, error: 'Not found' });

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
          role: userRole,
          status: u.status,
          statusUntil: u.status_until,
          createdAt: u.created_at,
          bio: u.bio,
          accountType
        },
        logs: logs || []
      });
    }

    if (req.method === 'POST' && action === 'moderate') {
      if (role !== 1 && role !== 2) return json(res, 403, { ok: false, error: 'Forbidden' });
      const body = await readBody(req);
      const target = String(body.username || '').toLowerCase().trim();
      const modAction = String(body.modAction || '').toLowerCase();
      const note = String(body.note || '').slice(0, 300);
      if (!target) return json(res, 400, { ok: false, error: 'username required' });

      const { data: u } = await sb.from('users').select('username').eq('username', target).maybeSingle();
      if (!u) return json(res, 404, { ok: false, error: 'User not found' });

      let status = 'active';
      let statusUntil = null;
      if (modAction === 'ban') { status = 'banned'; }
      else if (modAction === 'ban_timer') { status = 'banned'; statusUntil = parseDuration(body.amount, body.unit); }
      else if (modAction === 'unban') { status = 'active'; }
      else if (modAction === 'suspend') { status = 'suspended'; }
      else if (modAction === 'suspend_timer') { status = 'suspended'; statusUntil = parseDuration(body.amount, body.unit); }
      else if (modAction === 'unsuspend') { status = 'active'; }
      else return json(res, 400, { ok: false, error: 'Unknown modAction' });

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

    if (req.method === 'POST' && action === 'add-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only' });
      const body = await readBody(req);
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Invalid username' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6' });

      const { data: ea } = await sb.from('admins').select('username').eq('username', username).maybeSingle();
      if (ea) return json(res, 409, { ok: false, error: 'Already admin' });
      const { data: eu } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (eu) return json(res, 409, { ok: false, error: 'Username taken by a user' });

      const { error } = await sb.from('admins').insert({
        username,
        password_hash: hashPassword(password),
        display_name: username,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 201, { ok: true, username, role: 2 });
    }

    if (req.method === 'POST' && action === 'remove-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only' });
      const body = await readBody(req);
      const username = String(body.username || '').toLowerCase().trim();
      const { data: a } = await sb.from('admins').select('username').eq('username', username).maybeSingle();
      if (!a) return json(res, 404, { ok: false, error: 'Not an admin' });
      await sb.from('admins').delete().eq('username', username);
      return json(res, 200, { ok: true, username });
    }

    return json(res, 400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'admin failed' });
  }
};
