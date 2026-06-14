# TEAM 3332 — Capacitor Native Wrapper Setup

This folder (`mobile/`) is the native iOS/Android shell around the existing web app.
It is **scaffolded and ready** — but the native `ios/` and `android/` projects must be
generated **on your Mac** (they need Xcode, CocoaPods, and the npm registry, none of
which run in Claude's sandbox). Follow the steps below in order.

How it works: the web app (`../app/index.html`) already calls an **absolute** API URL
(`https://team3332-production-ba53.up.railway.app/api`). `sync-www.mjs` copies the web
app into `www/`, Capacitor bundles `www/` into the native app, and the app talks to the
same Railway backend. No URL rewriting, no separate API. Edit the web app as you always
have; re-run the sync to push changes into the native build.

---

## STEP 0 — Prerequisites (do these first; 1–2 day lead time)

These are the gating items. Nothing below works until they're done.

1. **Apple Developer Program** — enroll at https://developer.apple.com/programs/ ($99/yr).
   Approval usually takes 1–2 days. Needed for device testing, TestFlight, and the App Store.
2. **Install Xcode** — Mac App Store, ~10 GB. After install, run once and accept the license:
   ```bash
   sudo xcodebuild -license accept
   xcode-select --install      # command line tools, if prompted
   ```
3. **Install CocoaPods** (Capacitor iOS uses it):
   ```bash
   sudo gem install cocoapods
   # Apple Silicon, if the above errors: brew install cocoapods
   ```
4. **(Android only, optional this pass)** Google Play Console account ($25 one-time) at
   https://play.google.com/console + install **Android Studio**.
5. **Node 18+** (you already have it for the backend).

---

## STEP 1 — Scaffold the native projects (one time)

From this `mobile/` folder on your Mac:

```bash
cd "path/to/3332/mobile"

npm install                 # installs Capacitor (core, cli, ios, android, plugins)
npm run sync:www            # copies ../app -> www/  (run this any time the web app changes)

npx cap add ios             # generates the ios/ Xcode project  (needs Xcode + CocoaPods)
npx cap add android         # generates the android/ project    (optional; needs Android Studio)

npx cap sync                # copies www/ + plugins into the native projects
```

> If `npm install` complains about Capacitor versions, this scaffold pins v6. To move to the
> newest major instead, run: `npm i @capacitor/core@latest @capacitor/cli@latest @capacitor/ios@latest @capacitor/android@latest @capacitor/app@latest @capacitor/geolocation@latest @capacitor/splash-screen@latest @capacitor/status-bar@latest` then `npx cap sync`.

---

## STEP 2 — Run in the iOS simulator

```bash
npm run run:ios
# or: npx cap open ios   (opens Xcode; press the ▶ Run button, pick a simulator)
```

You should see the TEAM 3332 login screen. Log in and smoke-test: dashboard, record a run
(foreground GPS works via the browser geolocation API for now), leaderboard, profile.

**Apple rejects remote-URL shells** (apps that just load a website). This scaffold bundles
`www/` locally, so you're compliant — keep it that way (don't switch `webDir` to a `server.url`).

---

## STEP 3 — Background GPS — ✅ CODE DONE, finish on the Mac

**The app wiring is complete (committed June 14).** The free/community plugin
`@capacitor-community/background-geolocation` (v1.x — the Capacitor 6 line) is now a
dependency in `package.json`, and `../app/index.html` has a **`GeoTracker`** helper that:
- uses the background plugin for the recording watch on native (keeps tracking on the lock
  screen / in the background), and `@capacitor/geolocation` for the foreground "GPS ready"
  preview;
- **falls back to `navigator.geolocation`** unchanged in a plain browser — so the website
  (team3332.com) behaves exactly as before;
- normalizes every fix to `{lat, lon, accuracy, t}`, feeding the same `recorderStep`
  distance/route logic the web recorder already used.

Start is triggered on "Start run", stop on "Save/Discard" and on unmount. On native the
plugin requests **Always** permission at Start (preview already asked for When-in-use), and
shows the required foreground notification while recording.

### What's left — Mac-only steps (Claude's sandbox can't run these):

```bash
cd "path/to/3332/mobile"
npm install                         # pulls in @capacitor-community/background-geolocation
npm run sync                        # = sync:www + cap sync  (copies app/ -> www/, syncs plugins)
```

Then add the location keys to **`ios/App/App/Info.plist`** (copy from
`ios-Info.plist-additions.xml`) — required or iOS silently denies background location:
- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `UIBackgroundModes` → `location`

Re-run `npx cap sync ios`, then `npx cap run ios`. **Test:** start a run, lock the phone /
send the app to the background, walk ~100m, return — the distance/route should have kept
growing. (The simulator can feign movement via *Features → Location → City Run/Freeway Drive*.)

> **Android note:** `useLegacyBridge: true` is already set in `capacitor.config.json` (stops
> updates halting after 5 min in the background). Android 13+ also needs the
> `POST_NOTIFICATIONS` runtime permission for the tracking notification — handle when Android
> work begins (iOS-first for now).

> **Upgrade path:** to move to the production-grade `@transistorsoft/capacitor-background-geolocation`
> (paid license, most reliable for a real fitness app), install it and change the single
> `registerPlugin('BackgroundGeolocation')` call in `GeoTracker`. The rest of the recorder is
> plugin-agnostic.

---

## STEP 4 — Native polish

- **App icon + splash:** drop a 1024×1024 `icon.png` and a `splash.png` in `resources/`,
  then `npm i -D @capacitor/assets && npx capacitor-assets generate`. (Splash bg is already
  set to the brand black `#080B12` in `capacitor.config.json`.)
- **Status bar:** `@capacitor/status-bar` is installed; set dark content / brand color on launch.
- **TestFlight:** in Xcode, set your Team (Signing & Capabilities), bump build number,
  Product → Archive → Distribute → App Store Connect → TestFlight. Install on your phone and
  run the full record → save → share flow on real hardware.

---

## STEP 5 — Store submission

- App Store Connect + Play Console listings: name, description, keywords, screenshots
  (6.7" + 5.5" iPhone at minimum), privacy nutrition labels (you collect location + account).
- Apple review: 1–3 days; **first-submission rejections are common** — budget a buffer pass.
- Reuse your existing `../app/privacy.html` and `../app/terms.html` for the required URLs.

---

## ⚠️ The 30% decision (settle before in-app subscriptions)

Apple takes **30%** of digital subscriptions sold *inside* the app. Plan (standard for
fitness apps): **subscribe on the website, log in on the app.** The app must NOT show a
"Subscribe" button or link out to web payment from a paywall — Apple rejects both. Keep the
app's paywall to "Log in / your membership is managed at team3332.com." Pair this with the
pending lawyer ToS/Privacy review.

---

## Everyday workflow after setup

```bash
# 1. edit the web app as usual:  ../app/index.html
# 2. push changes into the native build:
npm run sync                # = sync:www + cap sync
# 3. run:
npx cap run ios
```

## Quick reference
- App ID: `com.team3332.app` · Name: `TEAM 3332` · webDir: `www`
- Backend: Railway (unchanged) · Web: https://team3332.com
- Files here: `capacitor.config.json`, `package.json`, `sync-www.mjs`, `www/` (generated),
  `ios-Info.plist-additions.xml`, this guide.
