// routes/activities.js — Log, list, and manage runs

const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { parseGpx } = require('../lib/gpx');

// ── Best-effort helpers (timestamped GPS tracks → real fastest splits) ──────────
// Great-circle distance between two [lat,lon] points, in miles.
function haversineMi(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(s))) / 1609.344;
}

// Parse route_data into a cumulative {cum:[miles], t:[secs]} track, but ONLY if every point
// carries a numeric timestamp (p[2]). Returns null for legacy [lat,lon] tracks or bad data.
function parseTrack(route_data) {
  if (!route_data) return null;
  let pts;
  try {
    const parsed = typeof route_data === 'string' ? JSON.parse(route_data) : route_data;
    pts = parsed && Array.isArray(parsed.points) ? parsed.points : null;
  } catch { return null; }
  if (!pts || pts.length < 2) return null;
  if (!pts.every(p => Array.isArray(p) && p.length >= 3 && Number.isFinite(p[2]))) return null;
  const cum = [0], t = [pts[0][2]];
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + haversineMi(pts[i - 1], pts[i]);
    t[i] = pts[i][2];
  }
  // Timestamps must be non-decreasing and span some time, else the track is unusable.
  if (!(t[t.length - 1] > t[0])) return null;
  return { cum, t };
}

// Fastest time (secs) to cover exactly `miles` anywhere within a timestamped track, using a
// forward two-pointer window with linear interpolation at the far end. null if the track
// never covers that far. O(n) per benchmark since j only advances.
function fastestSegment(track, miles) {
  const { cum, t } = track;
  const n = cum.length;
  if (cum[n - 1] < miles) return null;
  let best = Infinity, j = 1;
  for (let i = 0; i < n; i++) {
    if (j <= i) j = i + 1;
    while (j < n && cum[j] - cum[i] < miles) j++;
    if (j >= n) break;                                    // can't reach `miles` from here on
    const legDist = cum[j] - cum[j - 1];
    const need = miles - (cum[j - 1] - cum[i]);           // remaining distance into the last leg
    const frac = legDist > 0 ? need / legDist : 0;
    const segTime = (t[j - 1] - t[i]) + (t[j] - t[j - 1]) * frac;
    if (segTime < best) best = segTime;
  }
  return isFinite(best) && best > 0 ? best : null;
}

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

