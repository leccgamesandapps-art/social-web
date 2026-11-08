// #invite=gc_id | #invite=c_id | #invite=c!_id | #invite=g!_id
(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;

  function parseInvite() {
    var raw = (location.hash || '').slice(1);
    if (!raw) return null;
    var parts = raw.split('=');
    if (parts[0] !== 'invite') return null;
    var code = parts.slice(1).join('=');
    try { code = decodeURIComponent(code); } catch (e) {}
    return code;
  }

  function handle() {
    var code = parseInvite();
    if (!code) {
      if (window.SpacesUI) window.SpacesUI.render();
      return;
    }
    var type = null;
    var id = code;
    if (code.indexOf('g!') === 0 || code.indexOf('gc!') === 0) {
      type = 'gc';
      id = code.replace(/^gc!_?/, '').replace(/^g!_?/, '');
    } else if (code.indexOf('c!') === 0) {
      type = 'community';
      id = code.replace(/^c!_?/, '');
    } else if (code.indexOf('gc_') === 0) {
      type = 'gc';
      id = code.slice(3);
    } else if (code.indexOf('c_') === 0) {
      type = 'community';
      id = code.slice(2);
    } else if (typeof DB.joinViaShare === 'function') {
      var r0 = DB.joinViaShare(code, me);
      if (r0 && r0.ok) {
        alert((r0.title || r0.type) + ' joined');
        location.hash = '';
        if (window.SpacesUI) window.SpacesUI.render();
        return;
      }
    }

    if (type === 'community' && typeof DB.joinCommunity === 'function') {
      var r = DB.joinCommunity(id, me);
      alert(r && r.ok ? 'Joined space' : (r && r.error) || 'Invalid community invite');
      location.hash = '';
      if (window.SpacesUI) {
        window.SpacesUI.state.mode = 'space';
        window.SpacesUI.state.spaceId = id;
        window.SpacesUI.render();
      }
      return;
    }
    if (type === 'gc' && DB.getChat) {
      var chat = DB.getChat(id);
      if (chat) {
        location.hash = '';
        if (window.SpacesUI) {
          window.SpacesUI.state.mode = 'dm';
          window.SpacesUI.state.dmId = id;
          window.SpacesUI.render();
        }
      } else {
        alert('Group invite invalid or not found on this device');
        location.hash = '';
      }
      return;
    }
    alert('Invite link invalid');
    location.hash = '';
  }

  window.addEventListener('hashchange', handle);
  setTimeout(handle, 120);
})();
