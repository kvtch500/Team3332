---
author: claude
type: handoff
id: handoff618d
date: 2026-06-18
session: 8 (continues handoff618c)
---

# HANDOFF 618d — Thursday, June 18 2026 (session 8)

## Where Things Stand
Two things this session, on top of 618c's frontend pre-build:
1. **Phase 1 pre-build is confirmed working on device** — Ernest built to the iPhone (KATCH)
   and the app boots **noticeably faster** with no Babel. The pre-build track's core win is
   banked. (Commit/push of the 618c source + generated `app/app.js` still pending — see below.)
2. **New feature: a Strava-style "Progress" tab** under the "Me"/Profile screen — streak,
   active-day calendar with gold stars, best efforts, race predictions, and a 6-month trend.
   Backend logic is **tested green in-sandbox**; the frontend is built but (as always) needs a
   Mac build + device check.

Also added a **lock-screen Live Activity** feature to the roadmap (the richer "live stats on the
lock screen" upgrade beyond today's run-in-progress notification).

## What This Session Did

**1. Progress tab — backend `GET /api/activities/progress` (DONE + tested):**
- New route in `backend/routes/activities.js`, defined **before `/:id`** so "progress" isn't
  captured as an id (same pattern as `/stats`). Returns:
  - totals (runs, miles, active time), **current streak** (consecutive days, with a grace day
    so it doesn't reset just because today's run isn't logged yet),
  - **active_dates** (distinct YYYY-MM-DD, for the calendar stars),
  - **best_efforts** for ½ mi · 1 mi · 2 mi · 5K · 10K · 15K · 10 mi · 20K · ½ Mar · 30K ·
    Marathon · 50K · 100 Miler,
  - **predictions** (5K/10K/½/Marathon) via the **Riegel** model, and
  - **monthly** (last 6 months: distance + active time + runs).
- ⚠️ **Best efforts are ESTIMATED.** Route points are stored as `[lat,lon]` with **no per-point
  timestamps**, so true fastest-segment splits aren't possible. For each benchmark we take the
  fastest **even-pace projection** from any run that covered at least that far; the UI labels
  projected ones "est." (Roadmap follow-up: store `[lat,lon,t]` to enable real splits.)
- **Tests: `backend/test/progress.test.js` — 8 passed / 0 failed.** Covers auth, totals, streak,
  best-effort projection (Walk excluded; exact vs projected), Riegel base selection + monotonic
  predictions, the 6-month window, and the empty-user case.
- **Full backend suite now 133 passed / 0 failed** (was 125).

**2. Progress tab — frontend (DONE in code; needs Mac build + device check):**
- `app/src/app.jsx`: new `ProgressView` + `ProgressCalendar`, and a **Profile / Progress
  segmented toggle** at the top of the `Profile` screen (the "Me" bottom-nav tab). Profile view
  is unchanged; Progress is the new sub-tab.
- Renders: 4 stat tiles (🔥 streak, activities, miles, active time), a month calendar with a
  **gold ★** on active days (prev/next nav, today outlined), a 6-month **bar chart** (miles, with
  active-time on hover + a "vs last mo" delta), **race prediction** tiles, and a **best-efforts**
  list with pace + "est." tags. Pure inline styles + existing CSS vars; no new deps (no Chart.js
  in this app — Leaflet is the only lib).
- Reuses existing `fmtClock` / `durSecs` helpers; added `fmtHMS` / `fmtPaceMi`.

**3. Roadmap (`ROADMAP.md`):**
- New **Post-MVP / Native Polish** backlog with the **iOS Live Activity** (ActivityKit) feature:
  live distance/time/pace on the lock screen + Dynamic Island, a JS→native bridge from
  `GeoTracker`, brand styling, and an Android foreground-notification analog. Noted that today's
  persistent "run in progress" notification already works (618b) — Live Activity is the upgrade.
- Logged the Progress tab as built, with the **timestamped-GPS-points** follow-up for true
  best-effort splits.

## Validation
- Backend: `cd backend && node test/progress.test.js` → 8/8; full suite 133/0. ✓
- Frontend: sandbox can't transpile — checked `app/src/app.jsx` brackets/braces/brackets all
  balanced and backticks even. **Real proof = Mac build + on-device check** (below). ✗ until done.

## ⚠️ What Ernest needs to do (on the Mac)
This session changed **both** `app/src/app.jsx` (frontend) **and** `backend/routes/activities.js`
(backend), plus there's still the **618c pre-build commit** that hasn't been pushed.

```bash
cd ~/Desktop/claude\ ai/3332

# 1. Rebuild the frontend bundle (app.jsx changed → app.js must be regenerated)
npm install            # if not already done for 618c (installs esbuild)
npm run build:app      # ✓ built app/app.js

# 2. Quick local check
open app/index.html    # open Profile → toggle "Progress": calendar stars, trend bars,
                       # predictions, best efforts. (Predictions/best-efforts need a few runs.)

# 3. Commit everything — 618c pre-build + this session together
git add app/index.html app/src/app.jsx app/app.js app/build.mjs package.json \
        mobile/sync-www.mjs mobile/package.json .gitignore FRONTEND-BUILD.md ROADMAP.md \
        backend/routes/activities.js backend/test/progress.test.js
git commit -m "Frontend pre-build (Phase 1) + Strava-style Progress tab (streak, calendar, best efforts, predictions, trend)"
git push               # deploys web app (needs app.js) AND backend /progress route (Railway)

# 4. Native rebuild + check on device
cd mobile && npm run sync && npm run open:ios   # ⌘R; open Me → Progress
```
Reminder (FRONTEND-BUILD.md): never push `index.html`/`app.jsx` without a freshly built
`app/app.js`. Rollback net = `app/index.html.prebuild.bak`.

## Open Items (priority order)
- **Commit + push 618c + 618d** (above) — web app is running the new `index.html` locally but the
  repo/live deploy still needs the build committed. The backend `/progress` route must be deployed
  for the Progress tab to load data.
- **Timestamped GPS points** (`[lat,lon,t]`) → true fastest-segment best efforts (currently
  estimated). Small change in `GeoTracker` + GPX parser; backwards-compatible.
- **iOS Live Activity** (ActivityKit) — lock-screen live stats; see ROADMAP backlog.
- **Phase 2 frontend pre-build** (optional): bundle React/Leaflet/@capacitor/core locally for
  zero-CDN boot + retire the head-loader. Defer until Phase 1 is fully committed/verified.
- **Async/GPS error catching** — error boundary doesn't catch GPS async callbacks; surface
  `GeoTracker.onError`.
- Carried: paid Apple Dev → TestFlight → wider device testing; Android; test-account deletion;
  lawyer ToS/Privacy; PostgreSQL migration ~2mo pre-launch.

## ⚠️ Working Agreements
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space; commit from the
  **root**, not `mobile/`.
- **Frontend is a build:** edit `app/src/app.jsx` (never `app/app.js`) → `npm run build:app` →
  commit both. Never push without a fresh `app/app.js`. (FRONTEND-BUILD.md)
- **Native rebuild = `cd mobile && npm run sync` THEN ⌘R** (sync now builds app.js first).
- Sandbox can't transpile JS — frontend validated by bracket-balance/diff only; backend tests DO
  run in-sandbox (`cd backend && node test/<file>`; Node 22 node:sqlite shim).
- New API routes go **before `/:id`** in a router or they get captured as an id.

## Start Here Next Time
1. Confirm 618c+618d committed/pushed and the Progress tab loads live on device.
2. Quick, high-value: **timestamped GPS points** for real best-effort splits.
3. Then pick: iOS Live Activity · Phase 2 pre-build · async/GPS error surfacing.
4. Launch runway: paid Apple Dev → TestFlight → Android.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin) · Repo: github.com/kvtch500/Team3332
- Frontend: source `app/src/app.jsx` → built `app/app.js` (committed); shell `app/index.html`
  (CDN React/ReactDOM prod + Leaflet, then app.js). Build = `npm run build:app`. See
  FRONTEND-BUILD.md.
- Progress API: `GET /api/activities/progress` (auth) → totals, streak, active_dates,
  best_efforts, predictions, monthly. Best efforts = estimated (even-pace projection).
- Native: Capacitor 6, `com.team3332.app`, iOS at `mobile/ios`. Build = `cd mobile && npm run
  sync` then ⌘R. Device = KATCH, Personal Team signing. Background GPS verified 618b (untouched).
- Map: Leaflet 1.9.4 · web Mapbox dark-v11 · native OSM.
- Tests: `cd backend && node test/<file>` — **full suite 133 green** as of 618d (progress 8).
- Prior sessions: handoff618c.md · handoff618b.md · handoff618.md · handoff617d.md · handoff617c.md
