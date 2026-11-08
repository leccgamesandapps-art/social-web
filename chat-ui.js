(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;
  var tab = 'chat';
  var selected = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  }
  function letter(n) { return ((n || '?')[0] || '?').toUpperCase(); }
  function time(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
  }

  function setTab(name) {
    tab = name;
    selected = null;
    document.querySelectorAll('.chat-tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    var titles = { chat: 'Chats', gc: 'Group chats', community: 'Communities' };
    var t = document.getElementById('list-title');
    if (t) t.textContent = titles[name] || name;
    renderList();
    clearPanel();
  }

  function clearPanel() {
    var title = document.getElementById('panel-title');
    var box = document.getElementById('panel-messages');
    var input = document.getElementById('panel-input');
    var send = document.getElementById('panel-send');
    if (title) title.textContent = 'Select a conversation';
    if (box) box.innerHTML = '<div class="empty"><p>Choose from the list</p></div>';
    if (input) { input.value = ''; input.disabled = true; }
    if (send) send.disabled = true;
  }

  function renderList() {
    var list = document.getElementById('chat-list');
    if (!list) return;
    var html = '';
    if (tab === 'chat') {
      var chats = (DB.listChats(me) || []).filter(function (c) { return c.type !== 'gc'; });
      if (!chats.length) html = '<p class="meta" style="padding:12px">No DMs yet</p>';
      else {
        html = chats.map(function (c) {
          var other = (c.members || []).filter(function (m) { return m !== me; })[0] || 'user';
          var active = selected && selected.id === c.id ? ' active' : '';
          return '<button type="button" class="chat-list-item' + active + '" data-type="dm" data-id="' + esc(c.id) + '">' +
            '<div class="chat-list-av">' + letter(other) + '</div>' +
            '<div class="chat-list-meta"><strong>@' + esc(other) + '</strong></div></button>';
        }).join('');
      }
    } else if (tab === 'gc') {
      var gcs = (DB.listChats(me) || []).filter(function (c) { return c.type === 'gc'; });
      if (!gcs.length) html = '<p class="meta" style="padding:12px">No group chats</p>';
      else {
        html = gcs.map(function (c) {
          var active = selected && selected.id === c.id ? ' active' : '';
          return '<button type="button" class="chat-list-item' + active + '" data-type="gc" data-id="' + esc(c.id) + '">' +
            '<div class="chat-list-av">' + letter(c.name) + '</div>' +
            '<div class="chat-list-meta"><strong>' + esc(c.name || 'Group') + '</strong></div></button>';
        }).join('');
      }
    } else {
      var spaces = typeof DB.listCommunities === 'function' ? DB.listCommunities() : [];
      if (!spaces.length) html = '<p class="meta" style="padding:12px">No communities yet</p>';
      else {
        html = spaces.map(function (c) {
          var active = selected && selected.id === c.id ? ' active' : '';
          return '<button type="button" class="chat-list-item' + active + '" data-type="community" data-id="' + esc(c.id) + '">' +
            '<div class="chat-list-av">' + letter(c.name) + '</div>' +
            '<div class="chat-list-meta"><strong>' + esc(c.name) + '</strong></div></button>';
        }).join('');
      }
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-id]').forEach(function (btn) {
      btn.onclick = function () {
        selected = { type: btn.getAttribute('data-type'), id: btn.getAttribute('data-id') };
        renderList();
        openSelected();
      };
    });
  }

  function msgHtml(m) {
    return '<div class="chat-msg"><div class="chat-msg-av">' + letter(m.from) + '</div>' +
      '<div><div class="chat-msg-meta"><strong>@' + esc(m.from) + '</strong>' + time(m.createdAt) + '</div>' +
      '<div class="chat-msg-text">' + esc(m.text) + '</div></div></div>';
  }

  function openSelected() {
    if (!selected) return clearPanel();
    var title = document.getElementById('panel-title');
    var box = document.getElementById('panel-messages');
    var input = document.getElementById('panel-input');
    var send = document.getElementById('panel-send');

    if (selected.type === 'dm' || selected.type === 'gc') {
      var chat = DB.getChat(selected.id);
      if (!chat) { clearPanel(); return; }
      if (chat.type === 'gc') title.textContent = chat.name || 'Group';
      else {
        var other = (chat.members || []).filter(function (m) { return m !== me; })[0] || 'user';
        title.textContent = '@' + other;
      }
      var msgs = chat.messages || [];
      box.innerHTML = msgs.length ? msgs.map(msgHtml).join('') : '<div class="empty"><p>No messages yet</p></div>';
      box.scrollTop = box.scrollHeight;
      input.disabled = false;
      send.disabled = false;
      input.placeholder = 'Message…';
      return;
    }

    var c = DB.getCommunity(selected.id);
    if (!c) { clearPanel(); return; }
    title.innerHTML = esc(c.name) + ' <button type="button" class="btn small" id="com-settings-btn" style="float:right;font-size:0.65rem;padding:3px 8px">⚙️ Settings</button>';
    setTimeout(function () {
      var sb = document.getElementById('com-settings-btn');
      if (sb) sb.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.CommunitySettings) window.CommunitySettings.open(selected.id);
        else alert('Settings unavailable');
      };
    }, 0);
    var chats = Object.values(c.chats || {});
    if (!chats.length) {
      box.innerHTML = '<div class="empty"><p>No channels</p></div>';
      input.disabled = true;
      send.disabled = true;
      return;
    }
    if (!selected.channelId) selected.channelId = chats[0].id;
    var ch = c.chats[selected.channelId];
    var chBar = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">' +
      chats.map(function (x) {
        var on = x.id === selected.channelId ? ' primary' : '';
        return '<button type="button" class="btn small' + on + '" data-ch="' + esc(x.id) + '">#' + esc(x.name) + '</button>';
      }).join('') + '</div>';
    var msgs2 = (ch && ch.messages) || [];
    box.innerHTML = chBar + (msgs2.length ? msgs2.map(msgHtml).join('') :
      '<div class="empty"><p>No messages in #' + esc(ch.name) + '</p></div>');
    box.querySelectorAll('[data-ch]').forEach(function (b) {
      b.onclick = function () {
        selected.channelId = b.getAttribute('data-ch');
        openSelected();
      };
    });
    box.scrollTop = box.scrollHeight;
    input.disabled = false;
    send.disabled = false;
    input.placeholder = 'Message #' + (ch ? ch.name : '');
  }

  function send() {
    var input = document.getElementById('panel-input');
    if (!input || input.disabled || !selected) return;
    var text = input.value.trim();
    if (!text) return;
    if (selected.type === 'dm' || selected.type === 'gc') {
      DB.sendMessage(selected.id, me, text);
      input.value = '';
      openSelected();
      return;
    }
    if (selected.type === 'community' && selected.channelId) {
      DB.sendCommunityMessage(selected.id, selected.channelId, me, text);
      input.value = '';
      openSelected();
    }
  }

  function onAdd() {
    if (tab === 'community') {
      var n = prompt('Community name:');
      if (!n) return;
      var d = prompt('Description (optional):') || '';
      var r = DB.createCommunity(me, n.trim(), d);
      if (r && r.ok) {
        selected = { type: 'community', id: r.community.id };
        renderList(); openSelected();
      } else alert((r && r.error) || 'Failed');
    } else if (tab === 'gc') {
      var name = prompt('Group chat name:');
      if (!name) return;
      if (typeof DB.createGroupChat === 'function') {
        var g = DB.createGroupChat(me, name.trim(), []);
        if (g && g.ok) {
          selected = { type: 'gc', id: g.chat.id };
          renderList(); openSelected();
        } else alert((g && g.error) || 'Need friends to create GC');
      } else alert('GC not available');
    } else {
      alert('Start a chat from Friends on the Feed');
    }
  }

  document.querySelectorAll('.chat-tab').forEach(function (b) {
    b.onclick = function () { setTab(b.getAttribute('data-tab')); };
  });
  var addBtn = document.getElementById('list-add-btn');
  if (addBtn) addBtn.onclick = onAdd;
  var sendBtn = document.getElementById('panel-send');
  if (sendBtn) sendBtn.onclick = send;
  var input = document.getElementById('panel-input');
  if (input) input.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  window.ChatUI = {
    setTab: setTab,
    renderList: renderList,
    select: function (t, id) {
      tab = t === 'community' ? 'community' : (t === 'gc' ? 'gc' : 'chat');
      document.querySelectorAll('.chat-tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      var titles = { chat: 'Chats', gc: 'Group chats', community: 'Communities' };
      var el = document.getElementById('list-title');
      if (el) el.textContent = titles[tab];
      selected = { type: t, id: id };
      renderList();
      openSelected();
    }
  };

  setTab('chat');
})();
