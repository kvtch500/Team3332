// middleware/auth.js — JWT authentication middleware

const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireCaptain(req, res, next) {
  if (!req.user?.is_captain) {
    return res.status(403).json({ error: 'Captain access required' });
  }
  next();
}

function requireElite(req, res, next) {
  if (req.user?.tier !== 'Elite') {
    return res.status(403).json({ error: 'Elite membership required' });
  }
  next();
}

module.exports = { requireAuth, requireCaptain, requireElite };
