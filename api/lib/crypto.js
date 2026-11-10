const crypto = require('crypto');
function getSecret() { return process.env.SW_SECRET_KEY || 'dev-only-change-me'; }
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !String(stored).startsWith('scrypt:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const hash = crypto.scryptSync(String(password), parts[1], 64).toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(parts[2], 'hex')); } catch { return false; }
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function signSession(payload, ttlMs) {
  const body = Object.assign({}, payload, { exp: Date.now() + (ttlMs || 12 * 60 * 60 * 1000) });
  const data = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}
function verifySession(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const body = JSON.parse(Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!body.exp || Date.now() > body.exp) return null;
    return body;
  } catch { return null; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const p of raw.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}
function cookieOpts() {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${secure}`;
}
// USER session (index / dashboard / chat)
function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sw_session=${encodeURIComponent(token)}; ${cookieOpts()}; Max-Age=43200`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `sw_session=; ${cookieOpts()}; Max-Age=0`);
}
// PANEL session (owner / admin) — separate from user
function setPanelCookie(res, token) {
  res.setHeader('Set-Cookie', `sw_panel=${encodeURIComponent(token)}; ${cookieOpts()}; Max-Age=43200`);
}
function clearPanelCookie(res) {
  res.setHeader('Set-Cookie', `sw_panel=; ${cookieOpts()}; Max-Age=0`);
}
function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
module.exports = {
  hashPassword, verifyPassword, signSession, verifySession, readBody, getCookie,
  setSessionCookie, clearSessionCookie, setPanelCookie, clearPanelCookie, json
};
