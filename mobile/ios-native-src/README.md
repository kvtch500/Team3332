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

Full setup steps: **`mobile/LIVE-ACTIVITY-SETUP.md`**.
