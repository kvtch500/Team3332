---
author: claude
type: handoff
id: handoff614
date: 2026-06-14
---

# HANDOFF 614 — Sunday, June 14 2026

## Where Things Stand
team3332.com live and stable. Two big pushes this session: (1) **Capacitor Step 2 — background GPS — is wired in code** (web app falls back to browser geolocation unchanged; native uses a background-geolocation plugin), pending the Mac-side finish; and (2) **all three Captain Tools are now real features** (challenges, announcements, nominations) instead of fake-success toasts. Plus a GPX import bug fix and a latent challenge-create 500 fix. Backend tests went from 56 → **93 green**. Everything was committed/pushed from the Mac in two commits.

## What This Session Shipped

**1. Background GPS (Capacitor Step 2) — CODE DONE, Mac steps remain:**
- New **`GeoTracker`** helper in `app/index.html`: native (Capacitor) recording uses `@capacitor-community/background-geolocation` (keeps tracking on lock screen / backgrounded); foreground "GPS ready" preview uses `@capacitor/geolocation`; **plain browser falls back to `navigator.geolocation` unchanged** (so team3332.com behaves exactly as before). Every fix normalized to `{lat,lon,accuracy,t}` → same `recorderStep` logic. Start on "Start run", stop on Save/Discard/unmount; denial shows a toast.
- `mobile/package.json` — added `@capacitor-community/background-geolocation ^1.2.26` (v1.x = the Capacitor 6 line).
- `mobile/capacitor.config.json` — added `android.useLegacyBridge: true`.
- `mobile/SETUP-CAPACITOR.md` — Step 3 rewritten to "code done, finish on Mac."
- **iOS — DONE & VERIFIED THIS SESSION:** ran `npm install` + `npm run sync` (plugin `@capacitor-community/background-geolocation@1.2.26` confirmed in the iOS plugin list, `pod install` succeeded); the 3 location keys were added to `ios/App/App/Info.plist` (that file is gitignored — lives on the Mac, regenerates from `ios-Info.plist-additions.xml`); `npx cap run ios` booted on the iPhone 17 Pro simulator. **Background-tracking test PASSED** — started a run, backgrounded/locked the app with simulated movement (Features → Location → City Run), distance kept growing. Background GPS works on a real iOS build. ✅

**2. Captain Tools — all three now real (were toast-only stubs):**
- **Propose a Team Challenge** → real form modal posting to the existing captain-gated `POST /api/challenges`. New challenges go live to members immediately. (New `CaptainToolsCard` component in `app/index.html` replaced the fake-button block.)
- **Post Team Announcement** → new `announcements` table + captain routes (`GET/POST/DELETE /api/captain/announcements`, `/announcements/mine`). Captains compose title+message; shows in a new **"📣 Team Announcements"** card on every member's Dashboard. Captain deletes own; admin moderates any.
- **Nominate Member of the Month** → new `nominations` table + routes (`GET /api/captain/members` for the picker, `POST /api/captain/nominations`, `/nominations/mine`). One nomination per captain/member/month (409 on dup, 400 self-nominate). Admin sees a ranked tally.
- **Admin (`admin/index.html`):** two new pages — **Announcements** (list + remove) and **Nominations** (monthly tally + every-nomination detail). Added an `esc()` HTML-escaper for the new free-text fields. Overview stats now include `total_announcements` and `nominations_this_month`.

**3. GPX import bug — fixed:** `handleGpxFile` rebuilt the form without `type`, so imports always saved as "Run." Now preserves the selected Run/Walk type (functional `setForm` keeping `...f`).

**4. Latent bug fix:** `POST /api/challenges` 500'd when optional fields (`description`/`reward`) were omitted (undefined can't bind to SQLite). Coerced to `?? null`. Found via the new tests.

## Tests
- New `backend/test/captain-tools.test.js` — **22 passed** (announcements + nominations: create, member feed, captain/admin delete, dup/self guards, tally, auth).
- New `backend/test/challenges.test.js` — **15 passed** (captain create, member list/join/leave, validation, Elite tier gating, auth).
- Regression: captain-applications 12, captain-qa 14, clubs 12, group-runs 18. **Total 93 backend tests green** (was 56).
- HTML verified via bracket-balance vs git HEAD (app + admin both balanced, symmetric deltas) + admin `<script>` passed `node --check`. Same no-JSX-toolchain method as prior sessions.

## New Schema (auto-creates on boot, no migration)
- `announcements` (captain_id, title, body, created_at).
- `nominations` (captain_id, nominee_id, month 'YYYY-MM', reason, created_at, UNIQUE(captain_id,nominee_id,month)).
- Indexes: idx_announcements_created, idx_nominations_month, idx_nominations_nominee.

