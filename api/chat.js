const crypto = require('crypto');
const { hasDatabase, adminClient, ensureSchema } = require('./lib/db');
const { verifySession, getCookie, readBody, json } = require('./lib/crypto');

function sessionOf(req) {
  const token = getCookie(req, 'sw_session') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return verifySession(token);
}

function id(prefix) {
  return prefix + crypto.randomBytes(6).toString('hex');
}

function dmKey(a, b) {
  return [a, b].sort().join(':');
}

module.exports = async function handler(req, res) {
  if (!hasDatabase()) return json(res, 503, { ok: false, error: 'DATABASE_NOT_CONFIGURED' });
  const session = sessionOf(req);
  if (!session) return json(res, 401, { ok: false, error: 'Login required' });
  const me = session.username;

  try {
    await ensureSchema();
    const sb = adminClient();
    const url = new URL(req.url, 'http://x');
    const action = (url.searchParams.get('action') || '').toLowerCase();

    // ── LIST friends (accepted) for DM / GC invite ───────────
    if (req.method === 'GET' && action === 'friends') {
      const { data, error } = await sb.from('friendships')
        .select('user_a, user_b, status')
        .or(`user_a.eq.${me},user_b.eq.${me}`)
        .eq('status', 'accepted');
      if (error) return json(res, 400, { ok: false, error: error.message });
      const friends = (data || []).map(r => r.user_a === me ? r.user_b : r.user_a);
      return json(res, 200, { ok: true, friends });
    }

    // ── LIST DM threads ──────────────────────────────────────
    if (req.method === 'GET' && (action === 'dms' || action === 'chat')) {
      const { data, error } = await sb.from('dm_threads')
        .select('id, user_a, user_b, last_message_at')
        .or(`user_a.eq.${me},user_b.eq.${me}`)
        .order('last_message_at', { ascending: false });
      if (error) return json(res, 400, { ok: false, error: error.message });
      const threads = (data || []).map(t => ({
        id: t.id,
        peer: t.user_a === me ? t.user_b : t.user_a,
        lastMessageAt: t.last_message_at
      }));
      return json(res, 200, { ok: true, threads });
    }

    // ── OPEN or CREATE DM with a friend ──────────────────────
    if (req.method === 'POST' && action === 'dm-open') {
      const body = await readBody(req);
      const peer = String(body.username || '').toLowerCase().trim();
      if (!peer || peer === me) return json(res, 400, { ok: false, error: 'Invalid user' });

      // Must be friends
      const { data: fr } = await sb.from('friendships')
        .select('status')
        .or(`and(user_a.eq.${me},user_b.eq.${peer}),and(user_a.eq.${peer},user_b.eq.${me})`)
        .eq('status', 'accepted')
        .maybeSingle();
      if (!fr) return json(res, 403, { ok: false, error: 'Only friends can DM. Add them first.' });

      const key = dmKey(me, peer);
      let { data: existing } = await sb.from('dm_threads').select('id').eq('dm_key', key).maybeSingle();
      if (!existing) {
        const tid = id('dm_');
        const { error } = await sb.from('dm_threads').insert({
          id: tid, dm_key: key, user_a: me < peer ? me : peer, user_b: me < peer ? peer : me
        });
        if (error) return json(res, 400, { ok: false, error: error.message });
        existing = { id: tid };
      }
      return json(res, 200, { ok: true, threadId: existing.id, peer });
    }

    // ── GET DM messages ──────────────────────────────────────
    if (req.method === 'GET' && action === 'dm-messages') {
      const threadId = url.searchParams.get('thread');
      if (!threadId) return json(res, 400, { ok: false, error: 'thread required' });
      const { data: th } = await sb.from('dm_threads').select('*').eq('id', threadId).maybeSingle();
      if (!th || (th.user_a !== me && th.user_b !== me)) return json(res, 403, { ok: false, error: 'Not your DM' });
      const { data, error } = await sb.from('dm_messages')
        .select('id, sender, content, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, messages: data || [], peer: th.user_a === me ? th.user_b : th.user_a });
    }

    // ── SEND DM ──────────────────────────────────────────────
    if (req.method === 'POST' && action === 'dm-send') {
      const body = await readBody(req);
      const threadId = String(body.threadId || '');
      const content = String(body.content || '').trim();
      if (!threadId || !content) return json(res, 400, { ok: false, error: 'Missing data' });
      const { data: th } = await sb.from('dm_threads').select('*').eq('id', threadId).maybeSingle();
      if (!th || (th.user_a !== me && th.user_b !== me)) return json(res, 403, { ok: false, error: 'Not your DM' });
      const mid = id('m_');
      const { error } = await sb.from('dm_messages').insert({ id: mid, thread_id: threadId, sender: me, content });
      if (error) return json(res, 400, { ok: false, error: error.message });
      await sb.from('dm_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);
      return json(res, 201, { ok: true, message: { id: mid, sender: me, content } });
    }

    // ── LIST my GCs ──────────────────────────────────────────
    if (req.method === 'GET' && action === 'gcs') {
      const { data: mems } = await sb.from('gc_members').select('gc_id').eq('username', me);
      const ids = (mems || []).map(m => m.gc_id);
      if (!ids.length) return json(res, 200, { ok: true, gcs: [] });
      const { data, error } = await sb.from('group_chats')
        .select('id, name, owner, last_message_at')
        .in('id', ids)
        .order('last_message_at', { ascending: false });
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, gcs: data || [] });
    }

    // ── CREATE GC (requires at least 1 friend member) ────────
    if (req.method === 'POST' && action === 'gc-create') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 64);
      const members = Array.isArray(body.members) ? body.members.map(u => String(u).toLowerCase().trim()) : [];
      if (!name) return json(res, 400, { ok: false, error: 'Name required' });
      if (!members.length) return json(res, 400, { ok: false, error: 'Add at least 1 friend to create a GC' });

      // Verify all are accepted friends
      for (const peer of members) {
        if (peer === me) continue;
        const { data: fr } = await sb.from('friendships')
          .select('status')
          .or(`and(user_a.eq.${me},user_b.eq.${peer}),and(user_a.eq.${peer},user_b.eq.${me})`)
          .eq('status', 'accepted')
          .maybeSingle();
        if (!fr) return json(res, 403, { ok: false, error: `Not friends with @${peer}` });
      }

      const gid = id('gc_');
      const code = crypto.randomBytes(4).toString('hex');
      const { error } = await sb.from('group_chats').insert({ id: gid, name, owner: me, invite_code: code });
      if (error) return json(res, 400, { ok: false, error: error.message });

      const rows = [{ gc_id: gid, username: me }, ...members.filter(u => u !== me).map(u => ({ gc_id: gid, username: u }))];
      await sb.from('gc_members').insert(rows);
      return json(res, 201, { ok: true, gc: { id: gid, name, owner: me, inviteCode: code } });
    }

    // ── LIST my communities ──────────────────────────────────
    if (req.method === 'GET' && action === 'communities') {
      const { data: mems } = await sb.from('community_members').select('community_id').eq('username', me);
      const ids = (mems || []).map(m => m.community_id);
      if (!ids.length) return json(res, 200, { ok: true, communities: [] });
      const { data, error } = await sb.from('communities')
        .select('id, slug, name, description, owner')
        .in('id', ids);
      if (error) return json(res, 400, { ok: false, error: error.message });
      return json(res, 200, { ok: true, communities: data || [] });
    }

    // ── CREATE community ─────────────────────────────────────
    if (req.method === 'POST' && action === 'community-create') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 64);
      let slug = String(body.slug || name || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
      if (!name || !slug) return json(res, 400, { ok: false, error: 'Name required' });
      const cid = id('c_');
      const { error } = await sb.from('communities').insert({ id: cid, slug, name, owner: me, description: String(body.description || '') });
      if (error) return json(res, 400, { ok: false, error: error.message });
      await sb.from('community_members').insert({ community_id: cid, username: me });
      // Default category + general channel
      const catId = id('cat_');
      const chId = id('ch_');
      await sb.from('community_categories').insert({ id: catId, community_id: cid, name: 'Text Channels', position: 0 });
      await sb.from('community_channels').insert({ id: chId, community_id: cid, category_id: catId, name: 'general', position: 0 });
      return json(res, 201, { ok: true, community: { id: cid, slug, name } });
    }

    return json(res, 400, { ok: false, error: 'Unknown action. Use ?action=friends|dms|dm-open|dm-messages|dm-send|gcs|gc-create|communities|community-create' });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message || 'chat failed', code: e.code || null });
  }
};
