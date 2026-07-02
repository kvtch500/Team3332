---
author: claude
type: handoff
id: handoff620
date: 2026-06-20
session: 14 (continues handoff619d)
---

# HANDOFF 620 — Saturday, June 20 2026 (session 14)

## TL;DR
Three features built this session, all **code-complete and verified in the sandbox**, plus two
mobile-compliance legal drafts: **(1) in-app account deletion** (App Store / Play requirement —
backend endpoint + UI + tests, HTTP-verified end-to-end), **(2) opt-in auto-pause** (freezes
time/distance when you stop, reuses the 619 Doppler speed field), and **(3) smoothed live speed**
(EMA current-speed readout that fixes the jumpy first-15s MPH). Backend is **146 tests green**
(was 136 → +10 new). The 619 GPS overhaul is now **committed AND pushed** (local `main` == `origin/main`).
**This session's work is NOT yet committed**, and the built **`app/app.js` is STALE** — it must be
rebuilt on the Mac before committing or the new UI won't ship.

## ✅ Built & verified this session
1. **Account deletion (App Store requirement).** New `DELETE /api/auth/me` (`backend/routes/auth.js`):
   confirms the account password, best-effort cancels any live Stripe subscription, nulls
   `challenges.created_by` (the one non-cascading FK), then deletes the user — CASCADE clears
   activities, badges, memberships, captain records, announcements, nominations, resets. Frontend:
   red "Delete Account" Danger Zone in the **Account (⚙️)** tab with password confirm → logs out.
   Tests: `backend/test/account-deletion.test.js` (6) + **HTTP-verified against a live server.js**
   (register → delete → 404/401, and re-register of the freed email succeeds = truly gone).
2. **Auto-pause (opt-in, default off).** `auto_pause` column on users (schema + boot migration in
   `db/index.js`) + PATCH `/auth/me` support; toggle in Account → Recording. Pure `autoPauseStep`
   reducer in `app.jsx` does wall-clock-anchored time accounting; movement detected from an accepted
   distance step OR Doppler speed ≥ `GPS_MIN_SPEED_MS`. While paused: time + distance freeze, a gold
   "❚❚ Paused — auto" shows on the record screen, and the Live Activity freezes for free (elapsed
   stops). **With the toggle OFF it is byte-identical to the old wall-clock** → the device-verified
   background path is untouched. Tests: `backend/test/auto-pause.test.js` (4) + a simulation of the
   *real shipped* function (stop/resume trace `…9P 9P 9 10 11`, counts moving time only).
3. **Smoothed live speed.** The record screen's secondary stat (MPH walk / pace run) was a cumulative
   average (lurches in the first ~10-15s). Now an EMA (`SPEED_EMA_ALPHA = 0.3`) of *current* speed,
   fed by Doppler speed with a distance/time fallback; reads 0 after >3s stopped. **Review + saved
   run still show the true average** — only the live readout changed. Verified: `node --check`,
   formatter correctness, and jitter cut **2.58 → 0.91 mph (~65%)** on noisy fixes.

## 📄 Legal drafts (mobile compliance) — need lawyer review before going live
`app/privacy.draft.html` + `app/terms.draft.html` — the live web pages were web-only; drafts add the
App-Store/Play essentials: **precise + background location** disclosure (collected only during an
active run, incl. screen-locked; never for ads; never sold), location-permission/your-control
section, **Mapbox + OpenStreetMap** as map processors, in-app **Account → Delete Account** path, and
the **Apple-required EULA clauses** (Apple not responsible / no support obligation / third-party
beneficiary) + a GPS distance-accuracy disclaimer. Saved as `.draft.html` so nothing live changes
until reviewed. **Open question flagged in them:** in-app payments — Apple generally requires IAP for
digital memberships, not Stripe (billing clause written flexibly to cover both).

## 🔴 State of the repo (read before committing)
- **619 GPS work: committed + pushed.** `main...origin/main`, zero ahead. Nothing unpushed.
- **This session: uncommitted** on the Mac working tree (list below).
- **`app/app.js` is STALE** — confirmed it contains none of today's strings ("Auto-pause",
  "permanently deleted", "Paused — auto"). `app.jsx` was edited (21:00) after the last build
  (02:04). **Must run `npm run build:app` before committing**, or backend ships but the UI doesn't.
