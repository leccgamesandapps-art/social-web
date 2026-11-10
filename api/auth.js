const { hasDatabase, adminClient, ensureSchema, dbMode } = require('./lib/db');
const {
  hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie,
  setPanelCookie, clearPanelCookie, readBody, getCookie, verifySession, json
} = require('./lib/crypto');

function roleLabel(role) {
  if (role === 1) return 'owner';
  if (role === 2) return 'admin';
  return 'user';
}

const PANEL = {
  owner:  { password: 'swowner26',  username: 'owner',  displayName: 'Owner',  role: 1 },
  admin1: { password: 'swadmin26',  username: 'admin1', displayName: 'Admin 1', role: 2 },
  admin2: { password: 'swadmin123', username: 'admin2', displayName: 'Admin 2', role: 2 }
};

async function ensurePanelAccount(sb, account) {
  const { data: existing } = await sb.from('users').select('username, role').eq('username', account.username).maybeSingle();
  if (existing) {
    if (account.role === 1 && existing.role !== 1) {
      await sb.from('users').update({ role: 1 }).eq('username', account.username);
    }
    return existing;
  }
  await sb.from('users').insert({
    username: account.username,
    password_hash: hashPassword(account.password),
    display_name: account.displayName,
    role: account.role,
    status: 'active'
  });
  return { username: account.username, role: account.role };
}

