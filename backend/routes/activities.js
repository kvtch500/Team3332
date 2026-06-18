// routes/activities.js — Log, list, and manage runs

const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parseGpx } = require('../lib/gpx');

// GET /api/activities — My activities (paginated)
router.get('/', requireAuth, (req, res) => {
  const db    = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  const activities = db.prepare(`
    SELECT * FROM activities
    WHERE user_id = ?
    ORDER BY logged_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, limit, offset);

  const { total } = db.prepare('SELECT COUNT(*) as total FROM activities WHERE user_id = ?').get(req.user.id);

  res.json({ activities, total, limit, offset });
});

// GET /api/activities/stats — Aggregate stats for the logged-in user
router.get('/stats', requireAuth, (req, res) => {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*)          AS total_runs,
      ROUND(SUM(distance), 1) AS total_miles,
      ROUND(AVG(distance), 2) AS avg_distance,
      SUM(calories)     AS total_calories
    FROM activities
    WHERE user_id = ?
  `).get(req.user.id);

  // Weekly miles
  const weekly = db.prepare(`
    SELECT ROUND(SUM(distance), 1) AS miles
    FROM activities
    WHERE user_id = ? AND logged_at >= datetime('now', '-7 days')
  `).get(req.user.id);

  // Current streak (consecutive days with at least one run)
  const recentDays = db.prepare(`
    SELECT DISTINCT date(logged_at) AS run_date
    FROM activities
    WHERE user_id = ?
    ORDER BY run_date DESC
    LIMIT 60
  `).all(req.user.id);

  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  for (let i = 0; i < recentDays.length; i++) {
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const exp = expected.toISOString().split('T')[0];
    if (recentDays[i]?.run_date === exp) streak++;
    else break;
  }

  res.json({ ...stats, weekly_miles: weekly?.miles || 0, streak });
});

// POST /api/activities/parse-gpx — Parse a GPX file, return pre-filled fields (does NOT save)
// Body: raw GPX XML text. Frontend shows the parsed values for review before saving.
router.post('/parse-gpx', requireAuth, express.text({ type: '*/*', limit: '15mb' }), (req, res) => {
  try {
    const parsed = parseGpx(req.body);
    res.json({ parsed });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not parse GPX file' });
  }
});

// GET /api/activities/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!activity) return res.status(404).json({ error: 'Activity not found' });
  res.json({ activity });
});

// POST /api/activities — Log a new run
router.post('/', requireAuth, (req, res) => {
  const { name = 'My Run', type = 'Run', distance, pace, duration, calories, notes, route_data, logged_at } = req.body;

  if (!distance || isNaN(distance) || distance <= 0)
    return res.status(400).json({ error: 'Valid distance is required' });

  const db   = getDb();
  const info = db.prepare(`
    INSERT INTO activities (user_id, name, type, distance, pace, duration, calories, notes, route_data, logged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `).run(req.user.id, name, type, distance, pace ?? null, duration ?? null, calories || Math.round(distance * 82), notes ?? null, route_data ?? null, logged_at ?? null);

  // Auto-update challenge progress
  updateChallengeProgress(db, req.user.id, { distance, pace, type });

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ activity });
});

// PATCH /api/activities/:id
router.patch('/:id', requireAuth, (req, res) => {
  const { name, distance, pace, duration, calories, notes } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  // Coalesce undefined → null so a partial body (e.g. notes-only) doesn't crash the bind.
  // With null, the SQL COALESCE(?, col) keeps the existing column value. (618)
  db.prepare(`
    UPDATE activities SET
      name = COALESCE(?, name), distance = COALESCE(?, distance),
      pace = COALESCE(?, pace), duration = COALESCE(?, duration),
      calories = COALESCE(?, calories), notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name ?? null, distance ?? null, pace ?? null, duration ?? null, calories ?? null, notes ?? null, req.params.id);

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(req.params.id);
  res.json({ activity });
});

// DELETE /api/activities/:id
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM activities WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json({ message: 'Activity deleted' });
});

// Helper: bump challenge progress after logging an activity.
// Each challenge has a sport ('Run' | 'Walk' | 'Any', default 'Run') — an activity
// only advances challenges whose sport matches, so walks never touch run challenges.
function updateChallengeProgress(db, userId, { distance, pace, type }) {
  const now = new Date().toISOString();
  const active = db.prepare(`
    SELECT cm.*, c.type, c.goal_value, c.sport FROM challenge_members cm
    JOIN challenges c ON c.id = cm.challenge_id
    WHERE cm.user_id = ? AND cm.completed = 0
      AND c.starts_at <= ? AND c.ends_at >= ?
  `).all(userId, now, now);

  const actType = type || 'Run';
  for (const cm of active) {
    const sport = cm.sport || 'Run';
    if (sport !== 'Any' && sport !== actType) continue;
    let increment = 0;
    if (cm.type === 'distance') increment = distance;
    else if (cm.type === 'frequency') increment = 1;
    else if (cm.type === 'streak') increment = 1;
    else if (cm.type === 'pace' && pace) {
      const [m, s] = pace.split(':').map(Number);
      const secs = m * 60 + (s || 0);
      if (secs < 9 * 60) increment = 1; // sub-9:00 counts
    }

    const newProgress = cm.progress + increment;
    const completed   = newProgress >= cm.goal_value ? 1 : 0;

    db.prepare('UPDATE challenge_members SET progress = ?, completed = ? WHERE id = ?')
      .run(Math.min(newProgress, cm.goal_value), completed, cm.id);
  }
}

module.exports = router;
module.exports.updateChallengeProgress = updateChallengeProgress; // exported for tests
