// test/progress.test.js — Tests for GET /api/activities/progress
//
// Covers: auth guard, totals, current streak (consecutive days incl. today), best-effort
// even-pace projection (Run only; Walk excluded), Riegel race predictions + base selection,
// and the 6-month monthly trend. Same harness as activities.test.js: real router + real
// schema on in-memory SQLite.
//
//   Run:  node test/progress.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');

// ── better-sqlite3 → node:sqlite adapter ────────────────────────
if (!process.env.USE_NATIVE_SQLITE) {
  const { DatabaseSync } = require('node:sqlite');
  class BetterSqlite3Compat {
    constructor(path) { this._db = new DatabaseSync(path || ':memory:'); }
    exec(sql) { this._db.exec(sql); return this; }
    prepare(sql) { return this._db.prepare(sql); }
    close() { this._db.close(); }
  }
  const Module = require('node:module');
  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'better-sqlite3') return BetterSqlite3Compat;
    return origLoad.call(this, request, ...rest);
  };
}

const { getDb } = require('../db');
const activitiesRouter = require('../routes/activities');

// ── Tiny test harness ───────────────────────────────────────────
let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
app.use(express.json());
app.use('/api/activities', activitiesRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

async function req(method, path, { auth } = {}) {
  const headers = {};
  if (auth) headers.Authorization = auth;
  const res = await fetch(base + path, { method, headers });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

// ── Seed ────────────────────────────────────────────────────────
// UTC day strings so the streak math (which uses UTC) is deterministic regardless of when
// the test runs.
let USER, EMPTY;
const dayUTC = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

function seed() {
  const db = getDb();
  const mkUser = (name, email) =>
    db.prepare(`INSERT INTO users (name, email, password) VALUES (?,?,?)`).run(name, email, 'x').lastInsertRowid;
  USER  = { id: mkUser('Runner', 'r@t.com') };
  EMPTY = { id: mkUser('Empty',  'e@t.com') };

  const add = (uid, { type = 'Run', distance, pace = null, duration = null, day }) =>
    db.prepare(`INSERT INTO activities (user_id, name, type, distance, pace, duration, logged_at)
                VALUES (?,?,?,?,?,?,?)`)
      .run(uid, 'A', type, distance, pace, duration, day + ' 12:00:00');

  // Three consecutive days ending today → streak should be 3.
  add(USER.id, { type: 'Run',  distance: 1.0,      duration: '7:00',  day: dayUTC(0)  }); // 1 mi @ 7:00
  add(USER.id, { type: 'Run',  distance: 6.21371,  duration: '50:00', day: dayUTC(-1) }); // 10K @ 50:00
  add(USER.id, { type: 'Walk', distance: 2.0,      duration: '30:00', day: dayUTC(-2) }); // walk (excluded from best efforts)
}

const tok = () => token({ id: USER.id });
const effort = (body, label) => body.best_efforts.find(b => b.label === label);

// ── Tests ───────────────────────────────────────────────────────

test('GET /progress requires auth (401)', async () => {
  const r = await req('GET', '/api/activities/progress');
  assert.strictEqual(r.status, 401);
});

test('totals: runs + miles include all activity types', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.total_runs, 3);
  assert.strictEqual(r.body.total_miles, 9.2); // 1.0 + 6.21371 + 2.0 = 9.21371 → 9.2
});

test('streak counts consecutive days ending today', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(r.body.streak, 3);
  assert.ok(r.body.active_dates.includes(dayUTC(0)));
});

test('best efforts: exact 1 mile + 10K, projected 5K, Walk excluded', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(effort(r.body, '1 mile').best.time_secs, 420);   // exact, 7:00
  assert.strictEqual(effort(r.body, '10K').best.time_secs, 3000);     // exact, 50:00
  assert.strictEqual(effort(r.body, '5K').best.time_secs, 1500);      // 3000 * (3.10686/6.21371)
  assert.strictEqual(effort(r.body, '½ mile').best.time_secs, 210);   // 420 * 0.5
  assert.strictEqual(effort(r.body, '1 mile').best.estimated, false); // run was ~1 mi
  assert.strictEqual(effort(r.body, '5K').best.estimated, true);      // projected from the 10K
  // The 2.0-mile WALK must not produce a 2-mile best effort from a walk; the only qualifying
  // run for 2 miles is the 10K, projected.
  assert.strictEqual(effort(r.body, '2 mile').best.time_secs, Math.round(3000 * (2 / 6.21371)));
});

test('no best effort beyond the longest run', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(effort(r.body, 'Marathon').best, null);
  assert.strictEqual(effort(r.body, '100 Miler').best, null);
});

test('predictions: base is the longest reliable effort; times increase with distance', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(r.body.prediction_base.label, '10K'); // longest effort ≤ half marathon
  assert.strictEqual(r.body.predictions.length, 4);
  const t = r.body.predictions.map(p => p.time_secs);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1], 'predicted time should grow with distance');
  // 10K prediction should ≈ the 10K base time (same distance, exponent cancels).
  const p10k = r.body.predictions.find(p => p.label === '10K');
  assert.ok(Math.abs(p10k.time_secs - 3000) <= 1);
});

test('monthly trend returns exactly 6 months, current month populated', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: tok() });
  assert.strictEqual(r.body.monthly.length, 6);
  const last = r.body.monthly[5];
  assert.ok(last.runs >= 1);          // today's run lands in the current month
  assert.ok(last.distance >= 1.0);
});

test('empty user: zeros, null predictions, all best efforts null', async () => {
  const r = await req('GET', '/api/activities/progress', { auth: token({ id: EMPTY.id }) });
  assert.strictEqual(r.body.total_runs, 0);
  assert.strictEqual(r.body.streak, 0);
  assert.strictEqual(r.body.predictions, null);
  assert.ok(r.body.best_efforts.every(b => b.best === null));
  assert.strictEqual(r.body.monthly.length, 6);
});

// ── Runner ──────────────────────────────────────────────────────
(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  seed();

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`  ✗ ${t.name}`);
      console.log(`      ${err.message}`);
    }
  }

  server.close();
  console.log(`\nprogress.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
