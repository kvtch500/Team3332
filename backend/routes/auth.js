// routes/auth.js — Register, Login, Me

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, tier: user.tier, is_captain: user.is_captain },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function safeUser(user) {
  const { password, ...safe } = user;
  return safe;
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, tier = 'Standard', pace_group = 'C' } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db   = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (name, email, password, tier, pace_group)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email, hash, tier, pace_group);

  const user  = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);

  res.status(201).json({ token, user: safeUser(user) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });

  if (!user.is_active)
    return res.status(403).json({ error: 'Account is deactivated' });

  const token = signToken(user);
  res.json({ token, user: safeUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// PATCH /api/auth/me — Update profile
router.patch('/me', requireAuth, (req, res) => {
  const { name, bio, location, pace_group } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio),
    location = COALESCE(?, location), pace_group = COALESCE(?, pace_group),
    updated_at = datetime('now') WHERE id = ?
  `).run(name, bio, location, pace_group, req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: safeUser(user) });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'current_password and new_password are required' });

  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password))
    return res.status(401).json({ error: 'Current password is incorrect' });

  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), req.user.id);

  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
