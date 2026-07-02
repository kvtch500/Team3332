---
author: claude
type: handoff
id: handoff625
date: 2026-06-25
spans: 2026-06-25
session: 17 (continues handoff623)
---

# HANDOFF 625 — Session 17 (Thu Jun 25 2026)

## TL;DR
Real-run test of **Build 4** passed on device — auto-pause, GPS map tracking, and the swipe-up
options panel all work; only **live heart rate is still untested** (no BLE strap on hand yet).
Then built the **Apple Watch companion** (the HIGH-PRIORITY roadmap item) to code-complete: a
standalone watchOS app that records a Run/Walk from the wrist (GPS + heart rate), shows live
time/distance/pace/HR with pause-resume-finish, and **syncs the finished run back to the member's
account through the paired iPhone** — saved via the existing `POST /api/activities`, no separate
login on the watch. **Remaining work is the one-time Xcode wiring + a device test on a real Watch.**

## ✅ Build 4 real-run test (on device)
- **Auto-pause** ✓ · **map tracking** ✓ · **swipe-up options sheet** ✓.
- **Live heart rate** — NOT yet tested; needs a real BLE chest strap/armband. Carry over.

## ⌚ Apple Watch companion (NEW — code complete, session 17)

### Architecture (how it syncs)
The watch records standalone, then hands the **finished run** to the iPhone over
**WatchConnectivity** (`transferUserInfo`, so it queues and delivers even if the phone is briefly
out of range). The phone's `WatchSyncPlugin` forwards it to JS as a `watchActivity` event; `app.jsx`
POSTs it to **`/api/activities` using the member's existing token**. So a watch run is saved exactly
like a phone run — **the watch never holds a password or token.** The phone also pushes login context
(member name + signed-in flag) to the watch so the start screen shows whose account runs save to.
**No backend changes** — reuses the existing save path (activities tests still 13/13).

### Files written (committed source-of-truth in `mobile/ios-native-src/`)
Watch App target:
- `Watch/Team3332WatchApp.swift` — watchOS `@main` + phase router (Start → Recording → Summary).
- `Watch/WorkoutManager.swift` — recording engine: **HKWorkoutSession + HKLiveWorkoutBuilder** (HR
  from the Watch's optical sensor + background runtime) and **CLLocationManager** (GPS → distance +
  `[lat,lon,tSecsSinceStart]` route, same shape the phone records). Pause/resume banks elapsed time;
  on finish builds the WatchConnectivity payload (downsampled to ~200 points, avg/max HR, pace).
- `Watch/WatchSessionDelegate.swift` — WatchConnectivity (watch side): sends finished runs, receives
  login context.
- `Watch/WatchViews.swift` — SwiftUI Start (Run/Walk), Recording (live time/dist/pace/♥bpm +
  pause/resume/stop), Summary (distance/time/avg-HR + sync status).

App (phone) target:
- `App/WatchSyncPlugin.swift` + `.m` — Capacitor bridge `WatchSync`: receives watch runs → emits
  `watchActivity`; `setContext` pushes login info to the watch; queues runs that arrive before JS is
  ready (cold launch). Guarded no-op when no watch is paired.

### Frontend wiring (`app/src/app.jsx`)
- New **`WatchSync`** helper (same guarded `registerPlugin` no-op pattern as LiveActivity/HeartRate):
  maps a watch payload → `/activities` body (`toBody`), `init({onSaved,onError})` registers the
  listener and saves, `pushContext(user)` tells the watch who's signed in.
- Root `App`: a mount-once `useEffect` registers the listener (toast + refresh Runs on save), and a
  `useEffect([user])` pushes login context. (Inserted-JS syntax verified with `node --check`.)

### Build config / docs
- `mobile/patch-native-config.mjs` — added **`WatchSyncPlugin`** to `LOCAL_PLUGINS` (so it stays in
  `packageClassList` after every sync). Verified present.
- `mobile/ios-native-src/README.md` — documented the new Watch + Heart Rate files.
- **`mobile/APPLE-WATCH-SETUP.md`** — full one-time Xcode wiring guide (see below).
- `ROADMAP.md` — Apple Watch item marked **[~] in progress / code complete**.

## ▶️ Pick up here (next) — finish the Apple Watch feature
1. **One-time Xcode wiring** per **`mobile/APPLE-WATCH-SETUP.md`**:
   - Add a **watchOS App target** ("Team3332 Watch App", embedded in the phone App).
   - Add the 4 `Watch/*.swift` files to the Watch target; add `WatchSyncPlugin.swift`/`.m` to App.
   - Watch target capabilities: **HealthKit** + **Background Modes → Workout processing**; add the
     Health/Location usage strings + `WKBackgroundModes: [workout-processing]` to the Watch Info.plist.
2. `cd mobile && npm run sync` → Xcode: bump **Build** number → run the **App** scheme (installs the
   watch app) → **device-test on a real Apple Watch** (record a loop, confirm it lands in Runs +
   Health; test the out-of-range queue).
3. Then check the ROADMAP item fully `[x]`.

## 🟡 Open / not yet done
- **HR strap test** (phone BLE) — still pending a real strap. The Watch path gives HR without a strap.
- **Stripe vs Apple IAP** — still the real public-submission blocker for paid memberships.
- HR into the **Live Activity** lock-screen card; store the **full HR series** for a chart.
- ToS/Privacy lawyer review; Android build path; PostgreSQL migration; onboarding quiz / admin panel.

## Notes / gotchas
- ⚠️ **`app/app.js` was NOT rebuilt this session** — the sandbox here can't run esbuild (its binary
  is macOS-only). On the Mac, run `cd mobile && npm run sync` (or `npm run build:app`) to regenerate
  `app/app.js` from the edited `app/src/app.jsx` **before** building, or the watch wiring won't be in
  the bundle. The JSX edits were syntax-checked, just not bundled.
- Repo path has a space → build/commit/push from the Mac; quote paths.
- Each new TestFlight upload needs a **higher Build number** (Xcode General → Identity).
- Watch sync model: auth stays on the phone; the watch records and hands off the finished run.
- Prior: handoff623 (three features + Build 4 live on device).
