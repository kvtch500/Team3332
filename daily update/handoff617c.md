---
author: claude
type: handoff
id: handoff617c
date: 2026-06-17
session: 3 (continues handoff617b)
---

# HANDOFF 617c — Wednesday, June 17 2026 (session 3)

## Where Things Stand
Short verification + cleanup session, no code changes. Picked up 617b's top open items and
**closed two of them**: confirmed the Mapbox dark basemap actually renders on the live site, and
retired the old leaked Mapbox token. Repo is unchanged from 617b (HEAD = `68ceb00`). Paused here
because Ernest is restarting the MacBook.

## What This Session Did (verification only — no edits, no commits)

**1. Verified Mapbox dark map is LIVE on team3332.com (closes 617b open item #1):**
- Loaded https://team3332.com/app in Chrome (via Claude-in-Chrome extension). App mounts clean —
  React root present, Leaflet loaded, correct title. **No Babel black-screen.**
- Confirmed deployed source has the full Mapbox wiring: `baseTileLayer`, `MAPBOX_TOKEN` split-array,
  tile template `api.mapbox.com/styles/v1/${MAPBOX_STYLE}/tiles/512/{z}/{x}/{y}@2x?...`, `dark-v11`.
- **Decisive test:** reassembled the split-token in-page (a valid 94-char `pk.` token) and fetched a
  real tile from the team3332.com origin → **HTTP 200, image/png, ~349 KB.** This proves the token's
  URL restriction allows team3332.com and Mapbox serves real dark tiles — the "blank map" failure
  mode is ruled out. (Token value never logged — only status returned.)
- Still NOT done: the visual GPS walk-test (follow-cam pan + live polyline) — desktop has no real GPS.

**2. Retired the old Mapbox token (closes 617b open item #2):**
- In Mapbox console there were exactly two tokens:
  - `team3332-web` — `...zVe0jZlu5ISuz-NDQx536g`, **URLs: 2** (URL-restricted). THE ONE IN USE. Untouched.
  - `Default public token` — was `...gtAlmwF...`, **URLs: N/A** (unrestricted) = the old leaked one.
- Mapbox doesn't allow deleting the Default token, only **Refresh**. Ernest clicked Refresh → new
  value now ends `...8e8QyyPyQ0t9CVaV6ty2jA`, "1 minute ago". Old `...gtAlmwF...` value is dead.
- App reads `team3332-web` only, so refreshing the Default token breaks nothing.

## Repo / Deploy State (unchanged from 617b)
- HEAD = `68ceb00` "Wire Mapbox dark basemap into route maps (OSM fallback)", and cached
  `origin/main` == HEAD → the Mapbox push from 617b is confirmed landed and live.
- Working tree clean except untracked `daily update/*.md` handoffs + `.DS_Store` / `mobile/package-lock.json` noise.

## Open Items (carried, in priority order)
- **Native sync** — on the Mac: `cd mobile && npm run sync` → `npx cap sync ios` → Xcode rebuild, to
  get today's maps + Mapbox into the iOS app. (Stale lock fix if needed:
  `rm -f ~/Desktop/claude\ ai/3332/.git/index.lock`.)
- **Phone GPS walk-test** — start a real run on team3332.com from a phone; confirm the follow-cam
  pans, the gold polyline draws live, and the review mini-map fits the route. Watch that Mapbox dark
  tiles render (not blank) on mobile too.
- **Regression tests** for the 617 backend fixes: `PATCH /auth/me` partial body, `avatar_url`
  round-trip. (Claude can do this in-sandbox without the Mac — good next pickup.)
- **Frontend pre-build** to kill CDN-Babel fragility (bigger architectural task).
- Carried from 614: Apple Dev activation → TestFlight → physical phone; Android setup;
  test-account deletion; lawyer ToS/Privacy review; PostgreSQL migration ~2mo pre-launch.
- Pre-existing: 4000-point cap freezes the trailing line on very long activities.

## ⚠️ Working Agreements (unchanged)
- **Claude edits; Ernest commits/pushes from the Mac.** Repo path has a space: `~/Desktop/claude\ ai/3332`.
- Sandbox can't transpile JS or reach npm/unpkg/mapbox — validate frontend via bracket-balance.
- Write large code as many small edits (content-filter can reject big blocks).
- For browser tasks, Claude-in-Chrome extension must be connected; Claude never enters credentials.

## Start Here Next Time
1. After the MacBook restart: do the **native sync** (npm run sync + cap sync ios + Xcode) so today's
   maps + Mapbox land on iOS.
2. **Phone walk-test** the live follow-map + review preview on team3332.com.
3. Then resume the bigger queue: **regression tests** (617 backend fixes) → **frontend pre-build** →
   Apple Dev → TestFlight.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/Team3332 (local clone = the `3332` folder). HEAD `68ceb00`.
- Map stack: Leaflet 1.9.4 (pinned) · OSM tiles default · Mapbox `dark-v11` via `team3332-web`
  token (`...zVe0jZlu...`, URL-restricted to team3332.com, stored split-and-joined).
- Mapbox tokens: `team3332-web` = IN USE (restricted). Default public token refreshed to
  `...8e8QyyPyQ0t9CVaV6ty2jA` (not used by app).
- Tests: `cd backend && node test/<file>` (node:sqlite shim) — 93 green as of 617.
- Prior sessions: handoff617b.md · handoff617.md · handoff614.md · handoff613.md
