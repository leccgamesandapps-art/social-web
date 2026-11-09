module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
  }
  var secret = process.env.SW_SECRET_KEY || '';
  var pub = process.env.SW_PUBLIC_KEY || '';
  if (!secret || secret.length < 16) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ ok: false, error: 'SW_SECRET_KEY not configured on Vercel' }));
  }
  var stamp = Buffer.from(pub + '|' + secret.slice(0, 12) + '|ok').toString('base64');
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    app: 'le-social-web',
    publicKey: pub,
    secretConfigured: true,
    serverStamp: stamp
  }));
};
