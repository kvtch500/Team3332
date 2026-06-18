// routes/leaderboard.js — Team rankings

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/leaderboard
// Query params: period (weekly|monthly|alltime), pace_group (A|B|C|D|all), limit
router.get('/', requireAuth, (req, res) => {
  const db         = getDb();
  const period     = req.query.period || 'monthly';
  const paceGroup  = req.query.pace_group || 'all';
  const limit      = Math.min(parseInt(req.query.limit) || 50, 100);

  let dateFilter = '';
  if (period === 'weekly')  dateFilter = `AND a.logged_at >= datetime('now', '-7 days')`;
  if (period === 'monthly') dateFilter = `AND a.logged_at >= datetime('now', 'start of month')`;

  // Parameterized to avoid SQL injection — the value is bound, not interpolated.
  const params = [];
  let paceFilter = '';
  if (paceGroup !== 'all') {
    paceFilter = 'AND u.pace_group = ?';
    params.push(paceGroup);
  }

  const rows = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.tier,
      u.pace_group,
      u.is_captain,
      u.avatar_url,
      CASE WHEN c.status = 'verified' THEN c.id   END AS club_id,
      CASE WHEN c.status = 'verified' THEN c.name END AS club_name,
      ROUND(SUM(a.distance), 1) AS total_miles,
      COUNT(a.id)               AS run_count,
      AVG(a.distance)           AS avg_distance
    FROM users u
    JOIN activities a ON a.user_id = u.id
    LEFT JOIN clubs c ON c.id = u.club_id
    WHERE u.is_active = 1
      ${dateFilter}
      ${paceFilter}
    GROUP BY u.id
    ORDER BY total_miles DESC
    LIMIT ?
  `).all(...params, limit);

  // Tag which entry is the current user
  const ranked = rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    is_you: r.id === req.user.id,
  }));

  // Find current user's rank if not in top results
  const myRank = ranked.find(r => r.is_you);
  let myEntry = null;
  if (!myRank) {
    myEntry = db.prepare(`
      SELECT
        u.id, u.name, u.tier, u.pace_group, u.is_captain, u.avatar_url,
        ROUND(SUM(a.distance), 1) AS total_miles,
        COUNT(a.id) AS run_count
      FROM users u
      LEFT JOIN activities a ON a.user_id = u.id
      WHERE u.id = ?
      GROUP BY u.id
    `).get(req.user.id);
  }

  res.json({ leaderboard: ranked, my_entry: myEntry, period, pace_group: paceGroup });
});

module.exports = router;
