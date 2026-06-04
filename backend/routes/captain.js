// routes/captain.js — Captain panel: group runs, members, tools

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireCaptain } = require('../middleware/auth');

// GET /api/captain/runs — Captain's group runs
router.get('/runs', requireAuth, requireCaptain, (req, res) => {
  const db   = getDb();
  const runs = db.prepare(`
    SELECT gr.*, COUNT(grm.user_id) AS member_count
    FROM group_runs gr
    LEFT JOIN group_run_members grm ON grm.run_id = gr.id
    WHERE gr.captain_id = ?
    GROUP BY gr.id
    ORDER BY gr.scheduled_at DESC
  `).all(req.user.id);

  res.json({ runs });
});

// POST /api/captain/runs — Create a group run
router.post('/runs', requireAuth, requireCaptain, (req, res) => {
  const { title, description, run_type = 'Virtual', location, scheduled_at } = req.body;
  if (!title || !scheduled_at) return res.status(400).json({ error: 'title and scheduled_at are required' });

  const db   = getDb();
  const info = db.prepare(`
    INSERT INTO group_runs (captain_id, title, description, run_type, location, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, description, run_type, location, scheduled_at);

  const run = db.prepare('SELECT * FROM group_runs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ run });
});

// PATCH /api/captain/runs/:id
router.patch('/runs/:id', requireAuth, requireCaptain, (req, res) => {
  const { title, description, run_type, location, scheduled_at, status } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM group_runs WHERE id = ? AND captain_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Run not found' });

  db.prepare(`
    UPDATE group_runs SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      run_type = COALESCE(?, run_type), location = COALESCE(?, location),
      scheduled_at = COALESCE(?, scheduled_at), status = COALESCE(?, status)
    WHERE id = ?
  `).run(title, description, run_type, location, scheduled_at, status, req.params.id);

  const run = db.prepare('SELECT * FROM group_runs WHERE id = ?').get(req.params.id);
  res.json({ run });
});

// DELETE /api/captain/runs/:id
router.delete('/runs/:id', requireAuth, requireCaptain, (req, res) => {
  const db     = getDb();
  const result = db.prepare('DELETE FROM group_runs WHERE id = ? AND captain_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Run not found' });
  res.json({ message: 'Group run deleted' });
});

// GET /api/captain/runs/:id/members — Who joined a run
router.get('/runs/:id/members', requireAuth, requireCaptain, (req, res) => {
  const db      = getDb();
  const members = db.prepare(`
    SELECT u.id, u.name, u.tier, u.pace_group, grm.joined_at
    FROM group_run_members grm
    JOIN users u ON u.id = grm.user_id
    WHERE grm.run_id = ?
    ORDER BY grm.joined_at ASC
  `).all(req.params.id);

  res.json({ members });
});

// POST /api/captain/runs/:id/join — Member joins a group run
router.post('/runs/:id/join', requireAuth, (req, res) => {
  const db  = getDb();
  const run = db.prepare('SELECT * FROM group_runs WHERE id = ? AND status = "upcoming"').get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found or no longer open' });

  try {
    db.prepare('INSERT INTO group_run_members (run_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    res.json({ message: 'Joined group run' });
  } catch {
    res.status(409).json({ error: 'Already joined' });
  }
});

// GET /api/captain/stats — Captain's summary stats
router.get('/stats', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();

  const runStats = db.prepare(`
    SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
      SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END)  AS upcoming_runs
    FROM group_runs WHERE captain_id = ?
  `).get(req.user.id);

  const memberCount = db.prepare(`
    SELECT COUNT(DISTINCT grm.user_id) AS total_members
    FROM group_runs gr
    JOIN group_run_members grm ON grm.run_id = gr.id
    WHERE gr.captain_id = ?
  `).get(req.user.id);

  res.json({ ...runStats, total_members_mentored: memberCount.total_members });
});

// POST /api/captain/apply — Apply to become a captain
router.post('/apply', requireAuth, (req, res) => {
  if (req.user.is_captain) return res.status(400).json({ error: 'Already a captain' });
  // In production: store application, notify admin
  res.json({ message: 'Application received. You will be notified within 5–7 business days.' });
});

module.exports = router;
