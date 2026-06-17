// routes/auth.js — Register, Login, Me

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../lib/mailer');

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

// User row + club name/status (clubs only display publicly once verified)
function getUserWithClub(db, id) {
  return db.prepare(`
    SELECT u.*, c.name AS club_name, c.status AS club_status
    FROM users u LEFT JOIN clubs c ON c.id = u.club_id
    WHERE u.id = ?
  `).get(id);
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { name, email, password, tier = 'Standard', pace_group = 'C', country, state, city } = req.body;

  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, and password are required' });

  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db   = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO users (name, email, password, tier, pace_group, country, state, city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, email, hash, tier, pace_group, country || null, state || null, city || null);

  const user  = getUserWithClub(db, info.lastInsertRowid);
  const token = signToken(user);

  // Fire welcome email (non-blocking — never fails the signup)
  sendWelcomeEmail(user).catch((e) => console.error('[auth] welcome email failed:', e));

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
  res.json({ token, user: safeUser(getUserWithClub(db, user.id)) });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db   = getDb();
  const user = getUserWithClub(db, req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: safeUser(user) });
});

// PATCH /api/auth/me — Update profile
router.patch('/me', requireAuth, (req, res) => {
  const { name, bio, location, pace_group, country, state, city, avatar_url } = req.body;
  if (avatar_url != null && (typeof avatar_url !== 'string' || avatar_url.length > 700000)) {
    return res.status(413).json({ error: 'Photo is too large. Please choose a smaller image.' });
  }
  const db = getDb();

  db.prepare(`
    UPDATE users SET name = COALESCE(?, name), bio = COALESCE(?, bio),
    location = COALESCE(?, location), pace_group = COALESCE(?, pace_group),
    country = COALESCE(?, country), state = COALESCE(?, state), city = COALESCE(?, city),
    avatar_url = COALESCE(?, avatar_url),
    updated_at = datetime('now') WHERE id = ?
  `).run(name ?? null, bio ?? null, location ?? null, pace_group ?? null, country ?? null, state ?? null, city ?? null, avatar_url ?? null, req.user.id);

  const user = getUserWithClub(db, req.user.id);
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

// POST /api/auth/forgot-password — request a reset link
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  // Always return success — don't reveal whether an email is registered.
  if (user) {
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate any prior unused tokens for this user, then store the new one.
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0').run(user.id);
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)')
      .run(user.id, token, expires);

    sendPasswordResetEmail(user, token).catch((e) => console.error('[auth] reset email failed:', e));
  }

  res.json({ message: 'If that email is registered, a reset link is on its way.' });
});

// POST /api/auth/reset-password — consume a reset token, set new password
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password)
    return res.status(400).json({ error: 'token and new_password are required' });

  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' });

  const db  = getDb();
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);

  if (!row || row.used || new Date(row.expires_at) < new Date())
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });

  db.prepare('UPDATE users SET password = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);

  res.json({ message: 'Password reset successfully. You can now log in.' });
});

module.exports = router;
