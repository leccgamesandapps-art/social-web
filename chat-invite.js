(function () {
  if (typeof DB === 'undefined' || !DB.getSession || !DB.getSession()) return;
  var me = DB.getSession().username;
  function parseInvite() {
    var raw = (location.hash || '').slice(1);
    if (!raw || raw.indexOf('invite') !== 0) return null;
    var parts = raw.split('=');
    if (parts[0] !== 'invite') return null;
    var code = parts.slice(1).join('=');
    try { code = decodeURIComponent(code); } catch (e) {}
    return code;
  }
  function handle() {
    var code = parseInvite();
    if (!code) return;
    var type = null, id = code;
    if (code.indexOf('gc_') === 0) { type = 'gc'; id = code.slice(3); }
    else if (code.indexOf('c_') === 0) { type = 'community'; id = code.slice(2); }
    else if (code.indexOf('c!') === 0) { type = 'community'; id = code.replace(/^c!_?/, ''); }
    else if (code.indexOf('g!') === 0) { type = 'gc'; id = code.replace(/^g!_?/, ''); }
    if (type === 'community' && DB.joinCommunity) {
      var r = DB.joinCommunity(id, me);
      alert(r && r.ok ? 'Joined community' : (r && r.error) || 'Invalid invite');
      location.hash = '';
      if (window.ChatUI) window.ChatUI.select('community', id);
      return;
    }
    if (type === 'gc') {
      location.hash = '';
      if (window.ChatUI) window.ChatUI.select('gc', id);
      return;
    }
    alert('Invite invalid');
    location.hash = '';
  }
  window.addEventListener('hashchange', handle);
  setTimeout(handle, 200);
})();
