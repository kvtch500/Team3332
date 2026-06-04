// routes/users.js — Member profiles, badges, search

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/users — List members (with pagination + filters)
router.get('/', requireAuth, (req, res) => {
  const db         = getDb();
  const limit      = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset     = parseInt(req.query.offset) || 0;
  const paceGroup  = req.query.pace_group;
  const tier       = req.query.tier;
  const search     = req.query.search ? `%${req.query.search}%` : null;

  let where = 'WHERE u.is_active = 1';
  const params = [];
  if (paceGroup) { where += ' AND u.pace_group = ?'; params.push(paceGroup); }
  if (tier)      { where += ' AND u.tier = ?';       params.push(tier); }
  if (search)    { where += ' AND u.name LIKE ?';    params.push(search); }

  const users = db.prepare(`
    SELECT u.id, u.name, u.tier, u.pace_group, u.is_captain, u.bio, u.location, u.joined_at,
           ROUND(SUM(a.distance), 1) AS total_miles,
           COUNT(a.id)               AS total_runs
    FROM users u
    LEFT JOIN activities a ON a.user_id = u.id
    ${where}
    GROUP BY u.id
    ORDER BY total_miles DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM users u ${where}`).get(...params);

  res.json({ users, total, limit, offset });
});

// GET /api/users/:id — Public profile
router.get('/:id', requireAuth, (req, res) => {
  const db   = getDb();
  const user = db.prepare(`
    SELECT u.id, u.name, u.tier, u.pace_group, u.is_captain, u.bio, u.location, u.joined_at,
           ROUND(SUM(a.distance), 1) AS total_miles,
           COUNT(a.id)               AS total_runs
    FROM users u
    LEFT JOIN activities a ON a.user_id = u.id
    WHERE u.id = ? AND u.is_active = 1
    GROUP BY u.id
  `).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  // Badges
  const badges = db.prepare(`
    SELECT b.name, b.icon, b.description, b.type, ub.earned_at
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    WHERE ub.user_id = ?
    ORDER BY ub.earned_at DESC
  `).all(req.params.id);

  // Recent activities (last 5)
  const recent = db.prepare(`
    SELECT id, name, distance, pace, duration, logged_at
    FROM activities
    WHERE user_id = ?
    ORDER BY logged_at DESC
    LIMIT 5
  `).all(req.params.id);

  res.json({ user, badges, recent_activities: recent });
});

// GET /api/users/:id/badges
router.get('/:id/badges', requireAuth, (req, res) => {
  const db = getDb();

  // All badges with earned status for this user
  const badges = db.prepare(`
    SELECT b.*, CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END AS earned,
           ub.earned_at
    FROM badges b
    LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = ?
    ORDER BY earned DESC, b.name ASC
  `).all(req.params.id);

  res.json({ badges });
});

module.exports = router;
