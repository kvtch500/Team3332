---
author: claude
type: handoff
id: handoff618c
date: 2026-06-18
session: 7 (continues handoff618b)
---

# HANDOFF 618c — Thursday, June 18 2026 (session 7)

## Where Things Stand
Started the **frontend pre-build** track (the last big technical item). Did **Phase 1: kill
in-browser Babel.** The ~2,740-line JSX app body was pulled out of `app/index.html` into a new
source file `app/src/app.jsx`, and a real build step (esbuild) now pre-transpiles it to
`app/app.js`. `index.html` no longer loads Babel-standalone and no longer transpiles in the
browser. This removes the Babel-8 black-screen failure mode and the slow cold-boot transpile.

**⚠️ Not yet built or tested — the sandbox can't transpile/reach npm.** The repo currently has
the SOURCE + tooling but **`app/app.js` does not exist yet.** Ernest must run the build on the
Mac (below) **before** committing/pushing, or the web app and native app will black-screen
(index.html references an app.js that isn't there).

Phase 1 deliberately left React/ReactDOM/Leaflet on the CDN (still global `React`/`ReactDOM`/`L`)
and left the **Capacitor background-GPS head-loader completely untouched** — the verified 618b
background GPS is not at risk.

## What This Session Did

**1. Extracted the app body to a real source file (verified byte-identical):**
- `app/index.html` lines 910–3653 were a single `<script type="text/babel">` block. Its inner
  JSX (lines 911–3652) was moved verbatim into **`app/src/app.jsx`** (+ a header comment).
- Confirmed with `diff`: the extracted body is **IDENTICAL** to the original block, so it's
  exactly the JSX that already worked under Babel — esbuild just compiles the same source.
- The block in `index.html` is replaced by a single `<script src="app.js"></script>`.

**2. esbuild build tooling (`app/build.mjs` + root `package.json`):**
- `app/build.mjs`: esbuild, `bundle:false`, `jsx:'transform'` (classic → `React.createElement`,
  using the global `React`), `loader {'.jsx':'jsx'}`, `target safari14/chrome90/ff90/edge90`,
  minified → `app/app.js`. Nothing is bundled (source has no imports; libs stay global).
- Root `package.json`: added `"build:app": "node app/build.mjs"` (+ `"build"`) and
  `devDependencies.esbuild ^0.23.0`.

**3. `index.html` head/watchdog rewired:**
- Removed the `@babel/standalone` `<script>`.
- React/ReactDOM CDN switched **dev → production min** UMD (same `window.React`/`ReactDOM`
  globals, smaller + faster).
- Boot-watchdog "missing libs" check dropped `!window.Babel` (Babel is gone) → now
  `(!window.React || !window.ReactDOM)`.

**4. Native sync now builds first + fails loudly:**
- `mobile/sync-www.mjs`: `app.js` added to the copy list; **hard error + `exit(1)`** if
  `../app/app.js` is missing ("run `npm run build:app` first").
- `mobile/package.json`: `sync:www`, `sync`, `run:ios`, `run:android` now run
  `npm run build:app` (→ root build) **before** syncing, so the native bundle is never stale.

**5. Docs + safety net:**
- New **`FRONTEND-BUILD.md`** (repo root): layout, the build commands, the "edit app.jsx →
  rebuild → commit app.js" rule, validation checklist, rollback.
- `.gitignore`: added `node_modules/` + `mobile/node_modules/` (root esbuild install) with a
  note that `app/app.js` is committed on purpose.
- **`app/index.html.prebuild.bak`** = the pre-change single-file (Babel) version — local
  rollback net. Untracked; delete it once the new path is verified, or keep as a safety copy.

## Repo / Deploy State
- **Nothing committed/pushed yet this session** (Claude edits; Ernest commits). `app/app.js` is
  **not generated yet** — it must be built on the Mac before the next push.
- Files changed/added: `app/index.html`, **`app/src/app.jsx` (new)**, **`app/build.mjs` (new)**,
  `package.json` (root), `mobile/sync-www.mjs`, `mobile/package.json`, `.gitignore`,
  **`FRONTEND-BUILD.md` (new)**, `app/index.html.prebuild.bak` (new, local-only).

## ⚠️ What Ernest needs to do (on the Mac) — DO THIS BEFORE PUSHING

```bash
cd ~/Desktop/claude\ ai/3332

# 1. Install esbuild (once) and BUILD the bundle — this creates app/app.js
npm install
npm run build:app            # expect: ✓ built app/app.js from app/src/app.jsx

# 2. Sanity-check locally BEFORE committing
open app/index.html          # app should mount; Network tab shows NO babel request,
                             # page source has NO "text/babel". Click through login,
                             # record (foreground GPS + live trail), leaderboard, clubs.

# 3. Commit SOURCE + GENERATED bundle together (both are needed for the web deploy)
git add app/index.html app/src/app.jsx app/app.js app/build.mjs \
        package.json mobile/sync-www.mjs mobile/package.json .gitignore FRONTEND-BUILD.md
git commit -m "Frontend pre-build (Phase 1): pre-transpile JSX with esbuild, drop in-browser Babel"
git push                     # this also deploys the live web app — app.js MUST be in the commit

# 4. Native rebuild (now auto-builds app.js first) + device regression of background GPS
cd mobile
npm run sync                 # build:app -> copy www/ (incl. app.js + capacitor.js) -> cap sync
npm run open:ios             # ⌘R; confirm faster boot, foreground + LOCKED-SCREEN GPS still work
```

If anything looks wrong on web before pushing, restore `app/index.html.prebuild.bak` over
`app/index.html` to revert to the old Babel path instantly.

## Open Items (priority order)
- **Build + verify Phase 1 on the Mac** (above) — the one thing gating this change. Until
  `app/app.js` is built, do not push.
- **Phase 2 frontend pre-build (optional, later):** bundle React/ReactDOM/Leaflet (+CSS) and
  `@capacitor/core` *into* `app.js` so the app boots with **zero CDN** dependency (offline-safe)
  and the native Capacitor **head-loader can be retired**. Bigger diff; intentionally deferred to
  keep 618b's verified background GPS untouched. Do it once Phase 1 is proven on device.
- **Async/GPS error catching** — React error boundary (618) only catches render/lifecycle throws,
  not GPS async callbacks; `GeoTracker` routes plugin errors through `onError` — surface those.
- Carried: paid Apple Dev → TestFlight (org-team signing; KATCH PLA already accepted) → wider
  device testing; Android setup; test-account deletion; lawyer ToS/Privacy review; PostgreSQL
  migration ~2mo pre-launch.

## ⚠️ Working Agreements
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space:
  `~/Desktop/claude\ ai/3332`. Commit from the **root**, not `mobile/`.
- **NEW — frontend is now a build:** edit **`app/src/app.jsx`** (never `app/app.js`), then
  `npm run build:app`, then commit **both** `app.jsx` and the regenerated `app/app.js`. Never
  push `index.html` without a matching fresh `app/app.js`. (See `FRONTEND-BUILD.md`.)
- **Native rebuild = `cd mobile && npm run sync` THEN ⌘R.** `sync` now builds app.js first and
  errors out if it's missing.
- Sandbox can't transpile JS or reach npm/unpkg/mapbox — validate frontend via bracket-balance /
  diff only; real build + device test happen on the Mac.
- Backend tests DO run in-sandbox: `cd backend && node test/<file>` (Node 22, node:sqlite shim).
- iOS debugging: Safari → Develop → KATCH → TEAM 3332 → Web Inspector.

## Start Here Next Time
1. **Confirm Phase 1 built + verified** (web mounts with no Babel; native boots faster; GPS
   regression passes). If yes, this track's core win is banked.
2. Optional **Phase 2** (bundle libs locally, retire the head-loader) — only after device proof.
3. Quick win: surface async/GPS callback errors (error boundary doesn't catch them).
4. Then the launch runway: paid Apple Dev → TestFlight → Android.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/Team3332 (local clone = the `3332` folder).
- **Frontend (NEW):** source = `app/src/app.jsx`; built bundle = `app/app.js` (committed);
  shell = `app/index.html` (CDN React/ReactDOM prod UMD + Leaflet, then `app.js`). Build =
  `npm run build:app` (root; esbuild). See `FRONTEND-BUILD.md`.
- Native: Capacitor 6, appId `com.team3332.app`, iOS project at `mobile/ios`. Build =
  `cd mobile && npm run sync` (now builds app.js first) then ⌘R. Web layer = `mobile/www`
  (generated; includes app.js + capacitor.js). Device = KATCH, Personal Team signing.
- GPS: foreground = navigator.geolocation. Background = community plugin via `registerPlugin`,
  wired by the native head-loader — **VERIFIED ON DEVICE 618b; untouched this session.**
- Map stack: Leaflet 1.9.4 · web = Mapbox dark-v11 · native = OSM.
- Tests: `cd backend && node test/<file>` — full suite 125 green @ 618 (no backend change 618c).
- Prior sessions: handoff618b.md · handoff618.md · handoff617d.md · handoff617c.md · handoff617b.md
