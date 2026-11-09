const crypto = require('crypto');
const { hasDatabase, hasSupabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json } = require('./lib/crypto');
module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  try {
    await ensureSchema();
    if (!hasSupabase()) return json(res, 503, { ok: false, error: 'Supabase required' });
    const sb = adminClient();
    if (req.method === 'GET') {
      const { data, error } = await sb.from('posts').select('id, author, content, created_at').order('created_at', { ascending: false }).limit(100);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, posts: (data || []).map((r) => ({ id: r.id, author: r.author, content: r.content, createdAt: r.created_at })) });
    }
    if (req.method === 'POST') {
      const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const session = verifySession(token);
      if (!session) return json(res, 401, { ok: false, error: 'Login required' });
      const body = await readBody(req);
      const content = String(body.content || '').trim();
      if (!content) return json(res, 400, { ok: false, error: 'Empty post' });
      const postId = 'p_' + crypto.randomBytes(6).toString('hex');
      const { error } = await sb.from('posts').insert({ id: postId, author: session.username, content });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 201, { ok: true, post: { id: postId, author: session.username, content } });
    }
    return json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (e) { return json(res, 500, { ok: false, error: e.message || 'posts failed', code: e.code || null }); }
};
