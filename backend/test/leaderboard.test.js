// test/leaderboard.test.js — Integration tests for the leaderboard (rankings) route
//
// Covers: auth guard, ranking order by total_miles, rank numbering, is_you tagging,
// exclusion of inactive users and users with no activities, the my_entry fallback for
// off-board users, pace_group filter, period filter (weekly vs alltime), club_name only
// for verified clubs, and the limit cap. Same harness as group-runs.test.js.
//
//   Run:  node test/leaderboard.test.js   (from the backend/ folder)

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
const leaderboardRouter = require('../routes/leaderboard');

// ── Tiny test harness ───────────────────────────────────────────
let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── App under test ──────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/leaderboard', leaderboardRouter);
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
// Recent miles: TOP=10 (6+4), MID=5, LOW=2, INACTIVE=8 (excluded), NOACT=0.
// LOW also has a 50-mile run dated 2020 → only counts for the all-time period.
let TOP, MID, LOW, INACTIVE, NOACT;

function seed() {
  const db = getDb();
  const verified = db.prepare(`INSERT INTO clubs (name, status) VALUES ('Speed Demons', 'verified')`).run().lastInsertRowid;
  const pending  = db.prepare(`INSERT INTO clubs (name, status) VALUES ('Newbies', 'pending')`).run().lastInsertRowid;

  const mkUser = (name, email, { pace = 'C', club = null, active = 1 } = {}) =>
    db.prepare(`INSERT INTO users (name, email, password, pace_group, club_id, is_active) VALUES (?,?,?,?,?,?)`)
      .run(name, email, 'x', pace, club, active).lastInsertRowid;

  TOP      = { id: mkUser('Top',  'top@t.com',  { pace: 'A', club: verified }) };
  MID      = { id: mkUser('Mid',  'mid@t.com',  { pace: 'B', club: pending  }) };
  LOW      = { id: mkUser('Low',  'low@t.com',  { pace: 'A' }) };
  INACTIVE = { id: mkUser('Off',  'off@t.com',  { pace: 'A', active: 0 }) };
  NOACT    = { id: mkUser('None', 'none@t.com', { pace: 'C' }) };

  const log = (uid, dist, when) =>
    db.prepare(`INSERT INTO activities (user_id, name, distance, logged_at) VALUES (?, 'r', ?, COALESCE(?, datetime('now')))`)
      .run(uid, dist, when ?? null);

  log(TOP.id, 6);  log(TOP.id, 4);          // 10 recent
  log(MID.id, 5);                            // 5 recent
  log(LOW.id, 2);                            // 2 recent
  log(LOW.id, 50, '2020-01-01 08:00:00');    // old — all-time only
  log(INACTIVE.id, 8);                       // excluded (is_active = 0)
}

// ── Tests ───────────────────────────────────────────────────────

test('GET / requires auth (401)', async () => {
  const r = await req('GET', '/api/leaderboard');
  assert.strictEqual(r.status, 401);
});

test('default (monthly) board ranks by miles; excludes inactive + no-activity users', async () => {
  const r = await req('GET', '/api/leaderboard', { auth: token(TOP) });
  assert.strictEqual(r.status, 200);
  const ids = r.body.leaderboard.map(x => x.id);
  assert.deepStrictEqual(ids, [TOP.id, MID.id, LOW.id]);            // ordered by miles desc
  assert.deepStrictEqual(r.body.leaderboard.map(x => x.rank), [1, 2, 3]);
  assert.strictEqual(r.body.leaderboard[0].total_miles, 10);
  assert.ok(!ids.includes(INACTIVE.id), 'inactive user must be excluded');
  assert.ok(!ids.includes(NOACT.id), 'user with no activities must be excluded from board');
});

test('is_you tags the requesting user only', async () => {
  const r = await req('GET', '/api/leaderboard', { auth: token(MID) });
  const you = r.body.leaderboard.filter(x => x.is_you);
  assert.strictEqual(you.length, 1);
  assert.strictEqual(you[0].id, MID.id);
});

test('club_name shows for verified clubs only', async () => {
  const r = await req('GET', '/api/leaderboard', { auth: token(TOP) });
  const top = r.body.leaderboard.find(x => x.id === TOP.id);
  const mid = r.body.leaderboard.find(x => x.id === MID.id);
  assert.strictEqual(top.club_name, 'Speed Demons');   // verified
  assert.strictEqual(mid.club_name, null);             // pending → hidden
});

test('my_entry is populated for an off-board user, null for an on-board user', async () => {
  const off = await req('GET', '/api/leaderboard', { auth: token(NOACT) });
  assert.ok(off.body.my_entry, 'off-board user should get a my_entry');
  assert.strictEqual(off.body.my_entry.id, NOACT.id);
  assert.ok(!off.body.leaderboard.some(x => x.id === NOACT.id));

  const on = await req('GET', '/api/leaderboard', { auth: token(TOP) });
  assert.strictEqual(on.body.my_entry, null);          // TOP is in the board
});

test('pace_group filter narrows the board', async () => {
  const r = await req('GET', '/api/leaderboard?pace_group=A', { auth: token(TOP) });
  const ids = r.body.leaderboard.map(x => x.id);
  assert.deepStrictEqual(ids, [TOP.id, LOW.id]);        // both pace A, MID (B) excluded
  assert.strictEqual(r.body.pace_group, 'A');
});

test('period: weekly excludes the old run; alltime includes it (reorders board)', async () => {
  const weekly = await req('GET', '/api/leaderboard?period=weekly', { auth: token(LOW) });
  const lowWeekly = weekly.body.leaderboard.find(x => x.id === LOW.id);
  assert.strictEqual(lowWeekly.total_miles, 2);         // old 50mi run not counted

  const alltime = await req('GET', '/api/leaderboard?period=alltime', { auth: token(LOW) });
  assert.strictEqual(alltime.body.leaderboard[0].id, LOW.id);   // 52mi now tops the board
  assert.strictEqual(alltime.body.leaderboard[0].total_miles, 52);
});

test('limit caps the number of rows returned', async () => {
  const r = await req('GET', '/api/leaderboard?limit=1', { auth: token(TOP) });
  assert.strictEqual(r.body.leaderboard.length, 1);
  assert.strictEqual(r.body.leaderboard[0].id, TOP.id);
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
  console.log(`\nleaderboard.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
