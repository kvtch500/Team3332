# Live Activity setup (iOS) — one-time Xcode wiring

This sets up the lock-screen / Dynamic Island live run card (618g). The Swift source and the
JS bridge are already written and committed — but **a Live Activity needs a separate Widget
Extension target, and that can only be created in the Xcode GUI.** Do these steps once on the
Mac. After that, normal `cd mobile && npm run sync` + ⌘R works as usual.

Open the project first: `cd mobile && npm run open:ios`

> **Where the source lives:** `mobile/ios/` is **gitignored** — it's regenerated on the Mac by
> `npx cap add ios`, so anything placed inside it is NOT committed and can be wiped. The durable,
> committed source-of-truth for these files is **`mobile/ios-native-src/`**. In the steps below,
> when you "Add Files to…", point at `mobile/ios-native-src/…` and **check "Copy items if needed"**
> so Xcode copies them into the project. If you ever re-run `cap add ios`, re-do Steps 2–4.

Files in `mobile/ios-native-src/` (you'll attach them to targets below):
- `Shared/RunActivityAttributes.swift` — shared data model
- `Team3332Widget/RunLiveActivity.swift` — the SwiftUI lock-screen + Dynamic Island UI
- `Team3332Widget/Team3332WidgetBundle.swift` — the widget's `@main` entry
- `App/LiveActivityPlugin.swift` + `App/LiveActivityPlugin.m` — the Capacitor bridge

---

## Step 1 — Enable Live Activities on the App target

1. Select the **App** project in the navigator → **App** target → **Info** tab.
2. Add a new key: **`NSSupportsLiveActivities`** → type **Boolean** → value **YES**.
   (Equivalent: add `<key>NSSupportsLiveActivities</key><true/>` to `App/Info.plist`.)

## Step 2 — Add the Capacitor plugin to the App target

1. **File → Add Files to "App"…**, select `ios-native-src/App/LiveActivityPlugin.swift` and
   `ios-native-src/App/LiveActivityPlugin.m`. Check **"Copy items if needed"**.
2. In the dialog, **tick "App"** under "Add to targets". (If Xcode offers to create a
   bridging header for the `.m`, accept — the Capacitor `.m` macros need the ObjC ↔ Swift bridge.
   A Capacitor app usually already has one.)

## Step 3 — Create the Widget Extension target

1. **File → New → Target… → Widget Extension** → Next.
2. Product Name: **`Team3332Widget`**. Uncheck **"Include Configuration App Intent"**.
   **Check "Include Live Activity"** if offered. Finish. (If Xcode asks to activate the new
   scheme, click **Activate**.)
3. Xcode generates a `Team3332Widget` group with sample files. **Delete the generated
   `Team3332Widget.swift` / `*Bundle.swift` / `*LiveActivity.swift` samples** (Move to Trash) —
   you'll use the ones already in the repo instead.
4. **File → Add Files to "App"…** and add `ios-native-src/Team3332Widget/RunLiveActivity.swift`
   and `ios-native-src/Team3332Widget/Team3332WidgetBundle.swift` (Copy items if needed), ticking
   **only the `Team3332Widget` target**.
5. Set the widget's bundle id to a child of the app's: `com.team3332.app.Team3332Widget`
   (target → General / Signing). Use the **same Personal Team / signing** as the App target.
   Deployment target: **iOS 16.1+**.

## Step 4 — Share the data model with BOTH targets

1. **File → Add Files to "App"…**, add `ios-native-src/Shared/RunActivityAttributes.swift`
   (Copy items if needed), then select it in the navigator.
2. Open the **File Inspector** (right panel) → **Target Membership** → tick **BOTH**
   **`App`** and **`Team3332Widget`**.
   > This is the #1 thing people miss. If only one target has it, you'll get
   > "cannot find type 'RunActivityAttributes' in scope".

## Step 5 — Build, sync, run

```bash
cd mobile && npm run sync     # rebuilds app.js + syncs www into the native project
# then in Xcode: select the App scheme (not the widget) → ⌘R onto the KATCH device
```

---

## How to test on device

1. Open the app → **Record** a run → **START**.
2. Lock the phone (or swipe to Home). You should see the **TEAM 3332 live card** on the lock
   screen showing **distance / time / pace**, and on a Dynamic Island phone, the pill shows the
   run icon + miles (long-press to expand).
3. The stats update about once a second. Tap **END** → the activity disappears with the final stats.

## Notes / troubleshooting

- **iOS only, 16.1+.** On web, Android, and older iOS the JS bridge is a silent no-op — nothing
  to do and nothing breaks. (Android's live-stats analog is the existing foreground notification.)
- **"areActivitiesEnabled" false** → the user disabled Live Activities for the app in
  **Settings → TEAM 3332 → Live Activities**, or globally in **Settings → Face ID & Passcode**.
  The plugin resolves `started:false` and the run records normally without a card.
- **No push server needed** — these are local, app-driven updates via `Activity.update(...)`.
  No APNs, no app group required (the plugin runs in-process in the app).
- If the widget shows a stale/old layout, delete the app from the device and reinstall (widget
  extensions cache aggressively).
- The 1-second update cadence is driven by the recorder's existing timer in `RecordRun`
  (`app/src/app.jsx`). Local ActivityKit updates aren't rate-limited the way push updates are.
