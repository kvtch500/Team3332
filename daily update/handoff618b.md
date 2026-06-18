---
author: claude
type: handoff
id: handoff618b
date: 2026-06-18
session: 6 (continues handoff618)
---

# HANDOFF 618b — Thursday, June 18 2026 (session 6)

## Where Things Stand
The big one is done: **background GPS is now VERIFIED on a physical device.** Built the
native app to a real iPhone for the first time (free personal team), confirmed
`registerPlugin === true` in the native webview, and passed a lock-and-walk test — the route
filled in the distance walked while the screen was locked. Also fixed the **leaderboard.js
SQL injection** (parameterized `pace_group`), tests green. Two of the top open items from 618
are cleared.

Edits this session (leaderboard.js + BACKGROUND-GPS.md) were committed/pushed by Ernest from
the Mac.

## What This Session Did

**1. First native build to a physical iPhone (the walk-test, finally real):**
- This was Ernest's first-ever device build, so it was mostly one-time signing setup.
- Device = iPhone named **KATCH**. Free **Personal Team (Ernest Smith)** signing — no paid
  account needed for on-device testing (7-day cert expiry is irrelevant for a walk-test).
- **Signing snags resolved, in order:**
  - The **KATCH org** team hit a **PLA (Program License Agreement) blocker** — "Unable to
    process request – PLA Update available." Same error appeared under the personal team too,
    because both sign through the one Apple ID. **Fix: accept the updated agreement at
    developer.apple.com/account**, then Xcode minted a profile.
  - Bundle ID briefly got a trailing dot (`com.team3332.app.`) → invalid. Set to clean
    `com.team3332.app`.
  - Keychain prompt ("codesign wants to access key Apple Development: Ernest Smith") froze the
    build at 650/663 until the **Mac login password** was entered → **Always Allow**.
- **Detour to avoid:** Ernest wandered into Settings and tripped iOS **"Security Delay in
  Progress … enroll in MDM"** (Stolen Device Protection, 1-hr timer). **That's not part of a
  dev install — tap Done and back out.** When Xcode runs the app over the cable it launches
  directly; no manual "Trust" / Developer App step was needed.

**2. ⚠️ The gotcha that wasted an hour — `npm run sync` must run before rebuild:**
- First on-device run showed `registerPlugin === false` (fix not bound). Root cause: the
  app built from a **stale `mobile/www/`** (dated Jun 17) — `www/capacitor.js` was missing
  and `www/index.html` had no loader. The 618 source edits were correct, but **`npm run sync`
  had never been run**, so the bundle didn't include them.
- Fix: `cd mobile && npm run sync` (regenerates `www/` with the loader + copies
  `capacitor.js`), then ⌘R. After that, Console returned **`true`**. Walk-test passed.
- Recorded this in `mobile/BACKGROUND-GPS.md` so it doesn't bite again: **building without
  re-running sync ships a stale www/ and `registerPlugin` reads false.**

**3. Bug fix — leaderboard.js SQL injection (DONE):**
- `backend/routes/leaderboard.js` line ~20 built the pace filter by string interpolation:
  `AND u.pace_group = '${paceGroup}'`. Parameterized it to `AND u.pace_group = ?` with a
  bound `params` array, calling `.all(...params, limit)` (placeholder order: pace before
  LIMIT). Now an injection string is treated as a literal (matches nothing). Matches the
  pattern already used in `admin.js` / `users.js`.
- `backend/test/leaderboard.test.js` — **8 passed / 0 failed**, including the pace_group
  filter test.

**4. Doc — BACKGROUND-GPS.md marked VERIFIED:**
- Status line flipped from "needs a device build + walk-test" to "✅ VERIFIED ON DEVICE" with
  the device-test result + the sync-before-rebuild note.

## Repo / Deploy State
- Two files committed/pushed by Ernest this session: `backend/routes/leaderboard.js`,
  `mobile/BACKGROUND-GPS.md`. (Plus the `npm run sync` regenerated `mobile/www/` —
  capacitor.js now copied in.)
- `.DS_Store` and `mobile/package-lock.json` left uncommitted (usual noise).
- Reminder: Terminal commit failed once because it ran from `mobile/` — `git add` paths are
  relative; commit from the repo root (`~/Desktop/claude\ ai/3332`).

## Open Items (priority order)
- **leaderboard.js SQL injection — ✅ DONE this session.**
- **Phone GPS walk-test (foreground + background) — ✅ DONE / VERIFIED this session.**
- **Frontend pre-build** — still the next big track. Kills CDN-Babel fragility; today's slow
  **black-screen first boot** (it eventually came up) is a symptom of CDN/Babel load on the
  native webview. Would also let `@capacitor/core` be bundled the "proper" way, making the
  head-loader unnecessary.
- **Async/event-handler error catching** — the React error boundary (618) only catches
  render/lifecycle throws, not GPS async callbacks. `GeoTracker` routes plugin errors through
  `onError`; consider surfacing those.
- Carried: Apple Dev (paid) activation → TestFlight → wider device testing; Android setup;
  test-account deletion; lawyer ToS/Privacy review; PostgreSQL migration ~2mo pre-launch.
  - Note: paid TestFlight will require the **KATCH org PLA** accepted (done now) and proper
    org-team signing rather than the personal team used today.

## ⚠️ Working Agreements (unchanged)
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space:
  `~/Desktop/claude\ ai/3332`. Commit from the **root**, not `mobile/`.
- **Native rebuild = `cd mobile && npm run sync` THEN ⌘R.** Skipping sync ships stale www/.
- Sandbox can't transpile JS or reach npm/unpkg/mapbox — validate frontend via bracket-balance.
- Backend tests DO run in-sandbox: `cd backend && node test/<file>` (Node 22, node:sqlite shim).
- iOS debugging: Safari → Develop → KATCH → TEAM 3332 → Web Inspector (Console + Network).
- Device signing: free **Personal Team (Ernest Smith)**, device **KATCH**, bundle
  `com.team3332.app`. First dev install over cable needs no manual Trust step.

## Start Here Next Time
1. **Frontend pre-build** (boot robustness) — the last big technical track; also fixes the
   slow black-screen first boot. Bundles `@capacitor/core` properly.
2. Quick win if wanted: wrap async/GPS callbacks so failures surface (error boundary doesn't
   catch them).
3. Then the launch runway: paid Apple Dev → TestFlight (org-team signing now that the PLA is
   accepted) → Android.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/Team3332 (local clone = the `3332` folder).
- Native: Capacitor 6, appId `com.team3332.app`, iOS project at `mobile/ios`. Build =
  `cd mobile && npm run sync` then ⌘R in Xcode. Web layer = `mobile/www` (generated from
  `app/`; includes capacitor.js after sync). Device = KATCH, Personal Team signing.
- GPS: foreground = navigator.geolocation. Background = community plugin via `registerPlugin`,
  wired by loading `@capacitor/core` in native — **VERIFIED ON DEVICE 618b.**
- Map stack: Leaflet 1.9.4 · web = Mapbox dark-v11 · native = OSM.
- Tests: `cd backend && node test/<file>` — leaderboard 8 green; full suite was 125 green @ 618.
- Prior sessions: handoff618.md · handoff617d.md · handoff617c.md · handoff617b.md · handoff617.md
