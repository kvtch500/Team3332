//  WatchSyncPlugin.swift
//  TEAM 3332 — Capacitor bridge for Apple Watch sync (iPhone side, session 17, June 25 2026)
//  Reworked session 19 (June 27 2026): pull-based delivery via drainPending() — see note below.
//
//  The bridge between the watchOS recorder and the existing web app:
//    • RECEIVES a finished run from the watch over WatchConnectivity (transferUserInfo, the
//      reliable queued path, plus sendMessage when the phone is reachable for immediacy) and
//      hands it to JS. app.jsx then POSTs it to /api/activities using the member's logged-in
//      token — so a watch run is saved exactly like a phone run, no separate auth on the watch.
//    • SENDS the member's login context to the watch (setContext from JS → applicationContext)
//      so the watch can show whose account runs will sync to.
//
//  DELIVERY MODEL (why pull, not push):
//    The original design pushed runs to JS via notifyListeners("watchActivity"), gated on a
//    `jsReady` flag that was supposed to flip when JS added its listener (detected by overriding
//    addListener and checking eventName == "watchActivity"). Under Capacitor 6 that override's
//    eventName wasn't reliably readable, so jsReady never flipped, queued runs never flushed, and
//    nothing posted. We now QUEUE every finished run in `pendingActivities` and let JS PULL them
//    with drainPending() — called on app mount, on resume, and after login. A best-effort
//    "watchActivityAvailable" poke nudges JS to drain promptly when the app is foregrounded, but
//    delivery never DEPENDS on listener timing. Dedup by clientId guards against the message +
//    userInfo paths delivering the same run twice.
//
//  Add to the main `App` target only. Must also appear in capacitor.config.json
//  packageClassList as "WatchSyncPlugin" (patch-native-config.mjs handles that).
//  Requires the WatchConnectivity framework (linked automatically when imported).

import Foundation
import Capacitor
import WatchConnectivity

@objc(WatchSyncPlugin)
public class WatchSyncPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchSyncPlugin"
    public let jsName = "WatchSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setContext",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmSync",  returnType: CAPPluginReturnPromise),
    ]

    private var session: WCSession?
    // Last full applicationContext we pushed. setContext and confirmSync both merge into this,
    // because updateApplicationContext REPLACES the whole dict (it isn't a patch).
    private var lastContext: [String: Any] = [:]
    // Finished runs waiting for JS to pull them via drainPending(). Mutated only on the main queue.
    private var pendingActivities: [[String: Any]] = []
    // clientIds we've already accepted, to dedup the sendMessage + transferUserInfo paths.
    private var seenIds: [String] = []

    public override func load() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
        session = s
    }

    // MARK: - JS methods

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": WCSession.isSupported() && (session?.isPaired ?? false)])
    }

    /// JS pushes the member context: { loggedIn: Bool, memberName: String }.
    /// Stored as the WatchConnectivity applicationContext (latest-wins, survives relaunch).
    @objc func setContext(_ call: CAPPluginCall) {
        lastContext["loggedIn"] = call.getBool("loggedIn") ?? false
        if let name = call.getString("memberName") { lastContext["memberName"] = name }
        pushContext()
        call.resolve()
    }

    /// JS calls this after the POST to /api/activities settles, so the watch can flip its
    /// "Syncing to your phone…" label to the real result. Rides applicationContext (latest-wins,
    /// survives relaunch) — the clientId makes each confirmation dict unique, so WC always
    /// delivers it even though identical contexts are skipped.
    @objc func confirmSync(_ call: CAPPluginCall) {
        guard let cid = call.getString("clientId"), !cid.isEmpty else { call.resolve(); return }
        lastContext["lastSyncedClientId"] = cid
        lastContext["lastSyncOk"] = call.getBool("ok") ?? true
        pushContext()
        call.resolve()
    }

    private func pushContext() {
        guard let s = session, s.activationState == .activated else { return }
        do { try s.updateApplicationContext(lastContext) } catch { /* non-fatal */ }
    }

    /// JS pulls every queued finished run and we clear the queue. Returns { activities: [...] }.
    /// Called on app mount, on resume, and after login — so delivery never hinges on listener
    /// timing. Hops to the main queue because pendingActivities is mutated there.
    @objc func drainPending(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let queued = self.pendingActivities
            self.pendingActivities.removeAll()
            NSLog("[WatchSync] drainPending → returning %d run(s)", queued.count)
            call.resolve(["activities": queued])
        }
    }

    // MARK: - Delivery

    private func deliver(_ payload: [String: Any]) {
        // Only forward genuine finished-run messages from our watch app.
        guard (payload["source"] as? String) == "watch" else {
            NSLog("[WatchSync] deliver ignored — not a watch payload")
            return
        }

        // Dedup: the same run can arrive via both sendMessage and transferUserInfo.
        if let cid = payload["clientId"] as? String, !cid.isEmpty {
            if seenIds.contains(cid) { NSLog("[WatchSync] deliver dedup — already seen %@", cid); return }
            seenIds.append(cid)
            if seenIds.count > 50 { seenIds.removeFirst(seenIds.count - 50) }
        }

        pendingActivities.append(payload)
        NSLog("[WatchSync] deliver queued run — pending now %d", pendingActivities.count)
        // Best-effort nudge so a foregrounded app drains immediately. Delivery does NOT depend
        // on this firing — drainPending() on mount/resume is the guarantee.
        notifyListeners("watchActivityAvailable", data: [:])
    }

    // MARK: - WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    // Re-activate when the user switches to a new paired watch.
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    // Finished runs arrive here (queued, reliable delivery — even if the phone was unreachable).
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        NSLog("[WatchSync] didReceiveUserInfo (queued path)")
        DispatchQueue.main.async { self.deliver(userInfo) }
    }
    // Also accept live messages, sent when the phone is reachable (immediate).
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        NSLog("[WatchSync] didReceiveMessage (immediate path)")
        DispatchQueue.main.async { self.deliver(message) }
    }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        NSLog("[WatchSync] didReceiveMessage+reply (immediate path)")
        DispatchQueue.main.async { self.deliver(message) }
        replyHandler(["ok": true])
    }
}
