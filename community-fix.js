// Community UI + router guard (survives old app.js overwriting hash)
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function navigate(path) {
    location.hash = path.startsWith('#') ? path : '#' + path;
  }
  function time(ts) {
    try { return new Date(ts).toLocaleString(); } catch(e) { return ''; }
  }
  function showView(name) {
    document.querySelectorAll('.view').forEach(function(v){ v.classList.remove('active'); });
    var el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
  }
  function parseParts() {
    var raw = (location.hash || '').slice(1);
    return raw.split('=').filter(Boolean).map(function(p) {
      try { return decodeURIComponent(p); } catch(e) { return p; }
    });
  }

  function renderCommunityFull(id) {
    var c = DB.getCommunity(id);
    if (!c) { navigate('communities'); return; }
    var isOwner = c.owner === me;
    var isMember = (c.members || []).indexOf(me) !== -1;

    var header = document.getElementById('community-header');
    if (!header) return;
    header.innerHTML =
      '<div class="profile-card"><h2>' + esc(c.name) + '</h2>' +
      '<p class="bio">' + esc(c.description || '') + '</p>' +
      '<p class="meta">' + c.members.length + ' members · Owner @' + esc(c.owner) + '</p>' +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      (!isMember
        ? '<button class="btn primary" id="join-com">Join</button>'
        : '<span class="meta">You are a member</span>') +
      (isMember ? '<button class="btn" id="com-invite-btn">Invite</button>' : '') +
      (isOwner ? '<button class="btn primary" id="com-open-settings">⚙️ Settings</button>' : '') +
      '</div></div>';

    var join = document.getElementById('join-com');
    if (join) join.onclick = function(){ DB.joinCommunity(id, me); renderCommunityFull(id); };

    var setBtn = document.getElementById('com-open-settings');
    if (setBtn) setBtn.onclick = function(){
      sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: 'settings', sub2: '' }));
      navigate('community=' + encodeURIComponent(id) + '=settings');
      setTimeout(function(){ forceCommunityUI(); }, 30);
      setTimeout(function(){ forceCommunityUI(); }, 120);
    };

    var invBtn = document.getElementById('com-invite-btn');
    if (invBtn) invBtn.onclick = function() {
      var friends = (DB.getFriends(me) || []).filter(function(f){ return (c.members || []).indexOf(f) === -1; });
      if (!friends.length) {
        alert('No friends to invite. Add friends first, or they are already members.');
        return;
      }
      var pick = prompt('Invite friend to community (username):\n' + friends.join(', '));
      if (!pick) return;
      if (typeof DB.inviteToCommunity === 'function') {
        var r = DB.inviteToCommunity(id, me, pick.trim());
        alert(r.ok ? 'Invited!' : (r.error || 'Failed'));
      } else {
        DB.joinCommunity(id, pick.trim().toLowerCase());
        alert('Added');
      }
      renderCommunityFull(id);
    };

    var body = '';
    var cats = c.categories || [];
    var chats = Object.values(c.chats || {});
    if (!cats.length) {
      body = '<div class="empty"><p>No categories yet. Open Settings to add some.</p></div>';
    } else {
      cats.forEach(function(cat) {
        body += '<h3 style="margin:16px 0 8px;font-size:0.85rem;color:var(--muted);text-transform:uppercase">' + esc(cat.name) + '</h3>';
        var catChats = chats.filter(function(ch){ return ch.categoryId === cat.id; });
        if (!catChats.length) {
          body += '<p class="meta" style="margin-bottom:8px">No chats — add in Settings</p>';
        } else {
          body += catChats.map(function(ch) {
            return '<div class="list-item" style="cursor:pointer" data-com-chat="' + encodeURIComponent(ch.id) + '">' +
              '<div style="flex:1"><strong>#' + esc(ch.name) + '</strong></div></div>';
          }).join('');
        }
      });
    }
    var bodyEl = document.getElementById('community-body');
    if (bodyEl) {
      bodyEl.innerHTML = body;
      bodyEl.querySelectorAll('[data-com-chat]').forEach(function(el) {
        el.onclick = function() {
          var chatId = decodeURIComponent(el.getAttribute('data-com-chat'));
          sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: 'chat', sub2: chatId }));
          navigate('community=' + encodeURIComponent(id) + '=chat=' + encodeURIComponent(chatId));
          setTimeout(forceCommunityUI, 30);
          setTimeout(forceCommunityUI, 120);
        };
      });
    }
  }

  function renderCommunitySettingsFull(id, section) {
    var c = DB.getCommunity(id);
    if (!c) { navigate('communities'); return; }
    if (c.owner !== me) {
      alert('Only the owner can open Settings');
      navigate('community=' + encodeURIComponent(id));
      return;
    }
    section = section || '';
    showView('community-settings');
    var box = document.getElementById('com-settings-body');
    if (!box) return;

    var html = '<p class="meta" style="margin-bottom:12px">' + esc(c.name) + '</p>';
    html += '<div class="tabs" style="margin-bottom:16px;flex-wrap:wrap">' +
      '<button class="tab' + (!section ? ' active' : '') + '" data-cs="">Overview</button>' +
      '<button class="tab' + (section === 'roles' ? ' active' : '') + '" data-cs="roles">Roles</button>' +
      '<button class="tab' + (section === 'categories' ? ' active' : '') + '" data-cs="categories">Categories</button>' +
      '<button class="tab' + (section === 'chats' ? ' active' : '') + '" data-cs="chats">Chats</button>' +
      '</div><div id="cs-panel"></div>';
    box.innerHTML = html;

    box.querySelectorAll('[data-cs]').forEach(function(t) {
      t.onclick = function() {
        var s = t.getAttribute('data-cs') || '';
        sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: 'settings', sub2: s }));
        navigate('community=' + encodeURIComponent(id) + '=settings' + (s ? '=' + s : ''));
        setTimeout(forceCommunityUI, 30);
        setTimeout(forceCommunityUI, 120);
      };
    });

    var panel = document.getElementById('cs-panel');
    if (!panel) return;

    if (section === 'roles') {
      var roles = Object.values(c.roles || {});
      panel.innerHTML = roles.map(function(r) {
        return '<div class="list-item"><div style="flex:1"><strong>' + esc(r.name) + '</strong>' +
          '<span class="time"> · ' + esc((r.permissions || []).join(', ')) + '</span></div>' +
          (r.id !== 'owner' && r.id !== 'member'
            ? '<button class="btn small" data-er="' + r.id + '">Edit</button>' +
              '<button class="btn small danger" data-dr="' + r.id + '">Del</button>'
            : '') + '</div>';
      }).join('') + '<button class="btn primary" style="margin-top:12px" id="cs-add-role">+ Add Role</button>';

      var add = document.getElementById('cs-add-role');
      if (add) add.onclick = function() {
        var name = prompt('Role name:');
        if (!name) return;
        if (typeof DB.addCommunityRole !== 'function') { alert('Role API missing — hard refresh'); return; }
        var r = DB.addCommunityRole(id, name, ['view', 'chat'], me);
        alert(r && r.ok ? 'Role added' : (r && r.error) || 'Failed');
        renderCommunitySettingsFull(id, 'roles');
      };
      panel.querySelectorAll('[data-er]').forEach(function(b) {
        b.onclick = function() {
          var name = prompt('New role name:');
          if (!name) return;
          DB.editCommunityRole(id, b.getAttribute('data-er'), { name: name }, me);
          renderCommunitySettingsFull(id, 'roles');
        };
      });
      panel.querySelectorAll('[data-dr]').forEach(function(b) {
        b.onclick = function() {
          if (confirm('Delete role?')) {
            DB.deleteCommunityRole(id, b.getAttribute('data-dr'), me);
            renderCommunitySettingsFull(id, 'roles');
          }
        };
      });
    } else if (section === 'categories') {
      panel.innerHTML = (c.categories || []).map(function(cat) {
        return '<div class="list-item"><div style="flex:1"><strong>' + esc(cat.name) + '</strong></div>' +
          (cat.id !== 'general'
            ? '<button class="btn small" data-ec="' + cat.id + '">Edit</button>' +
              '<button class="btn small danger" data-dc="' + cat.id + '">Del</button>'
            : '') + '</div>';
      }).join('') + '<button class="btn primary" style="margin-top:12px" id="cs-add-cat">+ Add Category</button>';

      var addc = document.getElementById('cs-add-cat');
      if (addc) addc.onclick = function() {
        var name = prompt('Category name:');
        if (!name) return;
        var r = DB.addCommunityCategory(id, name, me);
        alert(r && r.ok ? 'Added' : (r && r.error) || 'Failed');
        renderCommunitySettingsFull(id, 'categories');
      };
      panel.querySelectorAll('[data-ec]').forEach(function(b) {
        b.onclick = function() {
          var name = prompt('New name:');
          if (!name) return;
          DB.editCommunityCategory(id, b.getAttribute('data-ec'), name, me);
          renderCommunitySettingsFull(id, 'categories');
        };
      });
      panel.querySelectorAll('[data-dc]').forEach(function(b) {
        b.onclick = function() {
          if (confirm('Delete category?')) {
            DB.deleteCommunityCategory(id, b.getAttribute('data-dc'), me);
            renderCommunitySettingsFull(id, 'categories');
          }
        };
      });
    } else if (section === 'chats') {
      var chats = Object.values(c.chats || {});
      panel.innerHTML = chats.map(function(ch) {
        return '<div class="list-item"><div style="flex:1"><strong>#' + esc(ch.name) + '</strong>' +
          '<span class="time"> · ' + esc(ch.categoryId) + '</span></div>' +
          '<button class="btn small" data-ech="' + ch.id + '">Edit</button>' +
          '<button class="btn small danger" data-dch="' + ch.id + '">Del</button></div>';
      }).join('') + '<button class="btn primary" style="margin-top:12px" id="cs-add-chat">+ Add Chat</button>';

      var addch = document.getElementById('cs-add-chat');
      if (addch) addch.onclick = function() {
        var name = prompt('Chat name:');
        if (!name) return;
        var cat = prompt('Category id (e.g. general):', 'general') || 'general';
        var r = DB.addCommunityChat(id, name, cat, me);
        alert(r && r.ok ? 'Chat added' : (r && r.error) || 'Failed');
        renderCommunitySettingsFull(id, 'chats');
      };
      panel.querySelectorAll('[data-ech]').forEach(function(b) {
        b.onclick = function() {
          var name = prompt('New chat name:');
          if (!name) return;
          DB.editCommunityChat(id, b.getAttribute('data-ech'), { name: name }, me);
          renderCommunitySettingsFull(id, 'chats');
        };
      });
      panel.querySelectorAll('[data-dch]').forEach(function(b) {
        b.onclick = function() {
          if (confirm('Delete chat?')) {
            DB.deleteCommunityChat(id, b.getAttribute('data-dch'), me);
            renderCommunitySettingsFull(id, 'chats');
          }
        };
      });
    } else {
      panel.innerHTML =
        '<div class="settings-group"><label>Community Name</label>' +
        '<input type="text" id="cs-name" value="' + esc(c.name) + '"/>' +
        '<label>Description</label>' +
        '<textarea id="cs-desc" rows="2">' + esc(c.description || '') + '</textarea>' +
        '<button class="btn primary" id="cs-save">Save</button></div>' +
        '<p class="meta">Members: ' + c.members.length + '</p>';
      var save = document.getElementById('cs-save');
      if (save) save.onclick = function() {
        if (typeof DB.updateCommunity === 'function') {
          DB.updateCommunity(id, {
            name: document.getElementById('cs-name').value.trim(),
            description: document.getElementById('cs-desc').value.trim()
          }, me);
        }
        alert('Saved');
        renderCommunitySettingsFull(id, '');
      };
    }
  }

  var currentComChat = null;
  function openCommunityChatFull(communityId, chatId) {
    var c = DB.getCommunity(communityId);
    if (!c || !c.chats || !c.chats[chatId]) {
      navigate('community=' + encodeURIComponent(communityId));
      return;
    }
    currentComChat = { communityId: communityId, chatId: chatId };
    showView('community-chat');
    var title = document.getElementById('com-chat-title');
    if (title) title.textContent = '#' + c.chats[chatId].name + ' · ' + c.name;
    renderComMessages(c.chats[chatId]);
  }
  function renderComMessages(chat) {
    var box = document.getElementById('com-chat-messages');
    if (!box) return;
    if (!chat.messages || !chat.messages.length) {
      box.innerHTML = '<div class="empty" style="padding:24px"><p>No messages yet</p></div>';
      return;
    }
    box.innerHTML = chat.messages.map(function(m) {
      return '<div class="chat-bubble ' + (m.from === me ? 'mine' : 'theirs') + '">' +
        '<div class="chat-text"><strong>@' + esc(m.from) + '</strong><br>' + esc(m.text) + '</div>' +
        '<div class="chat-time">' + time(m.createdAt) + '</div></div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  var csBack = document.getElementById('com-settings-back');
  if (csBack) csBack.onclick = function() {
    var nav = null;
    try { nav = JSON.parse(sessionStorage.getItem('sw_com_nav') || 'null'); } catch(e) {}
    var id = nav && nav.id;
    if (!id) {
      var parts = parseParts();
      id = parts[1];
    }
    sessionStorage.removeItem('sw_com_nav');
    if (id) navigate('community=' + encodeURIComponent(id));
    else navigate('communities');
    setTimeout(forceCommunityUI, 40);
  };
  var ccBack = document.getElementById('com-chat-back');
  if (ccBack) ccBack.onclick = function() {
    if (currentComChat) {
      sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: currentComChat.communityId, sub: '', sub2: '' }));
      navigate('community=' + encodeURIComponent(currentComChat.communityId));
    } else navigate('communities');
    setTimeout(forceCommunityUI, 40);
  };
  var sendBtn = document.getElementById('com-chat-send');
  if (sendBtn) sendBtn.onclick = function() {
    if (!currentComChat) return;
    var input = document.getElementById('com-chat-input');
    var text = (input && input.value || '').trim();
    if (!text) return;
    DB.sendCommunityMessage(currentComChat.communityId, currentComChat.chatId, me, text);
    if (input) input.value = '';
    var c = DB.getCommunity(currentComChat.communityId);
    renderComMessages(c.chats[currentComChat.chatId]);
  };
  var chatInput = document.getElementById('com-chat-input');
  if (chatInput) chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && sendBtn) sendBtn.click();
  });

  function forceCommunityUI() {
    var nav = null;
    try { nav = JSON.parse(sessionStorage.getItem('sw_com_nav') || 'null'); } catch(e) {}
    var parts = parseParts();

    if (nav && nav.id && (parts[0] !== 'community' || parts[1] !== nav.id || (nav.sub && parts[2] !== nav.sub))) {
      if (nav.sub === 'settings') {
        renderCommunitySettingsFull(nav.id, nav.sub2 || '');
        return;
      }
      if (nav.sub === 'chat' && nav.sub2) {
        openCommunityChatFull(nav.id, nav.sub2);
        return;
      }
      if (!nav.sub) {
        showView('community');
        renderCommunityFull(nav.id);
        return;
      }
    }

    if (parts[0] !== 'community' || !parts[1]) return;
    var id = parts[1];
    var sub = parts[2] || '';
    var sub2 = parts[3] || '';

    if (sub === 'settings') {
      sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: 'settings', sub2: sub2 }));
      renderCommunitySettingsFull(id, sub2);
      return;
    }
    if (sub === 'chat' && sub2) {
      sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: 'chat', sub2: sub2 }));
      openCommunityChatFull(id, sub2);
      return;
    }
    sessionStorage.setItem('sw_com_nav', JSON.stringify({ id: id, sub: '', sub2: '' }));
    showView('community');
    renderCommunityFull(id);
  }

  window.addEventListener('hashchange', function() {
    setTimeout(forceCommunityUI, 20);
    setTimeout(forceCommunityUI, 100);
  });

  document.addEventListener('click', function() {
    setTimeout(forceCommunityUI, 50);
  }, true);

  setTimeout(forceCommunityUI, 80);
  setTimeout(forceCommunityUI, 250);
})();
