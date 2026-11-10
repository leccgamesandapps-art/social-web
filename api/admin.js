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
  const role = session.role; // 1 = owner (O), 2 = admin (A)

  try {
    await ensureSchema();
    const sb = adminClient();
    const url = new URL(req.url, 'http://x');
    const action = (url.searchParams.get('action') || '').toLowerCase();

    // ── LIST ─────────────────────────────────────────────────
    // A (admin): ONLY users table (U). Never admins. Never owner.
    // O (owner): users (U) + admins (A) separately.
    if (req.method === 'GET' && (action === 'list' || !action)) {
      const { data: members, error: e1 } = await sb
        .from('users')
        .select('username, display_name, status, status_until, created_at')
        .order('id', { ascending: true });
      if (e1) return json(res, 400, { ok: false, error: e1.message });

      // Exclude any username that exists in admins or owner (safety)
      const { data: adminRows } = await sb.from('admins').select('username');
      const { data: ownerRows } = await sb.from('owner').select('username');
      const blocked = new Set([
        ...(adminRows || []).map(r => r.username),
        ...(ownerRows || []).map(r => r.username)
      ]);

      const usersOnly = (members || [])
        .filter(u => !blocked.has(u.username))
        .map(u => ({
          username: u.username,
          displayName: u.display_name,
          role: 0,
          status: u.status || 'active',
          statusUntil: u.status_until,
          createdAt: u.created_at,
          accountType: 'user',
          tag: 'U'
        }));

      // ADMIN PANEL — users only
      if (role === 2) {
        return json(res, 200, { ok: true, users: usersOnly, admins: [] });
      }

      // OWNER PANEL — users + admins
      const adminList = (adminRows || []).map(() => null);
      const { data: ads } = await sb
        .from('admins')
        .select('username, display_name, status, status_until, created_at')
        .order('id');
      const admins = (ads || []).map(a => ({
        username: a.username,
        displayName: a.display_name,
        role: 2,
        status: a.status || 'active',
        statusUntil: a.status_until,
        createdAt: a.created_at,
        accountType: 'admin',
        tag: 'A'
      }));

      return json(res, 200, { ok: true, users: usersOnly, admins });
    }

    // ── GET one account ──────────────────────────────────────
    if (req.method === 'GET' && action === 'user') {
      const username = String(url.searchParams.get('username') || '').toLowerCase();
      if (!username) return json(res, 400, { ok: false, error: 'username required' });

      // Admin (A) can only open users (U)
      if (role === 2) {
        const { data: inAdmin } = await sb.from('admins').select('username').eq('username', username).maybeSingle();
        const { data: inOwner } = await sb.from('owner').select('username').eq('username', username).maybeSingle();
        if (inAdmin || inOwner) {
          return json(res, 403, { ok: false, error: 'Admins can only view users (U)' });
        }
        const { data: u } = await sb
          .from('users')
          .select('username, display_name, status, status_until, created_at, bio')
          .eq('username', username)
          .maybeSingle();
        if (!u) return json(res, 404, { ok: false, error: 'User not found' });
        const { data: logs } = await sb.from('moderation_logs')
          .select('id, action, by_role, by_name, note, created_at')
          .eq('username', username)
          .order('created_at', { ascending: false })
          .limit(50);
        return json(res, 200, {
          ok: true,
          user: {
            username: u.username,
            displayName: u.display_name,
            role: 0,
            status: u.status,
            statusUntil: u.status_until,
            createdAt: u.created_at,
            bio: u.bio,
            accountType: 'user',
            tag: 'U'
          },
          logs: logs || []
        });
      }

      // Owner can open user or admin
      let { data: u } = await sb.from('users')
        .select('username, display_name, status, status_until, created_at, bio')
        .eq('username', username).maybeSingle();
      let accountType = 'user';
      let userRole = 0;
      let tag = 'U';
      if (!u) {
        const { data: a } = await sb.from('admins')
          .select('username, display_name, status, status_until, created_at')
          .eq('username', username).maybeSingle();
        if (a) {
          u = { ...a, bio: null };
          accountType = 'admin';
          userRole = 2;
          tag = 'A';
        }
      }
      if (!u) return json(res, 404, { ok: false, error: 'Not found' });
      const { data: logs } = await sb.from('moderation_logs')
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
          accountType,
          tag
        },
        logs: logs || []
      });
    }

    // ── MODERATE (ban/suspend) — ONLY users table (U) ────────
    // Admin (A) and Owner (O) can moderate users.
    // Nobody can ban/suspend admins or owner via this endpoint.
    if (req.method === 'POST' && action === 'moderate') {
      const body = await readBody(req);
      const target = String(body.username || '').toLowerCase().trim();
      const modAction = String(body.modAction || '').toLowerCase();
      const note = String(body.note || '').slice(0, 300);
      if (!target) return json(res, 400, { ok: false, error: 'username required' });

      // Block targeting admins or owner
      const { data: isAdmin } = await sb.from('admins').select('username').eq('username', target).maybeSingle();
      if (isAdmin) return json(res, 403, { ok: false, error: 'Cannot ban/suspend admins. Only Owner can remove admins.' });
      const { data: isOwner } = await sb.from('owner').select('username').eq('username', target).maybeSingle();
      if (isOwner) return json(res, 403, { ok: false, error: 'Cannot moderate owner' });

      // Must exist in users table
      const { data: u } = await sb.from('users').select('username').eq('username', target).maybeSingle();
      if (!u) return json(res, 404, { ok: false, error: 'User not found in users table' });

      // Cannot moderate self (panel identity)
      if (target === session.username) {
        return json(res, 403, { ok: false, error: 'Cannot moderate yourself' });
      }

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

    // ── ADD ADMIN — Owner (O) only ───────────────────────────
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
      const { data: eo } = await sb.from('owner').select('username').eq('username', username).maybeSingle();
      if (eo) return json(res, 409, { ok: false, error: 'Username is owner' });

      const { error } = await sb.from('admins').insert({
        username,
        password_hash: hashPassword(password),
        display_name: username,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 201, { ok: true, username, role: 2, tag: 'A' });
    }

    // ── REMOVE ADMIN — Owner (O) only ────────────────────────
    if (req.method === 'POST' && action === 'remove-admin') {
      if (role !== 1) return json(res, 403, { ok: false, error: 'Owner only — admins cannot remove admins' });
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
