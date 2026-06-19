---
author: claude
type: handoff
id: handoff619
date: 2026-06-19
session: 12 (continues handoff618g)
---

# HANDOFF 619 — Friday, June 19 2026 (session 12)

## TL;DR
Did **Phase 2a of the frontend pre-build**: React, ReactDOM and Leaflet are now **bundled into
`app/app.js`** instead of loaded from a CDN. The rendering stack boots with zero CDN dependency
and works offline. **`@capacitor/core` and the native head-loader were deliberately left alone**
(that's the GPS-critical path → Phase 2b, must be device-tested). All edits are source-only — the
**Mac still has to `npm install` + `npm run build:app`** (sandbox can't run esbuild). Nothing
committed by me (working agreement: Ernest commits/pushes from the Mac).

## ⚠️ FIRST: there was already uncommitted work in the tree (from 618g)
Before this session, the working tree had an **uncommitted native fix** (the 618g timer-jump fix)
that the 618g handoff never mentioned — looks like that session ended mid-fix. It's good work:
the lock-screen **TIME was jumping** because iOS rate-limits app-pushed Live Activity updates, so
it now adds `startedAt: Date` to the attributes and renders a self-counting `Text(start, style:
.timer)` (lock screen + Dynamic Island expanded). Mirrored in both `mobile/ios-native-src/`
(source of truth) and the live `mobile/ios/` copies, plus the 618g doc's 16.1→16.2 wording fixes.

**Commit that separately first (it's native-only, no JS rebuild needed):**
```bash
cd "/Users/ernestsmith/Desktop/claude ai/3332"
git add "daily update/handoff618g.md" mobile/ios-native-src mobile/ios
git commit -m "Live Activity: self-counting Text(.timer) so lock-screen TIME stops jumping (iOS rate-limits app pushes)"
git push
```
Then ⌘R and confirm the TIME ticks smoothly (no jumping) on the lock screen.

## What Phase 2a changed (this session)

Goal (from FRONTEND-BUILD.md): bundle the vendor libs **into** `app.js` so there's no CDN
dependency and the app works offline. Split into 2a (rendering stack, safe) and 2b (Capacitor,
GPS-sensitive). **Did 2a only.**

**Source edits (all in the repo, none built/committed):**
1. `package.json` — added `dependencies`: `react@18.3.1`, `react-dom@18.3.1`, `leaflet@1.9.4`
   (pinned to the exact versions previously served from unpkg, so behavior is unchanged).
2. `app/src/app.jsx` — added at the top:
   ```js
   import React from 'react';
   import * as ReactDOM from 'react-dom/client';
   import L from 'leaflet';
   ```
   **Plus a required fix:** the live/preview map components guarded on `window.L` (6 spots). Bundled
   Leaflet binds locally as `L`, so `window.L` is now `undefined` — left as-is every map would have
   fallen back to "Map unavailable". Changed all `window.L` → `L` (always defined now; the guards
   are defensive no-ops). `window.Capacitor` references (7) were **left untouched** — that's 2b.
3. `app/build.mjs` — `bundle:true`, `format:'iife'`, `define {process.env.NODE_ENV:'"production"'}`
   (pulls React's prod build), and after building it **copies `node_modules/leaflet/dist/leaflet.css`
   → `app/leaflet.css`** so the stylesheet is local too.
4. `app/index.html` — removed the 3 unpkg `<script>` tags (react, react-dom, leaflet) and the
   leaflet.css CDN `<link>`; added a local `<link rel="stylesheet" href="leaflet.css">`. Updated the
   boot watchdog (it probed `window.React`/`window.ReactDOM`, which no longer exist once bundled).
   **The native Capacitor head-loader `<script>` is unchanged.**
5. `mobile/sync-www.mjs` — added `leaflet.css` to the `INCLUDE` list so the native bundle gets it.
6. `FRONTEND-BUILD.md` — updated to Phase 2a status + Phase 2b plan + new troubleshooting.

**Generated on build (Mac):** `app/app.js` (rebuilt, now larger — bundles the libs) and the new
`app/leaflet.css`. Both must be committed (like app.js always is).

## ⚠️ What Ernest needs to do (on the Mac)

```bash
cd "/Users/ernestsmith/Desktop/claude ai/3332"
npm install            # fetches react, react-dom, leaflet (+ esbuild already there)
npm run build:app      # prints: ✓ built app/app.js  AND  ✓ copied leaflet.css -> app/leaflet.css
```
Verify, then commit the Phase 2a set:
```bash
git add package.json package-lock.json app/src/app.jsx app/build.mjs app/index.html \
        app/app.js app/leaflet.css mobile/sync-www.mjs FRONTEND-BUILD.md \
        "daily update/handoff619.md"
git commit -m "Frontend Phase 2a: bundle React/ReactDOM/Leaflet into app.js (zero-CDN rendering stack, offline)"
git push
```
Native (optional but recommended to confirm no regression):
```bash
cd mobile && npm run sync   # builds app.js, copies www/ incl. leaflet.css, cap sync
# then ⌘R in Xcode
```

## Validation
- **In-sandbox (done):** `node --check` on `app/build.mjs` and `mobile/sync-www.mjs` → PASS.
  Confirmed no remaining `window.L`; confirmed `React.Component`/`React.Fragment`/`<>` are covered
  by the default `import React`, `ReactDOM.createRoot` by `import * as ReactDOM from 'react-dom/client'`,
  and all 7 `window.Capacitor` refs intact (GPS path untouched).
- **Could NOT build in-sandbox** — npm registry is 403-blocked so react/leaflet/esbuild can't be
  installed here. **Real proof = Mac `npm install` + `npm run build:app` + load the page.** ✗ until done.

## On the Mac, eyeball after building (web first — fastest)
- App mounts at team3332.com/app (or a local open of `app/index.html`).
- **Network tab: NO requests to `unpkg.com`** for react / react-dom / leaflet; `leaflet.css` loads
  from your own origin; no `babel`, no `text/babel`.
- **Record screen: the live map still draws** the gold route polyline + start/head markers, and
  the post-run preview map fits the route. (This is the `window.L`→`L` change — verify it didn't
  break map rendering.)
- Turn off wifi → reload a cached page → the React UI still boots (offline; tiles won't load but
  the app shell renders).
- Native ⌘R: app boots (no black screen), maps render, and **GPS is unchanged** — foreground +
  locked-screen tracking still work (we didn't touch the Capacitor path, but confirm).

## Open Items (priority order)
- **Commit the 618g timer fix** (native, separate commit above) + ⌘R confirm TIME no longer jumps.
- **Build + commit Phase 2a** (commands above) + web/native eyeball.
- **Phase 2b (remaining, GPS-gated):** bundle `@capacitor/core` (import `registerPlugin`/`Capacitor`
  instead of reading `window.Capacitor`) and retire the native head-loader + `capacitor.js` copy in
  `sync-www.mjs`. **Must be done with on-device GPS re-testing** (foreground + locked screen) — do
  NOT do this in the sandbox. This is the last piece to make the app fully zero-CDN/offline.
- Optional: self-host the Google Fonts `<link>` too (last remaining CDN ref; a font CDN failure
  only falls back to system fonts, never a black screen — low priority).
- Still pending from 618e/f: eyeball Progress tab real splits + the 618f GPS-loss banner on device.
- Carried: Live Activity polish (Dynamic Island expanded, end flash); Android ongoing-notification
  analog; paid Apple Dev → TestFlight; test-account deletion; lawyer ToS/Privacy; PostgreSQL ~2mo
  pre-launch.

## ⚠️ Working Agreements (unchanged)
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space; commit from the root.
- **Frontend is a build:** edit `app/src/app.jsx` (never `app/app.js`) → `npm run build:app` →
  commit `app.js` (and now `leaflet.css`). Never push `index.html` without a fresh `app.js`.
- **Native rebuild = `cd mobile && npm run sync` THEN ⌘R** (sync builds app.js first).
- Sandbox can't transpile/bundle JS (npm blocked) → frontend validated by `node --check` of build
  scripts + static review; **the bundle itself is only proven by the Mac build + page load.**
- New native iOS plugins must be added to `packageClassList` (auto-handled by
  `mobile/patch-native-config.mjs`).

## Start Here Next Time
1. Confirm the **two commits** above are pushed (618g timer fix; Phase 2a bundle) and that the web
   app shows no unpkg requests + maps still render.
2. If 2a is verified clean, do **Phase 2b** (bundle `@capacitor/core`, retire head-loader) **with
   device GPS testing** — that completes the zero-CDN/offline goal.
3. Then launch runway: paid Apple Dev → TestFlight → Android.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin) · Repo: github.com/kvtch500/Team3332
- Frontend (Phase 2a): source `app/src/app.jsx` (imports react/react-dom/leaflet) → esbuild
  **bundles** into `app/app.js` (committed) + copies `app/leaflet.css` (committed). Shell
  `app/index.html` links local `leaflet.css`, loads `app.js`, keeps the native Capacitor
  head-loader. Build = `npm run build:app`. See FRONTEND-BUILD.md.
- Live Activity (618g): `startedAt` + `Text(.timer)` self-counting clock (uncommitted until you run
  the first commit above). One-time Xcode setup already done; `mobile/LIVE-ACTIVITY-SETUP.md`.
- Native: Capacitor 6, `com.team3332.app`, iOS at `mobile/ios`. Build = `cd mobile && npm run sync`
  then ⌘R. Device = KATCH, Personal Team signing. Background GPS verified 618b (untouched here).
- Tests: `cd backend && node test/<file>` — 136 green (backend untouched this session).
- Prior sessions: handoff618g.md · handoff618f.md · handoff618e.md · handoff618d.md
