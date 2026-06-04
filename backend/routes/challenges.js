// routes/challenges.js — Challenges CRUD + join/leave

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireCaptain } = require('../middleware/auth');

// GET /api/challenges — All active challenges
router.get('/', requireAuth, (req, res) => {
  const db  = getDb();
  const now = new Date().toISOString();

  const challenges = db.prepare(`
    SELECT
      c.*,
      COUNT(DISTINCT cm.user_id) AS participant_count,
      my.progress                AS my_progress,
      my.completed               AS my_completed,
      CASE WHEN my.id IS NOT NULL THEN 1 ELSE 0 END AS joined
    FROM challenges c
    LEFT JOIN challenge_members cm ON cm.challenge_id = c.id
    LEFT JOIN challenge_members my ON my.challenge_id = c.id AND my.user_id = ?
    WHERE c.is_active = 1 AND c.ends_at >= ?
    GROUP BY c.id
    ORDER BY c.ends_at ASC
  `).all(req.user.id, now);

  res.json({ challenges });
});

// GET /api/challenges/:id
router.get('/:id', requireAuth, (req, res) => {
  const db  = getDb();
  const now = new Date().toISOString();

  const challenge = db.prepare(`
    SELECT c.*,
      COUNT(DISTINCT cm.user_id) AS participant_count,
      my.progress AS my_progress,
      my.completed AS my_completed,
      CASE WHEN my.id IS NOT NULL THEN 1 ELSE 0 END AS joined
    FROM challenges c
    LEFT JOIN challenge_members cm ON cm.challenge_id = c.id
    LEFT JOIN challenge_members my ON my.challenge_id = c.id AND my.user_id = ?
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.user.id, req.params.id);

  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  // Top participants
  const top = db.prepare(`
    SELECT u.id, u.name, u.tier, u.pace_group, cm.progress, cm.completed
    FROM challenge_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.challenge_id = ?
    ORDER BY cm.progress DESC
    LIMIT 20
  `).all(req.params.id);

  res.json({ challenge, leaderboard: top });
});

// POST /api/challenges/:id/join
router.post('/:id/join', requireAuth, (req, res) => {
  const db        = getDb();
  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

  if (challenge.tier_req && req.user.tier !== challenge.tier_req)
    return res.status(403).json({ error: `This challenge requires ${challenge.tier_req} membership` });

  try {
    db.prepare('INSERT INTO challenge_members (challenge_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    res.json({ message: 'Joined challenge' });
  } catch {
    res.status(409).json({ error: 'Already joined this challenge' });
  }
});

// DELETE /api/challenges/:id/join
router.delete('/:id/join', requireAuth, (req, res) => {
  const db     = getDb();
  const result = db.prepare('DELETE FROM challenge_members WHERE challenge_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not joined to this challenge' });
  res.json({ message: 'Left challenge' });
});

// POST /api/challenges — Captain creates a challenge
router.post('/', requireAuth, requireCaptain, (req, res) => {
  const { title, description, icon, type, goal_value, reward, tier_req, starts_at, ends_at } = req.body;

  if (!title || !type || !goal_value || !starts_at || !ends_at)
    return res.status(400).json({ error: 'title, type, goal_value, starts_at, ends_at are required' });

  const db   = getDb();
  const info = db.prepare(`
    INSERT INTO challenges (title, description, icon, type, goal_value, reward, tier_req, starts_at, ends_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description, icon || '🏅', type, goal_value, reward, tier_req || null, starts_at, ends_at, req.user.id);

  const challenge = db.prepare('SELECT * FROM challenges WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ challenge });
});

module.exports = router;
