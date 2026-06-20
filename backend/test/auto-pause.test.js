// test/auto-pause.test.js — the opt-in auto_pause profile toggle (June 2026)
//   1) defaults to 0 for a new user
//   2) PATCH /auth/me { auto_pause: true|false } persists as 1|0 and reads back
//   3) a PATCH that omits auto_pause preserves it (COALESCE, like the other fields)
//
//   Run:  node test/auto-pause.test.js   (from the backend/ folder)

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.DB_PATH = ':memory:';

const assert  = require('node:assert');
const express = require('express');
const jwt     = require('jsonwebtoken');

if (!process.env.USE_NATIVE_SQLITE) {
  const { DatabaseSync } = require('node:sqlite');
  class Compat {
    constructor(p) { this._db = new DatabaseSync(p || ':memory:'); }
    exec(sql) { this._db.exec(sql); return this; }
    prepare(sql) { return this._db.prepare(sql); }
    close() { this._db.close(); }
  }
  const Module = require('node:module');
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'better-sqlite3') return Compat;
    return orig.call(this, req, ...rest);
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
    method, headers, body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  try { parsed = await res.json(); } catch {}
  return { status: res.status, body: parsed };
}

let USER;
function seed() {
  const db = getDb();
  const id = db.prepare(`INSERT INTO users (name, email, password, pace_group) VALUES (?,?,?,?)`)
    .run('Pause Pat', 'pause@t.com', 'x', 'C').lastInsertRowid;
  USER = { id, email: 'pause@t.com', tier: 'Standard', is_captain: false };
}

test('new user defaults to auto_pause = 0', async () => {
  const r = await req('GET', '/api/auth/me', { auth: token(USER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.auto_pause, 0);
});

test('PATCH /me { auto_pause: true } persists as 1', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { auto_pause: true } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.auto_pause, 1);
  const g = await req('GET', '/api/auth/me', { auth: token(USER) });
  assert.strictEqual(g.body.user.auto_pause, 1, 'must read back as 1');
});

test('a PATCH that omits auto_pause preserves it (still 1)', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { name: 'Renamed' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.name, 'Renamed');
  assert.strictEqual(r.body.user.auto_pause, 1, 'auto_pause must survive an unrelated PATCH');
});

test('PATCH /me { auto_pause: false } persists as 0', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { auto_pause: false } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.auto_pause, 0);
});

(async () => {
  getDb();
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
