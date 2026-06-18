# TEAM 3332 — Background GPS (screen-locked run tracking)

Status as of **June 18, 2026**: ✅ **VERIFIED ON DEVICE.** Built to a physical iPhone (free
personal team, Ernest Smith signing), `registerPlugin` confirmed `true` in the native
webview, and a lock-and-walk test passed — the route filled in the distance walked while the
screen was locked. Background screen-locked tracking works.

Note for next time: the fix only takes effect after `npm run sync` regenerates `www/`
(copies `capacitor.js` + the loader-bearing `index.html`). Building without re-running sync
ships a stale `www/` and `registerPlugin` reads `false`.

## The one-line problem

Foreground GPS already works on the native app. Background GPS (tracking that keeps
running when the screen locks or the app is backgrounded) did **not** work — not because
the feature was unbuilt, but because the web layer couldn't reach the native plugin.

## Root cause (confirmed in handoff617d)

The recorder code in `app/index.html` (`GeoTracker`) is already written for background GPS:
it calls `window.Capacitor.registerPlugin('BackgroundGeolocation')` and uses the community
plugin's `addWatcher({ backgroundTitle, backgroundMessage, ... })`.

But this is a **no-build, single-HTML app** — it loads React/Babel from a CDN and never
bundles `@capacitor/core`. In the native WKWebView, the bridge injects `window.Capacitor`
(so `isNativePlatform()` is true) but **not** `registerPlugin` (that function lives in the
`@capacitor/core` JS runtime). So `GeoTracker`'s `canUsePlugins` guard is false, `isNative`
is false, and recording falls back to `navigator.geolocation` — which the OS suspends when
the screen locks. Result: no locked-screen tracking.

Everything else for background GPS is **already in place**:
- `@capacitor-community/background-geolocation@^1.2.26` is installed and the native
  framework builds into the app (verified in `ios/.../Frameworks`).
- `ios/App/App/Info.plist` already has `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, and `UIBackgroundModes: [location]`.

So the entire fix is: **get `registerPlugin` into the native webview.**

## The fix (this change — 618)

`@capacitor/core` ships a prebuilt, standalone runtime at
`node_modules/@capacitor/core/dist/capacitor.js` (~10 KB) that, when loaded via a plain
`<script>`, attaches `registerPlugin` to `window.Capacitor` and connects to the native
bridge. We load exactly that file, only in the native app. Two small edits:

1. **`mobile/sync-www.mjs`** — now also copies `@capacitor/core/dist/capacitor.js` into
   `www/capacitor.js` during sync, so the bundled native app ships the runtime. It's
   copied from `node_modules` so it always matches the installed `@capacitor/core` version.

2. **`app/index.html` `<head>`** — a small synchronous loader that, **only** when running
   natively and only if `registerPlugin` is missing, `document.write`s
   `<script src="capacitor.js">`. `document.write` during head parse runs synchronously, so
   `registerPlugin` exists before the app's `text/babel` script (and the `GeoTracker` IIFE)
   executes. On the web, `window.Capacitor` is absent, so the loader never fires — **zero
   web impact**, and `team3332.com` is byte-for-byte unchanged in behavior.

No bundler, no killing CDN-Babel, no app rewrite required for background GPS. (The full
frontend pre-build is still worth doing later for runtime robustness, but it is **not** a
prerequisite for this.)

## What Ernest needs to do (on the Mac)

```bash
cd ~/Desktop/claude\ ai/3332

# 1. Commit the source edits (Claude can't push)
git add app/index.html mobile/sync-www.mjs mobile/BACKGROUND-GPS.md
git commit -m "Background GPS: load @capacitor/core runtime in native so registerPlugin exists (foreground unchanged on web)"
git push

# 2. Rebuild the native app
cd mobile
npm install          # ensure @capacitor/core is present (provides capacitor.js)
npm run sync         # regenerates www/ (now includes capacitor.js) + npx cap sync
npm run open:ios     # Xcode -> build to a device/simulator with Cmd-R
```

## Validation checklist (the actual proof)

Foreground regression (do first, fast):
- [ ] App boots normally on device/simulator (no black screen).
- [ ] Record screen opens; foreground tracking still works (timer + live polyline).
- [ ] On the **web** (team3332.com) the Record screen is unchanged — no `capacitor.js`
      request in the Network tab (confirms the loader stays dormant on web).

Background GPS (the new capability — needs a physical iPhone with Apple Dev signing):
- [ ] Start a run, then **lock the screen** and walk a block.
- [ ] iOS shows the background-location indicator and the "TEAM 3332 — run in progress"
      notification (the `backgroundTitle`/`backgroundMessage` from `GeoTracker.startRecording`).
- [ ] Unlock: the route polyline includes the distance walked while locked (not a straight
      line / gap).
- [ ] Permission prompt asks for "Always" / "Change to Always Allow" location.

Quick sanity in Safari Web Inspector (Develop → Simulator/Device → TEAM 3332 → Console):
- [ ] `typeof window.Capacitor.registerPlugin === 'function'` returns **true** (the fix).
- [ ] No `Cap.registerPlugin is not a function` error.

## If it doesn't bind

- Confirm `www/capacitor.js` exists after `npm run sync` (the sync log lists copied items).
- In the Console, check `window.Capacitor.isNativePlatform()` is `true` and
  `registerPlugin` is a function. If `registerPlugin` is still missing, the script tag
  didn't load — check the Network tab for `capacitor.js` (404 = path/sync issue).
- iOS only grants true background location with **"Always"** permission; "While Using"
  pauses on lock. The plugin requests it, but the user can decline — re-check in iOS
  Settings → TEAM 3332 → Location.
- The community plugin needs `UIBackgroundModes: location` (already present). If Apple
  later flags it in review, the `NSLocationAlwaysAndWhenInUseUsageDescription` string is
  the one they read.

## Follow-ups (not blockers)

- Errors inside async GPS callbacks aren't caught by the React error boundary (618) — only
  render/lifecycle throws are. Background-geolocation failures surface via `onError` in
  `GeoTracker`, which is fine, but worth keeping in mind.
- Full frontend pre-build (kill CDN-Babel) — separate, larger track; improves boot
  robustness and would bundle `@capacitor/core` the "proper" way, making this head-loader
  unnecessary.
