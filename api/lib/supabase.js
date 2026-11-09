const { createClient } = require('@supabase/supabase-js');
function hasSupabase() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function adminClient() {
  if (!hasSupabase()) {
    const err = new Error('SUPABASE_NOT_CONFIGURED');
    err.code = 'SUPABASE_NOT_CONFIGURED';
    throw err;
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
module.exports = { hasSupabase, adminClient };
