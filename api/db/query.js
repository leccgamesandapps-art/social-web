const { hasDatabase, rawQuery, ensureSchema, listTables } = require('../lib/db');
const { json, readBody } = require('../lib/crypto');
function authorize(req, body) {
  const secret = process.env.SW_SECRET_KEY || '';
  const key = (body && body.secretKey) || req.headers['x-sw-secret'] || '';
  return !!(secret && key && key === secret);
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) {
    return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED', help: 'Connect Vercel Postgres to le-social-web and redeploy.' });
  }
  try {
    const body = await readBody(req);
    if (!authorize(req, body)) {
      return json(res, 401, { ok: false, error: 'Unauthorized — enter SW_SECRET_KEY to run SQL' });
    }
    const action = body.action || 'sql';
    if (action === 'tables') {
      await ensureSchema();
      return json(res, 200, { ok: true, tables: await listTables() });
    }
    if (action === 'describe') {
      const table = String(body.table || '').replace(/[^a-z0-9_]/gi, '');
      if (!table) return json(res, 400, { ok: false, error: 'table required' });
      const r = await rawQuery(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [table]);
      return json(res, 200, { ok: true, columns: r.rows });
    }
    if (action === 'setup') {
      await ensureSchema();
      return json(res, 200, { ok: true, message: 'Schema ready', tables: await listTables() });
    }
    const sqlText = String(body.sql || '').trim();
    if (!sqlText) return json(res, 400, { ok: false, error: 'Empty SQL' });
    if (sqlText.length > 20000) return json(res, 400, { ok: false, error: 'SQL too long' });
    const start = Date.now();
    const result = await rawQuery(sqlText);
    return json(res, 200, {
      ok: true,
      command: result.command || null,
      rowCount: result.rowCount,
      fields: (result.fields || []).map((f) => f.name),
      rows: result.rows || [],
      durationMs: Date.now() - start
    });
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message || 'SQL error', code: e.code || null });
  }
};
