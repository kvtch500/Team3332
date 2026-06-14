# TEAM 3332 — Android Setup (Capacitor)

Android is the **second** platform. iOS comes first (see `SETUP-CAPACITOR.md`).
The app code is already cross-platform — the `GeoTracker` helper in `../app/index.html`
loads the same `@capacitor-community/background-geolocation` plugin on Android as on iOS,
and `android.useLegacyBridge: true` is already set in `capacitor.config.json` (this is the
fix that stops background location halting after 5 minutes on Android).

So this is **native-project setup + Android-specific permissions**, not new app logic.
Do it as its own focused session, after the iOS path is on TestFlight.

---

## STEP 0 — Prerequisites

1. **Android Studio** — https://developer.android.com/studio (large download; installs the
   Android SDK, an emulator, and the build toolchain).
2. **Google Play Console** account — https://play.google.com/console ($25 one-time) — only
   needed for distribution, not for emulator testing.
3. **Node 18+** and the existing `mobile/` scaffold (already in place).
4. A JDK — Android Studio bundles one; no separate install usually needed.

---

## STEP 1 — Generate the native Android project

From the `mobile/` folder on your Mac:

```bash
npm install                 # if not already done
npm run sync:www            # copies ../app -> www/
npx cap add android         # generates the android/ project (needs Android Studio/SDK)
npx cap sync android        # copies www/ + plugins (incl. background-geolocation) in
```

Like `ios/`, the `android/` folder is **gitignored** — it's regenerated from config, so it
won't appear in the repo. That's intentional.

---

## STEP 2 — Android permissions (the real Android-specific work)

Background location on Android is stricter than iOS and needs explicit manifest entries
**plus** runtime requests. Edit `android/app/src/main/AndroidManifest.xml` and add these
inside `<manifest>` (above `<application>`):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Notes:
- The plugin declares its own **foreground service**; you supply the permissions above.
- **`ACCESS_BACKGROUND_LOCATION`** (Android 10+): the user must separately grant **"Allow all
  the time"** — Android shows this as a second step and often sends them to Settings. The
  plugin's `addWatcher({ requestPermissions: true })` prompts for foreground location; the
  "all the time" upgrade may need a nudge to Settings. Plan for that UX.
- **`POST_NOTIFICATIONS`** (Android 13+): Android **requires** a visible persistent
  notification while tracking in the background, and you must request this permission at
  runtime — **the plugin gets no background updates without it.**

### Requesting the notification permission at runtime
Add the local-notifications plugin and request permission before the first background watch
on Android (this is the one bit of Android-specific app code still to write):

```bash
npm i @capacitor/local-notifications
npx cap sync android
```

Then in `GeoTracker.startRecording` (in `../app/index.html`), before `addWatcher` on Android:

```js
// Android 13+ needs notification permission for the tracking notification
if (Cap?.getPlatform?.() === 'android') {
  const LN = Cap.registerPlugin('LocalNotifications');
  try { await LN.requestPermissions(); } catch (e) { /* non-fatal */ }
}
```

(Optional) Customize the tracking notification's channel name/icon/color in
`android/app/src/main/res/values/strings.xml` — see the plugin README. Not required to ship.

---

## STEP 3 — Run on an emulator / device

```bash
npm run run:android
# or: npx cap open android   (opens Android Studio; press ▶ Run, pick an emulator)
```

**Test the same way as iOS:** log in → start a run → grant location ("Allow all the time")
and notifications → send the app to the background or lock the screen → use the emulator's
**Extended Controls → Location** (the "···" toolbar) to play a GPX route or move the pin →
return to the app and confirm distance/route kept growing. Watch for the persistent
"recording" notification while backgrounded — if it's missing, notification permission
wasn't granted.

> Real-time upload note: after ~5 min backgrounded, Android throttles HTTP requests made from
> the WebView. **This does NOT affect us** — the recorder accumulates points locally and only
> POSTs to `/activities` on Save, not continuously. No native HTTP plugin needed.

---

## STEP 4 — Build & distribute (when ready)

- In Android Studio: set the application ID (already `com.team3332.app`), bump versionCode,
  **Build → Generate Signed Bundle/APK → Android App Bundle (.aab)** with a signing key
  (create and **back up** the keystore — losing it means you can't update the app).
- Upload the `.aab` to Google Play Console, complete the listing (description, screenshots,
  **Data safety** form — you collect location + account), and submit. First review can take a
  few days.
- Reuse `../app/privacy.html` and `../app/terms.html` for the required policy URLs. Google is
  especially strict about a clear justification for `ACCESS_BACKGROUND_LOCATION` — be explicit
  that it's for run tracking with the screen off.

---

## Everyday workflow (after setup)

```bash
# edit ../app/index.html as usual, then:
npm run sync
npx cap run android
```

## Quick reference
- App ID: `com.team3332.app` · Name: `TEAM 3332` · webDir: `www`
- Plugin: `@capacitor-community/background-geolocation` (shared with iOS)
- Already set: `android.useLegacyBridge: true` in `capacitor.config.json`
- Still to do: `cap add android`, manifest permissions above, runtime notification request,
  emulator test, Play Console.
