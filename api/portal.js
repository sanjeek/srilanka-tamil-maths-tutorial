const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

const questions = require('../lib/questions');

const cookieName = '__Host-cmc-session';
const lifetime = 8 * 60 * 60;
const accounts = {
  student: { name: 'மாதிரி மாணவர்', env: 'PORTAL_STUDENT_PASSWORD' },
  teacher: { name: 'K. Kavithan', env: 'PORTAL_TEACHER_PASSWORD' }
};
const hash = value => createHash('sha256').update(value).digest();
const signature = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');
const cookie = (value, age) => `${cookieName}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const reply = (res, status, body) => res.status(status).json(body);

function getRole(req, secret) {
  const token = (req.headers.cookie || '').split('; ').find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  if (!token || token.length > 256) return null;
  const [role, expiry, proof, ...extra] = token.split('.');
  if (!Object.hasOwn(accounts, role) || !proof || extra.length || !/^\d+$/.test(expiry) || Number(expiry) <= Date.now()) return null;
  return timingSafeEqual(hash(proof), hash(signature(role + '.' + expiry, secret))) ? role : null;
}

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  const secret = process.env.PORTAL_SESSION_KEY;
  if (!secret) return reply(res, 503, { error: 'unavailable' });
  const role = getRole(req, secret);
  if (req.method === 'GET') {
    if (!role) return reply(res, 401, { error: 'login_required' });
    const account = { role, name: accounts[role].name };
    if (role === 'student') account.questions = questions;
    if (role === 'teacher') {
      account.classReport = [
        { name: 'மாணவர் 01', score: 18 },
        { name: 'மாணவர் 02', score: 15 },
        { name: 'மாணவர் 03', score: null }
      ];
    }
    return reply(res, 200, account);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return reply(res, 405, { error: 'method' });
  }
  const host = req.headers.host;
  if (!host || req.headers.origin !== 'https://' + host) return reply(res, 403, { error: 'origin' });
  if (!req.headers['content-type']?.startsWith('application/json')) return reply(res, 415, { error: 'content_type' });
  const { action, username, password, portal } = req.body || {};
  if (action === 'logout') {
    res.setHeader('Set-Cookie', cookie('', 0));
    return reply(res, 200, { ok: true });
  }
  if (action !== 'login' || typeof username !== 'string' || typeof password !== 'string' || password.length > 128) {
    return reply(res, 400, { error: 'invalid' });
  }
  const account = Object.hasOwn(accounts, username) && accounts[username];
  const expected = account && process.env[account.env];
  if (!expected || username !== portal || !timingSafeEqual(hash(password), hash(expected))) {
    return reply(res, 401, { error: 'credentials' });
  }
  const value = username + '.' + (Date.now() + lifetime * 1000);
  res.setHeader('Set-Cookie', cookie(value + '.' + signature(value, secret), lifetime));
  return reply(res, 200, { ok: true });
};
