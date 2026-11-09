window.SW_PUBLIC = {
  appName: 'Social Web',
  publicKey: 'sw_pub_le_social_web_v1',
  version: '1.0.0',
  moderationEnabled: true,
  secureSubpacks: true,
  secureVersion: 'v1',
  keysFromVercel: false
};
(function () {
  function applyMeta(pk) {
    try {
      var m = document.querySelector('meta[name="sw-public-key"]') || document.createElement('meta');
      m.name = 'sw-public-key';
      m.content = pk;
      if (!m.parentNode && document.head) document.head.appendChild(m);
    } catch (e) {}
  }
  applyMeta(window.SW_PUBLIC.publicKey);
  fetch('/api/keys', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.publicKey) {
        window.SW_PUBLIC.publicKey = data.publicKey;
        window.SW_PUBLIC.keysFromVercel = true;
        window.SW_PUBLIC.secretConfigured = !!data.secretConfigured;
        applyMeta(data.publicKey);
        try {
          window.dispatchEvent(new CustomEvent('sw-keys-ready', { detail: window.SW_PUBLIC }));
        } catch (e) {}
      }
    })
    .catch(function () {});
})();
