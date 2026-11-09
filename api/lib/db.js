const { sql, db } = require('@vercel/postgres');
function hasDatabase() {
  return !!(process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
}
async function query(strings, ...values) {
  if (!hasDatabase()) {
    const err = new Error('DATABASE_NOT_CONFIGURED');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }
  return sql(strings, ...values);
}
async function rawQuery(text, params) {
  if (!hasDatabase()) {
    const err = new Error('DATABASE_NOT_CONFIGURED');
    err.code = 'DATABASE_NOT_CONFIGURED';
    throw err;
  }
  if (params && params.length) return db.query(text, params);
  return db.query(text);
}
async function ensureSchema() {
  await query`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(32) UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name VARCHAR(64) NOT NULL, bio TEXT DEFAULT '', status VARCHAR(20) DEFAULT 'active', status_until TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())`;
  await query`CREATE TABLE IF NOT EXISTS posts (id VARCHAR(32) PRIMARY KEY, author VARCHAR(32) NOT NULL REFERENCES users(username) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`;
  await query`CREATE TABLE IF NOT EXISTS post_likes (post_id VARCHAR(32) REFERENCES posts(id) ON DELETE CASCADE, username VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE, PRIMARY KEY (post_id, username))`;
  await query`CREATE TABLE IF NOT EXISTS comments (id VARCHAR(32) PRIMARY KEY, post_id VARCHAR(32) REFERENCES posts(id) ON DELETE CASCADE, author VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`;
  await query`CREATE TABLE IF NOT EXISTS friendships (user_a VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE, user_b VARCHAR(32) REFERENCES users(username) ON DELETE CASCADE, status VARCHAR(20) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_a, user_b))`;
  await query`CREATE TABLE IF NOT EXISTS moderation_logs (id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, action VARCHAR(40) NOT NULL, by_role VARCHAR(20), by_name VARCHAR(64), note TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`;
  return { ok: true };
}
async function listTables() {
  const r = await rawQuery(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
  return r.rows.map((x) => x.table_name);
}
module.exports = { sql: query, rawQuery, hasDatabase, ensureSchema, listTables };
