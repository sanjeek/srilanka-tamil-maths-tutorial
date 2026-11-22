const questions = require('../lib/questions');

module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ questions });
};
