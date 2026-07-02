---
author: claude
type: prep
date: 2026-07-02
---

# App Store Submission Packet — TEAM 3332 (app + watch)

Goal: move 1.0 out of TestFlight into public App Store review. Gating milestone for the Sept launch.

## ⚠️ Decide FIRST: how memberships are sold (blocks submission)

The app sells digital memberships (Standard $199 / Elite $249) via **Stripe**. Apple's rule 3.1.1:
digital services bought **inside the app** must use Apple In-App Purchase (Apple takes 15–30%).
Realistic paths:

1. **Web-purchase model (recommended, Strava/Netflix-style):** memberships are bought on
   team3332.com only; the iOS app is sign-in-only with no purchase UI. Keeps Stripe + full margin.
   Safest wording: no "buy on our website" links in-app (US anti-steering rules have loosened, but
   the cleanest review is no purchase mention at all in v1).
2. **Apple IAP:** implement in-app subscription; Apple takes 15% (Small Business Program, <$1M/yr).
   $199 → ~$169 net vs ~$193 net via Stripe.
3. **Both** (IAP in-app + Stripe on web) — most work; skip for v1.

→ If you choose 1, verify the app has NO purchase/upgrade buttons before submitting.

## Pre-flight checklist (must all be true)

- [ ] Current build (12+) tested on phone AND watch: record, sync, Stop→Finish confirm
- [ ] Account deletion works in-app (done June 20 — verify once on the current build)
- [ ] ToS + Privacy live at team3332.com/terms and /privacy (done June 6)
- [ ] Purchase-model decision above reflected in the app
- [ ] All uncommitted work pushed to GitHub (currently 2+ weeks uncommitted!)

## App Store Connect — listing

- **Name:** TEAM 3332 · **Subtitle (30 chars):** e.g. "Virtual running team"
- **Category:** Health & Fitness · **Age rating:** 4+
- **Description draft:** lead with the identity/community angle (a real team, not another
  tracker); then features: GPS run/walk tracking with live pace + heart rate, Apple Watch
  recording from the wrist, team leaderboard, run clubs, member profiles.
- **Keywords:** running, run club, team, GPS tracker, virtual team, race, walk, pace, heart rate
- **Support URL:** team3332.com · **Marketing URL:** team3332.com
- **Privacy Policy URL:** team3332.com/privacy

## Screenshots needed (6.9" + 6.5" iPhone; watch optional but strong)

1. Record screen mid-run (map, live stats)
2. Live Activity / Dynamic Island during a run
3. Leaderboard with clubs
4. Profile with location + club badge
5. Apple Watch: recording screen + summary ("Synced ✓")
Take on-device, then frame in a free tool (e.g. screenshots.pro / AppMockUp).

## App Privacy questionnaire (answer honestly, matches what the app collects)

- **Contact info:** name, email — linked to identity, used for app functionality
- **Health & Fitness:** heart rate, workouts — linked, app functionality, NOT used for tracking
- **Location:** precise location during recording — linked, app functionality, NOT tracking
- **Identifiers:** account ID — linked, app functionality
- **No third-party advertising, no tracking across apps** → "Data Not Used to Track You"
- Export compliance: already handled (`ITSAppUsesNonExemptEncryption = false`)

## App Review notes (paste into the Review Information box)

- Provide a **demo account** (email + password) with some seeded activity
- Note: "Apple Watch companion records workouts; requires paired watch. Heart rate via watch
  sensor or BLE strap. Membership is managed on our website; the app has no in-app purchases."
  (adjust to the purchase decision)

## Submission steps

1. App Store Connect → App Store tab → prepare 1.0 listing (copy, screenshots, privacy)
2. Select the latest TestFlight build (12+)
3. Answer App Review questions, add demo account
4. Submit → review typically 24–48h. Rejections come with a reason; paste it to Claude and
   we fix + resubmit (common first-timer hits: 3.1.1 payments, demo account not working,
   privacy answers mismatching actual data collection).
