---
author: claude
type: handoff
id: handoff626
date: 2026-06-26
spans: 2026-06-26
session: 18 (continues handoff625)
---

# HANDOFF 626 — Session 18 (Fri Jun 26 2026)

## TL;DR
Did the full **one-time Xcode wiring** for the Apple Watch companion and got it onto a **real
Apple Watch via TestFlight**. The watch app now **launches, records a Run/Walk, and shows the
live + summary screens** on-device. **BUT the recorded run does NOT sync to the phone** — nothing
lands in the Runs list. The recording side works; the **watch → phone → `/api/activities`
delivery is broken and still needs debugging.** Two small UI fixes (Done button + a static label)
are staged in the code but **not yet built** — they need a build 7.

## ✅ What works now (build 6, on the watch via TestFlight)
- Watch app **installs and launches** on Apple Watch Series 11 (watchOS 26.5).
- **Records a Run/Walk**: live screen + the post-run **"Walk complete / Syncing to your phone… /
  Done"** summary both render. So HealthKit/CoreLocation recording + the SwiftUI flow are good.

## ❌ What does NOT work — the sync (TOP priority next session)
- After finishing a walk, **no activity appears in the phone's Runs list.** The watch→phone
  handoff never completes the POST to `/api/activities`.
- Path that's failing (any link could be the break):
  watch `WatchSessionDelegate.sendActivity()` → `WCSession.transferUserInfo` →
  phone `WatchSyncPlugin` `didReceiveUserInfo` → `notifyListeners("watchActivity")` →
  JS `WatchSync.init` listener → `api.post('/activities', …)`.
- **Prime suspect:** the plugin's `jsReady` gating. `WatchSyncPlugin` only forwards (or flushes
  queued) runs **after** JS adds the `watchActivity` listener, detected via an **`addListener`
  override** checking `eventName == "watchActivity"`. If that override isn't actually invoked by
  Capacitor 6 (or `eventName` isn't readable there), `jsReady` never flips true and
  `pendingActivities` never flush → nothing posts. **This needs verifying with the Xcode console.**
- Other things to rule out with logs: whether `didReceiveUserInfo` fires on the phone at all
  (transferUserInfo is a background/opportunistic transfer — may need the phone app foregrounded);
  whether the JS listener is mounted; whether the POST 401s (must be signed in on the phone).

### Suggested fix direction (next session)
Make delivery **not** depend on the `addListener` override timing. Cleanest: add a JS-callable
`drainPending()` method on `WatchSyncPlugin` that returns + clears any queued runs, and have
`app.jsx` call it on app mount **and** on resume (and after login). That sidesteps the
notifyListeners/listener-timing race entirely. Also consider the watch sending via `sendMessage`
(immediate) when `isReachable`, in addition to `transferUserInfo` (queued fallback). Debug with the
Xcode console attached to the **phone** app to watch for the event + POST.

## 🧰 The Xcode wiring completed this session (all done)
1. Created the **Team3332 Watch App** target (Watch App for Existing iOS App → App).
2. Added the 4 `Watch/*.swift` files to the **watch** target; `WatchSyncPlugin.swift`/`.m` to the
   **App** target. (Used "Copy files to destination" — see gotcha below.)
3. Capabilities on the watch target: **HealthKit** + the **workout** background mode; Health +
   Location usage strings in the watch Info.plist; `WKCompanionAppBundleIdentifier = com.team3332.app`.
4. **watchOS deployment target lowered 26.5 → 11.6** (26.5 blocked install).
5. **Build numbers aligned** across App + Widget + Watch app (App Store Connect requires a match).

## 🐞 Bugs found + fixed THIS session
- **Upload rejected — wrong background key:** the Info editor wrote `UIBackgroundModes`; watchOS
  needs **`WKBackgroundModes`** for `workout-processing`. Fixed in
  `mobile/ios/App/Team3332-Watch-App-Watch-App-Info.plist`.
- **Upload rejected — missing watch icon:** the watch `AppIcon` set had no image. Copied the phone
  app's 1024px icon into the watch `AppIcon.appiconset` + referenced it in `Contents.json`. Cleared
  the "Missing Icons" + "CFBundleIconName" errors.
- **App blinked / crashed on launch (build 5):** `WorkoutManager.init` set
  `locationManager.allowsBackgroundLocationUpdates = true`, which throws on watchOS without the
  `location` background mode. **Removed it** (the HKWorkoutSession keeps GPS alive while recording).
  This fix is in **build 6**, which launches.

## 🩹 Fixes staged in code but NOT yet built (need a build 7)
- **Done button does nothing:** `SummaryView`'s `onDone` cleared the payload but never reset
  `WorkoutManager.phase`, so the view stayed on the summary. Added `WorkoutManager.reset()` and
  call it from `ContentView`'s `.finished` case (`onDone: { summary = nil; workout.reset() }`).
- **(Still open, cosmetic):** the summary's **"Syncing to your phone…"** label is static — it never
  updates to "Synced"/"Couldn't sync". Worth wiring to the real result once sync works.

## ▶️ Pick up here (next session, in priority order)
1. **Fix the watch→phone sync** (the whole point). Attach Xcode console to the phone app, record a
   walk, and trace where the `watchActivity` event / POST dies. Implement the `drainPending()`
   approach above. This is the #1 task.
2. Then **build 7**: bump all three targets to **Build 7**, Archive → Distribute (TestFlight Internal
   Only), and it'll include the Done-button fix too.
3. Re-test on the watch: record → Done returns to start → run appears in phone Runs.

## ⚠️ Gotchas / notes
- **Two copies of the watch Swift** exist because files were added with "Copy files to destination":
  the Xcode-compiled copies live in **`mobile/ios/App/Team3332 Watch App Watch App/`** (gitignored),
  separate from the committed **`mobile/ios-native-src/Watch/`**. **Every code fix this session was
  applied to BOTH.** Keep doing that, or edits won't reach the build.
- The **`WKBackgroundModes` Info.plist fix and the watch `AppIcon`** live only in the gitignored
  `mobile/ios/` tree — they'd be lost if anyone re-runs `cap add ios`. **Not yet captured in
  `APPLE-WATCH-SETUP.md`** — fold them in.
- TestFlight builds so far: **5** (uploaded; launch-crash) and **6** (current; launches, no sync).
  Build 6 was distributed via **TestFlight Internal Only**.
- Device-trust lesson: direct Xcode install to the watch kept failing ("integrity could not be
  verified" / Devices window showed the watch **Disconnected — networking error**). **TestFlight
  sidesteps all of it** — that's the install path that worked. Don't burn time on the direct-install
  route again.
- `app/app.js` still must be rebuilt on the Mac (`cd mobile && npm run sync`) for any `app.jsx`
  change — the sandbox can't run esbuild. (The WatchSync JS wiring from handoff625 is already in.)
- Prior: handoff625 (Apple Watch code complete, pre-Xcode-wiring).
