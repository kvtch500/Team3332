---
author: claude
type: handoff
id: handoff611
date: 2026-06-11
---

# HANDOFF 611 — Thursday, June 11 2026

## Where Things Stand
team3332.com live and stable. This session shipped the **group-run approval flow** — the "lead runs" half of the captain feature is now complete end to end. Everything is committed and pushed from the Mac (including the clubs test that was pending from handoff608). Working tree should be clean.

## What This Session Shipped
**Group Runs feature (captain → admin → member flow):**
- **Schema:** `group_runs.approval_status` (pending/approved/rejected), auto-migration in `db/index.js` backfills pre-existing runs as approved (one-time, fires only when column is added).
- **Backend (`routes/captain.js`):** member-facing `GET /api/captain/runs/upcoming` (approved + future runs only, with `joined` flag + member_count), `POST /runs/:id/leave`, join locked to approved runs. **Re-approval rule (Ernest's call: "admin always approves"):** any captain edit to run details resets approval to pending; status-only changes (completed/cancelled) do NOT re-trigger approval.
- **Backend (`routes/admin.js`):** `GET /group-runs` (pending first), `PATCH /group-runs/:id` approve/reject, `pending_runs` count in stats.
- **App (`app/index.html`):** new **Group Runs** tab (sidebar, Team section) — one-click Join/Leave per run. Captain Panel shows "awaiting approval"/"rejected" badges; create toast says run goes live after admin approval.
- **Admin (`admin/index.html`):** new Group Runs page — pending-approval queue on top, full history below; gold "X runs awaiting approval — Review →" banner on Overview.
- **Bug fixed:** creating/editing a run with omitted description/location crashed (SQLite can't bind undefined) — was live in production, caught by the new tests.
- **Tests:** `backend/test/group-runs.test.js` — **18 passed, 0 failed** (full lifecycle incl. re-approval rules). clubs.test.js still 12/12.

## Captain Feature Status
- ✅ Lead runs (virtual + in-person): create → admin approve → members discover & join → roster. DONE.
- ❌ **Answer member questions: NOT BUILT.** No Q&A/messaging anywhere. This is the other half of the captain role. Simplest design discussed: a questions inbox per captain.
- ❌ "Apply to become captain" is still a stub (returns a message, stores nothing, notifies nobody).

## Recurring Admin Tasks
- Verify pending run clubs in admin panel (clubs only show publicly once verified).
- **NEW: approve pending group runs** — captains' runs are invisible to members until approved (admin panel → Group Runs).

## Open Items (carried forward)
- Test account from phone verification — delete/deactivate if unwanted.
- GPX import quirk (known, unfixed): imports always save as type "Run" — form drops the Run/Walk toggle.
- Pre-launch: lawyer review of ToS/Privacy before live Stripe keys; gold shade review; public profiles; referral system; PostgreSQL migration ~2 months pre-launch.
- Easy test continuation: `activities.js`/GPX and `challenges.js` suites (same in-memory + node:sqlite-shim pattern).

## Next Big Build — Capacitor Native Wrapper (still the milestone)
Gated on Ernest's prerequisites: Apple Developer enrollment ($99/yr), Google Play Console ($25), Xcode install. Full session plan in handoff630.md. Decision pending: subscribe on web, log in on app, to avoid Apple's 30% cut.

## Start Here Next Time
1. Captain Q&A feature (member asks → captain inbox → reply) — completes the captain role.
2. Or make "Apply to become captain" real (store applications, surface in admin panel).
3. Or kick off the Capacitor wrapper once Apple/Google accounts are ready.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/team3332 (local clone = the `3332` folder)
- Stack: static HTML/React (Babel) frontend · Node/Express + SQLite on Railway volume · Stripe test mode · Resend email
- Tests: `cd backend && node test/<file>` (node:sqlite shim auto-applies in sandbox)
- Prior sessions: handoff608.md · handoff630.md
