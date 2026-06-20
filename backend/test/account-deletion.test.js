// test/account-deletion.test.js — DELETE /api/auth/me (App Store / Play account deletion)
//   1) auth + password confirmation guards (401 / 400 / 401)
//   2) success permanently removes the user
//   3) CASCADE: the user's activities and badges are removed too
//   4) a challenge the user authored survives (created_by nulled, not deleted)
//   5) login fails afterward (account is really gone)
//
//   Run:  node test/account-deletion.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.ADMIN_KEY  = process.env.ADMIN_KEY  || 'test-admin-key';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

// ── better-sqlite3 → node:sqlite adapter (matches the other tests) ──
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
const authRouter = require('../routes/auth');

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/api/auth', authRouter);
let server, base;

const token = (user) => 'Bearer ' + jwt.sign(user, process.env.JWT_SECRET);

async function req(method, path, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const res = await fetch(base + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch { /* no body */ }
  return { status: res.status, body: parsed };
}

// ── Seed: a user with a real bcrypt hash, plus an activity, a badge, and a
//    challenge the user authored — to prove CASCADE deletes the first two and
//    the authored challenge survives with created_by nulled. ──────────────
const PASSWORD = 'correct horse';
let USER, CHALLENGE_ID;

function seed() {
  const db = getDb();
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const id = db.prepare(`
    INSERT INTO users (name, email, password, tier, pace_group)
    VALUES (?,?,?,?,?)
  `).run('Delete Me', 'del@t.com', hash, 'Standard', 'C').lastInsertRowid;
  USER = { id, email: 'del@t.com', tier: 'Standard', is_captain: false };

  db.prepare(`INSERT INTO activities (user_id, name, distance) VALUES (?,?,?)`)
    .run(id, 'Morning Run', 3.1);

  const badgeId = db.prepare(`INSERT INTO badges (name, icon, description) VALUES (?,?,?)`)
    .run('First Run', '🏃', 'Logged a first run').lastInsertRowid;
  db.prepare(`INSERT INTO user_badges (user_id, badge_id) VALUES (?,?)`).run(id, badgeId);

  CHALLENGE_ID = db.prepare(`
    INSERT INTO challenges (title, type, sport, goal_value, starts_at, ends_at, created_by)
    VALUES (?,?,?,?,?,?,?)
  `).run('June 100', 'distance', 'Run', 100, '2026-06-01', '2026-06-30', id).lastInsertRowid;
}

const counts = (id) => {
  const db = getDb();
  return {
    users:       db.prepare('SELECT COUNT(*) c FROM users WHERE id = ?').get(id).c,
    activities:  db.prepare('SELECT COUNT(*) c FROM activities WHERE user_id = ?').get(id).c,
    userBadges:  db.prepare('SELECT COUNT(*) c FROM user_badges WHERE user_id = ?').get(id).c,
  };
};

// ── Guards ──────────────────────────────────────────────────────
test('DELETE /me requires auth (401)', async () => {
  const r = await req('DELETE', '/api/auth/me', { body: { password: PASSWORD } });
  assert.strictEqual(r.status, 401);
});

test('DELETE /me without a password is rejected (400)', async () => {
  const r = await req('DELETE', '/api/auth/me', { auth: token(USER), body: {} });
  assert.strictEqual(r.status, 400);
  // Still here.
  assert.strictEqual(counts(USER.id).users, 1);
});

test('DELETE /me with the wrong password is rejected (401) and deletes nothing', async () => {
  const r = await req('DELETE', '/api/auth/me', { auth: token(USER), body: { password: 'nope' } });
  assert.strictEqual(r.status, 401);
  const c = counts(USER.id);
  assert.strictEqual(c.users, 1);
  assert.strictEqual(c.activities, 1, 'activity must survive a failed delete');
});

// ── Success ─────────────────────────────────────────────────────
test('DELETE /me with the correct password removes the user (200)', async () => {
  const before = counts(USER.id);
  assert.strictEqual(before.users, 1);
  assert.strictEqual(before.activities, 1);
  assert.strictEqual(before.userBadges, 1);

  const r = await req('DELETE', '/api/auth/me', { auth: token(USER), body: { password: PASSWORD } });
  assert.strictEqual(r.status, 200);
  assert.match(r.body.message, /deleted/i);

  const after = counts(USER.id);
  assert.strictEqual(after.users, 0, 'user row must be gone');
  assert.strictEqual(after.activities, 0, 'CASCADE must remove activities');
  assert.strictEqual(after.userBadges, 0, 'CASCADE must remove user_badges');
});

test('authored challenge survives deletion with created_by nulled', async () => {
  const db = getDb();
  const ch = db.prepare('SELECT id, created_by FROM challenges WHERE id = ?').get(CHALLENGE_ID);
  assert.ok(ch, 'challenge must still exist');
  assert.strictEqual(ch.created_by, null, 'created_by must be nulled, not block the delete');
});

test('login fails after deletion (account really gone)', async () => {
  const r = await req('POST', '/api/auth/login', { body: { email: 'del@t.com', password: PASSWORD } });
  assert.strictEqual(r.status, 401);
});

// ── Runner ──────────────────────────────────────────────────────
(async () => {
  getDb().exec(require('../db/schema'));
  seed();
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  for (const t of tests) {
    try { await t.fn(); console.log(`  ✓ ${t.name}`); passed++; }
    catch (e) { console.log(`  ✗ ${t.name}\n    ${e.message}`); failed++; }
  }

  server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
