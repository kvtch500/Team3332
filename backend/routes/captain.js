// routes/captain.js — Captain panel: group runs, members, tools

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireCaptain } = require('../middleware/auth');

// GET /api/captain/runs/upcoming — Member-facing: all admin-approved upcoming runs
// (must be registered before any '/runs/:id' routes)
router.get('/runs/upcoming', requireAuth, (req, res) => {
  const db   = getDb();
  const runs = db.prepare(`
    SELECT gr.id, gr.title, gr.description, gr.run_type, gr.location, gr.scheduled_at,
           u.name AS captain_name, u.pace_group AS captain_pace_group,
           COUNT(grm.user_id) AS member_count,
           MAX(CASE WHEN grm.user_id = ? THEN 1 ELSE 0 END) AS joined
    FROM group_runs gr
    JOIN users u ON u.id = gr.captain_id
    LEFT JOIN group_run_members grm ON grm.run_id = gr.id
    WHERE gr.approval_status = 'approved'
      AND gr.status = 'upcoming'
      AND gr.scheduled_at >= datetime('now')
    GROUP BY gr.id
    ORDER BY gr.scheduled_at ASC
  `).all(req.user.id);

  res.json({ runs });
});

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
  const { title, description = null, run_type = 'Virtual', location = null, scheduled_at } = req.body;
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

  // Editing run details sends the run back through admin approval.
  // Status-only changes (completing/cancelling) don't require re-approval.
  const detailsChanged = [title, description, run_type, location, scheduled_at].some(v => v !== undefined);

  db.prepare(`
    UPDATE group_runs SET
      title = COALESCE(?, title), description = COALESCE(?, description),
      run_type = COALESCE(?, run_type), location = COALESCE(?, location),
      scheduled_at = COALESCE(?, scheduled_at), status = COALESCE(?, status),
      approval_status = CASE WHEN ? THEN 'pending' ELSE approval_status END
    WHERE id = ?
  `).run(title ?? null, description ?? null, run_type ?? null, location ?? null, scheduled_at ?? null, status ?? null, detailsChanged ? 1 : 0, req.params.id);

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

// POST /api/captain/runs/:id/join — Member joins a group run (approved runs only)
router.post('/runs/:id/join', requireAuth, (req, res) => {
  const db  = getDb();
  const run = db.prepare(`SELECT * FROM group_runs WHERE id = ? AND status = 'upcoming' AND approval_status = 'approved'`).get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found or no longer open' });

  try {
    db.prepare('INSERT INTO group_run_members (run_id, user_id) VALUES (?, ?)').run(req.params.id, req.user.id);
    res.json({ message: 'Joined group run' });
  } catch {
    res.status(409).json({ error: 'Already joined' });
  }
});