- A **`.git/index.lock` is present** (sandbox couldn't remove it — permissions). If git complains,
  `rm -f .git/index.lock` on the Mac first.
- Sandbox still **cannot run esbuild** (only a macOS Mach-O binary exists; the registry blocks
  installing the Linux one) → the build genuinely must happen on the Mac.

## 🔴 To commit (from the Mac — Claude edits, Ernest commits)
```
cd "/Users/ernestsmith/Desktop/claude ai/3332"
rm -f .git/index.lock
npm run build:app                     # regenerates app/app.js (+ leaflet.css/fonts) — REQUIRED
git add -A
git status
git commit -m "Account deletion (App Store req), opt-in auto-pause, smoothed live speed; ToS/Privacy mobile drafts"
git push
```
Files: `app/src/app.jsx` **+ rebuilt `app/app.js`**, `backend/routes/auth.js`, `backend/db/schema.js`,
`backend/db/index.js`, new `backend/test/account-deletion.test.js`, `backend/test/auto-pause.test.js`,
new `app/privacy.draft.html`, `app/terms.draft.html`.

## Start Here Next Time
**FIRST THING NEXT SESSION (Ernest's pick):** Apple Developer enrollment is **confirmed ACTIVE**
(Individual, **Team ID `HS95TLWF38`**, renews June 13 2027). So jump straight to **registering the
bundle ID `com.team3332.app` and creating the App Store Connect app record** — the last gate before a
first TestFlight build. Walk through: developer.apple.com → Certificates, IDs & Profiles → Identifiers
→ register `com.team3332.app` (enable the capabilities the app uses: Background Modes/Location, Push if
ever needed, Live Activities via Info.plist `NSSupportsLiveActivities`); then appstoreconnect.apple.com
→ Apps → + → create the TEAM 3332 app record (name, primary language, bundle ID, SKU). Then the
Xcode-side signing + first archive/upload.

### Top 3 Most Important (overall)
1. **Rebuild + commit + push this session's work.** Nothing above is live yet, and `app.js` is stale.
   Run `npm run build:app` first (clear the index.lock if needed), then commit + push. This unblocks
   everything else and is a 5-minute task. **Do this first.**
2. **Apple → bundle ID + App Store Connect record → TestFlight.** Enrollment is now done (above);
   the next concrete step is the bundle ID + app record, the gate for the first beta build.
3. **Decide the in-app payment model: Stripe vs Apple IAP.** A real App Store *approval* blocker —
   Apple generally requires in-app purchase (15-30%) for digital memberships consumed in-app, not an
   external Stripe checkout. It affects architecture AND the legal drafts. Resolve before submission;
   the ToS/Privacy drafts are written to cover either path until you decide.

## Other open items (after the top 3)
- **iOS device tests** (lower priority now the GPS gate passed): Live Activity end-flash +
  `team3332://run` deep-link on device; maps render / no CDN requests; 618f GPS-loss banner.
  Also do an on-device pass of the new **auto-pause** and **smoothed speed** during a real walk/run.
- **ToS / Privacy:** lawyer review of the drafts, then swap them in for the live pages.
- **In-app account deletion:** on-device check of the new Delete Account flow (it backs the privacy
  policy's promise).
- **Android:** `cap add android` → wire the notification plugin (619d setup doc) → emulator/device test.
- **PostgreSQL migration (~2mo pre-launch):** large; buildable in the sandbox when ready.
- Other buildable-here threads: onboarding quiz (Month 2), admin panel, GPX import polish.

## ⚠️ Working Agreements (unchanged)
- Claude edits; Ernest commits/pushes from the Mac (repo path has a space — commit from root).
- Frontend is a build: edit `app/src/app.jsx` → `npm run build:app` → commit `app.js` (+ assets).
- Sandbox can't bundle (esbuild macOS binary) or compile Swift/Kotlin → validated by static review,
  `node --check`, brace checks, and extracted-pure-function simulations.
- Run the **App** Xcode scheme, not the widget scheme. Stale `.git/index.lock` → `rm -f .git/index.lock`.

## Quick Reference
- Live: https://team3332.com (app /app, admin /admin) · Repo: github.com/kvtch500/Team3332
- Account deletion: `DELETE /api/auth/me` (password-confirmed) · UI in Account tab Danger Zone.
- Auto-pause: `users.auto_pause` (0/1) · pure `autoPauseStep` + `AUTO_PAUSE_GRACE_MS=4000` in app.jsx.
- Smoothed speed: `emaSpeed`/`liveSpeedMph`/`livePaceFromMps`, `SPEED_EMA_ALPHA=0.3` in app.jsx.
- Backend tests: `cd backend && node test/<file>` — **146 green** (added account-deletion + auto-pause).
- Prior: handoff619d (GPS overhaul + CocoaPods fix, device-verified) · 619c (LA polish) · 619b (Phase 2b).
