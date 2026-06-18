---
author: claude
type: handoff
id: handoff618f
date: 2026-06-18
session: 10 (continues handoff618e)
---

# HANDOFF 618f — Thursday, June 18 2026 (session 10)

## Where Things Stand
618e (timestamped GPS → real best efforts) is **committed, pushed, and deployed** (commit
`7ebfc4c`, confirmed on `origin/main`; web app + backend live). On-device eyeball of the Progress
tab still pending on Ernest's side, but the code is shipped.

This session took the next pick: **surface GPS errors during recording** (the "async/GPS error
catching" open item). It's a **frontend-only** change — no backend touched, full suite still
**136 green**.

## What This Session Did

**The bug:** GPS fixes (and failures) come back on **async watch callbacks**. React's
`ErrorBoundary` only catches render/lifecycle errors, so it can never see these. During a
recording, `RecordRun` passed an `onError` that handled **only `'denied'`** (a toast) — a mid-run
`'error'` (signal loss, plugin rejection, hardware) was **silently swallowed**: the timer kept
ticking and distance sat frozen with no indication anything was wrong.

**The fix (`app/src/app.jsx`, all frontend):**
1. New pure helper `recGpsAlert(kind)` → banner text ('denied' vs generic 'error'). Placed by the
   recorder helpers; node-checkable.
2. `RecordRun` gains `gpsAlert` state. `start()` now wires the recorder's `onError` to set
   `gpsAlert` for **both** kinds (and keeps the denial toast). On every good fix, `onFix` clears a
   standing alert (**auto-recovery**) using the functional `setState(prev => prev ? null : prev)`
   form so a no-op doesn't re-render.
3. New **persistent red banner** (`role="alert"`) pinned to the top of the recording screen
   (respects `env(safe-area-inset-top)`), shown only while `gpsAlert` is set.

Net effect: a runner whose GPS drops mid-run now sees "⚠️ GPS signal lost — distance may pause
until it comes back" (or the location-off message), and it disappears on its own when GPS returns.

## Validation
- `recGpsAlert` extracted and executed as pure JS → correct text for `denied` / `error`. ✓
- Bracket-balance scan of `app/src/app.jsx` is **identical to HEAD** ({par:1,brk:0,brc:-2} — the
  scanner's known JSX/template-literal residual), i.e. my edits net to balanced. ✓
- No backend change → backend suite unchanged at **136/0** (not re-run; nothing touched).
- Sandbox can't transpile → **real proof = Mac build + on-device check** (below). ✗ until done.

## ⚠️ What Ernest needs to do (on the Mac)
Frontend-only this time (`app/src/app.jsx` + `ROADMAP.md` + this handoff). **app.jsx changed →
must rebuild app.js before committing.**

```bash
cd "/Users/ernestsmith/Desktop/claude ai/3332"

# 1. Rebuild the frontend bundle
npm run build:app           # ✓ regenerates app/app.js

# 2. Commit + push from the repo ROOT (path has a space)
git add app/src/app.jsx app/app.js ROADMAP.md "daily update/handoff618f.md"
git commit -m "Surface GPS errors during recording (persistent banner + auto-recovery)"
git push                    # deploys web app

# 3. Native rebuild + check on device
cd mobile && npm run sync && npm run open:ios   # ⌘R
```
**How to test the banner on device:** start a recording, then kill GPS — e.g. turn on Airplane
Mode (or revoke Location for the app in Settings) for ~10–20s. The red banner should appear over
the recording screen; turn GPS back on and it should clear on its own once fixes resume.
Reminder (FRONTEND-BUILD.md): never push `index.html`/`app.jsx` without a fresh `app/app.js`.

Note: there's also a **stale, unrelated edit to `daily update/handoff618d.md`** sitting
uncommitted from a prior session (just wording). Commit it or leave it — not part of 618f.

## Open Items (priority order)
- **Eyeball on device:** 618e Progress tab (real splits / no "est." on a fresh timestamped run)
  AND 618f GPS-loss banner (above).
- **iOS Live Activity** (ActivityKit) — lock-screen live stats; see ROADMAP backlog.
- **Phase 2 frontend pre-build** (optional) — bundle React/Leaflet/@capacitor/core locally,
  retire the head-loader.
- Best-effort resolution is bounded by the ~200-point downsample (recorder & GPX) — fine for now;
  raise the cap if you ever want finer splits.
- Carried: paid Apple Dev → TestFlight → wider device testing; Android; test-account deletion;
  lawyer ToS/Privacy; PostgreSQL migration ~2mo pre-launch.

## ⚠️ Working Agreements
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space; commit from the
  **root**, not `mobile/`.
- **Frontend is a build:** edit `app/src/app.jsx` (never `app/app.js`) → `npm run build:app` →
  commit both. Never push without a fresh `app/app.js`. (FRONTEND-BUILD.md)
- **Native rebuild = `cd mobile && npm run sync` THEN ⌘R** (sync builds app.js first).
- Sandbox can't transpile JS — frontend validated by bracket-balance + `node --check` of extracted
  pure-JS; backend tests DO run in-sandbox (`cd backend && node test/<file>`).
- New API routes go **before `/:id`** in a router or they get captured as an id.
- **GPS errors are async → ErrorBoundary can't catch them.** Surface via state (see `gpsAlert` /
  `recGpsAlert`), not the boundary.

## Start Here Next Time
1. Confirm 618f committed/pushed and the GPS-loss banner shows/clears correctly on device.
2. Then pick: **iOS Live Activity** · Phase 2 pre-build.
3. Launch runway: paid Apple Dev → TestFlight → Android.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin) · Repo: github.com/kvtch500/Team3332
- Frontend: source `app/src/app.jsx` → built `app/app.js` (committed); shell `app/index.html`
  (CDN React/ReactDOM prod + Leaflet, then app.js). Build = `npm run build:app`. See FRONTEND-BUILD.md.
- GPS error UX (618f): `RecordRun` `gpsAlert` state + `recGpsAlert(kind)` helper → red banner over
  the recording screen; auto-clears on the next good fix. Wired through `GeoTracker.startRecording`'s
  `onError` (kinds: 'denied' | 'error'), which exists native (bg-geolocation) + web (navigator).
- Progress API: `GET /api/activities/progress` (auth) → totals, streak, active_dates,
  best_efforts (real fastest-segment when track has `[lat,lon,t]`, else even-pace est.), predictions, monthly.
- Track shape: route_data `{source, points}`, points `[lat,lon]` (legacy) or `[lat,lon,t]` (618e+).
- Native: Capacitor 6, `com.team3332.app`, iOS at `mobile/ios`. Build = `cd mobile && npm run
  sync` then ⌘R. Device = KATCH, Personal Team signing. Background GPS verified 618b.
- Tests: `cd backend && node test/<file>` — **full suite 136 green** (unchanged; 618f is frontend-only).
- Prior sessions: handoff618e.md · handoff618d.md · handoff618c.md · handoff618b.md · handoff618.md