// POST /api/captain/runs/:id/leave — Member leaves a group run
router.post('/runs/:id/leave', requireAuth, (req, res) => {
  const db     = getDb();
  const result = db.prepare('DELETE FROM group_run_members WHERE run_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'You have not joined this run' });
  res.json({ message: 'Left group run' });
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

// ── CAPTAIN APPLICATIONS ─────────────────────────────────────

// GET /api/captain/apply/status — The member's most recent application (or null)
router.get('/apply/status', requireAuth, (req, res) => {
  const db = getDb();
  const application = db.prepare(
    `SELECT id, motivation, experience, status, created_at, reviewed_at
     FROM captain_applications WHERE user_id = ? ORDER BY id DESC LIMIT 1`
  ).get(req.user.id);
  res.json({ application: application || null });
});

// POST /api/captain/apply — Apply to become a captain (stores the application)
router.post('/apply', requireAuth, (req, res) => {
  const db = getDb();

  // Source of truth is the DB, not the (possibly stale) token.
  const me = db.prepare('SELECT is_captain FROM users WHERE id = ?').get(req.user.id);
  if (me?.is_captain) return res.status(400).json({ error: 'Already a captain' });

  const motivation = (req.body.motivation || '').trim();
  const experience = (req.body.experience || '').trim() || null;
  if (!motivation) return res.status(400).json({ error: 'Tell us why you want to be a captain' });

  const pending = db.prepare(
    `SELECT id FROM captain_applications WHERE user_id = ? AND status = 'pending'`
  ).get(req.user.id);
  if (pending) return res.status(409).json({ error: 'You already have an application under review' });

  const info = db.prepare(
    `INSERT INTO captain_applications (user_id, motivation, experience) VALUES (?, ?, ?)`
  ).run(req.user.id, motivation, experience);

  const application = db.prepare('SELECT * FROM captain_applications WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ application, message: 'Application received. An admin will review it soon.' });
});

// ── CAPTAIN Q&A ──────────────────────────────────────────────

// GET /api/captain/list — Captains a member can ask a question (id, name, pace_group)
router.get('/list', requireAuth, (req, res) => {
  const db = getDb();
  const captains = db.prepare(
    `SELECT id, name, pace_group, city, state, country
     FROM users WHERE is_captain = 1 AND is_active = 1 ORDER BY name ASC`
  ).all();
  res.json({ captains });
});

// GET /api/captain/questions/mine — Member's own questions, with answers
router.get('/questions/mine', requireAuth, (req, res) => {
  const db = getDb();
  const questions = db.prepare(
    `SELECT q.id, q.question, q.answer, q.status, q.created_at, q.answered_at,
            u.name AS captain_name
     FROM captain_questions q
     JOIN users u ON u.id = q.captain_id
     WHERE q.member_id = ?
     ORDER BY q.created_at DESC`
  ).all(req.user.id);
  res.json({ questions });
});

// GET /api/captain/questions/inbox — Captain's inbox (open first)
router.get('/questions/inbox', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const questions = db.prepare(
    `SELECT q.id, q.question, q.answer, q.status, q.created_at, q.answered_at,
            u.name AS member_name, u.pace_group AS member_pace_group
     FROM captain_questions q
     JOIN users u ON u.id = q.member_id
     WHERE q.captain_id = ?
     ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END, q.created_at DESC`
  ).all(req.user.id);
  res.json({ questions });
});

// POST /api/captain/questions — Member asks a captain a question
router.post('/questions', requireAuth, (req, res) => {
  const db = getDb();
  const captainId = parseInt(req.body.captain_id, 10);
  const question  = (req.body.question || '').trim();

  if (!captainId || !question) return res.status(400).json({ error: 'captain_id and question are required' });

  const captain = db.prepare(
    `SELECT id FROM users WHERE id = ? AND is_captain = 1 AND is_active = 1`
  ).get(captainId);
  if (!captain) return res.status(404).json({ error: 'Captain not found' });
  if (captainId === req.user.id) return res.status(400).json({ error: 'You cannot ask yourself' });

  const info = db.prepare(
    `INSERT INTO captain_questions (captain_id, member_id, question) VALUES (?, ?, ?)`
  ).run(captainId, req.user.id, question);

  const created = db.prepare('SELECT * FROM captain_questions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ question: created });
});

// POST /api/captain/questions/:id/answer — Captain answers a question addressed to them
router.post('/questions/:id/answer', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const answer = (req.body.answer || '').trim();
  if (!answer) return res.status(400).json({ error: 'answer is required' });

  const q = db.prepare('SELECT * FROM captain_questions WHERE id = ? AND captain_id = ?').get(req.params.id, req.user.id);
  if (!q) return res.status(404).json({ error: 'Question not found' });

  db.prepare(
    `UPDATE captain_questions SET answer = ?, status = 'answered', answered_at = datetime('now') WHERE id = ?`
  ).run(answer, req.params.id);

  res.json({ question: db.prepare('SELECT * FROM captain_questions WHERE id = ?').get(req.params.id) });
});

// ── TEAM ANNOUNCEMENTS ───────────────────────────────────────

// GET /api/captain/announcements — Team feed: recent announcements (all members)
router.get('/announcements', requireAuth, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const announcements = db.prepare(
    `SELECT a.id, a.title, a.body, a.created_at, a.captain_id,
            u.name AS captain_name
     FROM announcements a
     JOIN users u ON u.id = a.captain_id
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ?`
  ).all(limit);
  res.json({ announcements });
});

// GET /api/captain/announcements/mine — Captain's own posted announcements
router.get('/announcements/mine', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const announcements = db.prepare(
    `SELECT id, title, body, created_at FROM announcements
     WHERE captain_id = ? ORDER BY created_at DESC, id DESC`
  ).all(req.user.id);
  res.json({ announcements });
});

// POST /api/captain/announcements — Captain posts a team announcement
router.post('/announcements', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const title = (req.body.title || '').trim();
  const body  = (req.body.body  || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  if (title.length > 120) return res.status(400).json({ error: 'title must be 120 characters or fewer' });

  const info = db.prepare(
    `INSERT INTO announcements (captain_id, title, body) VALUES (?, ?, ?)`
  ).run(req.user.id, title, body);

  const announcement = db.prepare('SELECT * FROM announcements WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ announcement, message: 'Announcement posted to the team.' });
});

// DELETE /api/captain/announcements/:id — Captain deletes their own announcement
router.delete('/announcements/:id', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM announcements WHERE id = ? AND captain_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ message: 'Announcement deleted' });
});

