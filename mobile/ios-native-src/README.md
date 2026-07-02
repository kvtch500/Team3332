# mobile/ios-native-src — committed iOS native source

`mobile/ios/` is **gitignored** (it's regenerated on the Mac by `npx cap add ios`), so any custom
Swift/ObjC we write can't live there permanently. This folder is the **committed source-of-truth**
for hand-written native iOS code. Add these files into the Xcode project with **"Copy items if
needed"**; if you ever re-run `cap add ios`, re-add them.

Contents (Live Activity feature, 618g):
- `Shared/RunActivityAttributes.swift` — ActivityKit model; target membership: **App + Team3332Widget**
- `Team3332Widget/RunLiveActivity.swift` — lock-screen + Dynamic Island SwiftUI; target: **Team3332Widget**
- `Team3332Widget/Team3332WidgetBundle.swift` — widget `@main`; target: **Team3332Widget**
- `App/LiveActivityPlugin.swift` + `App/LiveActivityPlugin.m` — Capacitor bridge; target: **App**

Contents (Heart Rate sensor, 623):
- `App/HeartRatePlugin.swift` + `App/HeartRatePlugin.m` — CoreBluetooth BLE bridge; target: **App**

Contents (Apple Watch companion, session 17):
- `Watch/Team3332WatchApp.swift` — watchOS `@main` + screen router; target: **Team3332 Watch App**
- `Watch/WorkoutManager.swift` — HealthKit + CoreLocation recording engine; target: **Team3332 Watch App**
- `Watch/WatchSessionDelegate.swift` — WatchConnectivity (watch side); target: **Team3332 Watch App**
- `Watch/WatchViews.swift` — SwiftUI start / recording / summary screens; target: **Team3332 Watch App**
- `App/WatchSyncPlugin.swift` + `App/WatchSyncPlugin.m` — Capacitor bridge (phone side, receives
  watch runs → JS → `/api/activities`); target: **App**

Full setup steps:
- Live Activity → **`mobile/LIVE-ACTIVITY-SETUP.md`**
- Heart Rate → **`mobile/HEART-RATE-SETUP.md`**
- Apple Watch → **`mobile/APPLE-WATCH-SETUP.md`**
