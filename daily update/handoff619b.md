---
author: claude
type: handoff
id: handoff619b
date: 2026-06-19
session: 12 (continues handoff619)
---

# HANDOFF 619b — Friday, June 19 2026 (session 12, cont.)

## TL;DR
Did **Phase 2b of the frontend pre-build**: `@capacitor/core` is now **bundled into `app/app.js`**,
so `Capacitor`/`registerPlugin` come from the import instead of `window.Capacitor`. The native
**head-loader and the `capacitor.js` copy are retired**. Combined with Phase 2a (already committed),
the app now boots with **zero CDN dependency** and works offline. ⚠️ **This touches the background-
GPS path — it MUST be re-verified on device** (foreground + locked-screen). Source edits only; the
Mac still rebuilds + commits. Phase 2a (React/ReactDOM/Leaflet bundle) was already built, committed
and pushed earlier this session.

## Why this is safe in principle (but still needs device proof)
Bundling `@capacitor/core` is the **canonical** Capacitor setup. On device, the native iOS/Android
runtime injects the low-level `window.Capacitor` bridge at document-start (it always did — that's
how `isNativePlatform()` worked even before). The bundled `registerPlugin` proxies through that
bridge. The old `capacitor.js` head-loader was only a workaround for *not* bundling. So the
background-geolocation watcher binds the same way as before — but because GPS is the crown jewel,
**re-test on device** before trusting it.

## What Phase 2b changed (source only — not built/committed by me)
1. `package.json` — added `@capacitor/core: ^6.0.0` to `dependencies` (matches the native Capacitor 6
   line; installed native core is 6.2.1).
2. `app/src/app.jsx`:
   - added `import { Capacitor, registerPlugin } from '@capacitor/core';`
   - `GeoTracker` — `canUsePlugins`/`isNative` now use the bundled `registerPlugin`/`Capacitor`;
     `bg()`/`fg()` call `registerPlugin('BackgroundGeolocation'|'Geolocation')` directly. Web still
     falls back to `navigator.geolocation` (gated on `Capacitor.isNativePlatform()`).
   - `LiveActivity` — same: `isNative` via bundled `Capacitor`; `registerPlugin('LiveActivity')`
     inside the existing try/catch.
   - `IS_NATIVE_APP` — now `Capacitor.isNativePlatform()` instead of `window.Capacitor...`.
   - The 617d failure mode (`window.Capacitor` injected without `registerPlugin`) is now impossible
     — `registerPlugin` ships in the bundle.
