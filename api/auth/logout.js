const { clearSessionCookie, json } = require('../lib/crypto');
module.exports = async function handler(req, res) {
  clearSessionCookie(res);
  return json(res, 200, { ok: true });
};
