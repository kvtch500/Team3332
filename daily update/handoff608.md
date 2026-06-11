---
author: claude
type: handoff
id: handoff608
date: 2026-06-08
---

# HANDOFF 608 — Monday, June 8 2026 (evening session)

## Where Things Stand
team3332.com is live and stable. All prior-session work that was flagged "uncommitted" is now committed and pushed — working tree is clean and up to date with origin/main. This was a short session focused on **starting real test coverage**.

## What This Session Shipped
- **First committed automated test suite:** `backend/test/clubs.test.js` — 12 integration tests for the clubs + member-location API (`routes/clubs.js`), the most recently shipped backend feature, which had gone out with **no committed tests**.
  - Drives the **real Express router over HTTP** against a fresh in-memory DB built from the **real schema + boot migrations** (`db/index.js`) — no DB-layer mocks; only JWT tokens are minted directly.
  - Coverage: auth gating (401), verified-only listing + member_count ordering, `?search=` LIKE filter, roster aggregation (total miles/runs) sorted desc with location fields surfaced, 404s for pending + nonexistent clubs, join-existing (created=false) vs. create-new-as-pending (created=true), case-insensitive dedupe (no duplicate row), empty-name and >60-char validation (400), and leave (club_id → null).
  - **Result: 12 passed, 0 failed.** Verified non-tautological via a mutation check (dropping the verified filter + auto-verifying new clubs → 2 tests correctly fail).

## Sandbox Gotcha Handled
The Mac-compiled `better-sqlite3` native binary won't load in the Linux sandbox ("invalid ELF header"). The test ships a small adapter that shims `require('better-sqlite3')` onto Node 22's built-in `node:sqlite`, so the real db layer + route run **unmodified**. On the Mac (native binary loads), run with `USE_NATIVE_SQLITE=1 node test/clubs.test.js` to skip the shim.

## ⚠️ Needs Commit From Mac (edit-only agreement)
The test file is written but NOT committed. From the Mac:
```
cd ~/Desktop/claude\ ai/3332 && rm -f .git/index.lock && git add backend/test/clubs.test.js && git commit -m "Add clubs API integration tests (12 cases)" && git push origin main
```

## Open Items (carried forward)
- **Recurring admin task:** verify pending run clubs in the admin panel as members submit them — clubs only display publicly once verified.
- Test account from phone verification — delete/deactivate if unwanted.
- GPX import quirk (known, unfixed): imports always save as type "Run" — form drops the Run/Walk toggle.
- Pre-launch: lawyer review of ToS/Privacy before live Stripe keys; gold shade review; public profiles; referral system; PostgreSQL migration ~2 months pre-launch.

## Next Big Build — Capacitor Native Wrapper (still the milestone)
Gated on Ernest's prerequisites (1–2 day lead time): Apple Developer enrollment ($99/yr), Google Play Console ($25), Xcode install. Full session plan in handoff630.md (scaffold → background GPS → native polish → store submission → buffer). Decision pending: subscribe on web, log in on app, to avoid Apple's 30% cut.

## Start Here Next Time
1. Commit + push the clubs test (command above).
2. Easy continuation: add matching test suites for other untested routes — `activities.js`/GPX parsing and `challenges.js` sport-filtering are the natural next targets (same in-memory + node:sqlite-shim pattern as clubs.test.js).
3. Or kick off the Capacitor wrapper once Apple/Google accounts are ready.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/team3332 (local clone = the `3332` folder)
- Stack: static HTML/React (Babel) frontend · Node/Express + SQLite on Railway volume · Stripe test mode · Resend email
- Test pattern: `backend/test/*.test.js`, run with `node test/<file>` from `backend/` (uses node:sqlite shim in sandbox)
- Full history: PROGRESS.md · prior session: handoff630.md
