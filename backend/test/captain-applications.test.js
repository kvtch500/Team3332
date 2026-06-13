// test/captain-applications.test.js — Integration tests for "Apply to become captain"
//
// Covers: member applies (stored, pending) → duplicate pending blocked → admin sees it
// in queue → admin approves → member promoted to is_captain → already-captain can't apply.
// Same harness as group-runs.test.js: real routers + real schema on in-memory SQLite.
//
//   Run:  node test/captain-applications.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_KEY  = process.env.ADMIN_KEY  || 'test-admin-key';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');

// ── better-sqlite3 → node:sqlite adapter ───────────────────────
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
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

// ── Seed ────────────────────────────────────────────────────────
let MEMBER, CAPTAIN, APP_ID;

function seed() {
  const db = getDb();
  const mkUser = (name, email, is_captain) =>
    db.prepare(`INSERT INTO users (name, email, password, is_captain) VALUES (?,?,?,?)`)
      .run(name, email, 'x', is_captain ? 1 : 0).lastInsertRowid;

  MEMBER  = { id: mkUser('Runner', 'runner@t.com', false), is_captain: false, tier: 'Standard' };
  CAPTAIN = { id: mkUser('Cap',    'cap@t.com',    true),  is_captain: true,  tier: 'Elite' };
}

// ── Tests ───────────────────────────────────────────────────────

test('status is null before any application', async () => {
  const r = await req('GET', '/api/captain/apply/status', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.application, null);
});

test('apply requires a motivation (400)', async () => {
  const r = await req('POST', '/api/captain/apply', { auth: token(MEMBER), body: { experience: 'I run a lot' } });
  assert.strictEqual(r.status, 400);
});

test('member applies — stored as pending', async () => {
  const r = await req('POST', '/api/captain/apply', {
    auth: token(MEMBER),
    body: { motivation: 'I want to lead Saturday runs', experience: '5 years pacing 10Ks' },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.application.status, 'pending');
  assert.strictEqual(r.body.application.motivation, 'I want to lead Saturday runs');
  APP_ID = r.body.application.id;
});

test('apply/status now returns the pending application', async () => {
  const r = await req('GET', '/api/captain/apply/status', { auth: token(MEMBER) });
  assert.strictEqual(r.body.application.id, APP_ID);
  assert.strictEqual(r.body.application.status, 'pending');
});

test('a second application while one is pending is blocked (409)', async () => {
  const r = await req('POST', '/api/captain/apply', { auth: token(MEMBER), body: { motivation: 'again' } });
  assert.strictEqual(r.status, 409);
});

test('an existing captain cannot apply (400)', async () => {
  const r = await req('POST', '/api/captain/apply', { auth: token(CAPTAIN), body: { motivation: 'me too' } });
  assert.strictEqual(r.status, 400);
});

test('admin sees the application, pending first, with member info', async () => {
  const r = await req('GET', '/api/admin/captain-applications', { admin: true });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.applications[0].id, APP_ID);
  assert.strictEqual(r.body.applications[0].user_name, 'Runner');
  assert.strictEqual(r.body.applications[0].status, 'pending');
});

test('admin stats counts the pending application', async () => {
  const r = await req('GET', '/api/admin/stats', { admin: true });
  assert.strictEqual(r.body.pending_applications, 1);
});

test('admin endpoint rejects bad status (400) and requires key (401)', async () => {
  const bad = await req('PATCH', `/api/admin/captain-applications/${APP_ID}`, { admin: true, body: { status: 'maybe' } });
  assert.strictEqual(bad.status, 400);
  const noKey = await req('PATCH', `/api/admin/captain-applications/${APP_ID}`, { body: { status: 'approved' } });
  assert.strictEqual(noKey.status, 401);
});

test('admin approves — application approved AND member promoted to captain', async () => {
  const r = await req('PATCH', `/api/admin/captain-applications/${APP_ID}`, { admin: true, body: { status: 'approved' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.application.status, 'approved');
  assert.ok(r.body.application.reviewed_at, 'reviewed_at should be set');

  const db = getDb();
  const u = db.prepare('SELECT is_captain FROM users WHERE id = ?').get(MEMBER.id);
  assert.strictEqual(u.is_captain, 1, 'member must now be a captain');
});

test('newly-promoted member can use a captain-only endpoint', async () => {
  // token now reflects captain status (member re-logs in real life)
  const r = await req('GET', '/api/captain/questions/inbox', { auth: token({ ...MEMBER, is_captain: true }) });
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.questions));
});

test('admin reject sets reviewed_at and does not promote', async () => {
  const db = getDb();
  // fresh applicant
  const uid = db.prepare(`INSERT INTO users (name, email, password) VALUES ('Bob','bob@t.com','x')`).run().lastInsertRowid;
  const BOB = { id: uid, is_captain: false };
  const a = await req('POST', '/api/captain/apply', { auth: token(BOB), body: { motivation: 'pick me' } });
  const r = await req('PATCH', `/api/admin/captain-applications/${a.body.application.id}`, { admin: true, body: { status: 'rejected' } });
  assert.strictEqual(r.body.application.status, 'rejected');
  assert.ok(r.body.application.reviewed_at);
  const u = db.prepare('SELECT is_captain FROM users WHERE id = ?').get(uid);
  assert.strictEqual(u.is_captain, 0, 'rejected applicant must NOT be a captain');
});

// ── Runner ──────────────────────────────────────────────────────
(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  seed();

  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`  ✓ ${t.name}`); }
    catch (err) { failed++; console.log(`  ✗ ${t.name}`); console.log(`      ${err.message}`); }
  }

  server.close();
  console.log(`\ncaptain-applications.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
