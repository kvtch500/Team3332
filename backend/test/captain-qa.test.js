// test/captain-qa.test.js — Integration tests for member ↔ captain Q&A
//
// Covers: member lists captains → asks a question → it lands in the captain's inbox
// (open) → another captain can't see it → captain answers → member sees the answer
// → only the owning captain can answer → validation + auth guards.
//
//   Run:  node test/captain-qa.test.js   (from the backend/ folder)

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

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const app = express();
app.use(express.json());
app.use('/api/captain', captainRouter);
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
let MEMBER, CAP_A, CAP_B, Q_ID;

function seed() {
  const db = getDb();
  const mkUser = (name, email, is_captain) =>
    db.prepare(`INSERT INTO users (name, email, password, is_captain) VALUES (?,?,?,?)`)
      .run(name, email, 'x', is_captain ? 1 : 0).lastInsertRowid;

  MEMBER = { id: mkUser('Runner', 'runner@t.com', false), is_captain: false };
  CAP_A  = { id: mkUser('Cap A',  'capa@t.com',   true),  is_captain: true };
  CAP_B  = { id: mkUser('Cap B',  'capb@t.com',   true),  is_captain: true };
}

// ── Tests ───────────────────────────────────────────────────────

test('member can list captains (both A and B)', async () => {
  const r = await req('GET', '/api/captain/list', { auth: token(MEMBER) });
  assert.strictEqual(r.status, 200);
  const ids = r.body.captains.map(c => c.id);
  assert.ok(ids.includes(CAP_A.id) && ids.includes(CAP_B.id));
});

test('asking requires captain_id and question (400)', async () => {
  const r = await req('POST', '/api/captain/questions', { auth: token(MEMBER), body: { question: 'hi' } });
  assert.strictEqual(r.status, 400);
});

test('cannot ask a non-captain (404)', async () => {
  const r = await req('POST', '/api/captain/questions', { auth: token(MEMBER), body: { captain_id: MEMBER.id, question: 'hi' } });
  // MEMBER is not a captain → 404 (the self-check is only reachable for captains)
  assert.strictEqual(r.status, 404);
});

test('member asks Cap A a question', async () => {
  const r = await req('POST', '/api/captain/questions', {
    auth: token(MEMBER),
    body: { captain_id: CAP_A.id, question: 'How do I pace a long run?' },
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.question.status, 'open');
  Q_ID = r.body.question.id;
});

test("question appears in Cap A's inbox as open", async () => {
  const r = await req('GET', '/api/captain/questions/inbox', { auth: token(CAP_A) });
  assert.strictEqual(r.status, 200);
  const q = r.body.questions.find(x => x.id === Q_ID);
  assert.ok(q, 'should be in inbox');
  assert.strictEqual(q.status, 'open');
  assert.strictEqual(q.member_name, 'Runner');
});

test("question does NOT appear in Cap B's inbox", async () => {
  const r = await req('GET', '/api/captain/questions/inbox', { auth: token(CAP_B) });
  assert.ok(!r.body.questions.some(x => x.id === Q_ID), 'Cap B must not see Cap A\'s question');
});

test('member sees their own question (still unanswered)', async () => {
  const r = await req('GET', '/api/captain/questions/mine', { auth: token(MEMBER) });
  const q = r.body.questions.find(x => x.id === Q_ID);
  assert.ok(q);
  assert.strictEqual(q.captain_name, 'Cap A');
  assert.strictEqual(q.answer, null);
});

test('a captain cannot answer a question addressed to a different captain (404)', async () => {
  const r = await req('POST', `/api/captain/questions/${Q_ID}/answer`, { auth: token(CAP_B), body: { answer: 'nope' } });
  assert.strictEqual(r.status, 404);
});

test('answering requires non-empty answer (400)', async () => {
  const r = await req('POST', `/api/captain/questions/${Q_ID}/answer`, { auth: token(CAP_A), body: { answer: '   ' } });
  assert.strictEqual(r.status, 400);
});

test('non-captain cannot reach the answer endpoint (403)', async () => {
  const r = await req('POST', `/api/captain/questions/${Q_ID}/answer`, { auth: token(MEMBER), body: { answer: 'x' } });
  assert.strictEqual(r.status, 403);
});

test('Cap A answers the question', async () => {
  const r = await req('POST', `/api/captain/questions/${Q_ID}/answer`, {
    auth: token(CAP_A), body: { answer: 'Start easy, negative split the back half.' },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.question.status, 'answered');
  assert.ok(r.body.question.answered_at);
});

test('member now sees the answer', async () => {
  const r = await req('GET', '/api/captain/questions/mine', { auth: token(MEMBER) });
  const q = r.body.questions.find(x => x.id === Q_ID);
  assert.strictEqual(q.status, 'answered');
  assert.match(q.answer, /negative split/);
});

test("answered question sorts after open ones in the captain's inbox", async () => {
  // add a new open question, then verify ordering: open first
  await req('POST', '/api/captain/questions', { auth: token(MEMBER), body: { captain_id: CAP_A.id, question: 'New one?' } });
  const r = await req('GET', '/api/captain/questions/inbox', { auth: token(CAP_A) });
  assert.strictEqual(r.body.questions[0].status, 'open', 'open question should be on top');
});

test('inbox requires captain (403) and auth (401)', async () => {
  const noAuth = await req('GET', '/api/captain/questions/inbox');
  assert.strictEqual(noAuth.status, 401);
  const member = await req('GET', '/api/captain/questions/inbox', { auth: token(MEMBER) });
  assert.strictEqual(member.status, 403);
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
  console.log(`\ncaptain-qa.test.js — ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