3. `app/index.html` — **removed** the native head-loader `<script>` that `document.write`'d
   `capacitor.js`. (Phase 2a's removal of the React/ReactDOM/Leaflet CDN tags stands.)
4. `mobile/sync-www.mjs` — **removed** the `capacitor.js` copy block (no longer needed; `www/` is
   rebuilt from scratch each sync so the old file won't linger).
5. `FRONTEND-BUILD.md` — updated to Phase 2a+2b status, Capacitor section, and a GPS re-test item in
   the validation checklist.

**Regenerated on build (Mac):** `app/app.js` (now also bundles @capacitor/core — bigger),
`app/leaflet.css` (unchanged), `package-lock.json` (adds @capacitor/core).

## ⚠️ What Ernest needs to do (on the Mac)
```bash
cd "/Users/ernestsmith/Desktop/claude ai/3332"
npm install            # adds @capacitor/core to root node_modules
npm run build:app      # ✓ built app/app.js  AND  ✓ copied leaflet.css -> app/leaflet.css
```
If the build errors (e.g. can't resolve `@capacitor/core`), stop and paste it — that's the one thing
the sandbox couldn't verify. Otherwise commit Phase 2b:
```bash
git add package.json package-lock.json app/src/app.jsx app/index.html app/app.js \
        mobile/sync-www.mjs FRONTEND-BUILD.md "daily update/handoff619b.md"
git commit -m "Frontend Phase 2b: bundle @capacitor/core, retire native head-loader (zero-CDN, offline)"
git push
```
Then the **critical native test**:
```bash
cd mobile && npm run sync   # builds app.js, copies www/ (app.js + leaflet.css, NO capacitor.js), cap sync
# then ⌘R in Xcode
```

## 🔴 Device GPS re-test (do NOT skip — this is the whole risk of 2b)
On the phone (KATCH), after ⌘R:
1. Open the record screen → **foreground "GPS ready"** preview turns ready (not stuck on waiting).
2. Start a run → the **gold live route polyline** draws and follows you.
3. **Lock the screen / background the app** → tracking continues; the **TEAM 3332 "run in progress"**
   notification shows; come back and the route kept filling in (regression baseline: handoff618b).
4. The **Live Activity** lock-screen card still appears with live distance/time/pace.
5. End the run → it saves with the full track; Live Activity clears.

If any of 1–4 regress → **revert the Phase 2b commit** (`git revert <sha>`), rebuild, re-sync. Phase
2a stays intact since 2b is its own commit.

## Validation (in-sandbox, done)
- No `window.Capacitor` left in code (only in explanatory comments); no `Cap.` references remain.
- `Capacitor`/`registerPlugin` imported and used in GeoTracker, LiveActivity, IS_NATIVE_APP.
- `node --check mobile/sync-www.mjs` → PASS. No `capacitor.js` reference left in `index.html` (code).
- **Could NOT build/run** (npm blocked in sandbox) → bundle + native bridge proven only on the Mac/device.

## Open Items (priority order)
- **Build + commit Phase 2b** (commands above), then the **device GPS re-test** (the gate).
- After 2b is verified: the frontend is fully zero-CDN/offline. Only remaining CDN ref is the Google
  Fonts `<link>` (cosmetic — a font CDN failure just falls back to system fonts; self-host later, low
  priority).
- Carried: Live Activity polish (Dynamic Island expanded view, "Run complete" end-flash, deep-link
  tap); Android ongoing-notification analog; Progress tab real-splits eyeball + 618f GPS-loss banner
  on device; paid Apple Dev → TestFlight; test-account deletion; lawyer ToS/Privacy; PostgreSQL ~2mo
  pre-launch.

## ⚠️ Working Agreements (unchanged)
- Claude edits; Ernest commits/pushes from the Mac (repo path has a space — commit from root).
- Frontend is a build: edit `app/src/app.jsx` → `npm run build:app` → commit `app.js` (+ `leaflet.css`).
- Native rebuild = `cd mobile && npm run sync` then ⌘R.
- Sandbox can't transpile/bundle (npm blocked) → validated by static review + `node --check`; the
  bundle + native bridge are only proven by the Mac build + on-device run.
- If git says `index.lock: File exists`, remove the stale lock: `rm -f .git/index.lock` (it's a
  leftover from a sandbox `git status`, not a running process).

## Start Here Next Time
1. Confirm Phase 2b is committed/pushed **and the device GPS re-test passed**. If GPS regressed and
   you haven't already, revert the 2b commit and tell me — we'll debug the bridge timing.
2. With the frontend fully bundled, move to: Live Activity polish · Android ongoing-notification
   analog · launch runway (paid Apple Dev → TestFlight → Android).

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin) · Repo: github.com/kvtch500/Team3332
- Frontend (Phase 2a+2b): source `app/src/app.jsx` imports react / react-dom/client / leaflet /
  `@capacitor/core` → esbuild **bundles all** into `app/app.js` (committed) + copies `app/leaflet.css`.
  Shell `app/index.html` links local `leaflet.css`, loads `app.js`; **no CDN scripts, no head-loader**.
  Build = `npm run build:app`. See FRONTEND-BUILD.md.
- Capacitor: `GeoTracker`/`LiveActivity`/`IS_NATIVE_APP` use bundled `Capacitor.isNativePlatform()` +
  `registerPlugin(...)`. Web → `navigator.geolocation` fallback. Background watcher =
  `@capacitor-community/background-geolocation` (v1.x, Capacitor 6). Verified on device 618b (re-verify after 2b).
- Native: Capacitor 6, `com.team3332.app`, iOS at `mobile/ios`. Build = `cd mobile && npm run sync` then ⌘R.
  Device = KATCH, Personal Team signing.
- Tests: `cd backend && node test/<file>` — 136 green (backend untouched this session).
- Prior sessions: handoff619.md (Phase 2a) · handoff618g.md · handoff618f.md · handoff618e.md
