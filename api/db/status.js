const { hasDatabase } = require('../lib/db');
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  const configured = hasDatabase();
  res.statusCode = 200;
  res.end(JSON.stringify({
    ok: true,
    app: 'le-social-web',
    databaseConfigured: configured,
    mode: configured ? 'postgres' : 'not_configured',
    message: configured ? 'Server database is connected' : 'Add Vercel Postgres and connect to le-social-web, then POST /api/db/setup'
  }));
};
