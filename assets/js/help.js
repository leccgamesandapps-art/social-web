(function () {
  const main = document.getElementById('help-main');
  let me = null;

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function bubble(html, cls) {
    const d = document.createElement('div');
    d.className = 'help-bubble' + (cls ? ' ' + cls : '');
    d.innerHTML = '<div class="who">Social Web Guide</div>' + html;
    main.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return d;
  }

  function choices(items) {
    const wrap = document.createElement('div');
    wrap.className = 'help-choices';
    items.forEach(function (it) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.onclick = function () {
        wrap.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
        bubble('<p><strong>You:</strong> ' + esc(it.label) + '</p>');
        it.fn();
      };
      wrap.appendChild(b);
    });
    main.appendChild(wrap);
    wrap.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  function home() {
    bubble(
      '<p>Hi' + (me ? ', <strong>@' + esc(me.username) + '</strong>' : '') + '.</p>' +
      '<p>This is the Help Center — pick a topic. There is no live chat bot; answers are guided steps.</p>'
    );
    const opts = [
      { label: 'Login or register problems', fn: topicLogin },
      { label: 'I forgot my password', fn: topicForgot },
      { label: 'Ban / suspend / restrictions', fn: topicRestrict },
      { label: 'Admin & Owner panels', fn: topicPanels }
    ];
    if (me) {
      opts.push({ label: 'Delete my account (72-hour wait)', fn: topicDelete });
      if (me.deletePending) {
        opts.unshift({ label: 'Cancel account deletion', fn: topicCancelDelete });
      }
    } else {
      opts.push({ label: 'I am logged out — account recovery info', fn: topicRecovery });
    }
    opts.push({ label: 'About Chat / GC / Community', fn: topicChat });
    choices(opts);
  }

  function topicLogin() {
    bubble(
      '<p><strong>Login & register</strong></p>' +
      '<p>Regular users use <code>/</code> only (username + password).</p>' +
      '<ul style="margin:8px 0 0 18px;padding:0;font-size:.9rem;line-height:1.5">' +
      '<li>Username: 3–20 characters, letters numbers _</li>' +
      '<li>Password: min 6 characters</li>' +
      '<li>Admin / Owner accounts cannot login on the main site</li>' +
      '</ul>'
    );
    choices([
      { label: 'Back to topics', fn: home },
      { label: 'Go to login', fn: function () { location.href = '/'; } }
    ]);
  }

  function topicForgot() {
    bubble(
      '<p><strong>Forgot password</strong></p>' +
      '<p>Password reset email is not enabled yet. If you still have access on another device, change password in Settings when available.</p>' +
      '<p>Otherwise contact the site owner offline. We cannot show passwords from the database.</p>'
    );
    choices([{ label: 'Back to topics', fn: home }]);
  }

  function topicRestrict() {
    bubble(
      '<p><strong>Banned or suspended</strong></p>' +
      '<p>If login shows a ban/suspend message, moderation applied a restriction.</p>' +
      '<p>Timed bans expire automatically. Permanent bans need an admin/owner review.</p>'
    );
    choices([{ label: 'Back to topics', fn: home }]);
  }

  function topicPanels() {
    bubble(
      '<p><strong>Separate panels</strong></p>' +
      '<p><strong>User (U)</strong> — / dashboard chat — username + password</p>' +
      '<p><strong>Admin (A)</strong> — /admin — password only — moderate users</p>' +
      '<p><strong>Owner (O)</strong> — /owner — password only — manage admins + users</p>' +
      '<p>These are separate systems. Staff accounts do not work on the main app login.</p>'
    );
    choices([{ label: 'Back to topics', fn: home }]);
  }

  function topicChat() {
    bubble(
      '<p><strong>Chat = Messenger × Discord</strong></p>' +
      '<p><strong>Chat</strong> — 1:1 DMs with friends</p>' +
      '<p><strong>GC</strong> — group chats with multiple people</p>' +
      '<p><strong>Community</strong> — Discord-style servers with roles, categories, channels</p>'
    );
    choices([
      { label: 'Back to topics', fn: home },
      { label: 'Open Chat', fn: function () { location.href = '/chat'; } }
    ]);
  }

  function topicRecovery() {
    bubble(
      '<p><strong>Account recovery</strong></p>' +
      '<p>If you scheduled deletion, log in within 72 hours and open Help → Cancel account deletion.</p>' +
      '<p>After 72 hours the account is permanently removed and cannot login.</p>'
    );
    choices([
      { label: 'Back to topics', fn: home },
      { label: 'Go to login', fn: function () { location.href = '/'; } }
    ]);
  }

  function topicDelete() {
    bubble(
      '<p><strong>Delete account</strong></p>' +
      '<p>Deleting schedules removal in <strong>72 hours</strong>.</p>' +
      '<p>During those 3 days you can still use the app and can <strong>cancel</strong> anytime.</p>' +
      '<p>After 72 hours the account is erased and login is denied.</p>',
      'help-warn'
    );
    choices([
      { label: 'I understand — schedule deletion', fn: confirmDelete },
      { label: 'Never mind', fn: home }
    ]);
  }

  function confirmDelete() {
    bubble(
      '<p>Type <strong>DELETE</strong> below to confirm scheduling.</p>' +
      '<div class="help-input-row">' +
      '<input id="del-confirm" type="text" placeholder="DELETE" autocomplete="off" />' +
      '<button type="button" class="btn danger" id="del-go">Confirm</button>' +
      '</div>',
      'help-danger'
    );
    document.getElementById('del-go').onclick = async function () {
      const v = (document.getElementById('del-confirm').value || '').trim();
      if (v !== 'DELETE') {
        bubble('<p>Please type DELETE exactly.</p>', 'help-warn');
        return;
      }
      try {
        const r = await SW.api('/api/account?action=schedule-delete', {
          method: 'POST',
          body: { confirm: 'delete' }
        });
        if (!r.ok) {
          bubble('<p>' + esc(r.error || 'Failed') + '</p>', 'help-danger');
          return;
        }
        const when = r.deleteScheduledAt ? new Date(r.deleteScheduledAt).toLocaleString() : '72 hours';
        bubble(
          '<p>Deletion scheduled.</p><p>Your account will be removed after <strong>' + esc(when) + '</strong>.</p>' +
          '<p>Open Help anytime before then to cancel.</p>',
          'help-ok'
        );
        if (me) {
          me.deletePending = true;
          me.deleteScheduledAt = r.deleteScheduledAt;
        }
        choices([{ label: 'Back to topics', fn: home }]);
      } catch (e) {
        bubble('<p>' + esc(e.message || 'Network error') + '</p>', 'help-danger');
      }
    };
  }

  async function topicCancelDelete() {
    try {
      const r = await SW.api('/api/account?action=cancel-delete', { method: 'POST', body: {} });
      if (!r.ok) {
        bubble('<p>' + esc(r.error || 'Failed') + '</p>', 'help-danger');
      } else {
        bubble('<p>Deletion cancelled. Your account stays active.</p>', 'help-ok');
        if (me) {
          me.deletePending = false;
          me.deleteScheduledAt = null;
        }
      }
    } catch (e) {
      bubble('<p>' + esc(e.message || 'Network error') + '</p>', 'help-danger');
    }
    choices([{ label: 'Back to topics', fn: home }]);
  }

  async function boot() {
    try {
      const r = await SW.api('/api/auth?action=me');
      if (r.ok && r.user) me = r.user;
    } catch (_) {}
    // Back link: logged-in users prefer dashboard
    const back = document.querySelector('.help-back');
    if (back && me) back.setAttribute('href', '/dashboard#home');
    home();
  }

  boot();
})();
