const { sql, hasDatabase, ensureSchema } = require('../lib/db');
const { verifySession, getCookie, readBody, json } = require('../lib/crypto');
const crypto = require('crypto');
function sessionFrom(req) {
  const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifySession(token);
}
module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const result = await sql`SELECT p.id, p.author, p.content, p.created_at, u.display_name, COALESCE((SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id), 0) AS like_count FROM posts p JOIN users u ON u.username = p.author ORDER BY p.created_at DESC LIMIT 100`;
      return json(res, 200, { ok: true, posts: result.rows.map((r) => ({ id: r.id, author: r.author, displayName: r.display_name, content: r.content, createdAt: r.created_at, likeCount: Number(r.like_count) })) });
    }
    if (req.method === 'POST') {
      const session = sessionFrom(req);
      if (!session) return json(res, 401, { ok: false, error: 'Login required' });
      const body = await readBody(req);
      const content = String(body.content || '').trim();
      if (!content) return json(res, 400, { ok: false, error: 'Empty post' });
      const postId = 'p_' + crypto.randomBytes(6).toString('hex');
      await sql`INSERT INTO posts (id, author, content) VALUES (${postId}, ${session.username}, ${content})`;
      return json(res, 201, { ok: true, post: { id: postId, author: session.username, content } });
    }
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'posts failed' });
  }
};
