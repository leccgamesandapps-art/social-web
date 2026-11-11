const { hasDatabase, adminClient, ensureSchema, dbMode } = require('./lib/db');
const {
  hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie,
  setPanelCookie, clearPanelCookie, readBody, getCookie, verifySession, json
} = require('./lib/crypto');

function checkPassword(password, stored) {
  if (!stored) return false;
  if (String(stored).startsWith('panel:')) return password === String(stored).slice(6);
  return verifyPassword(password, stored);
}

async function purgeIfExpired(sb, user) {
  if (!user || !user.delete_scheduled_at) return { purged: false, pending: false };
  const when = new Date(user.delete_scheduled_at);
  if (when <= new Date()) {
    await sb.from('users').delete().eq('username', user.username);
    return { purged: true, pending: false };
  }
  return { purged: false, pending: true, deleteScheduledAt: user.delete_scheduled_at };
}

async function checkUserStatus(sb, user) {
  if (!user) return { blocked: true, message: 'User not found' };

  const del = await purgeIfExpired(sb, user);
  if (del.purged) {
    return { blocked: true, message: 'This account was deleted after the 72-hour waiting period.', code: 'DELETED' };
  }

  const status = user.status || 'active';
  if (status === 'active') {
    return {
      blocked: false,
      deletePending: del.pending,
      deleteScheduledAt: del.deleteScheduledAt || null
    };
  }
  if ((status === 'banned' || status === 'suspended') && user.status_until) {
    if (new Date(user.status_until) <= new Date()) {
      await sb.from('users').update({ status: 'active', status_until: null }).eq('username', user.username);
      return { blocked: false, deletePending: del.pending, deleteScheduledAt: del.deleteScheduledAt || null };
    }
    const until = new Date(user.status_until).toLocaleString();
    return {
      blocked: true,
      message: status === 'banned'
        ? `Your account is banned until ${until}`
        : `Your account is suspended until ${until}`
    };
  }
  if (status === 'banned') return { blocked: true, message: 'Your account is permanently banned' };
  if (status === 'suspended') return { blocked: true, message: 'Your account is permanently suspended' };
  return { blocked: false, deletePending: del.pending, deleteScheduledAt: del.deleteScheduledAt || null };
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  if (action === 'logout') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  if (action === 'panel-logout') {
    clearPanelCookie(res);
    return json(res, 200, { ok: true });
  }

  // USER me — users table ONLY (never admin/owner)
  if (action === 'me' || (req.method === 'GET' && !action)) {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_session');
    const session = verifySession(token);
    if (!session) return json(res, 401, { ok: false, error: 'Not logged in' });
    try {
      const sb = adminClient();
      const { data: u, error } = await sb
        .from('users')
        .select('username, display_name, bio, status, status_until, created_at, delete_scheduled_at')
        .eq('username', session.username)
        .maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      if (!u) {
        clearSessionCookie(res);
        return json(res, 401, { ok: false, error: 'User missing or deleted', code: 'DELETED' });
      }
      const st = await checkUserStatus(sb, u);
      if (st.blocked) {
        clearSessionCookie(res);
        return json(res, 403, { ok: false, error: st.message, code: st.code || 'RESTRICTED' });
      }
      return json(res, 200, {
        ok: true,
        user: {
          username: u.username,
          displayName: u.display_name,
          bio: u.bio || '',
          role: 0,
          roleLabel: 'user',
          accountType: 'user',
          status: u.status,
          createdAt: u.created_at,
          deletePending: !!st.deletePending,
          deleteScheduledAt: st.deleteScheduledAt || null
        }
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // PANEL me
  if (action === 'panel-me') {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_panel');
    const session = verifySession(token);
    if (!session || (session.role !== 1 && session.role !== 2)) {
      return json(res, 401, { ok: false, error: 'Not logged in to panel' });
    }
    try {
      const sb = adminClient();
      if (session.role === 1) {
        const { data: o } = await sb.from('owner').select('username, display_name').eq('username', session.username).maybeSingle();
        if (!o) {
          clearPanelCookie(res);
          return json(res, 401, { ok: false, error: 'Owner not in owner table' });
        }
        return json(res, 200, {
          ok: true,
          user: { username: o.username, displayName: o.display_name, role: 1, roleLabel: 'owner', accountType: 'owner' }
        });
      }
      const { data: a } = await sb.from('admins').select('username, display_name, status').eq('username', session.username).maybeSingle();
      if (!a) {
        clearPanelCookie(res);
        return json(res, 403, { ok: false, error: 'Admin removed or not in admins table', code: 'ADMIN_REMOVED' });
      }
      if (a.status === 'banned' || a.status === 'suspended') {
        clearPanelCookie(res);
        return json(res, 403, { ok: false, error: 'Admin account restricted' });
      }
      return json(res, 200, {
        ok: true,
        user: { username: a.username, displayName: a.display_name, role: 2, roleLabel: 'admin', accountType: 'admin' }
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });

  try {
    const body = await readBody(req);
    const act = action || body.action || 'login';
    await ensureSchema();
    const sb = adminClient();

    // PANEL LOGIN — owner table / admins table only
    if (act === 'panel-login') {
      const panel = String(body.panel || '').toLowerCase();
      const password = String(body.password || '');

      if (panel === 'owner') {
        const { data: o } = await sb.from('owner').select('username, display_name, password_hash').limit(1).maybeSingle();
        if (!o) return json(res, 403, { ok: false, error: 'No owner in owner table' });
        if (!checkPassword(password, o.password_hash)) return json(res, 401, { ok: false, error: 'Wrong owner password' });
        if (String(o.password_hash).startsWith('panel:')) {
          await sb.from('owner').update({ password_hash: hashPassword(password) }).eq('username', o.username);
        }
        setPanelCookie(res, signSession({ username: o.username, displayName: o.display_name || 'Owner', role: 1, panel: true }));
        return json(res, 200, { ok: true, user: { username: o.username, displayName: o.display_name || 'Owner', role: 1, roleLabel: 'owner' } });
      }

      if (panel === 'admin') {
        const { data: list } = await sb.from('admins').select('username, display_name, password_hash, status');
        if (!list || !list.length) return json(res, 403, { ok: false, error: 'No admins in admins table' });
        let matched = null;
        for (const a of list) {
          if (checkPassword(password, a.password_hash)) { matched = a; break; }
        }
        if (!matched) return json(res, 401, { ok: false, error: 'Wrong admin password or admin deleted' });
        if (matched.status === 'banned' || matched.status === 'suspended') {
          return json(res, 403, { ok: false, error: 'Admin account restricted' });
        }
        if (String(matched.password_hash).startsWith('panel:')) {
          await sb.from('admins').update({ password_hash: hashPassword(password) }).eq('username', matched.username);
        }
        setPanelCookie(res, signSession({ username: matched.username, displayName: matched.display_name || matched.username, role: 2, panel: true }));
        return json(res, 200, { ok: true, user: { username: matched.username, displayName: matched.display_name || matched.username, role: 2, roleLabel: 'admin' } });
      }

      return json(res, 400, { ok: false, error: 'Invalid panel' });
    }

    // REGISTER — users table only
    if (act === 'register') {
      const username = String(body.username || '').toLowerCase().trim();
      const password = String(body.password || '');
      const displayName = String(body.displayName || username).trim();

      if (username.length < 3 || username.length > 20) return json(res, 400, { ok: false, error: 'Username 3-20 chars' });
      if (!/^[a-z0-9_]+$/.test(username)) return json(res, 400, { ok: false, error: 'Username: letters numbers _ only' });
      if (password.length < 6) return json(res, 400, { ok: false, error: 'Password min 6 characters' });
      if (['owner', 'admin1', 'admin2', 'admin'].includes(username)) {
        return json(res, 400, { ok: false, error: 'Username reserved' });
      }

      const { data: eu } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (eu) return json(res, 409, { ok: false, error: 'Username taken' });
      const { data: ea } = await sb.from('admins').select('username').eq('username', username).maybeSingle();
      if (ea) return json(res, 409, { ok: false, error: 'Username taken' });
      const { data: eo } = await sb.from('owner').select('username').eq('username', username).maybeSingle();
      if (eo) return json(res, 409, { ok: false, error: 'Username taken' });

      const { error } = await sb.from('users').insert({
        username,
        password_hash: hashPassword(password),
        display_name: displayName,
        role: 0,
        status: 'active'
      });
      if (error) return json(res, 400, { ok: false, error: error.message });

      setSessionCookie(res, signSession({ username, displayName, role: 0 }));
      return json(res, 201, {
        ok: true,
        user: { username, displayName, role: 0, roleLabel: 'user', accountType: 'user' },
        mode: dbMode()
      });
    }

    // USER LOGIN — users table ONLY (admin/owner cannot login here)
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');

    // Explicitly reject if they try admin/owner usernames on the app
    const { data: isAdmin } = await sb.from('admins').select('username').eq('username', username).maybeSingle();
    if (isAdmin) return json(res, 403, { ok: false, error: 'Admin accounts use /admin only' });
    const { data: isOwner } = await sb.from('owner').select('username').eq('username', username).maybeSingle();
    if (isOwner) return json(res, 403, { ok: false, error: 'Owner accounts use /owner only' });

    const { data: user, error } = await sb
      .from('users')
      .select('username, password_hash, display_name, status, status_until, delete_scheduled_at')
      .eq('username', username)
      .maybeSingle();

    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!user) return json(res, 401, { ok: false, error: 'User not found' });
    if (!checkPassword(password, user.password_hash)) {
      return json(res, 401, { ok: false, error: 'Wrong password' });
    }

    const st = await checkUserStatus(sb, user);
    if (st.blocked) {
      clearSessionCookie(res);
      return json(res, 403, { ok: false, error: st.message, code: st.code || 'RESTRICTED' });
    }

    setSessionCookie(res, signSession({
      username: user.username,
      displayName: user.display_name,
      role: 0
    }));
    return json(res, 200, {
      ok: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        role: 0,
        roleLabel: 'user',
        accountType: 'user',
        deletePending: !!st.deletePending,
        deleteScheduledAt: st.deleteScheduledAt || null
      },
      mode: dbMode()
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'auth failed', code: e.code || null });
  }
};
