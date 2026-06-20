---
author: claude
type: handoff
id: handoff619d
date: 2026-06-19
session: 13 (continues handoff619c)
---

# HANDOFF 619d — Friday, June 19 2026 (session 13)

## TL;DR
Big session, lots verified ON DEVICE. The **CocoaPods blocker is cleared**, the app **builds and
runs on KATCH**, and a full **GPS-accuracy overhaul is device-verified** (stationary drift gone,
slow-walk speed believable, locked-screen tracking still works → the **Phase 2b background-GPS gate
PASSED, so no revert of `29c28a6`**). Also built this session: the **Android Live-Activity analog**
(ongoing run-stats notification, code only), **self-hosted Google Fonts** (web now 100% CDN-free),
**Dynamic Island expanded-view polish**, and an **auto-pause** backlog note. **Nothing is committed
yet** — everything is on disk for Ernest to commit from the Mac (commit list below).

## ✅ Device-verified this session (on KATCH)
1. **Stationary → 0.00 mi.** Standing still ~1 min no longer creeps (was 0.06 mi). Doppler speed
   gate works on device.
2. **Slow walk → believable MPH.** Was reading 6.3 then 4.5 mph for a slow walk (multipath
   inflating distance ~3×); now reads a sane ~2–3. Multipath guard works.
3. **Walk-and-lock → distance keeps climbing.** The Phase 2b background-GPS re-verify (the gate
   from 619c). It PASSED → bundling `@capacitor/core` / retiring the head-loader did NOT regress
   background GPS. **Do NOT revert `29c28a6`.**

## CocoaPods blocker — root cause + fix (619c carryover, now resolved)
`pod 1.16.2` was already installed (Homebrew) — version was never the problem. The real cause:
`mobile/ios/App/App.xcodeproj/project.pbxproj` is written in Xcode 16's newest format
(`objectVersion = 70` + 4 `PBXFileSystemSynchronizedRootGroup` objects), which CocoaPods 1.16.2's
bundled `xcodeproj` gem can't parse → "compatibility version string for object version `70`".
**Fix applied:** edited `objectVersion = 70` → `77` (the Xcode 16.2 value the parser accepts).
Backup at `project.pbxproj.bak-obj70`. After that, `npm run sync` + ⌘R built and ran clean.
⚠️ `ios/` is **gitignored**, so this edit lives ONLY on the Mac and is NOT committed. If Xcode 16
re-saves the project it may reset `objectVersion` to 70 and the error returns — the **durable** fix
then is Xcode → select **App** project → File inspector → **Project Format → Xcode 15.0-compatible**.
Refs: CocoaPods issues #12889/#12840, Xcodeproj #996.

> Aside discovered while debugging: the Xcode **scheme list had lost the App scheme** (only
> `Team3332WidgetExtension` showed), which is why "the app wasn't showing" and a `[S:1] Connection
> invalidated` loop appeared — running a widget-only scheme. Fixed via Manage Schemes (re-show/auto-
> create the **App** scheme). Run the **App** scheme, never the widget scheme directly.

