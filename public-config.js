window.SW_PUBLIC = {
  appName: 'Social Web',
  publicKey: 'sw_pub_le_social_web_v1',
  version: '1.0.0',
  moderationEnabled: true
};
try {
  var m = document.createElement('meta');
  m.name = 'sw-public-key';
  m.content = window.SW_PUBLIC.publicKey;
  if (document.head) document.head.appendChild(m);
} catch (e) {}
