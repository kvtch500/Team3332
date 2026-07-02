---
author: claude
type: handoff
id: handoff630b
date: 2026-07-01
spans: 2026-06-27 → 2026-07-01
session: 19–22 (continues handoff626; reconstructed 2026-07-02 from session transcripts — the live session ended before this file was saved)
---

# HANDOFF 630b — Sessions 19–22 (Jun 27 – Jul 1 2026)

> Note: this handoff was reconstructed the morning after from session transcripts (the live
> session ended before it was saved). **Ernest confirmed Jul 2: uploads happened — currently on
> build 12.** The project file on disk still reads 11 (the 12 bump was done in Xcode without a
> source change), so nothing is missing from the repo.

## TL;DR
**The watch→phone sync is FIXED. The Apple Watch feature — the only 🔴 HIGH PRIORITY roadmap
item — is functionally done: records on the wrist, syncs to the account, polish fixes in.**
Builds 7–10 carried the sync fix and Done-button reset. Build 11 (Stop → "Finish activity?"
confirm flow) is coded in both Swift copies and all build numbers are bumped to 11 in the
project file — but the Archive → TestFlight upload was in flight when the session ended.

## ✅ What got fixed (builds 7–10, sessions 19–21)
- **Sync root cause:** the old push model (`notifyListeners("watchActivity")` gated on a
  `jsReady` flag set by an `addListener` override) never fired under Capacitor 6.
- **New delivery model — pull, not push:** `WatchSyncPlugin` queues finished runs in
  `pendingActivities`; JS pulls them via a new **`drainPending()`** method called on app
  mount, on resume (`appStateChange` → `drainBurst()`), and after login. A best-effort
  `watchActivityAvailable` poke nudges a foregrounded app to drain immediately, but delivery
  never depends on listener timing. Dedup by `clientId`.
- **Watch side:** sends via `transferUserInfo` (queued, reliable) **plus** `sendMessage` when
  the phone `isReachable` (immediate).
- **Done button fixed:** `WorkoutManager.reset()` added; summary's Done returns to start screen.

## 🆕 Build 11 (coded Jul 1, upload UNCONFIRMED)
- **Stop is no longer a dead-end:** tapping red Stop now **pauses** and shows
  **"Finish activity?"** with **Resume** (continues same activity) / **Finish** (ends + syncs).
  Watch-only Swift change — no `npm run sync` needed. Applied to BOTH copies.
- All three targets (App, Widget, Watch) bumped **10 → 11** in `project.pbxproj` (6 entries).
- **Left to do:** Xcode → confirm Build reads 11 → Any iOS Device (arm64) → Product → Archive
  → Distribute → TestFlight Internal Only. Then on-watch test: start run → Stop → Resume keeps
  it going; Stop → Finish ends and syncs.

## ⚠️ RISK: everything since June 20 is UNCOMMITTED
`git status` shows the entire watch-sync fix, watch app polish, and handoffs 620b–626 as
modified/untracked. **Last commit is Jun 20 (103f4e8); origin/main is even with it.** One bad
`cap add ios` or disk hiccup loses weeks. Ernest: commit + push from the Mac
(`rm -f .git/index.lock` first if the sandbox left one).

## ▶️ Next 3 most important steps (agreed Jul 1)
1. **App Store submission** — move app + watch out of TestFlight into public review (listing,
   screenshots, App Privacy details). The gating milestone for the Sept launch.
2. **Go-live on payments** — flip Stripe test → live keys, paired with the pending lawyer
   review of ToS/Privacy. Makes the product chargeable.
3. **Protect the watch work + finish polish** — fold the gitignored Xcode fixes
   (`WKBackgroundModes`, watch `AppIcon`) into `APPLE-WATCH-SETUP.md` so a future
   `cap add ios` can't wipe them; wire the static "Syncing to your phone…" label to the real
   Synced / Couldn't-sync result. **Plus: commit everything (see risk above).**

## Gotchas (carried forward, still true)
- Two copies of the watch Swift: committed `mobile/ios-native-src/` + Xcode-compiled
  `mobile/ios/App/Team3332 Watch App Watch App/` (gitignored). **Every fix goes in BOTH.**
  (Verified in sync as of Jul 2.)
- `app/app.js` rebuilds only on the Mac (`cd mobile && npm run sync`).
- TestFlight is the install path that works — don't retry direct Xcode→watch install.
- `ITSAppUsesNonExemptEncryption = false` is set — no more Missing Compliance clicks.
- Prior: handoff626 (sync still broken at that point) → this file supersedes it.
