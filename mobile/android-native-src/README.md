# mobile/android-native-src — committed Android native source

`mobile/android/` is **gitignored** (regenerated on the Mac by `npx cap add android`), so any
hand-written Java/Kotlin can't live there permanently. This folder is the **committed
source-of-truth** for hand-written native Android code — the direct counterpart to
`mobile/ios-native-src/`. After you generate the `android/` project, copy these files in; if you
ever re-run `cap add android`, re-apply them.

Contents (run "Live Activity" analog — an ongoing notification with live stats, 619d):

- `app/src/main/java/com/team3332/app/LiveActivityPlugin.kt` — Capacitor plugin, **jsName
  "LiveActivity"** (same name the iOS bridge uses, so `app/src/app.jsx`'s `LiveActivity` helper
  drives both platforms unchanged). Posts/updates an ongoing notification showing distance / time /
  pace; self-ticking chronometer; "Run complete" end-flash; `team3332://run` deep-link.
- `app/src/main/java/com/team3332/app/MainActivity.java` — registers the local plugin
  (`registerPlugin(LiveActivityPlugin.class)`). Replace the generated `MainActivity.java` with this
  (or add the one line). Android has **no `packageClassList`**, so there is no patch-native-config
  step — registration here is the whole mechanism.
- `AndroidManifest-additions.xml` — the `POST_NOTIFICATIONS` permission + the `team3332://run`
  `<intent-filter>` to paste into the generated manifest.

Full setup steps: **`mobile/LIVE-ACTIVITY-ANDROID-SETUP.md`**.

## Why a notification (and not a foreground service)

Android has no Live Activity API. The closest equivalent to the iOS lock-screen card is an **ongoing
notification** that we update as the run progresses. It is intentionally **not** a foreground
service: the `@capacitor-community/background-geolocation` plugin already runs the tracking
foreground service and keeps the process alive while recording, so this notification is purely the
live-stats surface — no second service to conflict with.

The elapsed **time** is rendered with `setUsesChronometer(true)` + `setWhen(startMillis)`, so it
ticks on its own without app updates — the Android counterpart to iOS's self-counting
`Text(style: .timer)` (which exists because both platforms throttle app-pushed updates while
backgrounded). Distance and pace refresh whenever the recorder's JS timer pushes an `update()`.
