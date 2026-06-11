// test/group-runs.test.js — Integration tests for the group-run approval flow
//
// Covers: captain creates run (pending) → invisible to members → admin approves
// → visible in /runs/upcoming → one-click join/leave → admin reject hides it.
// Same harness as clubs.test.js: real routers + real schema on in-memory SQLite.
//
//   Run:  node test/group-runs.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_KEY  = process.env.ADMIN_KEY  || 'test-admin-key';
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
const captainRouter = require('../routes/captain');
const adminRouter   = require('../routes/admin');

// ── Tiny test harness ───────────────────────────────────────────
let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── App under test ──────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use('/api/captain', captainRouter);
app.use('/api/admin', adminRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

async function req(method, path, { auth, admin, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth)  headers.Authorization = auth;
  if (admin) headers['x-admin-key'] = process.env.ADMIN_KEY;
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
let CAPTAIN, MEMBER, RUN_ID, PAST_RUN_ID;
const FUTURE = '2027-01-01 07:00:00';
const PAST   = '2020-01-01 07:00:00';

function seed() {
  const db = getDb();
  const mkUser = (name, email, is_captain) =>
    db.prepare(`INSERT INTO users (name, email, password, is_captain) VALUES (?,?,?,?)`)
      .run(name, email, 'x', is_captain ? 1 : 0).lastInsertRowid;

  const cap = mkUser('Cap',    'cap@t.com',    true);
  const mem = mkUser('Runner', 'runner@t.com', false);
  CAPTAIN = { id: cap, is_captain: true,  tier: 'Elite' };
  MEMBER  = { id: mem, is_captain: false, tier: 'Standard' };

  // A pre-approved run in the past — must never show as "upcoming"
  PAST_RUN_ID = db.prepare(`
    INSERT INTO group_runs (captain_id, title, run_type, scheduled_at, approval_status)
    VALUES (?, 'Old Run', 'Virtual', ?, 'approved')
  `).run(cap, PAST).lastInsertRowid;
}

// ── Tests ───────────────────────────────────────────────────────

test('non-captain cannot create a group run (403)', async () => {
  const r = await req('POST', '/api/captain/runs', { auth: token(MEMBER), body: { title: 'Nope', scheduled_at: FUTURE } });
  assert.strictEqual(r.status, 403);
});

test('captain creates a run — starts as approval_status=pending', async () => {
  const r = await req('POST', '/api/captain/runs', {
    auth: token(CAPTAIN),
    body: { title: 'Saturday Long Run', run_type: 'In-Person', location: 'City Park', scheduled_at: FUTURE },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.run.approval_status, 'pending');
  RUN_ID = r.body.run.id;
});

test('pending run is NOT visible in member upcoming list', async () => {
  const r = await req('GET', '/api/captain/runs/upcoming', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  assert.ok(!r.body.runs.some(x => x.id === RUN_ID), 'pending run must be hidden');
});

test('member cannot join a pending run (404)', async () => {
  const r = await req('POST', `/api/captain/runs/${RUN_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 404);
});

test('upcoming list requires auth (401)', async () => {
  const r = await req('GET', '/api/captain/runs/upcoming');
  assert.strictEqual(r.status, 401);
});

test('admin sees the run as pending with captain info', async () => {
  const r = await req('GET', '/api/admin/group-runs', { admin: true });
  assert.strictEqual(r.status, 200);
  const run = r.body.runs.find(x => x.id === RUN_ID);
  assert.ok(run, 'run should be listed for admin');
  assert.strictEqual(run.approval_status, 'pending');
  assert.strictEqual(run.captain_name, 'Cap');
  // pending sorts first
  assert.strictEqual(r.body.runs[0].id, RUN_ID);
});

test('admin stats counts pending runs', async () => {
  const r = await req('GET', '/api/admin/stats', { admin: true });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.pending_runs, 1);
});

test('admin approval endpoint rejects bad status (400) and requires key (401)', async () => {
  const bad = await req('PATCH', `/api/admin/group-runs/${RUN_ID}`, { admin: true, body: { approval_status: 'maybe' } });
  assert.strictEqual(bad.status, 400);
  const noKey = await req('PATCH', `/api/admin/group-runs/${RUN_ID}`, { body: { approval_status: 'approved' } });
  assert.strictEqual(noKey.status, 401);
});

test('admin approves the run', async () => {
  const r = await req('PATCH', `/api/admin/group-runs/${RUN_ID}`, { admin: true, body: { approval_status: 'approved' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.run.approval_status, 'approved');
});

test('approved future run appears in upcoming; past run does not', async () => {
  const r = await req('GET', '/api/captain/runs/upcoming', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const run = r.body.runs.find(x => x.id === RUN_ID);
  assert.ok(run, 'approved run should be visible');
  assert.strictEqual(run.captain_name, 'Cap');
  assert.strictEqual(run.joined, 0);
  assert.strictEqual(run.member_count, 0);
  assert.ok(!r.body.runs.some(x => x.id === PAST_RUN_ID), 'past run must not be listed');
});

test('member joins with one click; duplicate join is 409', async () => {
  const r = await req('POST', `/api/captain/runs/${RUN_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const dup = await req('POST', `/api/captain/runs/${RUN_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(dup.status, 409);
});

test('upcoming list reflects joined=1 and member_count=1', async () => {
  const r = await req('GET', '/api/captain/runs/upcoming', { auth: token(MEMBER) });
  const run = r.body.runs.find(x => x.id === RUN_ID);
  assert.strictEqual(run.joined, 1);
  assert.strictEqual(run.member_count, 1);
  // a different user sees the count but not joined
  const other = await req('GET', '/api/captain/runs/upcoming', { auth: token(CAPTAIN) });
  const run2 = other.body.runs.find(x => x.id === RUN_ID);
  assert.strictEqual(run2.joined, 0);
  assert.strictEqual(run2.member_count, 1);
});

test('captain sees the joined member on the roster', async () => {
  const r = await req('GET', `/api/captain/runs/${RUN_ID}/members`, { auth: token(CAPTAIN) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.members.length, 1);
  assert.strictEqual(r.body.members[0].name, 'Runner');
});

test('member leaves; leaving again is 404', async () => {
  const r = await req('POST', `/api/captain/runs/${RUN_ID}/leave`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const again = await req('POST', `/api/captain/runs/${RUN_ID}/leave`, { auth: token(MEMBER) });
  assert.strictEqual(again.status, 404);
  const list = await req('GET', '/api/captain/runs/upcoming', { auth: token(MEMBER) });
  assert.strictEqual(list.body.runs.find(x => x.id === RUN_ID).member_count, 0);
});

test('admin rejects the run — it disappears from upcoming and joins are blocked', async () => {
  const r = await req('PATCH', `/api/admin/group-runs/${RUN_ID}`, { admin: true, body: { approval_status: 'rejected' } });
  assert.strictEqual(r.status, 200);
  const list = await req('GET', '/api/captain/runs/upcoming', { auth: token(MEMBER) });
  assert.ok(!list.body.runs.some(x => x.id === RUN_ID), 'rejected run must be hidden');
  const join = await req('POST', `/api/captain/runs/${RUN_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(join.status, 404);
});

test('captain still sees their run (with approval_status) in their own list', async () => {
  const r = await req('GET', '/api/captain/runs', { auth: token(CAPTAIN) });
  assert.strictEqual(r.status, 200);
  const run = r.body.runs.find(x => x.id === RUN_ID);
  assert.strictEqual(run.approval_status, 'rejected');
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
  console.log(`\ngroup-runs.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
