// Group chat + DB invite helpers
(function () {
  if (typeof DB === 'undefined') return;

  if (!DB.createGroupChat) {
    DB.createGroupChat = function(owner, name, memberUsernames) {
      var data = this._load();
      var o = owner.toLowerCase();
      var members = [o];
      (memberUsernames || []).forEach(function(u) {
        u = String(u).toLowerCase();
        if (u && members.indexOf(u) === -1) members.push(u);
      });
      if (members.length < 2) return { ok: false, error: 'Need at least 1 friend to create a group' };
      var id = this._id('gc');
      data.chats[id] = {
        id: id, type: 'gc', name: name || 'Group Chat', owner: o,
        members: members, messages: [], createdAt: Date.now()
      };
      this._save(data);
      var self = this;
      members.forEach(function(m) {
        if (m !== o) self.addNotification(m, o + ' added you to group "' + (name || 'Group Chat') + '"', 'system', id);
      });
      return { ok: true, chat: data.chats[id] };
    };
  }
  if (!DB.inviteToGroup) {
    DB.inviteToGroup = function(chatId, byUser, username) {
      var data = this._load();
      var chat = data.chats[chatId];
      if (!chat || chat.type !== 'gc') return { ok: false, error: 'Not a group' };
      var by = byUser.toLowerCase();
      if ((chat.members || []).indexOf(by) === -1) return { ok: false, error: 'Not a member' };
      var u = username.toLowerCase();
      if ((chat.members || []).indexOf(u) !== -1) return { ok: false, error: 'Already in group' };
      if (!data.users[u]) return { ok: false, error: 'User not found' };
      chat.members.push(u);
      this._save(data);
      this.addNotification(u, by + ' invited you to group "' + chat.name + '"', 'system', chatId);
      return { ok: true };
    };
  }
  if (!DB.inviteToCommunity) {
    DB.inviteToCommunity = function(communityId, byUser, username) {
      var data = this._load();
      var c = data.communities[communityId];
      if (!c) return { ok: false, error: 'Community not found' };
      var by = byUser.toLowerCase();
      if ((c.members || []).indexOf(by) === -1) return { ok: false, error: 'You are not a member' };
      var u = username.toLowerCase();
      if (!data.users[u]) return { ok: false, error: 'User not found' };
      if ((c.members || []).indexOf(u) !== -1) return { ok: false, error: 'Already a member' };
      c.members.push(u);
      if (!c.memberRoles) c.memberRoles = {};
      c.memberRoles[u] = 'member';
      this._save(data);
      this.addNotification(u, by + ' invited you to community "' + c.name + '"', 'system', communityId);
      return { ok: true };
    };
  }

  if (!DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function letter(name) { return ((name || 'U')[0] || 'U').toUpperCase(); }
  function navigate(path) {
    location.hash = path.startsWith('#') ? path : '#' + path;
  }

  function enhanceChatList() {
    var list = document.getElementById('chat-list');
    if (!list) return;
    var raw = (location.hash || '').slice(1);
    if (raw && raw !== 'chat' && raw.indexOf('chat=') !== 0) return;

    var chats = DB.listChats(me);
    var html = '<div style="margin-bottom:12px"><button class="btn small primary" id="create-gc-btn">+ Create Group</button></div>';
    if (!chats.length) {
      html += '<div class="empty"><div class="empty-icon">💬</div><p>No chats yet</p><p class="sub">Message a friend or create a group</p></div>';
    } else {
      html += chats.map(function(c) {
        var last = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        if (c.type === 'gc') {
          return '<div class="list-item" style="cursor:pointer" data-gc="' + encodeURIComponent(c.id) + '">' +
            '<div class="avatar" style="width:36px;height:36px;background:linear-gradient(135deg,#8b7cff,#a78bfa)">G</div>' +
            '<div style="flex:1"><strong>' + esc(c.name || 'Group') + '</strong>' +
            '<p style="font-size:0.8rem;color:var(--muted);margin:0">' + (c.members || []).length + ' members' +
            (last ? ' · ' + esc(String(last.text).slice(0, 30)) : '') + '</p></div></div>';
        }
        var other = (c.members || []).filter(function(m){ return m !== me; })[0] || (c.members || [])[0] || '?';
        return '<div class="list-item" style="cursor:pointer" data-dm="' + encodeURIComponent(other) + '">' +
          '<div class="avatar" style="width:36px;height:36px">' + letter(other) + '</div>' +
          '<div style="flex:1"><strong>@' + esc(other) + '</strong>' +
          (last ? '<p style="font-size:0.85rem;color:var(--muted);margin:0">' + esc(String(last.text).slice(0, 40)) + '</p>' : '') +
          '</div></div>';
      }).join('');
    }
    list.innerHTML = html;

    var btn = document.getElementById('create-gc-btn');
    if (btn) btn.onclick = function() {
      var friends = DB.getFriends(me) || [];
      if (!friends.length) {
        alert('You need at least 1 friend to create a group chat. Add friends first.');
        return;
      }
      var name = prompt('Group name:');
      if (!name || !name.trim()) return;
      var pick = prompt('Invite friends (usernames, comma separated).\nYour friends: ' + friends.join(', '));
      if (pick === null) return;
      var invited = pick.split(',').map(function(s){ return s.trim().toLowerCase(); })
        .filter(function(u){ return u && friends.indexOf(u) !== -1; });
      if (!invited.length) {
        alert('Select at least one friend from your friends list.');
        return;
      }
      var r = DB.createGroupChat(me, name.trim(), invited);
      if (r.ok) {
        alert('Group created!');
        navigate('chat=gc=' + encodeURIComponent(r.chat.id));
      } else alert(r.error || 'Failed');
    };

    list.querySelectorAll('[data-gc]').forEach(function(el) {
      el.onclick = function(){ navigate('chat=gc=' + el.getAttribute('data-gc')); };
    });
    list.querySelectorAll('[data-dm]').forEach(function(el) {
      el.onclick = function(){ navigate('chat=' + el.getAttribute('data-dm')); };
    });
  }

  function openGC(gcId) {
    var chat = DB.getChat(gcId);
    if (!chat || chat.type !== 'gc') { navigate('chat'); return; }
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    var view = document.getElementById('view-chat-dm');
    if (view) view.classList.add('active');
    var title = document.getElementById('chat-title');
    if (title) {
      title.innerHTML = esc(chat.name || 'Group') +
        ' <button class="btn small" id="gc-invite-btn" style="margin-left:8px">Invite</button>';
    }
    var box = document.getElementById('chat-messages');
    if (box) {
      if (!chat.messages || !chat.messages.length) {
        box.innerHTML = '<div class="empty" style="padding:24px"><p>No messages yet. Say hi!</p></div>';
      } else {
        box.innerHTML = chat.messages.map(function(m) {
          return '<div class="chat-bubble ' + (m.from === me ? 'mine' : 'theirs') + '">' +
            '<div class="chat-text">' + esc(m.text) + '</div>' +
            '<div class="chat-time">' + (function(ts){ try { return new Date(ts).toLocaleString(); } catch(e){ return ''; } })(m.createdAt) + '</div></div>';
        }).join('');
        box.scrollTop = box.scrollHeight;
      }
    }
    window.__swCurrentChatId = gcId;
    var inv = document.getElementById('gc-invite-btn');
    if (inv) inv.onclick = function() {
      var friends = (DB.getFriends(me) || []).filter(function(f){ return (chat.members || []).indexOf(f) === -1; });
      if (!friends.length) { alert('No friends left to invite.'); return; }
      var pick = prompt('Invite friend (username):\n' + friends.join(', '));
      if (!pick) return;
      var r = DB.inviteToGroup(gcId, me, pick.trim());
      alert(r.ok ? 'Invited!' : (r.error || 'Failed'));
      if (r.ok) openGC(gcId);
    };
  }

  var sendBtn = document.getElementById('chat-send');
  if (sendBtn) {
    sendBtn.addEventListener('click', function() {
      if (window.__swCurrentChatId && String(window.__swCurrentChatId).indexOf('gc_') === 0) {
        var text = (document.getElementById('chat-input').value || '').trim();
        if (!text) return;
        DB.sendMessage(window.__swCurrentChatId, me, text);
        document.getElementById('chat-input').value = '';
        openGC(window.__swCurrentChatId);
      }
    }, true);
  }

  function handleGCRoute() {
    var raw = (location.hash || '').slice(1);
    var parts = raw.split('=').filter(Boolean).map(function(p) {
      try { return decodeURIComponent(p); } catch(e) { return p; }
    });
    if (parts[0] === 'chat' && parts[1] === 'gc' && parts[2]) {
      openGC(parts[2]);
      return;
    }
    if (parts[0] === 'chat' && !parts[1]) {
      setTimeout(enhanceChatList, 30);
    }
  }

  window.addEventListener('hashchange', function() {
    setTimeout(handleGCRoute, 15);
  });
  setTimeout(function() {
    handleGCRoute();
    enhanceChatList();
  }, 100);
})();
