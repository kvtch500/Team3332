---
author: claude
type: handoff
id: handoff623
date: 2026-06-23
spans: 2026-06-23 → 2026-06-24
session: 16 (continues handoff620b)
---

# HANDOFF 623 — Session 16 (Tue Jun 23 → Wed Jun 24 2026)

## TL;DR
Shipped **three features** to TestFlight and got them onto the device. Found the TestFlight tester
setup was already done, so pivoted to building: (1) **auto-pause toggle** on the record screen,
(2) a full **Bluetooth heart-rate sensor** (pair a BLE strap, live bpm, avg/max saved), and (3) a
**Strava-style record-screen redesign** (full-screen map + bottom control panel + swipe-up options).
Hit and permanently fixed two ship-pipeline snags (CocoaPods + Missing Compliance). **Build 4 is
live on the iPhone via TestFlight and shows the new screen.** End-to-end pipeline now proven.

## ✅ Features built (all in `app/src/app.jsx` unless noted)

### 1. Auto-pause toggle on the record screen
A switch (originally above START; now lives in the swipe-up options sheet — see #3). Persists to the
member profile via `PATCH /auth/me`; the recorder reads it live through `autoPauseOnRef`; syncs to
global `user` via a new `onAutoPauseChange` prop. The old settings-screen toggle still works.

### 2. Bluetooth heart-rate sensor (BLE strap)
- **JS** `HeartRate` helper — guarded `registerPlugin` (same no-op pattern as GeoTracker/LiveActivity):
  `scan()` → `deviceFound`; `connect()` → `heartRate`{bpm} + `connection`{state}. No-op web/Android.
- **UI** — "Add a sensor" row + pairing sheet (scan/connect), connected chip, **live bpm** in the
  recording stats, **avg** on the review screen, `❤️ bpm` in activity history.
- **Capture/save** — samples collected only while recording (gated by `recordingRef`); avg+max
  computed on save and posted as `avg_hr`/`max_hr`.
- **Backend** — `avg_hr`/`max_hr` columns (`backend/db/schema.js` + auto-migration in
  `backend/db/index.js`), accepted + clamped 20–260 in `POST /activities` (`routes/activities.js`),
  returned by existing `SELECT *`. Backend tests pass 13/13.
- **Native** — `mobile/ios-native-src/App/HeartRatePlugin.swift` (+ `.m`): CoreBluetooth, HR Service
  `0x180D` / characteristic `0x2A37`, GATT bpm parse. Added to the **App** target in Xcode (one-time,
  done). `HeartRatePlugin` added to `patch-native-config.mjs` LOCAL_PLUGINS. `NSBluetoothAlwaysUsageDescription`
  added to `ios/App/App/Info.plist`. Setup doc: `mobile/HEART-RATE-SETUP.md`.

### 3. Strava-style record-screen redesign
Idle record view is now a full-screen **live map** (`IdleMap` Leaflet component, centered on the
member via new `GeoTracker.watchForMap`) with a **bottom control panel**: Run/Walk tabs, big START,
GPS status. Auto-pause + "Add a sensor" moved into a **swipe-up "Run options" sheet**, hinted by
**two up-chevrons** at the top of the panel (tap or swipe up). START never leaves the screen; ✕
closes, top-left over the map.

## 🔧 Ship-pipeline fixes (both permanent)
- **CocoaPods too old** — `npm run sync` failed at `pod install` ("compatibility version string for
  object version 70"). Fixed two ways: added pod-free script **`npm run sync:nopods`** (build:app →
  sync-www → `cap copy ios` → patch-native-config) for JS-only changes, AND ran
  `sudo gem install cocoapods` → **CocoaPods 1.16.2**, so plain `npm run sync` works again now.
- **Missing Compliance** — builds 2–4 stuck (not reaching testers) because TestFlight wanted the
  export-encryption answer. Cleared build 4 via **Manage → exempt** (app uses only standard HTTPS).
  Permanent fix: added **`ITSAppUsesNonExemptEncryption = false`** to `ios/App/App/Info.plist`, so
  builds 5+ skip the prompt entirely.

## 📦 Builds (App Store Connect / TestFlight, all Uploaded to Apple)
- **1.0 (1)** Jun 20 — first TestFlight build (pre-session).
- **1.0 (2)** & **1.0 (3)** — heart rate + auto-pause toggle (old layout). Ready to Test.
- **1.0 (4)** — adds the record-screen redesign. **Live on the iPhone, confirmed showing new screen.**
- Note: internal testers auto-receive every "Ready to Test" build — no manual group assignment needed.

## ▶️ Pick up here (next)
- **Real-run test of Build 4** on device: map tracking during a run, the swipe-up options sheet
  (auto-pause + Add a sensor), and pairing a **real BLE strap** for live bpm → avg/max saved. Adjust
  panel height / arrow placement / map behavior to taste.
- Iterate UI as desired: edit `app/src/app.jsx` → `cd mobile && npm run sync:nopods` (or `npm run sync`
  now that CocoaPods is fixed) → Xcode: bump **Build** number → Archive → Distribute → TestFlight Internal.

## 🟡 Open / not yet done
- **Stripe vs Apple IAP** — still the real public-submission blocker for paid memberships.
- HR into the **Live Activity** lock-screen card (in-app only today); store the **full HR series** for
  a chart; **Apple Watch** as an HR source (needs the watchOS companion — HIGH-PRIORITY roadmap item).
- ToS/Privacy lawyer review; Android build path; PostgreSQL migration; onboarding quiz / admin panel.

## Notes / gotchas
- Repo path has a space → build/commit/push from the Mac; quote paths.
- Frontend is a build: edit `app/src/app.jsx` → `cd mobile && npm run sync:nopods` (or `npm run sync`).
- Each new TestFlight upload needs a **higher Build number** (Xcode General → Identity).
- Companion docs written this session: `daily update/testflight-tester-setup.md`,
  `mobile/HEART-RATE-SETUP.md`.
- Prior: handoff620b (first TestFlight build live).
