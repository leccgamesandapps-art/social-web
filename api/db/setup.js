const { hasDatabase, ensureSchema, listTables, dbMode } = require('../lib/db');
const { json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { ok: false, error: 'GET or POST' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    await ensureSchema();
    return json(res, 200, { ok: true, mode: dbMode(), message: 'Database reachable', tables: await listTables() });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'setup failed', code: e.code || null, help: e.code === 'SCHEMA_MISSING' ? 'Supabase → SQL Editor → run schema.sql' : undefined });
  }
};
