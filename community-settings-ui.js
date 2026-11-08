// Community settings — Discord-like roles & permissions
(function () {
  if (typeof DB === 'undefined') return;
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  }
  var PERM_LABELS = {
    view_channels: 'View channels',
    send_messages: 'Send messages',
    manage_messages: 'Manage messages',
    manage_channels: 'Manage channels',
    manage_roles: 'Manage roles',
    kick_members: 'Kick members',
    create_invite: 'Create invite',
    administrator: 'Administrator (all perms)'
  };
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
    var canManageRoles = isOwner || DB.hasCommunityPerm(communityId, me, 'manage_roles');
    var canManageChannels = isOwner || DB.hasCommunityPerm(communityId, me, 'manage_channels');
    var canInvite = isOwner || DB.hasCommunityPerm(communityId, me, 'create_invite');
    var canKick = isOwner || DB.hasCommunityPerm(communityId, me, 'kick_members');
    var tabs = [{ id: 'overview', label: 'Overview' }, { id: 'members', label: 'Members' }];
    if (canManageChannels) tabs.push({ id: 'channels', label: 'Channels' });
    if (canInvite) tabs.push({ id: 'invite', label: 'Invite' });
    if (canManageRoles) tabs.push({ id: 'roles', label: 'Roles' });
    if (isOwner) tabs.push({ id: 'owner', label: 'Owner' });
    tabs.push({ id: 'me', label: 'My settings' });
    var r = ensureRoot();
    r.innerHTML =
      '<div class="com-set-backdrop" data-close></div><div class="com-set-sheet"><div class="com-set-bar">' +
      '<button type="button" class="btn small" data-close>Close</button><strong>' + esc(c.name) + '</strong>' +
      '<span class="com-set-role-badge">' + (isOwner ? 'Owner' : 'Member') + '</span></div><div class="com-set-tabs">' +
      tabs.map(function (t, i) {
        return '<button type="button" class="com-set-tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
      }).join('') +
      '</div><div class="com-set-body" id="com-set-body"></div></div>';
    r.classList.add('open');
    r.querySelectorAll('[data-close]').forEach(function (el) { el.onclick = close; });
    var state = { tab: tabs[0].id, editRoleId: null };
    function roleNameList(user) {
      var ids = DB.getMemberRoleIds(communityId, user);
      if (!ids.length) return 'No roles';
      return ids.map(function (id) {
        return (c.roles && c.roles[id] && c.roles[id].name) || id;
      }).join(', ');
    }
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
          '<p class="meta">Owner: @' + esc(c.owner) + ' <em>(not a role)</em></p>' +
          '<p class="meta">You: ' + (isOwner ? 'Owner' : 'Member') +
          (DB.getMemberRoleIds(communityId, me).length ? ' · roles: ' + esc(roleNameList(me)) : ' · no extra roles') + '</p>' +
          (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
          (isOwner || DB.hasCommunityPerm(communityId, me, 'manage_channels')
            ? '<label class="meta">Name</label><input id="cs-name" value="' + esc(c.name) + '" />' +
              '<label class="meta">Description</label><textarea id="cs-desc" rows="2">' + esc(c.description || '') + '</textarea>' +
              '<button type="button" class="btn primary" id="cs-save-info">Save</button>'
            : '');
        var save = document.getElementById('cs-save-info');
        if (save) save.onclick = function () {
          var data = DB._load();
          var cc = data.communities[communityId];
          cc.name = (document.getElementById('cs-name').value || cc.name).trim();
          cc.description = (document.getElementById('cs-desc').value || '').trim();
          DB._save(data);
          alert('Saved');
          open(communityId);
        };
      }
      if (state.tab === 'members') {
        body.innerHTML = (c.members || []).map(function (m) {
          var isOwn = String(m).toLowerCase() === String(c.owner).toLowerCase();
          var roles = roleNameList(m);
          var actions = '';
          if (!isOwn && canManageRoles) {
            var roleOpts = Object.values(c.roles || {}).map(function (rr) {
              var has = DB.getMemberRoleIds(communityId, m).indexOf(rr.id) >= 0;
              return '<option value="' + esc(rr.id) + '">' + (has ? '✓ ' : '+ ') + esc(rr.name) + '</option>';
            }).join('');
            if (roleOpts) actions += '<select class="cs-give-role" data-user="' + esc(m) + '"><option value="">Give / toggle role…</option>' + roleOpts + '</select>';
          }
          if (!isOwn && canKick) actions += ' <button type="button" class="btn small danger cs-kick" data-user="' + esc(m) + '">Kick</button>';
          return '<div class="cs-row"><span><strong>@' + esc(m) + '</strong>' + (isOwn ? ' · Owner' : ' · ' + esc(roles)) + '</span><span>' + actions + '</span></div>';
        }).join('') || '<p class="meta">No members</p>';
        body.querySelectorAll('.cs-give-role').forEach(function (sel) {
          sel.onchange = function () {
            var rid = sel.value; if (!rid) return;
            var user = sel.getAttribute('data-user');
            var has = DB.getMemberRoleIds(communityId, user).indexOf(rid) >= 0;
            var res = has ? DB.removeRoleFromMember(communityId, user, rid, me) : DB.giveRole(communityId, user, rid, me);
            if (!res.ok) alert(res.error || 'Failed');
            paint();
          };
        });
        body.querySelectorAll('.cs-kick').forEach(function (btn) {
          btn.onclick = function () {
            if (!confirm('Kick @' + btn.getAttribute('data-user') + '?')) return;
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
      if (state.tab === 'channels' && canManageChannels) {
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
      if (state.tab === 'invite' && canInvite) {
        var link = location.origin + '/chat#invite=c_' + encodeURIComponent(communityId);
        body.innerHTML = '<p class="meta">Invite link</p><div class="cs-link">' + esc(link) + '</div><button type="button" class="btn primary" id="cs-copy-inv">Copy</button>';
        document.getElementById('cs-copy-inv').onclick = function () {
          if (navigator.clipboard) navigator.clipboard.writeText(link);
          alert('Copied');
        };
      }
      if (state.tab === 'roles' && canManageRoles) {
        if (state.editRoleId && c.roles[state.editRoleId]) {
          var role = c.roles[state.editRoleId];
          var perms = role.permissions || {};
          body.innerHTML =
            '<button type="button" class="btn small" id="cs-role-back">← Roles</button>' +
            '<h3 style="margin:10px 0 6px">Edit: ' + esc(role.name) + '</h3>' +
            '<label class="meta">Name</label><input id="cs-role-name" value="' + esc(role.name) + '" />' +
            '<p class="meta" style="margin-top:10px">Permissions</p>' +
            Object.keys(PERM_LABELS).map(function (k) {
              var v = perms[k];
              var sel = v === true ? 'allow' : (v === false ? 'deny' : 'inherit');
              return '<div class="cs-row"><span>' + esc(PERM_LABELS[k]) + '</span><select data-perm="' + k + '" class="cs-perm">' +
                '<option value="inherit"' + (sel === 'inherit' ? ' selected' : '') + '>Inherit</option>' +
                '<option value="allow"' + (sel === 'allow' ? ' selected' : '') + '>Allow</option>' +
                '<option value="deny"' + (sel === 'deny' ? ' selected' : '') + '>Deny</option></select></div>';
            }).join('') +
            '<button type="button" class="btn primary" id="cs-role-save" style="margin-top:12px">Save role</button> ' +
            '<button type="button" class="btn danger" id="cs-role-del">Delete role</button>';
          document.getElementById('cs-role-back').onclick = function () { state.editRoleId = null; paint(); };
          document.getElementById('cs-role-save').onclick = function () {
            var permissions = {};
            body.querySelectorAll('.cs-perm').forEach(function (s) {
              var k = s.getAttribute('data-perm');
              if (s.value === 'allow') permissions[k] = true;
              else if (s.value === 'deny') permissions[k] = false;
              else permissions[k] = null;
            });
            var res = DB.updateRole(communityId, state.editRoleId, {
              name: document.getElementById('cs-role-name').value.trim() || role.name,
              permissions: permissions
            }, me);
            if (!res.ok) alert(res.error || 'Failed');
            else { state.editRoleId = null; paint(); }
          };
          document.getElementById('cs-role-del').onclick = function () {
            if (!confirm('Delete this role?')) return;
            var res = DB.deleteRole(communityId, state.editRoleId, me);
            if (!res.ok) alert(res.error || 'Failed');
            state.editRoleId = null;
            paint();
          };
        } else {
          var roles = Object.values(c.roles || {});
          body.innerHTML =
            '<p class="meta">Members start with <strong>no roles</strong>. Create roles (e.g. Mute) and give them on Members.</p>' +
            '<p class="meta">Mute example: Send messages = <strong>Deny</strong>, View channels = Allow</p>' +
            roles.map(function (rr) {
              return '<div class="cs-row"><span><strong>' + esc(rr.name) + '</strong></span>' +
                '<button type="button" class="btn small cs-edit-role" data-rid="' + esc(rr.id) + '">Edit</button></div>';
            }).join('') +
            (roles.length ? '' : '<p class="meta">No custom roles yet</p>') +
            '<button type="button" class="btn primary" id="cs-add-role" style="margin-top:12px">+ Create role</button>';
          body.querySelectorAll('.cs-edit-role').forEach(function (b) {
            b.onclick = function () { state.editRoleId = b.getAttribute('data-rid'); paint(); };
          });
          document.getElementById('cs-add-role').onclick = function () {
            var n = prompt('Role name (e.g. Mute, Moderator):');
            if (!n) return;
            var perms = {};
            if (/mute/i.test(n)) { perms.send_messages = false; perms.view_channels = true; }
            var res = DB.createRole(communityId, n.trim(), perms, me);
            if (!res.ok) alert(res.error || 'Failed');
            else { state.editRoleId = res.role.id; paint(); }
          };
        }
      }
      if (state.tab === 'owner' && isOwner) {
        body.innerHTML =
          '<p class="meta">Owner owns this community. Ownership cannot be transferred.</p>' +
          '<p class="meta">Owner is not a role — roles are for other members only.</p>' +
          '<button type="button" class="btn danger" id="cs-delete">Delete community</button>';
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
        var p = DB.getEffectivePerms(communityId, me);
        body.innerHTML =
          '<p class="meta">' + (isOwner ? 'You are the <strong>Owner</strong> (full access).' : 'You are a <strong>Member</strong>.') + '</p>' +
          '<p class="meta">Roles: ' + esc(roleNameList(me)) + '</p>' +
          '<p class="meta">Permissions:</p><ul style="margin:0;padding-left:18px;font-size:0.8rem">' +
          Object.keys(PERM_LABELS).map(function (k) {
            return '<li>' + esc(PERM_LABELS[k]) + ': ' + (p[k] ? 'Yes' : 'No') + '</li>';
          }).join('') + '</ul>' +
          (isOwner
            ? '<p class="meta" style="margin-top:12px">Owner cannot leave — delete the community instead.</p>'
            : '<button type="button" class="btn danger" id="cs-leave" style="margin-top:12px">Leave community</button>');
        var leave = document.getElementById('cs-leave');
        if (leave) leave.onclick = function () {
          if (!confirm('Leave?')) return;
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
      b.onclick = function () { state.tab = b.getAttribute('data-tab'); state.editRoleId = null; paint(); };
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
      '.com-set-body input,.com-set-body textarea,.com-set-body select{width:100%;max-width:200px;margin:4px 0 8px;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.25);color:#fff}' +
      '.cs-row select{max-width:140px}' +
      '.com-set-body .btn{margin-top:6px}';
    document.head.appendChild(s);
  }
  window.CommunitySettings = { open: open, close: close };
})();
