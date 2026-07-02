# Apple setup — Bundle ID + App Store Connect record (gate before first TestFlight)

Date: 2026-06-20 · Team: **TEAM 3332 (Individual)** · Team ID: **HS95TLWF38** (renews Jun 13 2027)

Exact values pulled from the repo so there's no guessing:

| Thing | Value |
|---|---|
| App bundle ID | `com.team3332.app` |
| Widget bundle ID | `com.team3332.app.Team3332Widget` |
| App display name | `TEAM 3332` |
| URL scheme | `team3332` (Info.plist only — not a portal setting) |
| Background mode | `location` (Info.plist + Xcode target — **not** a portal capability) |
| Live Activities | `NSSupportsLiveActivities` = true (Info.plist + Xcode target — **not** a portal capability) |
| Entitlements file | none yet → no App Groups / Push / Associated Domains to enable |

> **Key correction to the handoff:** the Apple Developer "Identifiers" page has **no** checkbox for Background Modes, Location, or Live Activities. Those live in Xcode/Info.plist, not the App ID. So when you register the App ID below, **leave all Capabilities unchecked.** You'd only enable a portal capability later if you add App Groups (to share data with the widget) or Push (only if you ever push-update the Live Activity remotely — right now it self-counts, so you don't).

---

## Decision: manual vs automatic signing

For a Capacitor app on an Individual account, **letting Xcode do "Automatically manage signing"** will auto-register both App IDs (app + widget) the first time you archive — so you can technically skip Part 1. But the handoff asked for the explicit manual registration (it makes the App Store Connect step cleaner and is the documented gate), so Part 1 below does it by hand. Either path works; don't do both halfway.

---

## Part 1 — Register the App ID (developer.apple.com)

1. Go to **developer.apple.com** → sign in → **Account** → **Certificates, IDs & Profiles**.
2. Left sidebar → **Identifiers** → click the blue **＋** next to "Identifiers".
3. Select **App IDs** → **Continue** → type **App** → **Continue**.
4. Fill in:
   - **Description:** `TEAM 3332` (internal label, no special chars)
   - **Bundle ID:** choose **Explicit** → enter `com.team3332.app`
5. **Capabilities tab:** leave everything **unchecked** (see correction above).
6. **Continue** → **Register**.
7. *(Optional, only if doing manual signing for the widget)* Repeat steps 2–6 with Bundle ID `com.team3332.app.Team3332Widget`, Description `TEAM 3332 Widget`. With automatic signing you can skip this — Xcode creates it on first archive.

---

## Part 2 — Create the App Store Connect app record

1. Go to **appstoreconnect.apple.com** → **Apps**.
2. Click the blue **＋** → **New App**.
3. Fill in:
   - **Platforms:** ☑ iOS
   - **Name:** `TEAM 3332`  *(this is the public App Store name — must be globally unique; if taken, try a variant like `TEAM 3332 Run`)*
   - **Primary Language:** English (U.S.)
   - **Bundle ID:** select `com.team3332.app` from the dropdown (appears once Part 1 is done)
   - **SKU:** any internal string, e.g. `team3332-ios-001` (never shown to users)
   - **User Access:** Full Access (default)
4. Click **Create**.

You now have an app record. That's the gate cleared — TestFlight builds can be uploaded against it.

---

## Part 3 — What comes next (Xcode side, not portal)

After the record exists:
1. In Xcode, open the **App** scheme (not the widget scheme).
2. **Signing & Capabilities** → set **Team = TEAM 3332 (HS95TLWF38)**, enable **Automatically manage signing** for both the App and Team3332Widget targets.
3. Set a real version/build (e.g. `1.0` / `1`).
4. **Product → Archive** → **Distribute App → TestFlight (Internal)** → upload.
5. Back in App Store Connect → **TestFlight** tab → add yourself as an internal tester once processing finishes.

> Heads-up still open from the handoff: **Stripe vs Apple IAP** is a real approval blocker for the membership — worth resolving before you get to actual submission (TestFlight is fine either way).

---

### Quick gotchas
- The **App Store name** must be unique across the whole store; the **bundle ID** must be unique to you. Different namespaces.
- If the Bundle ID dropdown in Part 2 is empty, Part 1 didn't finish — refresh after registering.
- Individual accounts: you are the only team member; no need to invite anyone.
