// Discord-style community settings by role
(function () {
  if (typeof DB === 'undefined') return;
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/\"/g,'"');
  }
  function ensureRoot() {
    var r = document.getElementById('com-settings-overlay');
    if (!r) {
      r = document.createElement('div');
      r.id = 'com-settings-overlay';
      r.className = 'com-set-overlay';
      document.body.appendChild(r);
    }
    return r;
  }
  function close() {
    var r = document.getElementById('com-settings-overlay');
    if (r) { r.classList.remove('open'); r.innerHTML = ''; }
  }
  function open(communityId) {
    var me = DB.getSession && DB.getSession() && DB.getSession().username;
    if (!me) return;
    var c = DB.getCommunity(communityId);
    if (!c) { alert('Community not found'); return; }
    var isOwner = DB.isCommunityOwner(communityId, me);
    var isAdmin = DB.isCommunityAdmin(communityId, me);
    var role = DB.getMemberRole(communityId, me);
    var roleId = (role && role.id) || 'member';
    var r = ensureRoot();
    var tabs = [{ id: 'overview', label: 'Overview' }, { id: 'members', label: 'Members' }];
    if (isAdmin) {
      tabs.push({ id: 'channels', label: 'Channels' });
      tabs.push({ id: 'invite', label: 'Invite' });
      tabs.push({ id: 'roles', label: 'Roles' });
    }
    if (isOwner) tabs.push({ id: 'owner', label: 'Owner' });
    tabs.push({ id: 'me', label: 'My settings' });
    r.innerHTML =
      '<div class="com-set-backdrop" data-close></div><div class="com-set-sheet"><div class="com-set-bar">' +
      '<button type="button" class="btn small" data-close>Close</button><strong>' + esc(c.name) + ' · Settings</strong>' +
      '<span class="com-set-role-badge">' + esc(role.name || roleId) + '</span></div><div class="com-set-tabs">' +
      tabs.map(function (t, i) {
        return '<button type="button" class="com-set-tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
      }).join('') +
      '</div><div class="com-set-body" id="com-set-body"></div></div>';
    r.classList.add('open');
    r.querySelectorAll('[data-close]').forEach(function (el) { el.onclick = close; });
    var state = { tab: tabs[0].id };
    function paint() {
      r.querySelectorAll('.com-set-tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
      });
      var body = document.getElementById('com-set-body');
      if (!body) return;
      c = DB.getCommunity(communityId);
      if (state.tab === 'overview') {
        body.innerHTML =
          '<p class="meta">Members: ' + (c.members || []).length + '</p>' +
          '<p class="meta">Owner: @' + esc(c.owner) + '</p>' +
          '<p class="meta">Your role: <strong>' + esc(role.name || roleId) + '</strong></p>' +
          (c.description ? '<p>' + esc(c.description) + '</p>' : '<p class="meta">No description</p>') +
          (isAdmin
            ? '<label class="meta">Name</label><input id="cs-name" value="' + esc(c.name) + '" />' +
              '<label class="meta">Description</label><textarea id="cs-desc" rows="2">' + esc(c.description || '') + '</textarea>' +
              '<button type="button" class="btn primary" id="cs-save-info">Save info</button>'
            : '');
        var save = document.getElementById('cs-save-info');
        if (save) save.onclick = function () {
          var data = DB._load();
          var cc = data.communities[communityId];
          if (!cc) return;
          cc.name = (document.getElementById('cs-name').value || cc.name).trim();
          cc.description = (document.getElementById('cs-desc').value || '').trim();
          DB._save(data);
          alert('Saved');
          open(communityId);
        };
      }
      if (state.tab === 'members') {
        body.innerHTML = (c.members || []).map(function (m) {
          var rid = DB.getMemberRoleId(communityId, m);
          var rn = (c.roles && c.roles[rid] && c.roles[rid].name) || rid;
          var actions = '';
          if (isAdmin && String(m).toLowerCase() !== String(c.owner).toLowerCase()) {
            actions = '<select data-user="' + esc(m) + '" class="cs-role-sel">' +
              Object.values(c.roles || {}).filter(function (rr) { return rr.id !== 'owner'; }).map(function (rr) {
                if (!isOwner && rr.id === 'admin') return '';
                return '<option value="' + esc(rr.id) + '"' + (rr.id === rid ? ' selected' : '') + '>' + esc(rr.name) + '</option>';
              }).join('') + '</select>';
            if (DB.hasCommunityPerm(communityId, me, 'kick') || isOwner) {
              actions += ' <button type="button" class="btn small danger cs-kick" data-user="' + esc(m) + '">Kick</button>';
            }
          }
          return '<div class="cs-row"><span>@' + esc(m) + ' · ' + esc(rn) + '</span><span>' + actions + '</span></div>';
        }).join('') || '<p class="meta">No members</p>';
        body.querySelectorAll('.cs-role-sel').forEach(function (sel) {
          sel.onchange = function () {
            var res = DB.setMemberRole(communityId, sel.getAttribute('data-user'), sel.value, me);
            if (!res.ok) alert(res.error || 'Failed');
            paint();
          };
        });
        body.querySelectorAll('.cs-kick').forEach(function (btn) {
          btn.onclick = function () {
            if (!confirm('Kick?')) return;
            var data = DB._load();
            var cc = data.communities[communityId];
            var u = btn.getAttribute('data-user').toLowerCase();
            if (String(cc.owner).toLowerCase() === u) return alert('Cannot kick owner');
            cc.members = (cc.members || []).filter(function (x) { return String(x).toLowerCase() !== u; });
            if (cc.memberRoles) delete cc.memberRoles[u];
            DB._save(data);
            paint();
          };
        });
      }
      if (state.tab === 'channels' && isAdmin) {
        var cats = c.categories || [];
        var chats = Object.values(c.chats || {});
        body.innerHTML =
          '<button type="button" class="btn small primary" id="cs-add-cat">+ Category</button> ' +
          '<button type="button" class="btn small primary" id="cs-add-ch">+ Channel</button>' +
          '<div style="margin-top:10px">' +
          cats.map(function (cat) {
            var chs = chats.filter(function (ch) { return ch.categoryId === cat.id; });
            return '<div class="cs-block"><strong>' + esc(cat.name) + '</strong>' +
              chs.map(function (ch) { return '<div class="cs-row"><span>#' + esc(ch.name) + '</span></div>'; }).join('') +
              '</div>';
          }).join('') + '</div>';
        document.getElementById('cs-add-cat').onclick = function () {
          var n = prompt('Category name:');
          if (!n) return;
          var res = DB.addCommunityCategory(communityId, n.trim(), me);
          if (res && res.ok === false) alert(res.error || 'Failed');
          paint();
        };
        document.getElementById('cs-add-ch').onclick = function () {
          var n = prompt('Channel name:');
          if (!n) return;
          var catId = (cats[0] && cats[0].id) || 'general';
          var res = DB.addCommunityChat(communityId, n.trim(), catId, me);
          if (res && res.ok === false) alert(res.error || 'Failed');
          paint();
        };
      }
      if (state.tab === 'invite' && isAdmin) {
        var link = location.origin + '/chat#invite=c_' + encodeURIComponent(communityId);
        body.innerHTML =
          '<p class="meta">Default permanent invite</p><div class="cs-link">' + esc(link) + '</div>' +
          '<button type="button" class="btn primary" id="cs-copy-inv">Copy link</button>';
        document.getElementById('cs-copy-inv').onclick = function () {
          if (navigator.clipboard) navigator.clipboard.writeText(link);
          alert('Copied');
        };
      }
      if (state.tab === 'roles' && isAdmin) {
        body.innerHTML = Object.values(c.roles || {}).map(function (rr) {
          return '<div class="cs-row"><span><strong>' + esc(rr.name) + '</strong> · ' + esc((rr.permissions || []).join(', ')) + '</span></div>';
        }).join('') +
          (isOwner
            ? '<button type="button" class="btn primary" id="cs-add-role" style="margin-top:10px">+ Add role</button>'
            : '<p class="meta" style="margin-top:10px">Only the owner can create new roles</p>');
        var addR = document.getElementById('cs-add-role');
        if (addR) addR.onclick = function () {
          var n = prompt('Role name:');
          if (!n) return;
          var res = DB.addCommunityRole(communityId, n.trim(), ['chat', 'view'], me);
          if (!res.ok) alert(res.error || 'Failed');
          paint();
        };
      }
      if (state.tab === 'owner' && isOwner) {
        body.innerHTML =
          '<p class="meta">Owner-only controls</p>' +
          '<button type="button" class="btn" id="cs-transfer">Transfer ownership</button>' +
          '<button type="button" class="btn danger" id="cs-delete" style="margin-top:8px">Delete community</button>';
        document.getElementById('cs-transfer').onclick = function () {
          var to = prompt('Transfer to username:');
          if (!to) return;
          var data = DB._load();
          var cc = data.communities[communityId];
          var t = to.trim().toLowerCase();
          if (!(cc.members || []).map(function (m) { return String(m).toLowerCase(); }).includes(t)) {
            alert('User must be a member'); return;
          }
          var old = String(cc.owner).toLowerCase();
          cc.owner = t;
          if (!cc.memberRoles) cc.memberRoles = {};
          cc.memberRoles[t] = 'owner';
          if (cc.memberRoles[old] === 'owner') cc.memberRoles[old] = 'admin';
          DB._save(data);
          alert('Ownership transferred');
          close();
        };
        document.getElementById('cs-delete').onclick = function () {
          if (!confirm('Delete this community forever?')) return;
          var data = DB._load();
          delete data.communities[communityId];
          DB._save(data);
          alert('Deleted');
          close();
          if (window.ChatUI && window.ChatUI.setTab) window.ChatUI.setTab('community');
        };
      }
      if (state.tab === 'me') {
        body.innerHTML =
          '<p class="meta">Your role: <strong>' + esc(role.name || roleId) + '</strong></p>' +
          (isOwner
            ? '<p class="meta">You are the owner. Transfer ownership before leaving.</p>'
            : '<button type="button" class="btn danger" id="cs-leave">Leave community</button>');
        var leave = document.getElementById('cs-leave');
        if (leave) leave.onclick = function () {
          if (!confirm('Leave this community?')) return;
          var res = DB.leaveCommunity(communityId, me);
          if (!res.ok) alert(res.error || 'Failed');
          else {
            close();
            if (window.ChatUI && window.ChatUI.setTab) window.ChatUI.setTab('community');
          }
        };
      }
    }
    r.querySelectorAll('.com-set-tab').forEach(function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-tab'); paint(); };
    });
    paint();
  }
  if (!document.getElementById('com-set-css')) {
    var s = document.createElement('style');
    s.id = 'com-set-css';
    s.textContent =
      '.com-set-overlay{position:fixed;inset:0;z-index:1200;display:none;align-items:flex-end;justify-content:center}' +
      '.com-set-overlay.open{display:flex}' +
      '.com-set-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}' +
      '.com-set-sheet{position:relative;width:100%;max-width:560px;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;background:#12141f;border-radius:16px 16px 0 0;border:1px solid rgba(255,255,255,.08)}' +
      '.com-set-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.08);font-size:.85rem}' +
      '.com-set-role-badge{margin-left:auto;font-size:.65rem;padding:3px 8px;border-radius:999px;background:rgba(100,120,255,.25)}' +
      '.com-set-tabs{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border-bottom:1px solid rgba(255,255,255,.06)}' +
      '.com-set-tab{border:none;background:transparent;color:#9a9ab0;font-size:.7rem;font-weight:700;padding:6px 8px;border-radius:8px;cursor:pointer}' +
      '.com-set-tab.active{background:rgba(100,120,255,.22);color:#fff}' +
      '.com-set-body{flex:1;overflow:auto;padding:12px;font-size:.85rem}' +
      '.cs-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}' +
      '.cs-block{margin:8px 0;padding:8px;border-radius:10px;background:rgba(255,255,255,.04)}' +
      '.cs-link{word-break:break-all;padding:8px;border-radius:8px;background:rgba(0,0,0,.25);margin:8px 0;font-size:.75rem}' +
      '.com-set-body input,.com-set-body textarea,.com-set-body select{width:100%;margin:4px 0 8px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.25);color:#fff}' +
      '.com-set-body .btn{margin-top:6px}';
    document.head.appendChild(s);
  }
  window.CommunitySettings = { open: open, close: close };
})();