// GET /api/activities/progress — Strava-style progress data for the logged-in user:
// totals, current streak, active calendar dates, best efforts, race predictions, and a
// 6-month trend. Defined BEFORE '/:id' so 'progress' isn't captured as an activity id.
//
// Best efforts: real fastest-segment splits when a run has timestamped GPS points
// (route_data points stored as [lat,lon,t], t = secs since start — recorded in-app from 618e,
// or imported from GPX with timestamps). For runs without per-point timestamps (legacy tracks
// or GPX without time), we fall back to the fastest even-pace projection from any run that
// covered at least that far, tagged estimated.
router.get('/progress', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, type, distance, pace, duration, logged_at, route_data
    FROM activities WHERE user_id = ?
    ORDER BY logged_at ASC
  `).all(req.user.id);

  // "HH:MM:SS" | "MM:SS" -> seconds (mirrors the frontend durSecs helper)
  const toSecs = (dur) => {
    if (!dur) return 0;
    const p = String(dur).trim().split(':').map(Number);
    if (p.some(isNaN)) return 0;
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
  };
  // Effective time for an activity: prefer recorded duration, else pace(min/mi) * distance.
  const actSecs = (a) => {
    let s = toSecs(a.duration);
    if (!s && a.pace) s = toSecs(a.pace) * (parseFloat(a.distance) || 0);
    return s;
  };

  // ── Totals ──────────────────────────────────────────────
  let total_miles = 0, total_time_secs = 0;
  for (const a of rows) { total_miles += parseFloat(a.distance) || 0; total_time_secs += actSecs(a); }
  const total_runs = rows.length;

  // ── Active dates (distinct YYYY-MM-DD) + current streak ──
  const dateSet = new Set(rows.map(a => String(a.logged_at).slice(0, 10)));
  const active_dates = [...dateSet].sort();
  const isoDay = (dt) => dt.toISOString().slice(0, 10);
  let streak = 0;
  const cur = new Date();
  if (!dateSet.has(isoDay(cur))) cur.setDate(cur.getDate() - 1); // grace: no run yet today
  while (dateSet.has(isoDay(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

  // ── Best efforts (Run only) ──
  // Real fastest-segment splits when a run's track has per-point timestamps; otherwise an
  // even-pace projection. See helpers (haversineMi, parseTrack, fastestSegment) below.
  const BENCHMARKS = [
    ['½ mile', 0.5], ['1 mile', 1], ['2 mile', 2], ['5K', 3.10686], ['10K', 6.21371],
    ['15K', 9.32057], ['10 mile', 10], ['20K', 12.4274], ['½ Marathon', 13.1094],
    ['30K', 18.6411], ['Marathon', 26.2188], ['50K', 31.0686], ['100 Miler', 100],
  ];
  const runs = rows.filter(a => (a.type || 'Run') === 'Run' && actSecs(a) > 0 && (parseFloat(a.distance) || 0) > 0);
  // Parse each run's timestamped track once (null when the track has no per-point times).
  const runTracks = runs.map(a => ({ a, dist: parseFloat(a.distance), track: parseTrack(a.route_data) }));
  const best_efforts = BENCHMARKS.map(([label, miles]) => {
    let best = null;
    for (const { a, dist, track } of runTracks) {
      if (dist < miles * 0.995) continue;                 // must have covered at least this far
      let time_secs, estimated;
      const real = track ? fastestSegment(track, miles) : null;
      if (real != null) {
        time_secs = real;                                 // true fastest segment from GPS timestamps
        estimated = false;
      } else {
        time_secs = actSecs(a) * (miles / dist);          // even-pace projection fallback
        estimated = dist > miles * 1.02;                  // exact-ish if the run was ~this distance
      }
      if (!best || time_secs < best.time_secs) {
        best = {
          time_secs: Math.round(time_secs),
          pace_secs_per_mi: Math.round(time_secs / miles),
          activity_id: a.id,
          logged_at: a.logged_at,
          estimated,
        };
      }
    }
    return { label, miles, best };
  });

  // ── Race predictions (Riegel: T2 = T1 * (D2/D1)^1.06) ──
  const RIEGEL = 1.06;
  const have = best_efforts.filter(b => b.best);
  const underHalf = have.filter(b => b.miles <= 13.2);
  const pool = underHalf.length ? underHalf : have;       // prefer a base at/under a half marathon
  let base = null;
  for (const b of pool) { if (!base || b.miles > base.miles) base = b; } // longest reliable effort
  let predictions = null, prediction_base = null;
  if (base) {
    prediction_base = { label: base.label, miles: base.miles, time_secs: base.best.time_secs };
    const RACES = [['5K', 3.10686], ['10K', 6.21371], ['½ Marathon', 13.1094], ['Marathon', 26.2188]];
    predictions = RACES.map(([label, miles]) => {
      const t = base.best.time_secs * Math.pow(miles / base.miles, RIEGEL);
      return { label, miles, time_secs: Math.round(t), pace_secs_per_mi: Math.round(t / miles) };
    });
  }

  // ── Monthly trend: last 6 months (distance + active time + runs) ──
  const monthMap = new Map();
  for (const a of rows) {
    const key = String(a.logged_at).slice(0, 7); // YYYY-MM
    const m = monthMap.get(key) || { distance: 0, time_secs: 0, runs: 0 };
    m.distance += parseFloat(a.distance) || 0;
    m.time_secs += actSecs(a);
    m.runs += 1;
    monthMap.set(key, m);
  }
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthly = [];
  const nowM = new Date();
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(nowM.getFullYear(), nowM.getMonth() - i, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    const m = monthMap.get(key) || { distance: 0, time_secs: 0, runs: 0 };
    monthly.push({
      month: key, label: MONTH_LABELS[dt.getMonth()],
      distance: Math.round(m.distance * 10) / 10, time_secs: m.time_secs, runs: m.runs,
    });
  }

  res.json({
    total_runs,
    total_miles: Math.round(total_miles * 10) / 10,
    total_time_secs,
    streak,
    active_dates,
    best_efforts,
    predictions,
    prediction_base,
    monthly,
  });
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
