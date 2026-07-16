---
author: claude
type: prep
date: 2026-07-07
---

# Android Ship Checklist — TEAM 3332 on Google Play

Goal: get Android users onto the app. iOS is done (build 14 verified on TestFlight 7/7);
Android native project doesn't exist yet. Companion docs: `mobile/SETUP-ANDROID.md` (details),
`mobile/LIVE-ACTIVITY-ANDROID-SETUP.md` (run notification).

## ⚠️ Same payments rule as Apple

Google Play's equivalent of Apple 3.1.1: digital memberships sold **in-app** must use Google
Play Billing (15% under $1M/yr). The web-purchase decision (buy on team3332.com only, app is
sign-in-only, no purchase UI or links) **covers both stores** — decide once, apply to both.

## Phase 0 — Ernest, in parallel (started 7/7)

- [ ] **Android Studio** installed — https://developer.android.com/studio (~2GB)
- [ ] **Play Console account** — https://play.google.com/console, $25 one-time
  - **Personal** account: must run a closed test with **12 testers for 14 consecutive days**
    before production access — real timeline risk for Sept launch.
  - **Organization** (Katch Media LLC): skips the 12-tester rule but needs a **D-U-N-S number**
    (free; check dnb.com if the LLC has one). Likely the faster path if D-U-N-S exists.
  - Either way, identity verification can take days — **start the account now**, before the
    build is ready.

## Phase 1 — Generate the project (Mac, after Studio installs)

```bash
cd mobile/
npm install                 # picks up new @capacitor/local-notifications dep (added 7/7)
npm run sync:www
npx cap add android
npx cap sync android
```

`android/` is gitignored (regenerated from config) — intentional, same as `ios/`.

## Phase 2 — One-time native edits (do immediately after Phase 1)

1. **Manifest permissions** — in `android/app/src/main/AndroidManifest.xml`, inside
   `<manifest>` above `<application>`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

2. **Run-notification plugin** (Android's Live Activity analog) — follow
   `LIVE-ACTIVITY-ANDROID-SETUP.md`: copy `android-native-src/.../LiveActivityPlugin.kt` in and
   add `registerPlugin(LiveActivityPlugin.class);` to MainActivity. NOTE: unlike iOS, this
   registration is code-based and survives `cap sync` — no packageClassList patch needed on
   Android.

3. ✅ **Runtime notification permission** — already in app code (7/7): `GeoTracker.startRecording`
   requests POST_NOTIFICATIONS via LocalNotifications before the first watcher on Android.

## Phase 3 — Emulator/device test

```bash
npm run run:android    # or npx cap open android and press ▶
```

- Log in → start a walk → grant location (**"Allow all the time"** — second prompt may route
  through Settings) and notifications.
- Background the app / lock screen → Extended Controls → Location → play a GPX route → distance
  keeps growing. The persistent "TEAM 3332 — run in progress" notification must be visible
  while backgrounded; if missing, notification permission wasn't granted.
- Verify the run-stats notification (LiveActivity analog) updates during the run.
- Save → run appears in account (backend is live, so this is end-to-end).

## Phase 4 — Signed build

- Bump `versionCode` in `android/app/build.gradle` (start at 1).
- Android Studio → **Build → Generate Signed Bundle/APK → Android App Bundle (.aab)**.
- Create the upload keystore. **BACK IT UP** (password manager + second location) — losing it
  means never updating the app. Consider Play App Signing (Google holds the release key;
  keystore is then only the upload key — recoverable. Recommended, and default for new apps).

## Phase 5 — Play Console listing

- **Name:** TEAM 3332 · **Category:** Health & Fitness
- **Short description (80 chars):** "A real virtual running team — track runs and walks, climb
  the team leaderboard."
- **Full description:** reuse the App Store draft (identity/community angle first, then GPS
  tracking with live pace + heart rate, leaderboard, run clubs, profiles). No watch/Dynamic
  Island mentions on Android.
- **Privacy policy URL:** team3332.com/privacy (required)
- **Screenshots:** phone screenshots (min 2; take on emulator or device) — record screen
  mid-run, run-stats notification, leaderboard, profile.
- **Data safety form** (Google's version of Apple's privacy questionnaire — answer identically):
  - Collected: name, email (account), precise location (fitness tracking), health/fitness
    (heart rate, workouts), account IDs. All linked to identity, used for app functionality.
  - No ads, no data sold, no tracking across apps. Data encrypted in transit; deletion
    available in-app (account deletion shipped June 20).
- **Background location declaration** (Google is strict; approval hinges on this):
  - Justification text: "TEAM 3332 is a run/walk tracker. Background location is required so a
    workout keeps recording distance and route while the screen is locked or the user switches
    apps — the core function of the app. A persistent notification is shown whenever tracking
    is active, and tracking only runs during a user-started workout."
  - Google requires a **short screen-recording video** showing the in-app flow that leads to
    the background-location permission prompt and the feature working. Record on the emulator
    once Phase 3 passes.
- **Content rating questionnaire** + target audience (18+ or 13+ per your ToS).

## Phase 6 — Submit

- Personal account: create the **closed testing** track first (12 testers, 14 days), then apply
  for production. Organization account: can go straight to production review.
- First review typically takes up to ~7 days. Rejections come with reasons — paste them into a
  session and we fix + resubmit. Likely first hits: background-location video insufficient,
  data-safety mismatch, payments (moot if web-purchase model).

## Current status (7/7)

- ✅ App code is cross-platform; notification-permission code + local-notifications dep added
- ✅ Kotlin LiveActivityPlugin source committed in `android-native-src/`
- ⬜ Everything else above
