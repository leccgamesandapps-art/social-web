// Spaces = combined communities + chat (Discord-style layout)
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;
  var state = { mode: 'dm', spaceId: null, channelId: null, dmId: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function letter(n) { return ((n || 'U')[0] || 'U').toUpperCase(); }
  function time(ts) {
    try { return new Date(ts).toLocaleString(); } catch (e) { return ''; }
  }

  function setComposer(enabled, placeholder) {
    var input = document.getElementById('spaces-input');
    var send = document.getElementById('spaces-send');
    if (!input || !send) return;
    input.disabled = !enabled;
    send.disabled = !enabled;
    input.placeholder = placeholder || 'Message…';
  }

  function renderRail() {
    var list = document.getElementById('spaces-server-list');
    if (!list) return;
    var spaces = typeof DB.listCommunities === 'function' ? DB.listCommunities() : [];
    list.innerHTML = spaces.map(function (c) {
      var active = state.mode === 'space' && state.spaceId === c.id ? ' active' : '';
      return '<button type="button" class="space-pill' + active + '" data-space="' + esc(c.id) + '" title="' + esc(c.name) + '">' +
        letter(c.name) + '</button>';
    }).join('');
    list.querySelectorAll('[data-space]').forEach(function (btn) {
      btn.onclick = function () {
        state.mode = 'space';
        state.spaceId = btn.getAttribute('data-space');
        state.channelId = 'general';
        state.dmId = null;
        var c = DB.getCommunity(state.spaceId);
        if (c && c.chats) {
          var ids = Object.keys(c.chats);
          state.channelId = ids.indexOf('general') >= 0 ? 'general' : (ids[0] || null);
        }
        renderAll();
      };
    });
    var dmBtn = document.getElementById('spaces-dm-btn');
    if (dmBtn) {
      dmBtn.classList.toggle('active', state.mode === 'dm');
      dmBtn.onclick = function () {
        state.mode = 'dm';
        state.spaceId = null;
        state.channelId = null;
        renderAll();
      };
    }
    var addBtn = document.getElementById('spaces-add-btn');
    if (addBtn) {
      addBtn.onclick = function () {
        var name = prompt('Space name:');
        if (!name) return;
        var desc = prompt('Description (optional):') || '';
        var r = DB.createCommunity(me, name.trim(), desc);
        if (r && r.ok) {
          state.mode = 'space';
          state.spaceId = r.community.id;
          state.channelId = 'general';
          renderAll();
        } else alert((r && r.error) || 'Failed');
      };
    }
  }

  function renderSidebar() {
    var header = document.getElementById('spaces-side-header');
    var body = document.getElementById('spaces-side-body');
    if (!header || !body) return;

    if (state.mode === 'dm') {
      header.textContent = 'Direct messages';
      var chats = DB.listChats(me) || [];
      var dms = chats.filter(function (c) { return c.type !== 'gc'; });
      var gcs = chats.filter(function (c) { return c.type === 'gc'; });
      var html = '';
      if (gcs.length) {
        html += '<div class="spaces-cat">Groups</div>';
        html += gcs.map(function (c) {
          var active = state.dmId === c.id ? ' active' : '';
          return '<button type="button" class="spaces-chan' + active + '" data-dm="' + esc(c.id) + '">' +
            '<span class="hash">#</span> ' + esc(c.name || 'Group') + '</button>';
        }).join('');
      }
      html += '<div class="spaces-cat">Friends</div>';
      if (!dms.length) {
        html += '<p class="meta" style="padding:8px 12px">No DMs yet</p>';
      } else {
        html += dms.map(function (c) {
          var other = (c.members || []).filter(function (m) { return m !== me; })[0] || 'user';
          var active = state.dmId === c.id ? ' active' : '';
          return '<button type="button" class="spaces-chan' + active + '" data-dm="' + esc(c.id) + '">' +
            '<span class="dm-av">' + letter(other) + '</span> ' + esc(other) + '</button>';
        }).join('');
      }
      body.innerHTML = html;
      body.querySelectorAll('[data-dm]').forEach(function (btn) {
        btn.onclick = function () {
          state.dmId = btn.getAttribute('data-dm');
          renderAll();
        };
      });
      return;
    }

    var c = DB.getCommunity(state.spaceId);
    if (!c) {
      header.textContent = 'Space';
      body.innerHTML = '<p class="meta" style="padding:8px 12px">Select a space</p>';
      return;
    }
    header.innerHTML = esc(c.name);
    var cats = c.categories || [{ id: 'general', name: 'General' }];
    var chats = Object.values(c.chats || {});
    var html = '';
    cats.forEach(function (cat) {
      html += '<div class="spaces-cat">' + esc(cat.name) + '</div>';
      var chs = chats.filter(function (ch) { return ch.categoryId === cat.id; });
      if (!chs.length) html += '<p class="meta" style="padding:4px 12px">No channels</p>';
      else {
        html += chs.map(function (ch) {
          var active = state.channelId === ch.id ? ' active' : '';
          return '<button type="button" class="spaces-chan' + active + '" data-ch="' + esc(ch.id) + '">' +
            '<span class="hash">#</span> ' + esc(ch.name) + '</button>';
        }).join('');
      }
    });
    html += '<div class="spaces-cat">Members · ' + (c.members || []).length + '</div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-ch]').forEach(function (btn) {
      btn.onclick = function () {
        state.channelId = btn.getAttribute('data-ch');
        renderAll();
      };
    });
  }

  function renderMain() {
    var title = document.getElementById('spaces-channel-title');
    var box = document.getElementById('spaces-messages');
    if (!title || !box) return;

    if (state.mode === 'dm') {
      if (!state.dmId) {
        title.textContent = 'Direct messages';
        box.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Select a conversation</p></div>';
        setComposer(false, 'Select a chat…');
        return;
      }
      var chat = DB.getChat(state.dmId);
      if (!chat) {
        title.textContent = 'Chat';
        box.innerHTML = '<div class="empty"><p>Not found</p></div>';
        setComposer(false);
        return;
      }
      if (chat.type === 'gc') title.textContent = '# ' + (chat.name || 'Group');
      else {
        var other = (chat.members || []).filter(function (m) { return m !== me; })[0] || 'user';
        title.textContent = '@' + other;
      }
      renderMessages(chat.messages || []);
      setComposer(true, 'Message…');
      return;
    }

    var c = DB.getCommunity(state.spaceId);
    if (!c || !state.channelId || !c.chats || !c.chats[state.channelId]) {
      title.textContent = c ? c.name : 'Space';
      box.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><p>Select a channel</p></div>';
      setComposer(false, 'Select a channel…');
      return;
    }
    var ch = c.chats[state.channelId];
    title.textContent = '# ' + ch.name + ' · ' + c.name;
    renderMessages(ch.messages || []);
    setComposer(true, 'Message #' + ch.name);
  }

  function renderMessages(msgs) {
    var box = document.getElementById('spaces-messages');
    if (!msgs.length) {
      box.innerHTML = '<div class="empty" style="padding:24px"><p>No messages yet</p><p class="sub">Say hello</p></div>';
      return;
    }
    box.innerHTML = msgs.map(function (m) {
      return '<div class="space-msg">' +
        '<div class="space-msg-av">' + letter(m.from) + '</div>' +
        '<div class="space-msg-body"><div class="space-msg-meta"><strong>@' + esc(m.from) + '</strong>' +
        '<span class="time">' + time(m.createdAt) + '</span></div>' +
        '<div class="space-msg-text">' + esc(m.text) + '</div></div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function doSend() {
    var input = document.getElementById('spaces-input');
    if (!input || input.disabled) return;
    var text = input.value.trim();
    if (!text) return;
    if (state.mode === 'dm' && state.dmId) {
      DB.sendMessage(state.dmId, me, text);
      input.value = '';
      renderMain();
      return;
    }
    if (state.mode === 'space' && state.spaceId && state.channelId) {
      DB.sendCommunityMessage(state.spaceId, state.channelId, me, text);
      input.value = '';
      renderMain();
    }
  }

  function renderAll() {
    renderRail();
    renderSidebar();
    renderMain();
  }

  function wire() {
    var send = document.getElementById('spaces-send');
    var input = document.getElementById('spaces-input');
    if (send) send.onclick = doSend;
    if (input) {
      input.onkeydown = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          doSend();
        }
      };
    }
  }

  window.SpacesUI = { render: renderAll, state: state };

  window.addEventListener('hashchange', function () {
    if ((location.hash || '').indexOf('spaces') !== -1) setTimeout(renderAll, 40);
  });
  setTimeout(function () {
    wire();
    var onChat = (location.pathname || '').indexOf('chat') !== -1;
    if (onChat || (location.hash || '').indexOf('spaces') !== -1) renderAll();
  }, 150);
})();