async function checkStatus(sb, user) {
  if (!user) return { blocked: true, message: 'User not found' };
  const status = user.status || 'active';
  if (status === 'active') return { blocked: false };
  if ((status === 'banned' || status === 'suspended') && user.status_until) {
    if (new Date(user.status_until) <= new Date()) {
      await sb.from('users').update({ status: 'active', status_until: null }).eq('username', user.username);
      return { blocked: false, cleared: true };
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
  return { blocked: false };
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();

  // USER logout
  if (action === 'logout') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  // PANEL logout (owner/admin)
  if (action === 'panel-logout') {
    clearPanelCookie(res);
    return json(res, 200, { ok: true });
  }

  // USER me
  if (action === 'me' || (req.method === 'GET' && !action)) {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_session');
    const session = verifySession(token);
    if (!session) return json(res, 401, { ok: false, error: 'Not logged in' });
    try {
      const sb = adminClient();
      const { data: u, error } = await sb
        .from('users')
        .select('username, display_name, bio, role, status, status_until, created_at')
        .eq('username', session.username)
        .maybeSingle();
      if (error) return json(res, 500, { ok: false, error: error.message });
      if (!u) {
        clearSessionCookie(res);
        return json(res, 401, { ok: false, error: 'User missing' });
      }
      const st = await checkStatus(sb, u);
      if (st.blocked) {
        clearSessionCookie(res);
        return json(res, 403, { ok: false, error: st.message, code: 'RESTRICTED', status: u.status, statusUntil: u.status_until });
      }
      return json(res, 200, {
        ok: true,
        user: {
          username: u.username,
          displayName: u.display_name,
          bio: u.bio,
          role: u.role,
          roleLabel: roleLabel(u.role),
          status: st.cleared ? 'active' : u.status,
          createdAt: u.created_at
        }
      });
    } catch (e) {
      return json(res, 500, { ok: false, error: e.message });
    }
  }

  // PANEL me (owner/admin)
  if (action === 'panel-me') {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_panel');
    const session = verifySession(token);
    if (!session || (session.role !== 1 && session.role !== 2)) {
      return json(res, 401, { ok: false, error: 'Not logged in to panel' });
    }
    try {
      const sb = adminClient();
      const { data: u } = await sb
        .from('users')
        .select('username, display_name, role, status')
        .eq('username', session.username)
        .maybeSingle();
      if (!u) {
        clearPanelCookie(res);
        return json(res, 401, { ok: false, error: 'Panel account missing' });
      }
      if (session.role === 2 && u.role !== 2) {
        clearPanelCookie(res);
        return json(res, 403, { ok: false, error: 'Admin access removed by owner', code: 'ADMIN_REMOVED' });
      }
      if (session.role === 1 && u.role !== 1) {
        clearPanelCookie(res);
        return json(res, 403, { ok: false, error: 'Not the owner account' });
      }
      return json(res, 200, {
        ok: true,
        user: {
          username: u.username,
          displayName: u.display_name,
          role: u.role,
          roleLabel: roleLabel(u.role)
        }
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

    // ── PANEL LOGIN (password only) → sw_panel cookie ─────────
    if (act === 'panel-login') {
      const panel = String(body.panel || '').toLowerCase();
      const password = String(body.password || '');
      await ensureSchema();
      const sb = adminClient();
      await ensurePanelAccount(sb, PANEL.owner);
      await ensurePanelAccount(sb, PANEL.admin1);
      await ensurePanelAccount(sb, PANEL.admin2);

      let matched = null;
      if (panel === 'owner' && password === PANEL.owner.password) matched = PANEL.owner;
      else if (panel === 'admin') {
        if (password === PANEL.admin1.password) matched = PANEL.admin1;
        else if (password === PANEL.admin2.password) matched = PANEL.admin2;
      } else if (panel !== 'owner' && panel !== 'admin') {
        return json(res, 400, { ok: false, error: 'Invalid panel' });
      }
      if (!matched) return json(res, 401, { ok: false, error: 'Wrong password' });

      const { data: dbUser } = await sb
        .from('users')
        .select('username, display_name, role, status, status_until')
        .eq('username', matched.username)
        .maybeSingle();
      if (!dbUser) return json(res, 401, { ok: false, error: 'Account not found' });
      if (panel === 'admin' && dbUser.role !== 2) {
        return json(res, 403, { ok: false, error: 'Admin access removed by owner' });
      }
      if (panel === 'owner' && dbUser.role !== 1) {
        return json(res, 403, { ok: false, error: 'Not the owner account' });
      }

      // Panel session — does NOT touch user session (sw_session)
      setPanelCookie(res, signSession({
        username: dbUser.username,
        displayName: dbUser.display_name,
        role: dbUser.role,
        panel: true
      }));

      return json(res, 200, {
        ok: true,
        user: {
          username: dbUser.username,
          displayName: dbUser.display_name,
          role: dbUser.role,
          roleLabel: roleLabel(dbUser.role)
        }
      });
    }

    // ── REGISTER (USER) ───────────────────────────────────────
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
      await ensureSchema();
      const sb = adminClient();
      const { data: existing } = await sb.from('users').select('username').eq('username', username).maybeSingle();
      if (existing) return json(res, 409, { ok: false, error: 'Username taken' });
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
        user: { username, displayName, role: 0, roleLabel: 'user' },
        mode: dbMode()
      });
    }

    // ── USER LOGIN (username + password) ──────────────────────
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    await ensureSchema();
    const sb = adminClient();
    const { data: user, error } = await sb
      .from('users')
      .select('username, password_hash, display_name, role, status, status_until')
      .eq('username', username)
      .maybeSingle();
    if (error) return json(res, 500, { ok: false, error: error.message });
    if (!user) return json(res, 401, { ok: false, error: 'User not found' });
    if (!verifyPassword(password, user.password_hash)) return json(res, 401, { ok: false, error: 'Wrong password' });

    const st = await checkStatus(sb, user);
    if (st.blocked) {
      return json(res, 403, { ok: false, error: st.message, code: 'RESTRICTED', status: user.status, statusUntil: user.status_until });
    }

    const role = typeof user.role === 'number' ? user.role : 0;
    // User session only — does not clear panel session
    setSessionCookie(res, signSession({
      username: user.username,
      displayName: user.display_name,
      role
    }));
    return json(res, 200, {
      ok: true,
      user: {
        username: user.username,
        displayName: user.display_name,
        role,
        roleLabel: roleLabel(role)
      },
      mode: dbMode()
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'auth failed', code: e.code || null });
  }
};