// ── MEMBER-OF-THE-MONTH NOMINATIONS ──────────────────────────

// GET /api/captain/members — Active members a captain can nominate (excludes self)
router.get('/members', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const members = db.prepare(
    `SELECT id, name, pace_group FROM users
     WHERE is_active = 1 AND id != ? ORDER BY name ASC`
  ).all(req.user.id);
  res.json({ members });
});

// GET /api/captain/nominations/mine — Captain's own nominations (most recent first)
router.get('/nominations/mine', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const nominations = db.prepare(
    `SELECT n.id, n.month, n.reason, n.created_at,
            u.name AS nominee_name, u.pace_group AS nominee_pace_group
     FROM nominations n
     JOIN users u ON u.id = n.nominee_id
     WHERE n.captain_id = ?
     ORDER BY n.created_at DESC, n.id DESC`
  ).all(req.user.id);
  res.json({ nominations });
});

// POST /api/captain/nominations — Captain nominates a member for the month
router.post('/nominations', requireAuth, requireCaptain, (req, res) => {
  const db = getDb();
  const nomineeId = parseInt(req.body.nominee_id, 10);
  const reason    = (req.body.reason || '').trim();
  // month defaults to the current calendar month (UTC) in 'YYYY-MM'
  const month = /^\d{4}-\d{2}$/.test(req.body.month || '')
    ? req.body.month
    : new Date().toISOString().slice(0, 7);

  if (!nomineeId || !reason) return res.status(400).json({ error: 'nominee_id and reason are required' });
  if (nomineeId === req.user.id) return res.status(400).json({ error: 'You cannot nominate yourself' });

  const nominee = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(nomineeId);
  if (!nominee) return res.status(404).json({ error: 'Member not found' });

  const dup = db.prepare(
    `SELECT id FROM nominations WHERE captain_id = ? AND nominee_id = ? AND month = ?`
  ).get(req.user.id, nomineeId, month);
  if (dup) return res.status(409).json({ error: 'You already nominated this member this month' });

  const info = db.prepare(
    `INSERT INTO nominations (captain_id, nominee_id, month, reason) VALUES (?, ?, ?, ?)`
  ).run(req.user.id, nomineeId, month, reason);

  const nomination = db.prepare('SELECT * FROM nominations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ nomination, message: 'Nomination submitted.' });
});

module.exports = router;