## GPS accuracy overhaul (app/src/app.jsx — the main code change)
All in `recorderStep` (+ `speed` threaded through both `GeoTracker.startRecording` fix callbacks).
Layered filters, each validated by extracting the pure function and simulating; **app.js must be
rebuilt on the Mac** (sandbox can't run esbuild — macOS binary):

1. **Accuracy gate** tightened 35→**30 m** (`GPS_MAX_ACCURACY_M`).
2. **Doppler speed gate** (`GPS_MIN_SPEED_MS = 0.4`): if a fix carries a valid speed < 0.4 m/s
   (≈0.9 mph) the user isn't moving → drop it. iOS speed is Doppler-derived (drift-immune); it's
   `-1`/negative when unavailable and `null` on web, in which case we **fall back** to the distance
   floor. This is what zeroed stationary drift on device.
3. **Flat noise floor** raised 3→**5 m** (`GPS_MIN_STEP_M`) — the fallback when speed is missing.
   Deliberately FLAT, not accuracy-scaled (an accuracy-scaled floor under-counted a real
   out-and-back ~15% in poor GPS — caught via Ernest's "0.04 out + 0.04 back should = 0.08" test).
   Because `last` only advances on an ACCEPTED fix, real walking loses nothing (sub-floor steps
   batch up); only jitter is dropped.
4. **Multipath guard** (NEW, the slow-walk-MPH fix): when a real speed is reported, reject a step
   whose implied speed `d/dt` exceeds `max(2.5×speed, speed+3)` m/s. Urban-canyon reflections jump
   the POSITION 20–30 m even while you walk normally — that spike passed the speed gate (Doppler
   reads true ~1 m/s) and the 12 m/s teleport cap, inflating distance & avg-mph. Sim: slow walk
   with spikes went 0.278 mi/7.9 mph (before) → 0.088 mi/2.5 mph (after); clean walks untouched.
- The 12 m/s absolute teleport cap remains as the no-speed fallback.

## Other features built this session (code only; not yet wired/tested)
- **Android Live-Activity analog** — `mobile/android-native-src/` (Kotlin `LiveActivityPlugin.kt`
  same jsName "LiveActivity", `MainActivity.java` that `registerPlugin`s it, `AndroidManifest-
  additions.xml`, README) + `mobile/LIVE-ACTIVITY-ANDROID-SETUP.md` + a cross-link in
  `SETUP-ANDROID.md`. An ongoing run-stats notification (chronometer self-ticks time, "Run
  complete" end-flash, `team3332://run` deep-link). Shared JS bridge drives it with ZERO JS
  changes. **Needs the Android project (`cap add android`) to exist, then wire-in per the setup
  doc.** Android has no `packageClassList` — `registerPlugin(LiveActivityPlugin.class)` in
  MainActivity is the whole registration.
- **Google Fonts self-host** — web app now 100% CDN-free. `app/fetch-fonts.mjs` (build-time fetch
  → `app/fonts/` + `app/fonts.css`), called from `app/build.mjs`; `index.html` links local
  `fonts.css`; `mobile/sync-www.mjs` INCLUDEs `fonts.css`+`fonts`; `npm run fonts:refresh` added.
  Idempotent (skips when present → offline-safe after first build).
- **Dynamic Island expanded-view polish** — `RunLiveActivity.swift` (+ the `ios/App/App/` copy):
  labeled-stat treatment (TIME under the timer, DISTANCE microlabel, AVG PACE/SPEED row, clean
  completion line). Static-validated only; renders on device.
- **Auto-pause** — added to `ROADMAP.md` backlog as an **opt-in member toggle** (default off). Can
  reuse the new Doppler `speed` field (pause when speed < threshold for N secs, resume when it
  rises); freeze elapsed/distance + show "Paused" on the record screen & Live Activity; persist the
  toggle on the user profile. Note only — not built.

## 🔴 To commit (from the Mac — Claude edits, Ernest commits)
- `app/src/app.jsx` **+ rebuilt `app/app.js`** (run `npm run build:app` first)
- `app/index.html`, `app/build.mjs`, `app/fetch-fonts.mjs`, `app/fonts.css` + `app/fonts/`,
  `package.json`, `mobile/sync-www.mjs`  (Google Fonts self-host)
- `mobile/android-native-src/**`, `mobile/LIVE-ACTIVITY-ANDROID-SETUP.md`, `mobile/SETUP-ANDROID.md`
- `mobile/ios-native-src/Team3332Widget/RunLiveActivity.swift` (Dynamic Island polish)
- `ROADMAP.md` (auto-pause note)
- NOT committed (gitignored, Mac-only): the `objectVersion 77` edit in `ios/…/project.pbxproj`.

## Open items (priority order)
1. **iOS device tests still outstanding** (lower priority now the GPS gate passed): Live Activity
   **end-flash** + **`team3332://run` deep-link** on device; **maps render / no CDN requests**;
   Progress-tab real-splits eyeball + 618f GPS-loss banner.
2. **Apple Developer Program ($99/yr) → TestFlight** — gate to wider beta. Enroll early (lead time).
3. **Android:** `cap add android` → wire the notification plugin (setup doc) → emulator/device test.
4. **Test-account deletion** (App Store requires it) — buildable from the sandbox; do before review.
5. **ToS / Privacy Policy** — stores require it; lawyer lead time → start in parallel. Drafts
   buildable here.
6. **PostgreSQL migration (~2mo pre-launch)** — large; buildable here when ready.
- Offered but not built: a **smoothed current-speed** live display (the MPH is still a cumulative
  average, so it's a little jumpy in the first ~10–15s — inherent to an average). Auto-pause (above).

## ⚠️ Working Agreements (unchanged)
- Claude edits; Ernest commits/pushes from the Mac (repo path has a space — commit from root).
- Frontend is a build: edit `app/src/app.jsx` → `npm run build:app` → commit `app.js` (+ assets).
- Native iOS Swift in BOTH `mobile/ios-native-src/` (truth) and tracked `mobile/ios/` copies; new
  native ANDROID truth in `mobile/android-native-src/`. `ios/`+`android/` are gitignored/regenerated.
- Sandbox can't bundle (esbuild macOS binary) or compile Swift/Kotlin → validated by static review,
  `node --check`, brace checks, and extracted-pure-function simulations; proven on device.
- Run the **App** Xcode scheme, not the widget scheme. CocoaPods ≥1.16.2 (have 1.16.2) + the
  `objectVersion` workaround. Stale `.git/index.lock` → `rm -f .git/index.lock`.

## Start Here Next Time
1. **Commit today's work** (list above), after `npm run build:app` regenerates `app.js`.
2. Optionally finish the remaining iOS device checks (end-flash, deep-link, maps/no-CDN).
3. Then pick a thread: Apple Dev → TestFlight · Android project + wire the notification plugin ·
   account deletion (buildable here) · ToS/Privacy drafts (buildable here) · Postgres migration.

## Quick Reference
- Live: https://team3332.com (app /app, admin /admin) · Repo: github.com/kvtch500/Team3332
- GPS recorder: `recorderStep` in `app/src/app.jsx` — accuracy≤30m, Doppler speed gate (≥0.4 m/s),
  flat 5m floor, multipath guard (d/dt ≤ max(2.5×speed, speed+3)), 12 m/s teleport cap. `speed`
  threaded from both native + web fix callbacks.
- Live Activity iOS: jsName `LiveActivity`, Swift in `mobile/ios-native-src/`; setup
  `mobile/LIVE-ACTIVITY-SETUP.md`. Android analog: `mobile/android-native-src/`; setup
  `mobile/LIVE-ACTIVITY-ANDROID-SETUP.md`.
- Web is CDN-free: React/ReactDOM/Leaflet/Capacitor bundled into `app.js`; fonts self-hosted
  (`app/fonts.css`); only OSM map tiles are external (native uses OSM, web uses Mapbox).
- Native: Capacitor 6, `com.team3332.app`, iOS at `mobile/ios` (objectVersion=77 workaround on disk),
  device KATCH / Personal Team. Android project not yet generated.
- Tests: `cd backend && node test/<file>` — 136 green (backend untouched session 13).
- Prior: handoff619c (Live Activity polish) · 619b (Phase 2b) · 619 (Phase 2a) · 618g (LA iOS).
