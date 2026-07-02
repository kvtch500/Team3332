# Apple Watch setup (watchOS) — one-time Xcode wiring

This adds the **TEAM 3332 Apple Watch companion**: a standalone wrist recorder (Strava-style)
that records a Run or Walk with GPS + heart rate, shows live time / distance / pace / HR, and
syncs the finished run back to the member's account through the paired iPhone (session 17).

All the Swift and the JS bridge are **already written and committed**. But a watchOS app needs a
**separate Watch App target**, which can only be created in the Xcode GUI. Do these steps once on
the Mac. After that, normal `cd mobile && npm run sync` + ⌘R works as usual.

Open the project first: `cd mobile && npm run open:ios`

> **Where the source lives:** `mobile/ios/` is **gitignored** — regenerated on the Mac by
> `npx cap add ios`. The durable, committed source-of-truth is **`mobile/ios-native-src/`**. When
> you "Add Files to…", point at `mobile/ios-native-src/…` and **check "Copy items if needed"**.
> If you ever re-run `cap add ios`, re-do Steps 1–4.

Files in `mobile/ios-native-src/` you'll attach to targets below:

- `Watch/Team3332WatchApp.swift` — watchOS `@main` + screen router → **Watch App** target
- `Watch/WorkoutManager.swift` — HealthKit + CoreLocation recording engine → **Watch App** target
- `Watch/WatchSessionDelegate.swift` — WatchConnectivity, watch side → **Watch App** target
- `Watch/WatchViews.swift` — SwiftUI start / recording / summary screens → **Watch App** target
- `App/WatchSyncPlugin.swift` + `App/WatchSyncPlugin.m` — Capacitor bridge, phone side → **App** target

---

## Step 1 — Create the Watch App target

1. **File → New → Target… → watchOS → App** → Next.
2. Product Name: **`Team3332 Watch App`**. Interface **SwiftUI**, Language **Swift**.
   Leave "Include Notification Scene" / "Include Complication" unchecked (not needed for v1).
3. If Xcode offers **"Watch App for Existing iOS App"**, pick the **App** target as the companion
   so the watch app is embedded in the phone app (one install, auto-paired). Finish.
   If Xcode asks to activate the new scheme, click **Activate**.
4. Xcode generates a `Team3332 Watch App` group with sample `*App.swift` and `ContentView.swift`.
   **Delete those generated samples** (Move to Trash) — you'll use the committed ones instead.
5. Confirm the watch app's bundle id is a child of the phone app's, e.g.
   **`com.team3332.app.watchkitapp`** (target → General / Signing). Use the **same Personal Team /
   signing** as the App target. Deployment target: **watchOS 9.0+** (HKLiveWorkoutBuilder is older,
   but 9+ keeps the SwiftUI APIs simple).

## Step 2 — Add the watch source to the Watch App target

1. **File → Add Files to "Team3332 Watch App"…**, select all four files in
   `ios-native-src/Watch/` (Copy items if needed).
2. In the dialog, tick **only the `Team3332 Watch App` target** (not App, not the widget).

## Step 3 — Add the phone-side bridge to the App target

1. **File → Add Files to "App"…**, select `ios-native-src/App/WatchSyncPlugin.swift` and
   `ios-native-src/App/WatchSyncPlugin.m` (Copy items if needed).
2. Tick **only the `App` target**. If Xcode offers to create/route through the bridging header for
   the `.m`, accept (a Capacitor app already has one — the ObjC macros need the ObjC↔Swift bridge).

## Step 4 — Capabilities & Info.plist (the part people miss)

**On the `Team3332 Watch App` target:**

1. **Signing & Capabilities → + Capability → HealthKit.** (Adds the HealthKit entitlement.)
2. **Signing & Capabilities → + Capability → Background Modes → check "Workout processing".**
   This is what lets the workout session keep running (and HR streaming) with the screen off.
   Without it the session stops the moment the wrist drops.
3. **Info** tab — add these usage strings (or paste into the Watch App `Info.plist`):

   ```xml
   <key>NSHealthShareUsageDescription</key>
   <string>TEAM 3332 reads your heart rate during a run so it can show and save it with your activity.</string>
   <key>NSHealthUpdateUsageDescription</key>
   <string>TEAM 3332 saves your run to the Health app as a workout.</string>
   <key>NSLocationWhenInUseUsageDescription</key>
   <string>TEAM 3332 uses your location to map your run and measure distance and pace from your wrist.</string>
   <key>WKBackgroundModes</key>
   <array><string>workout-processing</string></array>
   ```

   > ⚠️ **`WKBackgroundModes`, not `UIBackgroundModes`** (learned the hard way, session 18):
   > Xcode's Info editor writes the background mode under **`UIBackgroundModes`**, which watchOS
   > ignores — App Store Connect then **rejects the upload**. Open the watch target's Info.plist
   > as source and make sure `workout-processing` is under **`WKBackgroundModes`**. The fixed file
   > lives at `mobile/ios/App/Team3332-Watch-App-Watch-App-Info.plist`.

4. **Watch app icon (upload requirement):** the watch target's `AppIcon` set starts EMPTY and App
   Store Connect **rejects builds with a missing watch icon** ("Missing Icons" / CFBundleIconName
   errors). Fix: copy the phone app's 1024px icon into the watch target's `AppIcon.appiconset`
   and reference it in that set's `Contents.json`.