## Apple / Native Status
- ✅ **Apple Developer Program purchased this session** — waiting on activation (Apple states up to 2 business days; often hours). Membership-confirmation email is the signal. If nothing in ~24h, contact Apple Dev Support with the enrollment ID. Until active: no TestFlight / no physical-device runs, but the **simulator works** so background-GPS testing isn't blocked.

## Android — Not Started (plan written: `mobile/SETUP-ANDROID.md`)
Android is the intentional second platform (iOS-first). The app code is **already
cross-platform** — `GeoTracker` loads the same background-geolocation plugin on Android, and
`android.useLegacyBridge: true` is already set (the fix that stops Android background location
halting after 5 min). So Android is native-project setup + permissions, **not** new app logic.
What remains (full steps in the new `mobile/SETUP-ANDROID.md`):
- Install **Android Studio**; `npx cap add android` (the `android/` project has never been
  generated; it's gitignored like `ios/`).
- **AndroidManifest permissions** — `ACCESS_FINE/COARSE/BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`, and (Android 13+) `POST_NOTIFICATIONS`.
- **The one bit of Android-specific app code still to write:** request notification permission
  at runtime before the background watch (Android requires a persistent tracking notification;
  no notification = no background updates). Plan: add `@capacitor/local-notifications` and
  call `requestPermissions()` in `GeoTracker.startRecording` when `getPlatform()==='android'`.
  Also expect a separate "Allow all the time" location prompt (Android 10+).
- **Google Play Console** ($25 one-time) for distribution; Data-safety form + a clear
  `ACCESS_BACKGROUND_LOCATION` justification (Google is strict here).
- Real-time-upload throttling note does NOT affect us — we accumulate locally and POST on Save.
- Recommendation: ship iOS (TestFlight) first, then do Android as its own session.

## Recurring Admin Tasks
- Verify pending run clubs; approve pending group runs; review captain applications (auto-promotes).
- **NEW:** moderate announcements (admin → Announcements); review Member-of-the-Month tally (admin → Nominations).

## Open Items (carried forward)
- **Finish background GPS on the Mac** (steps above) — highest priority once you're at the machine.
- **Apple Developer activation** — watch for the email; then native polish → TestFlight.
- **Test account deletion** — still not done; it's a live-DB action (sandbox can't reach the Railway volume). Do via admin → Members (deactivate) or a one-off query.
- Decision pending: subscribe-on-web / log-in-on-app to avoid Apple's 30% (pairs with lawyer ToS/Privacy review).
- Pre-launch: lawyer review of ToS/Privacy before live Stripe keys; gold-shade review; public profiles; referral system; PostgreSQL migration ~2 months pre-launch.
- Optional later: swap free background-geolocation plugin → paid `@transistorsoft/...` (one-line change in `GeoTracker`).
- Easy test continuation still available: `activities.js`/GPX suite (not added yet).

## ⚠️ Working Agreements (unchanged)
- **Claude edits; Ernest commits/pushes from the Mac.** Sandbox can't write git. Stale lock fix: `rm -f ~/Desktop/claude\ ai/3332/.git/index.lock`.
- Repo path has a space: `~/Desktop/claude\ ai/3332` (don't use the `path/to/3332` placeholder literally).
- Mac `better-sqlite3` won't load in sandbox — backend tests use the `node:sqlite` adapter (auto-applied).
- Large code responses can hit content-filter errors — write code via many small edits.
- Sandbox can't `unlink` in the mounted folder by default (deletion must be explicitly enabled) — avoid leaving scratch files in the repo.

## Start Here Next Time
1. Once Apple Dev is active: app icon/splash, status bar, then Archive → TestFlight → run on Ernest's physical phone. (Background GPS already verified on the iOS simulator — ✅.)
2. When going cross-platform: follow `mobile/SETUP-ANDROID.md` (Android Studio → `cap add android` → manifest permissions → runtime notification request → emulator test → Play Console). Recommend doing this as its own session after iOS TestFlight.
3. Optional: add the `activities`/GPX test suite; handle the test-account deletion.

## Quick Reference
- Live: https://team3332.com (app at /app, admin at /admin)
- Repo: github.com/kvtch500/team3332 (local clone = the `3332` folder)
- Mobile: `3332/mobile` — `npm run sync` then `npx cap run ios`; guides: `SETUP-CAPACITOR.md` (iOS), `SETUP-ANDROID.md` (Android)
- Stack: static HTML/React (Babel) frontend · Node/Express + SQLite on Railway volume · Stripe test mode · Resend email · Capacitor iOS wrapper (background-geolocation)
- Tests: `cd backend && node test/<file>` (node:sqlite shim auto-applies) — 93 green
- Prior sessions: handoff613.md · handoff611.md · handoff608.md
