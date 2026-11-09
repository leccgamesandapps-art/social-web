module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
  }
  var publicKey = process.env.SW_PUBLIC_KEY || 'sw_pub_le_social_web_v1';
  var hasSecret = !!(process.env.SW_SECRET_KEY && process.env.SW_SECRET_KEY.length > 8);
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    app: 'le-social-web',
    publicKey: publicKey,
    secretConfigured: hasSecret
  }));
};
