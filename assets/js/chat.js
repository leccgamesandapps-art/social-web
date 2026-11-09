(function () {
  const guard = document.getElementById('guard');
  const app = document.getElementById('app');
  const listEl = document.getElementById('chat-list');
  const paneEmpty = document.getElementById('pane-empty');
  const paneConv = document.getElementById('pane-conv');
  const convHead = document.getElementById('conv-head');
  const convMsgs = document.getElementById('conv-messages');
  const msgInput = document.getElementById('msg-input');
  const sheet = document.getElementById('new-sheet');
  const sheetBody = document.getElementById('sheet-body');
  const sheetTitle = document.getElementById('sheet-title');

  let currentUser = null;
  let tab = 'chat'; // chat | gc | community
  let active = null; // { type: 'dm'|'gc'|'community', id, peer? }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Tabs
  document.querySelectorAll('.ctab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      tab = btn.dataset.tab;
      active = null;
      showEmpty();
      loadList();
    });
  });

  function showEmpty() {
    paneEmpty.classList.remove('hidden');
    paneConv.classList.add('hidden');
  }

  function showConv() {
    paneEmpty.classList.add('hidden');
    paneConv.classList.remove('hidden');
  }

  async function loadList() {
    listEl.innerHTML = '<div class="empty-state sm">Loading…</div>';
    try {
      if (tab === 'chat') {
        const r = await SW.api('/api/chat?action=dms');
        if (!r.ok) throw new Error(r.error);
        if (!r.threads || !r.threads.length) {
          listEl.innerHTML = '<div class="empty-state sm">No DMs yet.<br>Tap ＋ and pick a friend.</div>';
          return;
        }
        listEl.innerHTML = r.threads.map(t => `
          <div class="list-item" data-type="dm" data-id="${esc(t.id)}" data-peer="${esc(t.peer)}">
            <div class="av">${esc((t.peer || '?')[0].toUpperCase())}</div>
            <div class="meta"><div class="title">@${esc(t.peer)}</div><div class="sub">Direct message</div></div>
          </div>`).join('');
      } else if (tab === 'gc') {
        const r = await SW.api('/api/chat?action=gcs');
        if (!r.ok) throw new Error(r.error);
        if (!r.gcs || !r.gcs.length) {
          listEl.innerHTML = '<div class="empty-state sm">No group chats.<br>Tap ＋ to create one (needs friends).</div>';
          return;
        }
        listEl.innerHTML = r.gcs.map(g => `
          <div class="list-item" data-type="gc" data-id="${esc(g.id)}">
            <div class="av">#</div>
            <div class="meta"><div class="title">${esc(g.name)}</div><div class="sub">GC · owner @${esc(g.owner)}</div></div>
          </div>`).join('');
      } else {
        const r = await SW.api('/api/chat?action=communities');
        if (!r.ok) throw new Error(r.error);
        if (!r.communities || !r.communities.length) {
          listEl.innerHTML = '<div class="empty-state sm">No communities yet.<br>Tap ＋ to create one.</div>';
          return;
        }
        listEl.innerHTML = r.communities.map(c => `
          <div class="list-item" data-type="community" data-id="${esc(c.id)}" data-slug="${esc(c.slug)}">
            <div class="av">C</div>
            <div class="meta"><div class="title">${esc(c.name)}</div><div class="sub">/${esc(c.slug)}</div></div>
          </div>`).join('');
      }
      bindListClicks();
    } catch (e) {
      listEl.innerHTML = `<div class="empty-state sm">${esc(e.message)}<br><br>If tables missing, run the new schema.sql in Supabase.</div>`;
    }
  }

  function bindListClicks() {
    listEl.querySelectorAll('.list-item').forEach(el => {
      el.addEventListener('click', () => {
        listEl.querySelectorAll('.list-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        const type = el.dataset.type;
        const id = el.dataset.id;
        if (type === 'dm') openDm(id, el.dataset.peer);
        else if (type === 'gc') openGc(id, el.querySelector('.title').textContent);
        else openCommunity(id, el.querySelector('.title').textContent);
      });
    });
  }

  async function openDm(threadId, peer) {
    active = { type: 'dm', id: threadId, peer };
    convHead.textContent = '@' + peer;
    showConv();
    convMsgs.innerHTML = '<div class="empty-state sm">Loading messages…</div>';
    const r = await SW.api('/api/chat?action=dm-messages&thread=' + encodeURIComponent(threadId));
    if (!r.ok) {
      convMsgs.innerHTML = `<div class="empty-state sm">${esc(r.error)}</div>`;
      return;
    }
    renderMessages(r.messages || []);
  }

  function openGc(id, name) {
    active = { type: 'gc', id };
    convHead.textContent = name + ' (GC)';
    showConv();
    convMsgs.innerHTML = '<div class="empty-state sm">GC messages coming next — create works now</div>';
  }

  function openCommunity(id, name) {
    active = { type: 'community', id };
    convHead.textContent = name;
    showConv();
    convMsgs.innerHTML = '<div class="empty-state sm">Community channels coming next — create works now</div>';
  }

  function renderMessages(msgs) {
    if (!msgs.length) {
      convMsgs.innerHTML = '<div class="empty-state sm">No messages yet. Say hi!</div>';
      return;
    }
    convMsgs.innerHTML = msgs.map(m => {
      const mine = m.sender === currentUser.username;
      return `<div class="msg ${mine ? 'mine' : ''}">
        ${mine ? '' : `<div class="who">@${esc(m.sender)}</div>`}
        ${esc(m.content)}
      </div>`;
    }).join('');
    convMsgs.scrollTop = convMsgs.scrollHeight;
  }

  document.getElementById('btn-send').addEventListener('click', sendMsg);
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

  async function sendMsg() {
    if (!active || active.type !== 'dm') return;
    const content = msgInput.value.trim();
    if (!content) return;
    msgInput.value = '';
    const r = await SW.api('/api/chat?action=dm-send', {
      method: 'POST',
      body: { threadId: active.id, content }
    });
    if (r.ok) {
      openDm(active.id, active.peer);
    } else {
      alert(r.error || 'Send failed');
    }
  }

  // ── New sheet ──────────────────────────────────────────────
  document.getElementById('btn-new').addEventListener('click', openSheet);
  document.getElementById('sheet-close').addEventListener('click', () => sheet.classList.add('hidden'));
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.add('hidden'); });

  async function openSheet() {
    sheet.classList.remove('hidden');
    if (tab === 'chat') {
      sheetTitle.textContent = 'Message a friend';
      const r = await SW.api('/api/chat?action=friends');
      const friends = (r.ok && r.friends) ? r.friends : [];
      if (!friends.length) {
        sheetBody.innerHTML = '<p class="hint">You have no friends yet. Add friends from the dashboard first, then you can DM them.</p>';
        return;
      }
      sheetBody.innerHTML = `<div class="friend-pick">${friends.map(f =>
        `<button type="button" class="friend-chip" data-user="${esc(f)}">@${esc(f)}</button>`
      ).join('')}</div>`;
      sheetBody.querySelectorAll('.friend-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
          const peer = btn.dataset.user;
          const r2 = await SW.api('/api/chat?action=dm-open', { method: 'POST', body: { username: peer } });
          if (!r2.ok) { alert(r2.error); return; }
          sheet.classList.add('hidden');
          tab = 'chat';
          document.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'chat'));
          await loadList();
          openDm(r2.threadId, peer);
        });
      });
    } else if (tab === 'gc') {
      sheetTitle.textContent = 'Create Group Chat';
      const r = await SW.api('/api/chat?action=friends');
      const friends = (r.ok && r.friends) ? r.friends : [];
      if (!friends.length) {
        sheetBody.innerHTML = '<p class="hint">You need at least 1 friend to create a GC.</p>';
        return;
      }
      sheetBody.innerHTML = `
        <div class="field"><label>GC name</label><input id="gc-name" type="text" placeholder="Weekend squad" maxlength="64" /></div>
        <label class="group-label">Add friends</label>
        <div class="friend-pick" id="gc-picks">${friends.map(f =>
          `<button type="button" class="friend-chip" data-user="${esc(f)}">@${esc(f)}</button>`
        ).join('')}</div>
        <button type="button" class="btn primary full" id="btn-gc-create">Create GC</button>`;
      const selected = new Set();
      sheetBody.querySelectorAll('.friend-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          const u = btn.dataset.user;
          if (selected.has(u)) { selected.delete(u); btn.classList.remove('selected'); }
          else { selected.add(u); btn.classList.add('selected'); }
        });
      });
      document.getElementById('btn-gc-create').addEventListener('click', async () => {
        const name = document.getElementById('gc-name').value.trim();
        if (!name) return alert('Enter a name');
        if (!selected.size) return alert('Pick at least 1 friend');
        const r2 = await SW.api('/api/chat?action=gc-create', {
          method: 'POST',
          body: { name, members: [...selected] }
        });
        if (!r2.ok) { alert(r2.error); return; }
        sheet.classList.add('hidden');
        await loadList();
      });
    } else {
      sheetTitle.textContent = 'Create Community';
      sheetBody.innerHTML = `
        <div class="field"><label>Name</label><input id="c-name" type="text" placeholder="Social Web Hub" maxlength="64" /></div>
        <div class="field"><label>Slug (permanent link id)</label><input id="c-slug" type="text" placeholder="socialweb" maxlength="40" /></div>
        <div class="field"><label>Description</label><textarea id="c-desc" rows="2" placeholder="Optional"></textarea></div>
        <button type="button" class="btn primary full" id="btn-c-create">Create community</button>`;
      document.getElementById('btn-c-create').addEventListener('click', async () => {
        const name = document.getElementById('c-name').value.trim();
        const slug = document.getElementById('c-slug').value.trim();
        const description = document.getElementById('c-desc').value.trim();
        if (!name) return alert('Name required');
        const r2 = await SW.api('/api/chat?action=community-create', {
          method: 'POST',
          body: { name, slug, description }
        });
        if (!r2.ok) { alert(r2.error); return; }
        sheet.classList.add('hidden');
        await loadList();
      });
    }
  }

  async function boot() {
    currentUser = await SW.requireAuth();
    if (!currentUser) return;
    guard.classList.add('hidden');
    app.classList.remove('hidden');
    loadList();
  }
  boot();
})();
