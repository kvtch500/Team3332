//  WatchSessionDelegate.swift
//  TEAM 3332 — watchOS side of WatchConnectivity (Apple Watch support, session 17)
//
//  Two jobs:
//    1. SEND a finished run to the iPhone. We use `transferUserInfo`, which queues the
//       payload and delivers it even if the phone is briefly unreachable (locked, in a
//       pocket) — so a run recorded out of range still syncs the moment they reconnect.
//    2. RECEIVE the member's login context from the phone (name + whether they're signed
//       in) via `applicationContext`, so the watch can show who it'll log runs for and
//       avoid recording into a logged-out account.
//
//  Target membership: the **watchOS app** target only.

import Foundation
import Combine
import WatchConnectivity

@MainActor
final class WatchSessionDelegate: NSObject, ObservableObject, WCSessionDelegate {

    static let shared = WatchSessionDelegate()

    @Published var memberName: String? = nil    // nil = phone hasn't reported a login yet
    @Published var loggedIn: Bool = false
    @Published var lastSyncMessage: String? = nil

    // clientId of the most recently finished run, so a sync confirmation from the phone
    // (via applicationContext) can be matched to the run the summary screen is showing.
    private var lastSentClientId: String? = nil

    private var session: WCSession? { WCSession.isSupported() ? WCSession.default : nil }

    func activate() {
        guard let s = session else { return }
        s.delegate = self
        s.activate()
        applyContext(s.receivedApplicationContext)
    }

    /// Deliver a finished run to the iPhone. Returns false if WC is unavailable.
    ///
    /// Two delivery paths, both carrying the same `clientId` so the phone dedups them:
    ///   • transferUserInfo — queued + reliable; delivers even if the phone is briefly
    ///     unreachable (locked, in a pocket), and survives until it gets through.
    ///   • sendMessage — immediate, but only when the phone is reachable right now. Lets a run
    ///     land instantly when the phone app is foregrounded, instead of waiting on the
    ///     opportunistic transferUserInfo queue. Failures are non-fatal (transferUserInfo covers it).
    @discardableResult
    func sendActivity(_ payload: [String: Any]) -> Bool {
        guard let s = session else { lastSyncMessage = "Pair an iPhone to sync runs."; return false }
        lastSentClientId = payload["clientId"] as? String
        s.transferUserInfo(payload)
        if s.isReachable {
            s.sendMessage(payload, replyHandler: nil, errorHandler: { _ in /* queued path covers it */ })
        }
        lastSyncMessage = s.isReachable ? "Syncing to your phone…" : "Saved — will sync when your phone is near."
        return true
    }

    private func applyContext(_ ctx: [String: Any]) {
        if let name = ctx["memberName"] as? String { memberName = name }
        if let li = ctx["loggedIn"] as? Bool { loggedIn = li }
        // Real sync result, confirmed by the phone AFTER its POST to /api/activities settled.
        // Only update the label if it's about the run we just sent (stale confirmations from
        // an earlier run — e.g. context replayed on activation — are ignored).
        if let cid = ctx["lastSyncedClientId"] as? String, cid == lastSentClientId {
            let ok = (ctx["lastSyncOk"] as? Bool) ?? true
            lastSyncMessage = ok ? "Synced to your account ✓"
                                 : "Sync problem — will retry automatically."
        }
    }

    // MARK: - WCSessionDelegate

    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
        let ctx = session.receivedApplicationContext
        Task { @MainActor in self.applyContext(ctx) }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.applyContext(applicationContext) }
    }
}
