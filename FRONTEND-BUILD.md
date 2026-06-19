# TEAM 3332 — Frontend build (pre-transpile, no in-browser Babel)

Status as of **June 19, 2026** (Phase 2a + 2b): the web/native frontend is **pre-transpiled AND
fully bundled**. The app body no longer runs through Babel-standalone in the browser; esbuild
compiles the JSX and **bundles React, ReactDOM, Leaflet AND `@capacitor/core` into `app/app.js`**
(none are CDN/UMD globals anymore). The app boots with **zero CDN dependency** and works offline.
The native Capacitor head-loader (`document.write` of `capacitor.js`) has been **retired** —
`registerPlugin`/`Capacitor` ship in the bundle and proxy through the bridge the native runtime
injects. ⚠️ Phase 2b touches the background-GPS path, so it **must be re-verified on device**
(foreground + locked-screen tracking) — the sandbox can't prove it.

## Why

`app/index.html` used to load `@babel/standalone` from a CDN and transpile ~2,740 lines of JSX
**in the browser on every cold boot**. That was:
- the cause of the **Babel-8 black-screen outage** (handoff617), and
- the main reason for the **slow black-screen first boot** on the native WKWebView (handoff618b).

Pre-transpiling removes both: no Babel download, no boot-time transpile.

## The layout (Phase 1)

| File | Role |
|---|---|
| `app/src/app.jsx` | **SOURCE.** The React app body (the old `text/babel` block). Edit this. |
| `app/app.js` | **GENERATED.** Pre-transpiled, **bundled** (React + ReactDOM + Leaflet inside), minified output of `app.jsx`. Committed & deployed. **Never hand-edit.** |
| `app/leaflet.css` | **GENERATED.** Leaflet's stylesheet, copied from `node_modules` by the build. Committed. Local (no CDN). **Never hand-edit.** |
| `app/index.html` | Shell: links local `leaflet.css`, then loads `app.js` (which bundles React/ReactDOM/Leaflet/@capacitor/core). Boot UI + watchdog live here. The native head-loader is **gone**. |
| `app/build.mjs` | esbuild build script (JSX → bundled `app.js`) + copies `leaflet.css`. |

`app/src/app.jsx` now **imports** `react`, `react-dom/client`, `leaflet`, and
`{ Capacitor, registerPlugin }` from `@capacitor/core` (root `dependencies`, version-pinned
18.3.1 / 18.3.1 / 1.9.4 / ^6.0.0 to match the old CDN + the native Capacitor 6 line). esbuild
bundles them all in (`bundle:true`, `process.env.NODE_ENV` defined to `production`). The app uses
only Leaflet vector layers (`tileLayer`/`polyline`/`circleMarker`) — no default marker icons — so
the image assets referenced inside `leaflet.css` are never requested.

**Capacitor (Phase 2b):** `GeoTracker`, `LiveActivity` and `IS_NATIVE_APP` now use the bundled
`Capacitor.isNativePlatform()` / `registerPlugin(...)` instead of reading `window.Capacitor`. On
device, the native runtime still injects the low-level bridge at document-start and the bundled
`registerPlugin` proxies through it (the canonical Capacitor setup); on the web, `isNativePlatform()`
is false so the recorder falls back to `navigator.geolocation` exactly as before. The 617d failure
mode (`window.Capacitor` injected without `registerPlugin`) is now impossible — `registerPlugin`
ships in the bundle. `sync-www.mjs` no longer copies `capacitor.js`, and the `index.html`
head-loader was removed.

> ⚠️ **Phase 2b is GPS-sensitive.** After building, **re-verify background GPS on device**:
> foreground "GPS ready" preview, the live route polyline while recording, and tracking that
> continues when the screen locks / app is backgrounded (the `@capacitor-community/background-
> geolocation` watcher). If anything regresses, this is the commit to revert.

## Build it

esbuild is a **root devDependency**. Once, at the repo root:

```bash
cd ~/Desktop/claude\ ai/3332
npm install            # installs esbuild (and runs the backend install hook)
```

Then, after any edit to `app/src/app.jsx`:

```bash
npm run build:app      # regenerates app/app.js
```

## ⚠️ The one rule that will bite you

`app/app.js` is what **both** the live web app **and** the native bundle actually run.

- **Edit `app/src/app.jsx`, then `npm run build:app`, then commit BOTH** `app/src/app.jsx`
  **and** the regenerated `app/app.js`.
- **Never edit `app/app.js` by hand** — your change is overwritten on the next build.
- **Never push `index.html` without a matching, freshly-built `app/app.js`** — `index.html`
  references `app.js`, so a missing/stale bundle = black screen on web and native.

## Native build (unchanged workflow, now auto-builds first)

`mobile/`'s sync scripts now run the app build before copying, and `sync-www.mjs` **fails loudly**
if `app/app.js` is missing:

```bash
cd mobile
npm run sync           # = npm run build:app  ->  copy www/ (app.js + leaflet.css, NO capacitor.js)  ->  npx cap sync
# then ⌘R in Xcode
```

## Validation checklist (on the Mac — sandbox can't transpile)

- [ ] `npm install` at repo root succeeds; `node_modules/{esbuild,react,react-dom,leaflet,@capacitor/core}` exist.
- [ ] `npm run build:app` prints `✓ built app/app.js` **and** `✓ copied leaflet.css -> app/leaflet.css`;
      both files are non-empty (app.js is now larger — it bundles React/ReactDOM/Leaflet/@capacitor/core).
- [ ] Open `app/index.html` locally (or deploy to a preview): app mounts, and in the Network tab
      there are **no** requests to `unpkg.com` for react / react-dom / leaflet, **no** `babel`
      request, **no** `text/babel`, **no** `capacitor.js` request. `leaflet.css` loads same-origin.
- [ ] Spot-check core flows: login, record screen (foreground GPS + live polyline), leaderboard,
      challenges, clubs, captain tools.
- [ ] **Phase 2b GPS re-test (critical) — `cd mobile && npm run sync` then ⌘R:** app boots (no black
      screen); **foreground** "GPS ready" preview works; the **live route polyline** draws while
      recording; tracking **continues when the screen locks / app is backgrounded** (the TEAM 3332
      "run in progress" notification appears); the Live Activity card still shows. If any of these
      regress, revert the Phase 2b commit. (Regression baseline: handoff618b background GPS.)
- [ ] Web (team3332.com) after deploy: app loads; `app.js` is requested; no console errors;
      `navigator.geolocation` fallback still records a run in the browser.

## If something breaks

- Black screen on web/native → `app/app.js` is missing or stale. Run `npm run build:app` and
  redeploy/re-sync.
- `React is not defined` / `L is not defined` → should no longer happen (they're bundled into
  `app.js`). If it does, the build didn't bundle — confirm `app/build.mjs` has `bundle:true` and
  that `react`/`react-dom`/`leaflet` are installed (`npm install` at the repo root), then rebuild.
- Map renders but unstyled / controls misplaced → `app/leaflet.css` is missing or wasn't synced.
  Re-run `npm run build:app` (it copies it) and make sure `leaflet.css` is in `index.html` and in
  `sync-www.mjs`'s INCLUDE list.
- esbuild reports a syntax error in `app.jsx` → fix it in `app/src/app.jsx` (the only file you
  edit) and rebuild. The error's line number maps directly to `app.jsx`.
- Need to roll back fast → `app/index.html.prebuild.bak` is the pre-change single-file version
  (Babel-based). Restoring it reverts the whole frontend to the old no-build path.
