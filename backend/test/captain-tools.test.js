// test/captain-tools.test.js — Integration tests for the three Captain Tools:
//   • Team announcements (captain posts → all members see → captain/admin delete)
//   • Member-of-the-Month nominations (captain nominates → admin tally)
//   • Members picker used by the nomination form
//
//   Run:  node test/captain-tools.test.js   (from the backend/ folder)

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

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
app.use(express.json());
app.use('/api/captain', captainRouter);
app.use('/api/admin', adminRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

async function req(method, path, { auth, body, adminKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  if (adminKey) headers['x-admin-key'] = adminKey;
  const res = await fetch(base + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}
const ADMIN = process.env.ADMIN_KEY;

// ── Seed ────────────────────────────────────────────────────────
let MEMBER, NOMINEE, CAP_A, CAP_B;

function seed() {
  const db = getDb();
  const mkUser = (name, email, is_captain) =>
    db.prepare(`INSERT INTO users (name, email, password, is_captain) VALUES (?,?,?,?)`)
      .run(name, email, 'x', is_captain ? 1 : 0).lastInsertRowid;

  MEMBER  = { id: mkUser('Runner',  'runner@t.com',  false), is_captain: false };
  NOMINEE = { id: mkUser('Nominee', 'nominee@t.com', false), is_captain: false };
  CAP_A   = { id: mkUser('Cap A',   'capa@t.com',    true),  is_captain: true };
  CAP_B   = { id: mkUser('Cap B',   'capb@t.com',    true),  is_captain: true };
}

// ── ANNOUNCEMENTS ───────────────────────────────────────────────
let ANN_ID;

test('non-captain cannot post an announcement (403)', async () => {
  const r = await req('POST', '/api/captain/announcements', { auth: token(MEMBER), body: { title: 'x', body: 'y' } });
  assert.strictEqual(r.status, 403);
});

test('posting requires title and body (400)', async () => {
  const r = await req('POST', '/api/captain/announcements', { auth: token(CAP_A), body: { title: 'Only title' } });
  assert.strictEqual(r.status, 400);
});

test('captain posts an announcement (201)', async () => {
  const r = await req('POST', '/api/captain/announcements', {
    auth: token(CAP_A), body: { title: 'Saturday run moved to 7am', body: 'Meet at the park entrance.' },
  });
  assert.strictEqual(r.status, 201);
  ANN_ID = r.body.announcement.id;
  assert.ok(ANN_ID);
});

test('any member sees the announcement in the team feed', async () => {
  const r = await req('GET', '/api/captain/announcements', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const a = r.body.announcements.find(x => x.id === ANN_ID);
  assert.ok(a, 'announcement should be in the feed');
  assert.strictEqual(a.captain_name, 'Cap A');
});

test("captain sees their own announcement in /mine", async () => {
  const r = await req('GET', '/api/captain/announcements/mine', { auth: token(CAP_A) });
  assert.ok(r.body.announcements.some(x => x.id === ANN_ID));
});

test('another captain cannot delete it (404)', async () => {
  const r = await req('DELETE', `/api/captain/announcements/${ANN_ID}`, { auth: token(CAP_B) });
  assert.strictEqual(r.status, 404);
});

test('admin can list all announcements', async () => {
  const r = await req('GET', '/api/admin/announcements', { adminKey: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.announcements.some(x => x.id === ANN_ID));
});

test('admin requires the key (401)', async () => {
  const r = await req('GET', '/api/admin/announcements');
  assert.strictEqual(r.status, 401);
});

test('owning captain can delete their announcement (200)', async () => {
  const r = await req('DELETE', `/api/captain/announcements/${ANN_ID}`, { auth: token(CAP_A) });
  assert.strictEqual(r.status, 200);
  const feed = await req('GET', '/api/captain/announcements', { auth: token(MEMBER) });
  assert.ok(!feed.body.announcements.some(x => x.id === ANN_ID), 'deleted announcement should be gone');
});

test('admin can delete any announcement (200)', async () => {
  const posted = await req('POST', '/api/captain/announcements', { auth: token(CAP_B), body: { title: 'Gear sale', body: '20% off this week' } });
  const id = posted.body.announcement.id;
  const del = await req('DELETE', `/api/admin/announcements/${id}`, { adminKey: ADMIN });
  assert.strictEqual(del.status, 200);
});

// ── NOMINATIONS ─────────────────────────────────────────────────

test('members picker requires captain (403 for member)', async () => {
  const r = await req('GET', '/api/captain/members', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 403);
});

test('members picker excludes the requesting captain', async () => {
  const r = await req('GET', '/api/captain/members', { auth: token(CAP_A) });
  assert.strictEqual(r.status, 200);
  assert.ok(!r.body.members.some(m => m.id === CAP_A.id), 'should not list self');
  assert.ok(r.body.members.some(m => m.id === NOMINEE.id), 'should list other members');
});

test('non-captain cannot nominate (403)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(MEMBER), body: { nominee_id: NOMINEE.id, reason: 'great' } });
  assert.strictEqual(r.status, 403);
});

test('nomination requires nominee_id and reason (400)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_A), body: { nominee_id: NOMINEE.id } });
  assert.strictEqual(r.status, 400);
});

test('captain cannot nominate themselves (400)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_A), body: { nominee_id: CAP_A.id, reason: 'me!' } });
  assert.strictEqual(r.status, 400);
});

test('cannot nominate a nonexistent member (404)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_A), body: { nominee_id: 99999, reason: 'ghost' } });
  assert.strictEqual(r.status, 404);
});

test('captain nominates a member (201)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_A), body: { nominee_id: NOMINEE.id, reason: 'Showed up to every run.' } });
  assert.strictEqual(r.status, 201);
  assert.match(r.body.nomination.month, /^\d{4}-\d{2}$/);
});

test('same captain cannot nominate the same member twice this month (409)', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_A), body: { nominee_id: NOMINEE.id, reason: 'again' } });
  assert.strictEqual(r.status, 409);
});

test('a different captain CAN also nominate the same member', async () => {
  const r = await req('POST', '/api/captain/nominations', { auth: token(CAP_B), body: { nominee_id: NOMINEE.id, reason: 'Mentored newcomers.' } });
  assert.strictEqual(r.status, 201);
});

test("captain sees their nominations in /mine", async () => {
  const r = await req('GET', '/api/captain/nominations/mine', { auth: token(CAP_A) });
  assert.ok(r.body.nominations.some(n => n.nominee_name === 'Nominee'));
});

test('admin tally counts both nominations for the nominee', async () => {
  const r = await req('GET', '/api/admin/nominations', { adminKey: ADMIN });
  assert.strictEqual(r.status, 200);
  const row = r.body.tally.find(t => t.nominee_id === NOMINEE.id);
  assert.ok(row, 'nominee should appear in tally');
  assert.strictEqual(row.nomination_count, 2);
  assert.strictEqual(r.body.detail.length >= 2, true);
});

test('admin tally for an empty month returns no rows', async () => {
  const r = await req('GET', '/api/admin/nominations?month=2000-01', { adminKey: ADMIN });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.month, '2000-01');
  assert.strictEqual(r.body.tally.length, 0);
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
  console.log(`\ncaptain-tools.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
