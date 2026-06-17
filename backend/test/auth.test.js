// test/auth.test.js — Regression tests for the 617 backend fixes:
//   1) PATCH /auth/me partial body — COALESCE must preserve fields the
//      client did NOT send (no clobbering bio/location/etc. with null).
//   2) avatar_url round-trip — a data-URL string saves and reads back intact,
//      and the 700 KB guard returns 413 for oversized payloads.
// Also covers the GET/PATCH auth guards so the profile surface stays locked.
//
//   Run:  node test/auth.test.js   (from the backend/ folder)

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
const authRouter = require('../routes/auth');

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
// Match server.js limit so the avatar size guard (not body-parser) is what trips.
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

// ── Seed ────────────────────────────────────────────────────────
let USER;

function seed() {
  const db = getDb();
  const id = db.prepare(`
    INSERT INTO users (name, email, password, tier, pace_group, bio, location, country, state, city)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run('Profile Pat', 'pat@t.com', 'x', 'Standard', 'C',
         'Original bio', 'Brooklyn, NY', 'USA', 'NY', 'Brooklyn').lastInsertRowid;
  USER = { id, email: 'pat@t.com', tier: 'Standard', is_captain: false };
}

// ── GET /me ─────────────────────────────────────────────────────
test('GET /me requires auth (401)', async () => {
  const r = await req('GET', '/api/auth/me');
  assert.strictEqual(r.status, 401);
});

test('GET /me returns the seeded profile without the password', async () => {
  const r = await req('GET', '/api/auth/me', { auth: token(USER) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.email, 'pat@t.com');
  assert.strictEqual(r.body.user.bio, 'Original bio');
  assert.strictEqual(r.body.user.password, undefined, 'password must never be serialized');
});

// ── PATCH /me — partial body / COALESCE preservation ────────────
test('PATCH /me requires auth (401)', async () => {
  const r = await req('PATCH', '/api/auth/me', { body: { name: 'Hacker' } });
  assert.strictEqual(r.status, 401);
});

test('PATCH /me with only { name } updates name and preserves everything else', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { name: 'Pat Renamed' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.name, 'Pat Renamed');
  // The fields we did NOT send must survive — this is the 617 regression.
  assert.strictEqual(r.body.user.bio, 'Original bio');
  assert.strictEqual(r.body.user.location, 'Brooklyn, NY');
  assert.strictEqual(r.body.user.city, 'Brooklyn');
  assert.strictEqual(r.body.user.pace_group, 'C');
});

test('PATCH /me with an empty body is a no-op (all fields preserved)', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: {} });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.name, 'Pat Renamed');
  assert.strictEqual(r.body.user.bio, 'Original bio');
  assert.strictEqual(r.body.user.location, 'Brooklyn, NY');
});

test('PATCH /me can update one field (bio) without disturbing the rest', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { bio: 'New bio text' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.bio, 'New bio text');
  assert.strictEqual(r.body.user.name, 'Pat Renamed');     // untouched
  assert.strictEqual(r.body.user.location, 'Brooklyn, NY'); // untouched
});

test('PATCH /me can update several fields at once', async () => {
  const r = await req('PATCH', '/api/auth/me', {
    auth: token(USER),
    body: { pace_group: 'A', city: 'Queens', state: 'NY' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.pace_group, 'A');
  assert.strictEqual(r.body.user.city, 'Queens');
  assert.strictEqual(r.body.user.bio, 'New bio text'); // from the prior test, preserved
});

// ── avatar_url round-trip + size guard ──────────────────────────
test('PATCH /me saves an avatar_url and reads it back intact', async () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const patch = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { avatar_url: dataUrl } });
  assert.strictEqual(patch.status, 200);
  assert.strictEqual(patch.body.user.avatar_url, dataUrl);

  // Confirm it persisted by re-reading via GET /me.
  const get = await req('GET', '/api/auth/me', { auth: token(USER) });
  assert.strictEqual(get.body.user.avatar_url, dataUrl);
  assert.strictEqual(get.body.user.bio, 'New bio text', 'avatar update must not clobber bio');
});

test('PATCH /me rejects an oversized avatar with 413', async () => {
  const tooBig = 'data:image/png;base64,' + 'A'.repeat(700001);
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { avatar_url: tooBig } });
  assert.strictEqual(r.status, 413);
});

test('PATCH /me rejects a non-string avatar_url with 413', async () => {
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { avatar_url: 12345 } });
  assert.strictEqual(r.status, 413);
});

test('a previously-saved avatar survives an unrelated PATCH', async () => {
  // The avatar set two tests ago must still be there after a name-only update.
  const r = await req('PATCH', '/api/auth/me', { auth: token(USER), body: { name: 'Pat Final' } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.user.avatar_url && r.body.user.avatar_url.startsWith('data:image/png'),
            'avatar_url should persist through a name-only patch');
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
  console.log(`\nauth.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
