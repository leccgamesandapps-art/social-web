const { hasDatabase, dbMode, adminClient, listTables, hasSupabase, ensureSchema } = require('../lib/db');
const { json, readBody } = require('../lib/crypto');
function authorize(req, body) {
  const secret = process.env.SW_SECRET_KEY || '';
  const key = (body && body.secretKey) || req.headers['x-sw-secret'] || '';
  return !!(secret && key && key === secret);
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const body = await readBody(req);
    if (!authorize(req, body)) return json(res, 401, { ok: false, error: 'Unauthorized — enter SW_SECRET_KEY' });
    const action = body.action || 'sql';
    if (action === 'tables' || action === 'setup') {
      try { await ensureSchema(); } catch (e) {
        if (e.code === 'SCHEMA_MISSING') return json(res, 200, { ok: false, error: e.message, tables: [], needSchema: true });
        throw e;
      }
      return json(res, 200, { ok: true, message: 'OK', tables: await listTables(), mode: dbMode() });
    }
    const sqlText = String(body.sql || '').trim();
    if (!sqlText) return json(res, 400, { ok: false, error: 'Empty SQL' });
    const m = sqlText.match(/^select\s+([\w\s,*]+)\s+from\s+([a-z0-9_]+)([\s\S]*)$/i);
    if (m && hasSupabase()) {
      const cols = m[1].trim();
      const table = m[2];
      let limit = 100;
      const lim = (m[3] || '').match(/limit\s+(\d+)/i);
      if (lim) limit = parseInt(lim[1], 10);
      const sb = adminClient();
      const start = Date.now();
      const selectCols = cols === '*' ? '*' : cols;
      const { data, error } = await sb.from(table).select(selectCols).limit(limit);
      if (error) return json(res, 400, { ok: false, error: error.message });
      const rows = data || [];
      const fields = rows.length ? Object.keys(rows[0]) : [];
      return json(res, 200, { ok: true, command: 'SELECT', rowCount: rows.length, fields, rows, durationMs: Date.now() - start, mode: 'supabase' });
    }
    return json(res, 400, { ok: false, error: 'For complex SQL use Supabase SQL Editor', help: 'https://supabase.com/dashboard → SQL' });
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message || 'query failed', code: e.code || null });
  }
};
