const { hasDatabase, adminClient, ensureSchema, dbMode } = require('./lib/db');
const {
  hashPassword, verifyPassword, signSession, setSessionCookie, clearSessionCookie,
  setPanelCookie, clearPanelCookie, readBody, getCookie, verifySession, json
} = require('./lib/crypto');

// Fixed panel passwords (password-only for /admin and /owner)
const PANEL_PASS = {
  owner: 'swowner26',
  admin1: 'swadmin26',
  admin2: 'swadmin123'
};

const PANEL_ACCOUNTS = {
  owner:  { username: 'owner',  displayName: 'Owner',  password: PANEL_PASS.owner },
  admin1: { username: 'admin1', displayName: 'Admin 1', password: PANEL_PASS.admin1 },
  admin2: { username: 'admin2', displayName: 'Admin 2', password: PANEL_PASS.admin2 }
};

async function ensureOwnerRow(sb) {
  const acc = PANEL_ACCOUNTS.owner;
  const { data } = await sb.from('owner').select('username').limit(1).maybeSingle();
  if (data) return data;
  await sb.from('owner').insert({
    username: acc.username,
    password_hash: hashPassword(acc.password),
    display_name: acc.displayName
  });
  return { username: acc.username };
}

async function ensureAdminRow(sb, key) {
  const acc = PANEL_ACCOUNTS[key];
  if (!acc) return null;
  const { data } = await sb.from('admins').select('username, status').eq('username', acc.username).maybeSingle();
  if (data) return data;
  await sb.from('admins').insert({
    username: acc.username,
    password_hash: hashPassword(acc.password),
    display_name: acc.displayName,
    status: 'active'
  });
  return { username: acc.username, status: 'active' };
}

async function findAccount(sb, username) {
  // Check users → admins → owner
  let { data: u } = await sb.from('users').select('username, password_hash, display_name, status, status_until, bio, created_at').eq('username', username).maybeSingle();
  if (u) return { ...u, accountType: 'user', role: 0 };

  let { data: a } = await sb.from('admins').select('username, password_hash, display_name, status, status_until, created_at').eq('username', username).maybeSingle();
  if (a) return { ...a, accountType: 'admin', role: 2, bio: null };

  let { data: o } = await sb.from('owner').select('username, password_hash, display_name, created_at').eq('username', username).maybeSingle();
  if (o) return { ...o, accountType: 'owner', role: 1, status: 'active', status_until: null, bio: null };

  return null;
}

