// Invite UI override: permanent c!_ links + designed modal (replaces prompt)
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  if (DB.createCommunityInvite) {
    var _cci = DB.createCommunityInvite.bind(DB);
    DB.createCommunityInvite = function (communityId, byUser, customId) {
      if (customId) return _cci(communityId, byUser, customId);
      var code = DB.makeShareCode ? DB.makeShareCode('community', communityId) : ('c!_' + communityId);
      var data = DB._load();
      var c = data.communities[communityId];
      if (c) {
        c.inviteCode = code;
        c.inviteMode = 'default';
        Object.keys(data.shares || {}).forEach(function (k) {
          var s = data.shares[k];
          if (s && s.type === 'community' && s.targetId === communityId && String(k).indexOf('s_') === 0) {
            delete data.shares[k];
          }
        });
        DB._save(data);
      }
      return { ok: true, shareId: code, permanent: true };
    };
  }

  function openInviteModal(id) {
    var c = DB.getCommunity(id);
    if (!c) return;
    var root = document.getElementById('sw-modal-root');
    if (!root) return;
    var defaultCode = DB.makeShareCode ? DB.makeShareCode('community', id) : ('c!_' + id);
    var defaultLink = location.origin + '/dashboard#share=' + encodeURIComponent(defaultCode);
    var customCode = c.customInvite || '';
    var mode = c.inviteMode === 'custom' && customCode ? 'custom' : 'default';

    function close() {
      root.classList.remove('open');
      root.innerHTML = '';
    }

    function paint(m) {
      root.innerHTML =
        '<div class="sw-modal-backdrop"></div>' +
        '<div class="sw-modal-panel invite-panel">' +
        '<div class="sw-modal-handle"></div>' +
        '<h3>Invite · ' + esc(c.name) + '</h3>' +
        '<div class="invite-mode-tabs">' +
        '<button type="button" class="tab' + (m === 'default' ? ' active' : '') + '" data-imode="default">Default (permanent)</button>' +
        '<button type="button" class="tab' + (m === 'custom' ? ' active' : '') + '" data-imode="custom">Custom</button>' +
        '</div><div id="inv-body"></div>' +
        '<div class="invite-actions">' +
        '<button type="button" class="btn" id="inv-friend">Invite friend</button>' +
        '<button type="button" class="btn" id="inv-close">Close</button>' +
        '</div></div>';
      root.classList.add('open');
      root.querySelector('.sw-modal-backdrop').onclick = close;
      document.getElementById('inv-close').onclick = close;
      root.querySelectorAll('[data-imode]').forEach(function (t) {
        t.onclick = function () { paint(t.getAttribute('data-imode')); };
      });
      var body = document.getElementById('inv-body');
      if (m === 'default') {
        DB.createCommunityInvite(id, me, null);
        body.innerHTML =
          '<p class="meta">Permanent link based on community ID. Not random.</p>' +
          '<div class="invite-link-box"><code>' + esc(defaultLink) + '</code></div>' +
          '<p class="meta">Shows as: Community: ' + esc(c.name) + '</p>' +
          '<button type="button" class="btn primary" id="inv-copy" style="width:100%;margin-top:10px">Copy default link</button>' +
          '<button type="button" class="btn" id="inv-reset" style="width:100%;margin-top:8px">Reset default link</button>';
        document.getElementById('inv-copy').onclick = function () {
          try { navigator.clipboard.writeText(defaultLink); alert('Copied'); }
          catch (e) { prompt('Copy:', defaultLink); }
        };
        document.getElementById('inv-reset').onclick = function () {
          DB.createCommunityInvite(id, me, null);
          alert('Default permanent link ready');
          paint('default');
        };
      } else {
        body.innerHTML =
          '<p class="meta">Custom vanity code (letters, numbers, - _)</p>' +
          '<input id="inv-custom" type="text" value="' + esc(customCode) + '" placeholder="e.g. my-group" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--text);margin:8px 0"/>' +
          '<button type="button" class="btn primary" id="inv-save-c" style="width:100%">Save custom link</button>' +
          '<div class="invite-link-box" style="margin-top:10px"><code id="inv-clink">' +
          esc(customCode ? location.origin + '/dashboard#share=' + encodeURIComponent(customCode) : '—') +
          '</code></div>' +
          '<button type="button" class="btn" id="inv-copy-c" style="width:100%;margin-top:8px">Copy custom link</button>';
        document.getElementById('inv-save-c').onclick = function () {
          var val = document.getElementById('inv-custom').value.trim();
          if (!val) { alert('Enter custom ID'); return; }
          var r = DB.createCommunityInvite(id, me, val);
          if (!r || !r.ok) { alert((r && r.error) || 'Failed'); return; }
          var data = DB._load();
          if (data.communities[id]) {
            data.communities[id].inviteMode = 'custom';
            data.communities[id].customInvite = r.shareId;
            DB._save(data);
          }
          alert('Custom link saved');
          c = DB.getCommunity(id);
          customCode = c.customInvite || val;
          paint('custom');
        };
        document.getElementById('inv-copy-c').onclick = function () {
          var t = document.getElementById('inv-clink').textContent;
          if (!t || t === '—') { alert('Save first'); return; }
          try { navigator.clipboard.writeText(t); alert('Copied'); }
          catch (e) { prompt('Copy:', t); }
        };
      }
      document.getElementById('inv-friend').onclick = function () {
        var friends = (DB.getFriends(me) || []).filter(function (f) {
          return (c.members || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(String(f).toLowerCase()) === -1;
        });
        if (!friends.length) { alert('No friends to invite'); return; }
        var pick = prompt('Friend username:\n' + friends.join(', '));
        if (!pick) return;
        var r = DB.inviteToCommunity(id, me, pick.trim());
        alert(r && r.ok ? 'Invited!' : (r && r.error) || 'Failed');
      };
    }
    paint(mode);
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'com-invite-btn' || (t.closest && t.closest('#com-invite-btn'))) {
      e.preventDefault();
      e.stopPropagation();
      var parts = (location.hash || '').slice(1).split('=');
      var id = parts[0] === 'community' ? decodeURIComponent(parts[1] || '') : '';
      if (!id) return;
      openInviteModal(id);
    }
  }, true);
})();
