const { hasSupabase, adminClient } = require('./supabase');

function hasDatabase() {
  return hasSupabase();
}

function dbMode() {
  if (hasSupabase()) return 'supabase';
  return 'none';
}

async function ensureSchema() {
  if (hasSupabase()) {
    const sb = adminClient();
    const { error } = await sb.from('users').select('username').limit(1);
    if (error && /relation|does not exist|schema cache/i.test(error.message)) {
      const err = new Error('Tables missing. Open Supabase → SQL Editor and run schema-RESET.sql');
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

module.exports = {
  hasDatabase,
  hasSupabase,
  dbMode,
  adminClient,
  ensureSchema
};
