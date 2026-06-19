//  LiveActivityPlugin.swift
//  TEAM 3332 — Capacitor bridge for the run Live Activity (618g)
//
//  Exposes start / update / end to JS as the "LiveActivity" plugin. JS feature-detects it
//  (registerPlugin guard, see app.jsx LiveActivity helper) and no-ops where unsupported, so
//  this is iOS-only and safe to ship before the widget target exists.
//
//  Add this file (and LiveActivityPlugin.m) to the main `App` target only.
//  RunActivityAttributes.swift must ALSO be a member of the App target.
//  ⚠️ The class must ALSO be listed in capacitor.config.json `packageClassList`
//     ("LiveActivityPlugin") or Capacitor 6 won't register it. `npx cap sync`
//     regenerates that list, so the sync step re-adds it (see mobile/patch-native-config.mjs).

import Foundation
import Capacitor
import ActivityKit

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    ]

    // Hold a type-erased reference to the running activity (iOS 16.2+ only).
    private var _activity: Any?

    @available(iOS 16.2, *)
    private var activity: Activity<RunActivityAttributes>? {
        get { _activity as? Activity<RunActivityAttributes> }
        set { _activity = newValue }
    }

    private func state(from call: CAPPluginCall) -> RunActivityAttributes.ContentState {
        RunActivityAttributes.ContentState(
            distanceMiles: call.getDouble("distanceMiles") ?? 0,
            elapsedSeconds: call.getInt("elapsedSeconds") ?? 0,
            metricValue: call.getString("metricValue") ?? "—",
            metricLabel: call.getString("metricLabel") ?? ""
        )
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(["started": false]); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(["started": false, "reason": "disabled"]); return
        }
        // If one is somehow already running, end it before starting a fresh run.
        if let existing = activity {
            Task { await existing.end(nil, dismissalPolicy: .immediate) }
            activity = nil
        }
        let attributes = RunActivityAttributes(
            activityType: call.getString("activityType") ?? "Run",
            startedAt: Date()
        )
        let initial = state(from: call)
        do {
            let act = try Activity.request(
                attributes: attributes,
                content: .init(state: initial, staleDate: nil)
            )
            activity = act
            call.resolve(["started": true, "id": act.id])
        } catch {
            call.reject("Could not start Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let act = activity else { call.resolve(); return }
        let newState = state(from: call)
        Task {
            await act.update(.init(state: newState, staleDate: nil))
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *), let act = activity else { call.resolve(); return }
        let final = state(from: call)
        Task {
            await act.end(.init(state: final, staleDate: nil), dismissalPolicy: .immediate)
            activity = nil
            call.resolve()
        }
    }
}
