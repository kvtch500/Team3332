// test/clubs.test.js — Integration tests for routes/clubs.js (run clubs + location)
//
// Drives the REAL Express router over HTTP against a fresh in-memory SQLite DB
// built from the real schema + boot migrations in db/index.js. No mocks of the
// DB layer — only auth tokens are minted directly with the app's JWT secret.
//
//   Run:  node test/clubs.test.js   (from the backend/ folder)
//
// Sandbox note: better-sqlite3 may not load on every machine; this test forces
// DB_PATH=:memory: so it never touches the real team3332.db volume file.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');

// ── better-sqlite3 → node:sqlite adapter ────────────────────────
// The Mac-compiled better-sqlite3 native binary in node_modules won't load in
// the Linux test sandbox ("invalid ELF header"). node:sqlite (built into Node
// 22) exposes a near-identical synchronous API. We shim `require('better-sqlite3')`
// so the REAL db/index.js (schema + boot migrations) and routes/clubs.js run
// completely unmodified on top of it. On a machine where better-sqlite3 loads
// natively (e.g. the Mac), set USE_NATIVE_SQLITE=1 to skip the shim.
if (!process.env.USE_NATIVE_SQLITE) {
  const { DatabaseSync } = require('node:sqlite');
  class BetterSqlite3Compat {
    constructor(path) { this._db = new DatabaseSync(path || ':memory:'); }
    exec(sql) { this._db.exec(sql); return this; }
    prepare(sql) { return this._db.prepare(sql); }   // StatementSync: .get/.all/.run(...params)
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
const clubsRouter = require('../routes/clubs');

// ── Tiny test harness ───────────────────────────────────────────
let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── App under test ──────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/clubs', clubsRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

// fetch helper — returns { status, body }
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

// ── Seed: deterministic fixture data ────────────────────────────
let USER, OTHER, CLUB_VERIFIED, CLUB_PENDING;
function seed() {
  const db = getDb();
  // Two verified clubs + one pending
  const big   = db.prepare(`INSERT INTO clubs (name, status) VALUES (?, 'verified')`).run('Bayou Striders').lastInsertRowid;
  const small = db.prepare(`INSERT INTO clubs (name, status) VALUES (?, 'verified')`).run('Crescent City Runners').lastInsertRowid;
  const pend  = db.prepare(`INSERT INTO clubs (name, status) VALUES (?, 'pending')`).run('Pending Pacers').lastInsertRowid;
  CLUB_VERIFIED = big;
  CLUB_PENDING  = pend;

  const mkUser = (name, email, club_id, country, state, city) =>
    db.prepare(`INSERT INTO users (name, email, password, club_id, country, state, city) VALUES (?,?,?,?,?,?,?)`)
      .run(name, email, 'x', club_id, country, state, city).lastInsertRowid;

  // big club: 2 members with different mileage; small club: 1 member
  const u1 = mkUser('Ann',  'ann@t.com',  big,   'US', 'LA', 'New Orleans');
  const u2 = mkUser('Bob',  'bob@t.com',  big,   'US', 'LA', 'Metairie');
  const u3 = mkUser('Cara', 'cara@t.com', small, 'US', 'TX', 'Austin');
  USER  = { id: u1, is_captain: false, tier: 'Standard' };
  OTHER = { id: u3, is_captain: false, tier: 'Standard' };

  // activities so the roster aggregation has something to sum
  const act = db.prepare(`INSERT INTO activities (user_id, distance) VALUES (?, ?)`);
  act.run(u1, 5.0); act.run(u1, 3.2);   // Ann = 8.2 over 2 runs
  act.run(u2, 10.0);                     // Bob = 10.0 over 1 run
  act.run(u3, 4.0);
}

// ── Tests ───────────────────────────────────────────────────────

test('GET /api/clubs requires auth', async () => {
  const r = await req('GET', '/api/clubs');
  assert.strictEqual(r.status, 401);
});

test('GET /api/clubs returns only verified clubs, busiest first', async () => {
  const r = await req('GET', '/api/clubs', { auth: token(USER) });
  assert.strictEqual(r.status, 200);
  const names = r.body.clubs.map(c => c.name);
  assert.ok(!names.includes('Pending Pacers'), 'pending club must not be listed');
  assert.deepStrictEqual(names, ['Bayou Striders', 'Crescent City Runners'],
    'should order by member_count desc (2 then 1)');
  assert.strictEqual(r.body.clubs[0].member_count, 2);
});

test('GET /api/clubs?search= filters by name (LIKE)', async () => {
  const r = await req('GET', '/api/clubs?search=crescent', { auth: token(USER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.clubs.length, 1);
  assert.strictEqual(r.body.clubs[0].name, 'Crescent City Runners');
});

test('GET /api/clubs/:id returns roster sorted by miles desc', async () => {
  const r = await req('GET', `/api/clubs/${CLUB_VERIFIED}`, { auth: token(USER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.club.name, 'Bayou Striders');
  assert.strictEqual(r.body.member_count, 2);
  const roster = r.body.members;
  assert.strictEqual(roster[0].name, 'Bob');   // 10.0 mi
  assert.strictEqual(roster[0].total_miles, 10.0);
  assert.strictEqual(roster[1].name, 'Ann');   // 8.2 mi
  assert.strictEqual(roster[1].total_miles, 8.2);
  assert.strictEqual(roster[1].total_runs, 2);
  assert.strictEqual(roster[0].city, 'Metairie'); // location surfaced in roster
});

test('GET /api/clubs/:id 404s for a pending (unverified) club', async () => {
  const r = await req('GET', `/api/clubs/${CLUB_PENDING}`, { auth: token(USER) });
  assert.strictEqual(r.status, 404);
});

test('GET /api/clubs/:id 404s for a club that does not exist', async () => {
  const r = await req('GET', '/api/clubs/99999', { auth: token(USER) });
  assert.strictEqual(r.status, 404);
});

test('POST /join an existing verified club sets membership, created=false', async () => {
  const r = await req('POST', '/api/clubs/join', { auth: token(OTHER), body: { name: 'Bayou Striders' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.created, false);
  assert.strictEqual(r.body.club.status, 'verified');
  const db = getDb();
  const u = db.prepare('SELECT club_id FROM users WHERE id = ?').get(OTHER.id);
  assert.strictEqual(u.club_id, CLUB_VERIFIED);
  assert.ok(/now a member/i.test(r.body.message));
});

test('POST /join with a new name creates a PENDING club, created=true', async () => {
  const r = await req('POST', '/api/clubs/join', { auth: token(USER), body: { name: 'Lakefront Loopers' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.created, true);
  assert.strictEqual(r.body.club.status, 'pending');     // not auto-verified
  assert.ok(/verifies/i.test(r.body.message));
  // and it must NOT appear in the public verified list
  const list = await req('GET', '/api/clubs?search=Lakefront', { auth: token(USER) });
  assert.strictEqual(list.body.clubs.length, 0);
});

test('POST /join is case-insensitive — no duplicate club created', async () => {
  const db = getDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM clubs').get().n;
  const r = await req('POST', '/api/clubs/join', { auth: token(OTHER), body: { name: 'bayou striders' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.created, false);
  assert.strictEqual(r.body.club.id, CLUB_VERIFIED);
  const after = db.prepare('SELECT COUNT(*) AS n FROM clubs').get().n;
  assert.strictEqual(after, before, 'no new club row should be inserted');
});

test('POST /join rejects empty name (400)', async () => {
  const r = await req('POST', '/api/clubs/join', { auth: token(USER), body: { name: '   ' } });
  assert.strictEqual(r.status, 400);
});

test('POST /join rejects names longer than 60 chars (400)', async () => {
  const r = await req('POST', '/api/clubs/join', { auth: token(USER), body: { name: 'x'.repeat(61) } });
  assert.strictEqual(r.status, 400);
});

test('POST /leave clears the user club_id', async () => {
  // OTHER is currently in Bayou Striders from an earlier test
  const r = await req('POST', '/api/clubs/leave', { auth: token(OTHER) });
  assert.strictEqual(r.status, 200);
  const db = getDb();
  const u = db.prepare('SELECT club_id FROM users WHERE id = ?').get(OTHER.id);
  assert.strictEqual(u.club_id, null);
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
  console.log(`\nclubs.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
