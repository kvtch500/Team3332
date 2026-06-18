# TEAM 3332 — Frontend build (pre-transpile, no in-browser Babel)

Status as of **June 18, 2026** (Phase 1): the web/native frontend is now **pre-transpiled**.
The app body no longer runs through Babel-standalone in the browser; esbuild compiles the JSX
ahead of time into `app/app.js`.

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
| `app/app.js` | **GENERATED.** Pre-transpiled, minified output of `app.jsx`. Committed & deployed. **Never hand-edit.** |
| `app/index.html` | Shell: loads React/ReactDOM (production UMD) + Leaflet from CDN, then `app.js`. Boot UI + watchdog live here. |
| `app/build.mjs` | esbuild build script (JSX → `app.js`). |

React, ReactDOM, and Leaflet are still loaded as **CDN UMD globals** in `index.html` — the app
body references them as globals (`React`, `ReactDOM`, `L`), so nothing is bundled; esbuild only
transpiles JSX. `window.Capacitor` is still provided by the native head-loader (unchanged — the
verified background-GPS path is untouched).

> Phase 2 (later, optional): bundle React/ReactDOM/Leaflet/@capacitor/core **into** `app.js` so
> the app boots with zero CDN dependency (works offline) and the native head-loader can be
> retired. Not done yet — deliberately kept out to protect the just-verified background GPS.

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

- [ ] `npm install` at repo root succeeds and `node_modules/esbuild` exists.
- [ ] `npm run build:app` prints `✓ built app/app.js` and `app/app.js` is non-empty.
- [ ] Open `app/index.html` locally (or deploy to a preview): app mounts, **no** `babel`
      request in the Network tab, **no** `text/babel` in the page source.
- [ ] Spot-check core flows: login, record screen (foreground GPS + live polyline), leaderboard,
      challenges, clubs, captain tools.
- [ ] Native: `cd mobile && npm run sync` then ⌘R → app boots **faster**, no black screen;
      foreground + background GPS still work (regression of handoff618b).
- [ ] Web (team3332.com) after deploy: app loads; `app.js` is requested; no console errors.

## If something breaks

- Black screen on web/native → `app/app.js` is missing or stale. Run `npm run build:app` and
  redeploy/re-sync.
- `React is not defined` → the CDN React UMD didn't load before `app.js`. Check the `<head>`
  script order in `index.html` (Leaflet → React → ReactDOM → … → `app.js` last, in `<body>`).
- esbuild reports a syntax error in `app.jsx` → fix it in `app/src/app.jsx` (the only file you
  edit) and rebuild. The error's line number maps directly to `app.jsx`.
- Need to roll back fast → `app/index.html.prebuild.bak` is the pre-change single-file version
  (Babel-based). Restoring it reverts the whole frontend to the old no-build path.
