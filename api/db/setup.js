const { hasDatabase, ensureSchema } = require('../lib/db');
const { json, readBody } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    await ensureSchema();
    return json(res, 200, { ok: true, message: 'Schema created / verified' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'setup failed' });
  }
};
