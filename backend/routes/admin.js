// routes/admin.js — Admin panel API (protected by admin secret key)

const router = require('express').Router();
const { getDb } = require('../db');

// Simple admin auth middleware — checks X-Admin-Key header
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/stats — Platform overview
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDb();

  const members     = db.prepare(`SELECT COUNT(*) as total FROM users WHERE is_active = 1`).get();
  const elite       = db.prepare(`SELECT COUNT(*) as total FROM users WHERE tier = 'Elite' AND is_active = 1`).get();
  const standard    = db.prepare(`SELECT COUNT(*) as total FROM users WHERE tier = 'Standard' AND is_active = 1`).get();
  const captains    = db.prepare(`SELECT COUNT(*) as total FROM users WHERE is_captain = 1 AND is_active = 1`).get();
  const totalMiles  = db.prepare(`SELECT ROUND(SUM(distance),1) as total FROM activities`).get();
  const totalRuns   = db.prepare(`SELECT COUNT(*) as total FROM activities`).get();
  const challenges  = db.prepare(`SELECT COUNT(*) as total FROM challenges`).get();
  const newThisWeek = db.prepare(`SELECT COUNT(*) as total FROM users WHERE joined_at >= date('now','-7 days')`).get();
  const pendingClubs = db.prepare(`SELECT COUNT(*) as total FROM clubs WHERE status = 'pending'`).get();
  const pendingRuns  = db.prepare(`SELECT COUNT(*) as total FROM group_runs WHERE approval_status = 'pending'`).get();

  res.json({
    total_members:   members.total,
    elite_members:   elite.total,
    standard_members: standard.total,
    captains:        captains.total,
    total_miles:     totalMiles.total || 0,
    total_runs:      totalRuns.total,
    active_challenges: challenges.total,
    new_this_week:   newThisWeek.total,
    pending_clubs:   pendingClubs.total,
    pending_runs:    pendingRuns.total,
  });
});

// GET /api/admin/group-runs — All group runs, pending first
router.get('/group-runs', requireAdmin, (req, res) => {
  const db = getDb();
  const runs = db.prepare(`
    SELECT gr.id, gr.title, gr.description, gr.run_type, gr.location, gr.scheduled_at,
           gr.status, gr.approval_status, gr.created_at,
           u.name AS captain_name, u.email AS captain_email,
           COUNT(grm.user_id) AS member_count
    FROM group_runs gr
    JOIN users u ON u.id = gr.captain_id
    LEFT JOIN group_run_members grm ON grm.run_id = gr.id
    GROUP BY gr.id
    ORDER BY CASE gr.approval_status WHEN 'pending' THEN 0 ELSE 1 END, gr.scheduled_at DESC
  `).all();
  res.json({ runs });
});

// PATCH /api/admin/group-runs/:id — Approve or reject a group run
router.patch('/group-runs/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { approval_status } = req.body;

  if (!['approved', 'rejected', 'pending'].includes(approval_status))
    return res.status(400).json({ error: 'approval_status must be approved, rejected, or pending' });

  const run = db.prepare('SELECT * FROM group_runs WHERE id = ?').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  db.prepare('UPDATE group_runs SET approval_status = ? WHERE id = ?').run(approval_status, req.params.id);
  res.json({ run: db.prepare('SELECT * FROM group_runs WHERE id = ?').get(req.params.id) });
});

// GET /api/admin/clubs — All clubs with member counts
router.get('/clubs', requireAdmin, (req, res) => {
  const db = getDb();
  const clubs = db.prepare(`
    SELECT c.id, c.name, c.status, c.created_at, COUNT(u.id) AS member_count
    FROM clubs c
    LEFT JOIN users u ON u.club_id = c.id AND u.is_active = 1
    GROUP BY c.id
    ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.created_at DESC
  `).all();
  res.json({ clubs });
});

// PATCH /api/admin/clubs/:id — Verify a club (or rename it)
router.patch('/clubs/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { status, name } = req.body;

  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  if (status && !['pending', 'verified'].includes(status))
    return res.status(400).json({ error: 'status must be pending or verified' });

  db.prepare(`UPDATE clubs SET status = COALESCE(?, status), name = COALESCE(?, name) WHERE id = ?`)
    .run(status || null, name ? name.trim() : null, req.params.id);

  res.json({ club: db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id) });
});

// DELETE /api/admin/clubs/:id — Reject/remove a club (members are unlinked)
router.delete('/clubs/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  db.prepare('UPDATE users SET club_id = NULL WHERE club_id = ?').run(club.id);
  db.prepare('DELETE FROM clubs WHERE id = ?').run(club.id);

  res.json({ message: `Club "${club.name}" removed` });
});

// GET /api/admin/members — All members with filters
router.get('/members', requireAdmin, (req, res) => {
  const db        = getDb();
  const search    = req.query.search ? `%${req.query.search}%` : null;
  const tier      = req.query.tier;
  const paceGroup = req.query.pace_group;
  const limit     = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset    = parseInt(req.query.offset) || 0;

  let where = 'WHERE u.is_active = 1';
  const params = [];
  if (search)    { where += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(search, search); }
  if (tier)      { where += ' AND u.tier = ?'; params.push(tier); }
  if (paceGroup) { where += ' AND u.pace_group = ?'; params.push(paceGroup); }

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.tier, u.pace_group, u.is_captain, u.is_active, u.joined_at,
           ROUND(SUM(a.distance),1) AS total_miles,
           COUNT(a.id) AS total_runs
    FROM users u
    LEFT JOIN activities a ON a.user_id = u.id
    ${where}
    GROUP BY u.id
    ORDER BY u.joined_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const { total } = db.prepare(`SELECT COUNT(*) as total FROM users u ${where}`).get(...params);

  res.json({ members, total, limit, offset });
});

// PATCH /api/admin/members/:id — Update member (promote/demote captain, change tier, deactivate)
router.patch('/members/:id', requireAdmin, (req, res) => {
  const db = getDb();
  const { is_captain, tier, is_active } = req.body;

  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Member not found' });

  db.prepare(`
    UPDATE users SET
      is_captain = COALESCE(?, is_captain),
      tier       = COALESCE(?, tier),
      is_active  = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    is_captain !== undefined ? (is_captain ? 1 : 0) : null,
    tier || null,
    is_active !== undefined ? (is_active ? 1 : 0) : null,
    req.params.id
  );

  const updated = db.prepare('SELECT id, name, email, tier, pace_group, is_captain, is_active FROM users WHERE id = ?').get(req.params.id);
  res.json({ member: updated });
});

// GET /api/admin/activities — Recent activity feed
router.get('/activities', requireAdmin, (req, res) => {
  const db = getDb();
  const activities = db.prepare(`
    SELECT a.*, u.name as user_name, u.pace_group
    FROM activities a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.logged_at DESC
    LIMIT 50
  `).all();
  res.json({ activities });
});

// DELETE /api/admin/members/:id — Deactivate member
router.delete('/members/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Member deactivated' });
});

module.exports = router;
