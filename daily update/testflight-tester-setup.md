# TestFlight Tester Setup + On-Device Smoke Test

Date: 2026-06-23 · Continues handoff620b · Build **1.0 (1)**, bundle `com.team3332.app`
Team: TEAM 3332 (Individual) · Team ID `HS95TLWF38` · Apple ID: Ernest Smith

Goal: get build 1.0 (1) onto your iPhone via TestFlight, then verify the session-14 features
work on the real build (not just the simulator).

---

## Step 1 — Create the Internal Testing group (App Store Connect, web)

1. Go to **appstoreconnect.apple.com** → **Apps** → **TEAM 3332**.
2. Top tab bar → **TestFlight**.
3. Confirm build **1.0 (1)** shows under **iOS Builds**. Status should be **Ready to Test**
   (if it says "Processing", wait — it can take 5–30 min after upload).
4. Left sidebar → under **Internal Testing** click the **＋** next to "Internal Testing".
5. Group name: `Team 3332 Internal` → **Create**.
6. Open the new group → **Builds** tab → **＋** → select build **1.0 (1)** → **Add**.
   - If it asks about export compliance, answer the encryption question (standard HTTPS only =
     "No" to proprietary encryption) so the build stays testable.

## Step 2 — Add yourself as a tester

1. Still in the group → **Testers** tab → **＋ Add Testers**.
2. Add your own Apple ID email (the one tied to this Apple account).
3. Apple emails you a TestFlight invite — keep your phone handy.
   - Internal testers (up to 100) get builds immediately, no Beta App Review needed.

## Step 3 — Install on the iPhone

1. On the iPhone, install **TestFlight** from the App Store (if not already installed).
2. Open the invite email on the phone → **View in TestFlight**, OR open TestFlight and the
   app appears automatically.
3. Tap **Install** next to TEAM 3332 → wait for download → **Open**.

---

## Step 4 — On-device smoke test (session-14 features)

Check each on the REAL build. Note pass/fail next to each.

- [ ] **App launches** to the dashboard, you can log in, no white screen.
- [ ] **Smoothed live speed** — start a run, walk/jog; the live mph/pace reading is steady,
      not jumping wildly between values.
- [ ] **Auto-pause** — turn the setting ON (per-member toggle in settings, default off). Start a
      run, then stand still ~10–15s → timer + distance should **freeze** and show a "Paused"
      state; start moving again → it **resumes**. With it OFF, the clock keeps running.
- [ ] **GPS-loss banner** — during a run, turn on Airplane Mode (or step somewhere with no signal)
      → a persistent **red banner** ("GPS signal lost") appears over the record screen; restore
      signal → banner clears on its own.
- [ ] **Location permission revoked** — Settings → TEAM 3332 → Location → set to Never mid-run →
      banner shows "Location access turned off"; the existing toast also fires.
- [ ] **Live Activity** — start a run, lock the phone → lock-screen card shows live distance,
      time, pace/mph; on a Dynamic Island phone, check compact + expanded views update each second.
      End the run → the Live Activity ends.
- [ ] **Account deletion** — go to the account-deletion flow, confirm it works end-to-end (this is
      an App Store requirement, so it must actually delete). Use a throwaway test account, not your
      main login.

---

## If something fails
Note exactly what and on which screen. Frontend fix path (from handoff620b):
edit `app/src/app.jsx` → `cd mobile && npm run sync` → re-archive in Xcode → upload a new build
(bump build number to 1.0 (2)). The TestFlight group will pick up the new build automatically.

## Still-open blockers (not for today)
- Stripe vs Apple IAP decision — real *public submission* blocker for paid memberships (not TestFlight).
- ToS / Privacy drafts need lawyer review before going live.
