---
author: claude
type: handoff
id: handoff617
date: 2026-06-17
---

# HANDOFF 617 — Wednesday, June 17 2026

## Where Things Stand
team3332.com is live. This session was a production firefight followed by a front-end pass.
Fixed a full **black-screen outage** (a CDN auto-upgrade to Babel 8) that took down both the
website and the native app, hardened against a repeat, then shipped a round of UX changes:
a redesigned bottom nav with a center Record button, SVG tab icons, a new Account page split
out of the Me tab, and **profile photos** (upload + display across the app). Everything is
committed and pushed (commits `928e9cb` → `2102132`). Backend tests still **93 green**.

## What This Session Shipped

**1. 🔴 Black-screen outage — diagnosed & fixed (highest impact):**
- Root cause: `app/index.html` (and the native `www/` bundle) loaded `@babel/standalone` from
  unpkg with **no version pinned**. Babel published `8.0.0` as "latest"; its in-browser build
  doesn't transpile this app, so React never mounted → the page's black background with nothing
  on it, on BOTH the website and the native app at the same moment, with zero code change. (The
  app compiles its JSX in the browser via Babel standalone.)
- Fix: pinned all three CDN scripts — `react@18.3.1`, `react-dom@18.3.1`,
  `@babel/standalone@7.29.7` (last 7.x) — in `app/index.html` and `mobile/www/index.html`. (`0dcc503`)
- Hardening: added a loading placeholder (TEAM 3332 + spinner) inside `#root`, plus a
  **plain-JS boot watchdog** that runs even if Babel fails to load and, if the app hasn't mounted
  8s after load, swaps in a "couldn't load — reload" message + Reload button instead of a silent
  black screen. (`5a9db01`)
- ⚠️ Architectural debt: compiling JSX in-browser via CDN Babel is inherently fragile. Pre-building
  to plain JS at deploy time would remove this entire failure class. Recommended follow-up.

**2. Latent backend bugs fixed (same class as the earlier challenge-500):**
- `PATCH /api/auth/me` and `POST /api/activities` bound possibly-`undefined` values straight into
  SQLite (better-sqlite3 throws on undefined). Both frontend callers send partial bodies, so partial
  profile updates and recorder saves (which omit `notes`) would 500. Coerced to `?? null`. Confirmed
  empirically that node:sqlite / better-sqlite3 throw on undefined binds. (`928e9cb`)

**3. Bottom nav redesign:** (`6adf612`)
- New order: Home · Runs · ⊙**Record** · Board · Me. Record is a raised gold center button (play
  icon) that opens the run/walk recorder from any page; on save it refreshes and navigates to the
  Runs list. The recorder was lifted from `ActivityLog` up to the App level (`showRecord` state +
  an `activityKey` remount key).
- **Goals (challenges)** moved out of the bottom bar into the sidebar/hamburger menu (still in `NAV`).

**4. Tab icons → inline SVG (replaced emoji):** (`4b885e9`)
- Home (solid house), Runs (sneaker), Board (star), Me (person), Record (play) are now hand-coded
  inline SVGs using `fill="currentColor"`, so they tint gray/gold via the existing
  `.bottom-nav-item` / `.active` colors and render identically on iPhone + web. The sidebar (`NAV`)
  still uses emoji (not requested).

**5. Account page (split out of the Me tab):** (`e1332b1`)
- New `Account` component + route + a sidebar entry directly below "My Profile". It holds the
  **Membership** card (plan / status / price + Elite upgrade via Stripe) and the **Location** card,
  both moved out of Profile. The Me tab now shows only the banner, Running Stats, Run Club, and Badges.

**6. Profile photos — upload + display:** (`e1332b1`, `2102132`)
- **Upload:** the banner avatar is now an uploader (tap the avatar or the camera badge). The image is
  cropped square + resized to 256px JPEG (q0.85) **client-side** via a new `resizeImage()` canvas
  helper, then sent as `PATCH /auth/me { avatar_url }` and stored as a base64 data-URL.
