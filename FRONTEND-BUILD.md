# TEAM 3332 — Frontend build (pre-transpile, no in-browser Babel)

Status as of **June 19, 2026** (Phase 2a): the web/native frontend is **pre-transpiled AND
bundled**. The app body no longer runs through Babel-standalone in the browser; esbuild compiles
the JSX and now **bundles React, ReactDOM and Leaflet into `app/app.js`** (no longer CDN UMD
globals). The rendering stack boots with zero CDN dependency and works offline. `@capacitor/core`
is intentionally NOT bundled yet (Phase 2b) so the verified background-GPS path stays untouched.

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
| `app/index.html` | Shell: links local `leaflet.css`, then loads `app.js` (which bundles React/ReactDOM/Leaflet). Boot UI + watchdog + the native Capacitor head-loader live here. |
| `app/build.mjs` | esbuild build script (JSX → bundled `app.js`) + copies `leaflet.css`. |

`app/src/app.jsx` now **imports** `react`, `react-dom/client`, and `leaflet` (root `dependencies`,
version-pinned 18.3.1 / 18.3.1 / 1.9.4 to match the old CDN), and esbuild bundles them in
(`bundle:true`, `process.env.NODE_ENV` defined to `production`). The app uses only Leaflet vector
layers (`tileLayer`/`polyline`/`circleMarker`) — no default marker icons — so the image assets
referenced inside `leaflet.css` are never requested.

`window.Capacitor` is **still** injected by the native head-loader in `index.html` (unchanged — the
verified background-GPS path is untouched). `GeoTracker`/`LiveActivity` still read
`window.Capacitor.registerPlugin` as before.

> **Phase 2b (remaining, GPS-gated):** bundle `@capacitor/core` **into** `app.js` (import
> `registerPlugin`/`Capacitor` instead of reading `window.Capacitor`) and retire the native
> head-loader + `capacitor.js` copy. Deferred on purpose — it touches the just-verified
> background-GPS path, so it must be done with on-device GPS re-testing (foreground + locked
> screen), not in the sandbox.

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
npm run sync           # = npm run build:app  ->  copy www/ (incl. app.js + capacitor.js)  ->  npx cap sync
# then ⌘R in Xcode
```

## Validation checklist (on the Mac — sandbox can't transpile)

- [ ] `npm install` at repo root succeeds; `node_modules/{esbuild,react,react-dom,leaflet}` exist.
- [ ] `npm run build:app` prints `✓ built app/app.js` **and** `✓ copied leaflet.css -> app/leaflet.css`;
      both files are non-empty (app.js is now larger — it bundles React/ReactDOM/Leaflet).
- [ ] Open `app/index.html` locally (or deploy to a preview): app mounts, and in the Network tab
      there are **no** requests to `unpkg.com` for react / react-dom / leaflet, **no** `babel`
      request, **no** `text/babel` in the page source. `leaflet.css` loads from the same origin.
- [ ] Spot-check core flows: login, record screen (foreground GPS + live polyline), leaderboard,
      challenges, clubs, captain tools.
- [ ] Native: `cd mobile && npm run sync` then ⌘R → app boots **faster**, no black screen;
      foreground + background GPS still work (regression of handoff618b).
- [ ] Web (team3332.com) after deploy: app loads; `app.js` is requested; no console errors.

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
