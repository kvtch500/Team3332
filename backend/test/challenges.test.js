// test/challenges.test.js — Integration tests for challenges:
// captain creates (the "Propose a Team Challenge" tool) → members list/join/leave,
// validation, tier gating, and captain-only creation.
//
//   Run:  node test/challenges.test.js   (from the backend/ folder)

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
const challengesRouter = require('../routes/challenges');

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
app.use(express.json());
app.use('/api/challenges', challengesRouter);
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

const future = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString(); };

// ── Seed ────────────────────────────────────────────────────────
let MEMBER, ELITE, CAP;

function seed() {
  const db = getDb();
  const mkUser = (name, email, tier, is_captain) =>
    db.prepare(`INSERT INTO users (name, email, password, tier, is_captain) VALUES (?,?,?,?,?)`)
      .run(name, email, 'x', tier, is_captain ? 1 : 0).lastInsertRowid;

  MEMBER = { id: mkUser('Standard Sam', 'sam@t.com', 'Standard', false), tier: 'Standard', is_captain: false };
  ELITE  = { id: mkUser('Elite Ella',   'ella@t.com', 'Elite',   false), tier: 'Elite',    is_captain: false };
  CAP    = { id: mkUser('Captain Cal',  'cal@t.com',  'Elite',   true),  tier: 'Elite',    is_captain: true };
}

let CH_ID, ELITE_CH_ID;

test('non-captain cannot create a challenge (403)', async () => {
  const r = await req('POST', '/api/challenges', { auth: token(MEMBER), body: { title: 'x', type: 'distance', goal_value: 10, starts_at: future(0), ends_at: future(30) } });
  assert.strictEqual(r.status, 403);
});

test('create requires the core fields (400)', async () => {
  const r = await req('POST', '/api/challenges', { auth: token(CAP), body: { title: 'Missing goal' } });
  assert.strictEqual(r.status, 400);
});

test('invalid sport is rejected (400)', async () => {
  const r = await req('POST', '/api/challenges', { auth: token(CAP), body: { title: 'Bad sport', type: 'distance', goal_value: 10, sport: 'Swim', starts_at: future(0), ends_at: future(30) } });
  assert.strictEqual(r.status, 400);
});

test('captain creates a challenge (201)', async () => {
  const r = await req('POST', '/api/challenges', {
    auth: token(CAP),
    body: { title: 'June 100-Mile Club', description: 'Log 100 miles', type: 'distance', sport: 'Run', goal_value: 100, reward: 'Badge', starts_at: future(0), ends_at: future(30) },
  });
  assert.strictEqual(r.status, 201);
  CH_ID = r.body.challenge.id;
  assert.strictEqual(r.body.challenge.created_by, CAP.id);
});

test('member lists active challenges and sees it unjoined', async () => {
  const r = await req('GET', '/api/challenges', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const c = r.body.challenges.find(x => x.id === CH_ID);
  assert.ok(c, 'challenge should be listed');
  assert.strictEqual(c.joined, 0);
});

test('member joins the challenge (200)', async () => {
  const r = await req('POST', `/api/challenges/${CH_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
});

test('joining twice returns 409', async () => {
  const r = await req('POST', `/api/challenges/${CH_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 409);
});

test('list now shows joined=1 and a participant', async () => {
  const r = await req('GET', '/api/challenges', { auth: token(MEMBER) });
  const c = r.body.challenges.find(x => x.id === CH_ID);
  assert.strictEqual(c.joined, 1);
  assert.ok(c.participant_count >= 1);
});

test('member leaves the challenge (200)', async () => {
  const r = await req('DELETE', `/api/challenges/${CH_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
});

test('leaving when not joined returns 404', async () => {
  const r = await req('DELETE', `/api/challenges/${CH_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 404);
});

test('joining a nonexistent challenge returns 404', async () => {
  const r = await req('POST', `/api/challenges/99999/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 404);
});

test('captain creates an Elite-only challenge (201)', async () => {
  const r = await req('POST', '/api/challenges', {
    auth: token(CAP),
    body: { title: 'Elite Streak', type: 'streak', sport: 'Run', goal_value: 7, tier_req: 'Elite', starts_at: future(0), ends_at: future(30) },
  });
  assert.strictEqual(r.status, 201);
  ELITE_CH_ID = r.body.challenge.id;
});

test('Standard member is blocked from an Elite-only challenge (403)', async () => {
  const r = await req('POST', `/api/challenges/${ELITE_CH_ID}/join`, { auth: token(MEMBER) });
  assert.strictEqual(r.status, 403);
});

test('Elite member can join the Elite-only challenge (200)', async () => {
  const r = await req('POST', `/api/challenges/${ELITE_CH_ID}/join`, { auth: token(ELITE) });
  assert.strictEqual(r.status, 200);
});

test('creating a challenge requires auth (401)', async () => {
  const r = await req('POST', '/api/challenges', { body: { title: 'x', type: 'distance', goal_value: 10, starts_at: future(0), ends_at: future(30) } });
  assert.strictEqual(r.status, 401);
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
  console.log(`\nchallenges.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
