# Heart-rate sensor setup (iOS) — one-time Xcode wiring

This enables pairing a **Bluetooth LE heart-rate strap/armband** (Polar, Wahoo, Garmin, Coros,
etc.) and streaming live bpm during a run (623). The JS bridge, backend, and the native Swift
plugin are already written and committed. The only thing that can't be scripted is **adding the
two plugin files to the App target in Xcode** — do that once. After that, normal
`cd mobile && npm run sync` + ⌘R works as usual.

Open the project first: `cd mobile && npm run open:ios`

> **Where the source lives:** `mobile/ios/` is **gitignored** — it's regenerated on the Mac by
> `npx cap add ios`, so anything inside it is NOT committed. The durable, committed source of
> truth is **`mobile/ios-native-src/App/`**. When you "Add Files to…", point at that path and
> check **"Copy items if needed."** If you ever re-run `cap add ios`, re-do Step 1.

Files (already committed):
- `App/HeartRatePlugin.swift` — CoreBluetooth bridge (scan/connect/subscribe, parses bpm)
- `App/HeartRatePlugin.m` — Capacitor registration macro (`HeartRate` JS name)

---

## Step 1 — Add the plugin to the App target

1. In Xcode, right-click the **App** group (the folder with `AppDelegate.swift`) → **Add Files to "App"…**
2. Select **both** `mobile/ios-native-src/App/HeartRatePlugin.swift` and `HeartRatePlugin.m`.
3. Check **"Copy items if needed"**, and under "Add to targets" tick **App** (only the App target).
4. When the `.m` is added, Xcode may ask to **create a bridging header** — if you already have one
   from the Live Activity plugin, reuse it; otherwise let Xcode create it. (It just needs to
   `#import <Capacitor/Capacitor.h>`, which the `.m` does itself.)

## Step 2 — Bluetooth permission string (Info.plist)

Already added to `mobile/ios/App/App/Info.plist`:

```
<key>NSBluetoothAlwaysUsageDescription</key>
<string>TEAM 3332 connects to Bluetooth heart-rate monitors so it can show and record your heart rate during a run.</string>
```

This is **required** — iOS hard-crashes the first time CoreBluetooth is used without it. If you
ever regenerate `ios/`, re-add the key (or just re-run the insert: it's also documented here).

## Step 3 — packageClassList (handled by sync)

Capacitor 6 only registers plugins listed in `ios/App/App/capacitor.config.json`
`packageClassList`. `npm run sync` runs `patch-native-config.mjs`, which now re-adds
**both** `LiveActivityPlugin` and `HeartRatePlugin` after every `cap sync`. Nothing to do by hand —
just don't remove `HeartRatePlugin` from `LOCAL_PLUGINS` in that script.

## Step 4 — Build & test

`npm run sync` → ⌘R (or Product → Archive for TestFlight).

- **Simulator has no Bluetooth radio** — sensor pairing only works on a **real iPhone** with a
  **real BLE HR strap**. On the simulator/web the "Add a sensor" sheet shows the "works in the
  app on your phone" note and everything else still runs normally (HR is fully optional).
- On device: open **Record → Add a sensor**, wake the strap, tap it when it appears, then start a
  run. Live bpm shows on the record screen + lock-screen later; avg/max are saved with the run and
  appear in the activity history (`❤️ bpm`).

---

## How it works (for future reference)

- **JS** (`app.jsx` → `HeartRate` helper): guarded `registerPlugin('HeartRate')`, same no-op
  pattern as `GeoTracker`/`LiveActivity`. `scan()` emits `deviceFound`; `connect()` subscribes and
  emits `heartRate` {bpm} + `connection` {state}. RecordRun collects samples only while recording,
  computes avg/max on save, and posts `avg_hr`/`max_hr`.
- **Native** (`HeartRatePlugin.swift`): CoreBluetooth central scans for the standard **Heart Rate
  Service `0x180D`**, connects, subscribes to **Heart Rate Measurement `0x2A37`**, and parses the
  GATT value (UInt8 or UInt16 bpm per the flags byte).
- **Backend** (`activities.js` + `schema.js` + `db/index.js`): `avg_hr`/`max_hr` columns
  (auto-migrated), accepted on `POST /activities` (clamped to 20–260 bpm) and returned by the
  existing `SELECT *` reads.

## Still open / nice-to-haps later
- Pushing live HR into the **Live Activity** card (currently HR shows in-app; the lock-screen card
  still shows distance/time/pace only — would need an extra field on `RunActivityAttributes`).
- **Apple Watch** as an HR source (needs the watchOS companion app — the HIGH-PRIORITY roadmap item).
- Storing the **full HR series** per run for a chart on the activity detail (today we store avg+max).
