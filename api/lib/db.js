const { hasSupabase, adminClient } = require('./supabase');
let pg = null;
try { pg = require('@vercel/postgres'); } catch (e) { pg = null; }
function hasPostgres() {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
}
function hasDatabase() { return hasSupabase() || hasPostgres(); }
function dbMode() {
  if (hasSupabase()) return 'supabase';
  if (hasPostgres()) return 'postgres';
  return 'none';
}
async function ensureSchema() {
  if (hasSupabase()) {
    const sb = adminClient();
    const { error } = await sb.from('users').select('username').limit(1);
    if (error && /relation|does not exist|schema cache/i.test(error.message)) {
      const err = new Error('Tables missing. Open Supabase → SQL Editor and run schema.sql');
      err.code = 'SCHEMA_MISSING';
      throw err;
    }
    if (error) throw error;
    return { ok: true, mode: 'supabase' };
  }
  const err = new Error('DATABASE_NOT_CONFIGURED');
  err.code = 'DATABASE_NOT_CONFIGURED';
  throw err;
}
async function listTables() {
  return ['users', 'posts', 'post_likes', 'comments', 'friendships', 'moderation_logs'];
}
async function rawQuery() {
  const err = new Error('For full SQL use Supabase SQL Editor, or set DATABASE_URL');
  err.code = 'RAW_SQL_UNAVAILABLE';
  throw err;
}
module.exports = { hasDatabase, hasSupabase, hasPostgres, dbMode, adminClient, ensureSchema, listTables, rawQuery, sql: null };
