---
author: claude
type: handoff
id: handoff551
date: 2026-06-07
---

# HANDOFF 551 — Sunday, June 7 2026 (late session)

## Where Things Stand
team3332.com is live (apex + www, SSL, launch checklist closed). The GPS recorder is phone-tested and verified. All of today's features are built, tested, and deployed — last push confirmed by Ernest ("done").

## What This Session Shipped
1. **Walker speed (mph)** — Walk activities show speed in mph (recorder live view, review screen, dashboard, activity log); runs keep min/mi pace. Helpers: `fmtSpeed`, `durSecs`, `activityStat` in `app/index.html`.
2. **Share button** — 📤 on the recorder review screen and every activity card. Canvas-rendered 1080×1080 branded card (activity name, gold route map, distance/time/pace-or-speed) → native share sheet; falls back to text share, then PNG download. $0, all client-side.
   - Footer reads **Team**3332 — "Team" white, "3332" gold, centered (Ernest's spec).
3. **Walks-vs-runs policy** (Ernest's decision, informed by Strava research):
   - Walks COUNT toward: Total Miles, weekly miles, monthly leaderboard distance, streaks.
   - Walks NEVER touch: run challenges or pace. New `challenges.sport` column (`Run`/`Walk`/`Any`, **default Run**); boot-time auto-migration in `backend/db/index.js` upgraded the prod volume DB on deploy; legacy challenges backfilled to runs-only. `POST /challenges` accepts `sport`. Challenge cards show 🏃/🚶 eligibility tags.
4. **"— mph" bug → fixed** — live recorder showed a dash at 0.00 mi (standing still). Now shows **0.0** and climbs as GPS distance accrues; dash reserved for genuinely missing time data.

Commits: `4c3c579` + two follow-ups (challenge sport filter / footer + mph fixes). All pushed and live.

Earlier today (see latest.md / PROGRESS.md): launch checklist closed, GPX import, recorder built, Strava OAuth deferred, "accurate-solace" Railway project deleted.

## Tests
- 20 unit tests: mph/duration helpers ✓
- 11 backend tests: challenge sport filtering + migration idempotence ✓
- 8 tests: live-recorder speed display ✓
- Share-card renderer smoke tests ✓

## ⚠️ Working Agreement (important for next Claude session)
Git run from Claude's sandbox leaves stale `.git/index.lock` files (sandbox can't delete files in the mounted folder). **Claude edits files; Ernest commits/pushes from the Mac.** If a lock error ever appears: `cd ~/Desktop/claude\ ai/3332 && rm -f .git/index.lock`

Also: Mac-compiled `better-sqlite3` won't load in Claude's sandbox — backend tests use a `node:sqlite` adapter (pattern is in PROGRESS.md, June 7 late session).

## Open Items
- **Verify on phone after latest push:** Walk recorder shows 0.0 → live mph; share footer shows Team3332.
- **GPX import quirk (known, unfixed):** importing a GPX always saves as type "Run" — the import form drops the Run/Walk toggle state. Minor; fix when convenient.
- Carried over: lawyer review of ToS/Privacy before live Stripe keys; gold shade review; public profiles; referral system; PostgreSQL migration ~2 months pre-launch.

## Next Big Fork (Ernest to choose)
1. **Capacitor native wrapper** — lock-screen GPS recording, App Store presence. Est. 3–5 sessions, ~$124 store fees. Everything built so far carries over. This is the flagged "next major milestone."
2. **Smaller roadmap items** — public member profiles, referral system.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/team3332 (local clone = the `3332` folder)
- Stack: static HTML/React (Babel) frontend · Node/Express + SQLite on Railway volume · Stripe test mode · Resend email
- Full history: PROGRESS.md · today's detail: latest.md
