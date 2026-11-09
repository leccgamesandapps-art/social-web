const { hasDatabase, dbMode, hasSupabase, adminClient, ensureSchema, listTables } = require('./lib/db');
const { json, readBody } = require('./lib/crypto');
function authorize(req, body) {
  const secret = process.env.SW_SECRET_KEY || '';
  const key = (body && body.secretKey) || req.headers['x-sw-secret'] || '';
  return !!(secret && key && key === secret);
}
module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const action = (url.searchParams.get('action') || '').toLowerCase();
  if (req.method === 'GET' && (!action || action === 'status')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const mode = dbMode();
    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true, app: 'le-social-web', databaseConfigured: hasDatabase(), mode, supabase: hasSupabase(),
      supabaseUrl: process.env.SUPABASE_URL || null,
      message: mode === 'supabase' ? 'Supabase connected. Run schema.sql in Supabase SQL Editor if tables missing.' : 'No database configured'
    }));
  }
  if (req.method === 'GET' && action === 'setup') {
    if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
    try { await ensureSchema(); return json(res, 200, { ok: true, mode: dbMode(), tables: await listTables() }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message, code: e.code || null }); }
  }
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Use GET ?action=status or POST' });
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    const body = await readBody(req);
    const act = action || body.action || 'sql';
    if (act === 'setup' || act === 'tables') {
      if (act === 'tables' && !authorize(req, body)) return json(res, 401, { ok: false, error: 'Unauthorized' });
      try { await ensureSchema(); return json(res, 200, { ok: true, mode: dbMode(), tables: await listTables(), message: 'OK' }); }
      catch (e) { return json(res, 500, { ok: false, error: e.message, code: e.code || null, help: 'Supabase SQL Editor → run schema.sql' }); }
    }
    if (!authorize(req, body)) return json(res, 401, { ok: false, error: 'Unauthorized — enter SW_SECRET_KEY' });
    const sqlText = String(body.sql || '').trim();
    if (!sqlText) return json(res, 400, { ok: false, error: 'Empty SQL' });
    const m = sqlText.match(/^select\s+([\w\s,*]+)\s+from\s+([a-z0-9_]+)([\s\S]*)$/i);
    if (m && hasSupabase()) {
      const cols = m[1].trim(); const table = m[2]; let limit = 100;
      const lim = (m[3] || '').match(/limit\s+(\d+)/i); if (lim) limit = parseInt(lim[1], 10);
      const sb = adminClient(); const start = Date.now();
      const { data, error } = await sb.from(table).select(cols === '*' ? '*' : cols).limit(limit);
      if (error) return json(res, 400, { ok: false, error: error.message });
      const rows = data || []; const fields = rows.length ? Object.keys(rows[0]) : [];
      return json(res, 200, { ok: true, command: 'SELECT', rowCount: rows.length, fields, rows, durationMs: Date.now() - start, mode: 'supabase' });
    }
    return json(res, 400, { ok: false, error: 'For complex SQL use Supabase SQL Editor' });
  } catch (e) { return json(res, 400, { ok: false, error: e.message || 'failed', code: e.code || null }); }
};