5. **Also required for a clean upload (session 18 lessons):**
   - `WKCompanionAppBundleIdentifier = com.team3332.app` in the watch Info.plist.
   - **Build numbers must MATCH across all three targets** (App, Widget, Watch) — App Store
     Connect rejects mismatches. Bump all of them together every upload.
   - **watchOS deployment target 11.6** (26.5 blocked the install on the real watch).
   - `ITSAppUsesNonExemptEncryption = false` is already in the phone Info.plist (kills the
     "Missing Compliance" step in TestFlight). Keep it if the plist is ever regenerated.
   - **Do not remove** `locationManager.allowsBackgroundLocationUpdates` guards: setting it
     `true` on watchOS without the `location` background mode **crashes at launch** (build 5's
     blink-crash). The HKWorkoutSession keeps GPS alive during recording — it isn't needed.
   - **Install via TestFlight, not direct Xcode→watch install.** Direct install repeatedly failed
     ("integrity could not be verified", watch showing Disconnected). TestFlight Internal Only
     works every time — don't burn time on the direct route.

**On the `App` (phone) target:** nothing extra — WatchConnectivity links automatically once a
watch app is embedded, and the phone already has its own location/Bluetooth strings.

## Step 5 — Register the plugin in packageClassList (critical, Capacitor 6)

Capacitor 6 loads iOS plugins from `ios/App/App/capacitor.config.json` → **`packageClassList`**.
The `CAP_PLUGIN` macro alone is **not** enough — if `WatchSyncPlugin` isn't in that list it silently
never loads and watch runs never reach JS.

Already automated: `npm run sync` runs `mobile/patch-native-config.mjs`, which re-adds
`WatchSyncPlugin` (it's in `LOCAL_PLUGINS` alongside `LiveActivityPlugin` and `HeartRatePlugin`).
**If you ever sync with a bare `npx cap sync`, run `node patch-native-config.mjs` afterward**, or add
`"WatchSyncPlugin"` to `packageClassList` by hand.

## Step 6 — Build, sync, run

```bash
cd mobile && npm run sync      # rebuilds app.js, syncs www, AND re-adds the plugin to packageClassList
```

Then in Xcode:
- Select the **App** scheme → ⌘R onto the iPhone (installs the embedded watch app too).
- Or select the **Team3332 Watch App** scheme → run directly onto the paired Apple Watch.
- Bump the **Build** number (Xcode General → Identity) before any new TestFlight upload, same as
  the phone app.

---

## How to test on device

1. On the **iPhone**, open TEAM 3332 and sign in. (This pushes your name to the watch as context.)
2. On the **Apple Watch**, open TEAM 3332. The start screen should read **"Runs save to <your name>"**.
3. Tap **Run** (or **Walk**). Grant Health + Location when prompted (first launch only).
4. Walk/run a short loop: time ticks, **distance** climbs from GPS, **pace** fills in, and **♥ BPM**
   shows your live heart rate from the watch sensor.
5. Tap **pause** ▮▮ then **play** ▶ — elapsed time should hold while paused.
6. Tap **stop** ■ → the summary shows distance / time / avg HR and **"Syncing to your phone…"**.
7. On the phone, the run appears in **Runs** within a few seconds (you'll get a "⌚ Watch run saved"
   toast). It also lands in the Apple **Health** app as a workout.

**Out-of-range test:** leave the phone at home, record a short walk on just the watch, come back —
the run syncs automatically when the watch and phone reconnect (it's queued via `transferUserInfo`).

## ⚠️ Two copies of every watch/bridge source file

Because files were added with "Copy items if needed", the Xcode build compiles the copies in
**`mobile/ios/App/Team3332 Watch App Watch App/`** (gitignored), NOT the committed
**`mobile/ios-native-src/`** originals. **Every code change must be applied to BOTH copies** or
it won't reach the build. Quick check that they're in sync:

```bash
cd mobile && for f in ios-native-src/Watch/*.swift ios-native-src/App/WatchSync*; do
  diff -q "$f" "ios/App/Team3332 Watch App Watch App/$(basename $f)"; done
```

## Notes / troubleshooting

- **Watch run never appears on the phone** → plugin not registered: check `packageClassList`
  (Step 5). Same gotcha as the Live Activity build — everything compiles, but the bridge is invisible
  until it's in the list.
- **Start screen says "sign in on your iPhone"** even though you're signed in → the watch hasn't
  received context yet. Make sure the phone app has been opened at least once since signing in;
  context is pushed via `updateApplicationContext` (latest-wins, survives relaunch).
- **No heart rate** → Health access was denied. Re-enable in **Watch → Settings → Privacy & Security
  → Health → TEAM 3332**, or in the **iPhone Watch app → TEAM 3332**.
- **Distance stays at 0** → Location denied, or you're indoors with no GPS. The watch needs a
  location fix; HR and time still record. (Indoors, distance will be GPS-only and may be low.)
- **Simulator** → HealthKit/CoreLocation are limited on the watch simulator; the engine degrades to
  GPS-only and won't stream HR. Real-device testing is the source of truth, same as the BLE strap.
- **watchOS only.** On the phone with no watch paired, `WatchSync` is a silent no-op — nothing to do
  and nothing breaks.
- Auth stays on the phone: the watch never holds your password or token. It records and hands the
  finished run to the phone, which saves it with your existing session. That's the whole sync model.