- **Backend:** reuses the existing `avatar_url` schema column; added a matching auto-migration
  (`ALTER TABLE users ADD COLUMN avatar_url`) in `db/index.js` so the live DB gets it on next boot.
  `safeUser` returns it automatically (`SELECT u.*`). `PATCH /auth/me` accepts `avatar_url` with a
  ~700KB guard (413 if larger; body limit is already 2mb).
- **Other members:** new shared `<Avatar member={} style={} />` component (photo-or-initial).
  `avatar_url` was added to the `/leaderboard` and `/clubs/:id` queries, so member photos now show in
  the club roster, the dashboard leaderboard preview, and the Board podium + full rankings.

## Tests
- Backend still **93 green** (no test changes; all suites pass after the edits). Frontend validated via
  the usual bracket-balance method + `node --check` on edited backend files (no JSX toolchain — the
  npm registry is blocked in the sandbox, so Babel can't be installed there).
- ⚠️ No new tests added this session. Worth adding: a partial `PATCH /auth/me` case (guards the
  undefined-bind regression) and an `avatar_url` round-trip.

## New Schema
- `users.avatar_url TEXT` — already present in `db/schema.js`; added the matching auto-migration in
  `db/index.js` for existing databases. Stores a small base64 data-URL (resized client-side).

## Apple / Native Status
- The native app (`mobile/`) bundles `www/`, which is **gitignored and regenerated from `app/` by
  `npm run sync`**. All of this session's `app/index.html` changes reach iOS only after
  `cd mobile && npm run sync` + an Xcode rebuild. (I also hand-edited `www/index.html` for the CDN
  pin + fallback, but `sync` overwrites it from `app/`.)
- Apple Developer activation / TestFlight: unchanged from 614 (was awaiting activation).

## Open Items
- **Live map during a run** — the feature we were about to start: Leaflet + free OpenStreetMap tiles
  behind the run stats (the recorder already collects `points[]`). ~2–3h. Pin the Leaflet version
  from day one (lesson from the Babel outage).
- **Pre-build the frontend** to drop the in-browser Babel/CDN dependency — removes the black-screen
  failure class. Do after TestFlight.
- Profile photos: no "remove photo" option yet (upload only replaces); display is banner + member
  lists, not the sidebar (by choice).
- Carried from 614: Apple Dev activation → TestFlight → physical phone; Android setup
  (`mobile/SETUP-ANDROID.md`); test-account deletion; lawyer ToS/Privacy review pre-launch;
  PostgreSQL migration ~2 months pre-launch.

## ⚠️ Working Agreements (unchanged)
- **Claude edits; Ernest commits/pushes from the Mac.** Stale lock fix:
  `rm -f ~/Desktop/claude\ ai/3332/.git/index.lock`.
- Repo path has a space: `~/Desktop/claude\ ai/3332`.
- Sandbox can't load Mac `better-sqlite3` (tests use the `node:sqlite` shim); the npm registry is
  blocked in the sandbox (no install/transpile) — validate the frontend via bracket-balance.
- Write large code as many small edits (content-filter can reject big blocks).

## Start Here Next Time
1. Build the **live map** for the run recorder (Leaflet + OSM, pinned version) — the queued feature.
2. `cd mobile && npm run sync` + rebuild iOS so all of this session's UI lands in the native app.
3. Once Apple Dev is active: app icon/splash → Archive → TestFlight → run on Ernest's phone.
4. Consider the frontend pre-build to kill the CDN-Babel fragility.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/team3332 (local clone = the `3332` folder)
- This session's commits (all pushed): `928e9cb` `0dcc503` `5a9db01` `6adf612` `4b885e9` `e1332b1` `2102132`
- Stack: static HTML/React (in-browser Babel) · Node/Express + SQLite on Railway volume · Stripe test
  mode · Resend email · Capacitor iOS wrapper (background-geolocation)
- Tests: `cd backend && node test/<file>` (node:sqlite shim auto-applies) — 93 green
- Prior sessions: handoff614.md · handoff613.md · handoff611.md
