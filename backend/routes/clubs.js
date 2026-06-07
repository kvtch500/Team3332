// routes/clubs.js — Running clubs (member-submitted, admin-verified)

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/clubs — Verified clubs (for autocomplete / browsing). ?search=
router.get('/', requireAuth, (req, res) => {
  const db     = getDb();
  const search = req.query.search ? `%${req.query.search}%` : null;

  let where = `WHERE c.status = 'verified'`;
  const params = [];
  if (search) { where += ' AND c.name LIKE ?'; params.push(search); }

  const clubs = db.prepare(`
    SELECT c.id, c.name, COUNT(u.id) AS member_count
    FROM clubs c
    LEFT JOIN users u ON u.club_id = c.id AND u.is_active = 1
    ${where}
    GROUP BY c.id
    ORDER BY member_count DESC, c.name ASC
    LIMIT 25
  `).all(...params);

  res.json({ clubs });
});

// GET /api/clubs/:id — Club details + member roster (verified clubs only)
router.get('/:id', requireAuth, (req, res) => {
  const db   = getDb();
  const club = db.prepare(`SELECT id, name, status, created_at FROM clubs WHERE id = ?`).get(req.params.id);

  if (!club || club.status !== 'verified')
    return res.status(404).json({ error: 'Club not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.tier, u.pace_group, u.is_captain, u.country, u.state, u.city,
           ROUND(SUM(a.distance), 1) AS total_miles,
           COUNT(a.id)               AS total_runs
    FROM users u
    LEFT JOIN activities a ON a.user_id = u.id
    WHERE u.club_id = ? AND u.is_active = 1
    GROUP BY u.id
    ORDER BY total_miles DESC
  `).all(club.id);

  res.json({ club, members, member_count: members.length });
});

// POST /api/clubs/join — Join an existing club or submit a new one (pending until admin verifies)
router.post('/join', requireAuth, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Club name is required' });
  if (name.length > 60) return res.status(400).json({ error: 'Club name must be 60 characters or fewer' });

  const db = getDb();
  // Case-insensitive match against existing clubs (verified or pending)
  let club = db.prepare(`SELECT * FROM clubs WHERE name = ? COLLATE NOCASE`).get(name);
  let created = false;

  if (!club) {
    const info = db.prepare(`INSERT INTO clubs (name) VALUES (?)`).run(name);
    club = db.prepare(`SELECT * FROM clubs WHERE id = ?`).get(info.lastInsertRowid);
    created = true;
  }

  db.prepare(`UPDATE users SET club_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(club.id, req.user.id);

  res.json({
    club,
    created,
    message: club.status === 'verified'
      ? `You're now a member of ${club.name}.`
      : `${club.name} submitted — it will appear on your profile once an admin verifies it.`,
  });
});

// POST /api/clubs/leave — Leave current club
router.post('/leave', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare(`UPDATE users SET club_id = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(req.user.id);
  res.json({ message: 'You left your club.' });
});

module.exports = router;
