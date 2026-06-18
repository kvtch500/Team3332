// test/activities.test.js — Integration tests for the activities (run log) route
//
// Covers: auth guard, POST validation + defaults (auto-calories), GET list pagination
// + total, per-user isolation, GET/:id, PATCH COALESCE partial update, DELETE, /stats
// aggregation, and the challenge-progress side effect (sport filter: a Walk must not
// advance a Run-sport challenge). Same harness as group-runs.test.js: real router + real
// schema on in-memory SQLite.
//
//   Run:  node test/activities.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');

// ── better-sqlite3 → node:sqlite adapter (see clubs.test.js) ────
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

// ── App under test ──────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/activities', activitiesRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

async function req(method, path, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

// ── Seed ────────────────────────────────────────────────────────
let USER_A, USER_B, STATS_USER, CH_USER, CH_ID;
const PAST   = '2020-01-01 00:00:00';
const FUTURE = '2099-01-01 00:00:00';

function seed() {
  const db = getDb();
  const mkUser = (name, email) =>
    db.prepare(`INSERT INTO users (name, email, password) VALUES (?,?,?)`)
      .run(name, email, 'x').lastInsertRowid;

  USER_A     = { id: mkUser('Alice', 'a@t.com') };
  USER_B     = { id: mkUser('Bob',   'b@t.com') };
  STATS_USER = { id: mkUser('Stat',  's@t.com') };
  CH_USER    = { id: mkUser('Chal',  'c@t.com') };

  // A distance Run challenge the CH_USER has joined (progress 0).
  CH_ID = db.prepare(`
    INSERT INTO challenges (title, type, sport, goal_value, starts_at, ends_at)
    VALUES ('Run 50', 'distance', 'Run', 50, ?, ?)
  `).run(PAST, FUTURE).lastInsertRowid;
  db.prepare(`INSERT INTO challenge_members (challenge_id, user_id, progress) VALUES (?,?,0)`)
    .run(CH_ID, CH_USER.id);
}

const chProgress = () =>
  getDb().prepare('SELECT progress FROM challenge_members WHERE challenge_id = ? AND user_id = ?')
    .get(CH_ID, CH_USER.id).progress;

// ── Tests ───────────────────────────────────────────────────────

test('GET / requires auth (401)', async () => {
  const r = await req('GET', '/api/activities');
  assert.strictEqual(r.status, 401);
});

test('POST / rejects missing/invalid distance (400)', async () => {
  const none = await req('POST', '/api/activities', { auth: token(USER_A), body: { name: 'No dist' } });
  assert.strictEqual(none.status, 400);
  const zero = await req('POST', '/api/activities', { auth: token(USER_A), body: { distance: 0 } });
  assert.strictEqual(zero.status, 400);
  const neg  = await req('POST', '/api/activities', { auth: token(USER_A), body: { distance: -3 } });
  assert.strictEqual(neg.status, 400);
});

test('POST / creates a run with defaults + auto-calories (201)', async () => {
  const r = await req('POST', '/api/activities', { auth: token(USER_A), body: { distance: 3 } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.activity.name, 'My Run');     // default
  assert.strictEqual(r.body.activity.type, 'Run');        // default
  assert.strictEqual(r.body.activity.distance, 3);
  assert.strictEqual(r.body.activity.calories, Math.round(3 * 82)); // auto = 246
  assert.ok(r.body.activity.id);
});

test('POST / honors explicit name/type/calories', async () => {
  const r = await req('POST', '/api/activities', {
    auth: token(USER_A),
    body: { name: 'Evening Walk', type: 'Walk', distance: 2, calories: 99, pace: '12:00' },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.activity.name, 'Evening Walk');
  assert.strictEqual(r.body.activity.type, 'Walk');
  assert.strictEqual(r.body.activity.calories, 99);
});

test('GET / lists only my activities with total (per-user isolation)', async () => {
  const a = await req('GET', '/api/activities', { auth: token(USER_A) });
  assert.strictEqual(a.status, 200);
  assert.strictEqual(a.body.total, 2);            // the two A logged above
  assert.strictEqual(a.body.activities.length, 2);
  assert.ok(a.body.activities.every(x => x.user_id === USER_A.id));

  const b = await req('GET', '/api/activities', { auth: token(USER_B) });
  assert.strictEqual(b.body.total, 0);            // B sees nothing of A's
  assert.strictEqual(b.body.activities.length, 0);
});

test('GET / respects limit/offset paging', async () => {
  const page = await req('GET', '/api/activities?limit=1&offset=0', { auth: token(USER_A) });
  assert.strictEqual(page.body.activities.length, 1);
  assert.strictEqual(page.body.total, 2);
  assert.strictEqual(page.body.limit, 1);
  const page2 = await req('GET', '/api/activities?limit=1&offset=1', { auth: token(USER_A) });
  assert.strictEqual(page2.body.activities.length, 1);
  assert.notStrictEqual(page.body.activities[0].id, page2.body.activities[0].id);
});

test('GET /:id returns my activity; 404 for missing and for another user', async () => {
  const list = await req('GET', '/api/activities', { auth: token(USER_A) });
  const id = list.body.activities[0].id;
  const mine = await req('GET', `/api/activities/${id}`, { auth: token(USER_A) });
  assert.strictEqual(mine.status, 200);
  assert.strictEqual(mine.body.activity.id, id);
  const missing = await req('GET', '/api/activities/999999', { auth: token(USER_A) });
  assert.strictEqual(missing.status, 404);
  const notYours = await req('GET', `/api/activities/${id}`, { auth: token(USER_B) });
  assert.strictEqual(notYours.status, 404);       // user isolation, not a leak
});

test('PATCH /:id does a COALESCE partial update; unspecified fields preserved', async () => {
  const list = await req('GET', '/api/activities', { auth: token(USER_A) });
  const target = list.body.activities.find(x => x.name === 'My Run');
  const before = target.distance;
  const r = await req('PATCH', `/api/activities/${target.id}`, { auth: token(USER_A), body: { notes: 'felt great' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.activity.notes, 'felt great');
  assert.strictEqual(r.body.activity.distance, before);   // untouched field preserved
  assert.strictEqual(r.body.activity.name, 'My Run');
});

test('PATCH /:id on another user\'s activity is 404', async () => {
  const list = await req('GET', '/api/activities', { auth: token(USER_A) });
  const id = list.body.activities[0].id;
  const r = await req('PATCH', `/api/activities/${id}`, { auth: token(USER_B), body: { notes: 'hax' } });
  assert.strictEqual(r.status, 404);
});

test('DELETE /:id removes my activity; repeat + cross-user are 404', async () => {
  const list = await req('GET', '/api/activities', { auth: token(USER_A) });
  const id = list.body.activities[0].id;
  const del = await req('DELETE', `/api/activities/${id}`, { auth: token(USER_A) });
  assert.strictEqual(del.status, 200);
  const again = await req('DELETE', `/api/activities/${id}`, { auth: token(USER_A) });
  assert.strictEqual(again.status, 404);
  // a surviving activity can't be deleted by another user
  const survivor = (await req('GET', '/api/activities', { auth: token(USER_A) })).body.activities[0].id;
  const cross = await req('DELETE', `/api/activities/${survivor}`, { auth: token(USER_B) });
  assert.strictEqual(cross.status, 404);
});

test('GET /stats aggregates totals for the user', async () => {
  // STATS_USER logs exactly two runs: 3.0 and 5.0 miles
  await req('POST', '/api/activities', { auth: token(STATS_USER), body: { distance: 3 } });
  await req('POST', '/api/activities', { auth: token(STATS_USER), body: { distance: 5 } });
  const r = await req('GET', '/api/activities/stats', { auth: token(STATS_USER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.total_runs, 2);
  assert.strictEqual(r.body.total_miles, 8);      // ROUND(SUM(distance),1)
  assert.strictEqual(r.body.avg_distance, 4);     // ROUND(AVG,2)
});

test('logging a Run advances a matching distance Run-challenge', async () => {
  assert.strictEqual(chProgress(), 0);
  const r = await req('POST', '/api/activities', { auth: token(CH_USER), body: { type: 'Run', distance: 5 } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(chProgress(), 5);            // +5 miles toward the distance goal
});

test('logging a Walk does NOT advance a Run-sport challenge (sport filter)', async () => {
  const before = chProgress();
  const r = await req('POST', '/api/activities', { auth: token(CH_USER), body: { type: 'Walk', distance: 4 } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(chProgress(), before);       // unchanged — Walk must not touch Run challenge
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
  console.log(`\nactivities.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
