const { hasDatabase, dbMode, hasSupabase } = require('../lib/db');
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const mode = dbMode();
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    app: 'le-social-web',
    databaseConfigured: hasDatabase(),
    mode: mode,
    supabase: hasSupabase(),
    supabaseUrl: process.env.SUPABASE_URL || null,
    message: mode === 'supabase'
      ? 'Supabase connected. Run schema.sql in Supabase SQL Editor if tables missing.'
      : 'No database configured'
  }));
};