async function checkStatus(sb, account) {
  if (!account) return { blocked: true, message: 'User not found' };
  if (account.accountType === 'owner') return { blocked: false };
  const status = account.status || 'active';
  if (status === 'active') return { blocked: false };
  if ((status === 'banned' || status === 'suspended') && account.status_until) {
    if (new Date(account.status_until) <= new Date()) {
      const table = account.accountType === 'admin' ? 'admins' : 'users';
      await sb.from(table).update({ status: 'active', status_until: null }).eq('username', account.username);
      return { blocked: false, cleared: true };
    }
    const until = new Date(account.status_until).toLocaleString();
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

function roleLabel(role) {
  if (role === 1) return 'owner';
  if (role === 2) return 'admin';
  return 'user';
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

  // USER me (app session)
  if (action === 'me' || (req.method === 'GET' && !action)) {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    const token = getCookie(req, 'sw_session');
    const session = verifySession(token);
    if (!session) return json(res, 401, { ok: false, error: 'Not logged in' });
    try {
      const sb = adminClient();
      const acc = await findAccount(sb, session.username);
      if (!acc) {
        clearSessionCookie(res);
        return json(res, 401, { ok: false, error: 'User missing' });
      }
      const st = await checkStatus(sb, acc);
      if (st.blocked) {
        clearSessionCookie(res);
        return json(res, 403, { ok: false, error: st.message, code: 'RESTRICTED' });
      }
      return json(res, 200, {
        ok: true,
        user: {
          username: acc.username,
          displayName: acc.display_name || acc.username,
          bio: acc.bio || '',
          role: acc.role,
          roleLabel: roleLabel(acc.role),
          accountType: acc.accountType,
          status: st.cleared ? 'active' : (acc.status || 'active'),
          createdAt: acc.created_at
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
          return json(res, 401, { ok: false, error: 'Owner account missing' });
        }
        return json(res, 200, { ok: true, user: { username: o.username, displayName: o.display_name, role: 1, roleLabel: 'owner', accountType: 'owner' } });
      }
      const { data: a } = await sb.from('admins').select('username, display_name, status').eq('username', session.username).maybeSingle();
      if (!a) {
        clearPanelCookie(res);
        return json(res, 403, { ok: false, error: 'Admin access removed by owner', code: 'ADMIN_REMOVED' });
      }
      return json(res, 200, { ok: true, user: { username: a.username, displayName: a.display_name, role: 2, roleLabel: 'admin', accountType: 'admin' } });
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

    // ── PANEL LOGIN (password only) ───────────────────────────
    if (act === 'panel-login') {
      const panel = String(body.panel || '').toLowerCase();
      const password = String(body.password || '');

      if (panel === 'owner') {
        if (password !== PANEL_PASS.owner) return json(res, 401, { ok: false, error: 'Wrong password' });
        await ensureOwnerRow(sb);
        const { data: o } = await sb.from('owner').select('username, display_name').limit(1).maybeSingle();
        if (!o) return json(res, 500, { ok: false, error: 'Owner not configured' });
        setPanelCookie(res, signSession({ username: o.username, displayName: o.display_name, role: 1, panel: true }));
        return json(res, 200, { ok: true, user: { username: o.username, displayName: o.display_name, role: 1, roleLabel: 'owner' } });
      }

      if (panel === 'admin') {
        let matchedKey = null;
        if (password === PANEL_PASS.admin1) matchedKey = 'admin1';
        else if (password === PANEL_PASS.admin2) matchedKey = 'admin2';
        if (!matchedKey) return json(res, 401, { ok: false, error: 'Wrong password' });

        await ensureAdminRow(sb, matchedKey);
        const uname = PANEL_ACCOUNTS[matchedKey].username;
        const { data: a } = await sb.from('admins').select('username, display_name, status').eq('username', uname).maybeSingle();
        if (!a) return json(res, 403, { ok: false, error: 'Admin access removed by owner' });
        if (a.status === 'banned' || a.status === 'suspended') {
          return json(res, 403, { ok: false, error: 'Admin account restricted' });
        }
        setPanelCookie(res, signSession({ username: a.username, displayName: a.display_name, role: 2, panel: true }));
        return json(res, 200, { ok: true, user: { username: a.username, displayName: a.display_name, role: 2, roleLabel: 'admin' } });
      }

      return json(res, 400, { ok: false, error: 'Invalid panel' });
    }

    // ── REGISTER → users table only ───────────────────────────
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

      // Must not exist in any of the 3 tables
      const existing = await findAccount(sb, username);
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
        user: { username, displayName, role: 0, roleLabel: 'user', accountType: 'user' },
        mode: dbMode()
      });
    }

    // ── USER LOGIN (username + password) — checks users, admins, owner ──
    const username = String(body.username || '').toLowerCase().trim();
    const password = String(body.password || '');
    const acc = await findAccount(sb, username);
    if (!acc) return json(res, 401, { ok: false, error: 'User not found' });
    if (!verifyPassword(password, acc.password_hash)) return json(res, 401, { ok: false, error: 'Wrong password' });

    const st = await checkStatus(sb, acc);
    if (st.blocked) {
      return json(res, 403, { ok: false, error: st.message, code: 'RESTRICTED' });
    }

    setSessionCookie(res, signSession({
      username: acc.username,
      displayName: acc.display_name || acc.username,
      role: acc.role
    }));
    return json(res, 200, {
      ok: true,
      user: {
        username: acc.username,
        displayName: acc.display_name || acc.username,
        role: acc.role,
        roleLabel: roleLabel(acc.role),
        accountType: acc.accountType
      },
      mode: dbMode()
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'auth failed', code: e.code || null });
  }
};
