---
author: claude
type: handoff
id: handoff620b
date: 2026-06-20
session: 15 (continues handoff620)
---

# HANDOFF 620b — Saturday, June 20 2026 (session 15)

## TL;DR
**First TestFlight build is LIVE.** Walked Ernest through the full Apple ship path and the app is now
**Ready to Test** on TestFlight: build **1.0 (1)**, bundle `com.team3332.app`, signed by the paid
Individual team (Ernest Smith / `HS95TLWF38`). Crucially, the build ships **today's session-14
features** because we re-synced the stale iOS web assets first. Also added a HIGH PRIORITY Apple Watch
item to the roadmap. Ernest is on a ~30-min break and will continue.

## ✅ Done this session
1. **Confirmed handoff620 #1 was already complete** — session-14 work (account deletion, auto-pause,
   smoothed live speed, ToS/Privacy drafts) was rebuilt, committed (`103f4e8`), and pushed before this
   session. `main == origin/main`. Built `app/app.js` is fresh.
2. **Found the App Store Connect record already existed** — bundle ID `com.team3332.app` registered +
   "TEAM 3332" app record created (so handoff620 #2's portal steps were already done). TestFlight was
   empty (no builds) — so the real gap was uploading a build.
3. **Fixed stale iOS assets before building (important).** `mobile/www/app.js` was from 02:04 and did
   NOT contain today's features. Ran `npm run sync` in `mobile/` (build:app → sync-www → `npx cap sync`
   → patch-native-config) — finished clean, pods installed, 5 Capacitor plugins, assets copied into
   `ios/App/App/public`. Without this the TestFlight build would have shipped the OLD UI.
4. **Archived + uploaded via Xcode.** Scheme=App, destination=Any iOS Device (arm64), automatic
   signing on both **App** and **Team3332Widget** targets (Team = Ernest Smith), Version 1.0 / Build 1.
   Product → Archive → Distribute App → upload succeeded ("App 1.0 (1) uploaded"). No export-compliance
   prompt blocked it — build went straight to **Ready to Test** (90-day window).
5. **Roadmap:** added a 🔴 HIGH PRIORITY item — full **Apple Watch** support (native watchOS companion
   that records runs from the wrist, live stats, syncs all activity features back to the account, à la
   Strava). Top of `ROADMAP.md`.

## ▶️ Pick up here (next 30 min / next session)
- **Finish TestFlight tester setup** (where we paused): in App Store Connect → TestFlight →
  create an **Internal Testing** group → add Ernest's Apple ID → confirm build 1.0 (1) is attached →
  install the **TestFlight** app on the iPhone and pull the build.
- **On-device smoke test** of today's features on the real build: auto-pause, account-deletion flow,
  smoothed live speed, plus the GPS-loss banner and Live Activity.

## 🟡 Open / not yet done
- **Stripe vs Apple IAP** decision — still the real App Store *approval* blocker for paid memberships;
  doesn't block TestFlight, does block public submission. Resolve before submitting.
- **ToS / Privacy** drafts (`app/*.draft.html`) still need lawyer review before swapping into live pages.
- **Apple Watch support** (new HIGH PRIORITY, roadmap) — not started.
- **Android** build path (`cap add android` + notification plugin), PostgreSQL migration, onboarding
  quiz / admin panel — all still buildable in the sandbox when ready.

## Notes
- Repo path has a space → commit/push from the Mac. Frontend is a build: edit `app/src/app.jsx` →
  for the mobile app run `cd mobile && npm run sync` (NOT just build:app — `www/` is a separate copy).
- A `.git/index.lock` may reappear (sandbox can't remove it) → `rm -f .git/index.lock` on the Mac.
- Nothing new to commit from this session except the roadmap edit + these handoff notes.
- Prior: handoff620 (session 14 features + this session's starting point).
