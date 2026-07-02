//  Team3332WatchApp.swift
//  TEAM 3332 — watchOS companion app entry point (Apple Watch support, session 17)
//
//  A standalone wrist recorder, the way Strava's watch app works: start a Run or Walk,
//  see live time / distance / pace / heart rate, pause and resume, then finish — and the
//  run syncs back to the member's TEAM 3332 account through the paired iPhone.
//
//  Target membership: the **watchOS app** target only. This file is its `@main`.

import SwiftUI

@main
struct Team3332WatchApp: App {
    @StateObject private var workout = WorkoutManager()
    @StateObject private var phone = WatchSessionDelegate.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(workout)
                .environmentObject(phone)
                .onAppear {
                    phone.activate()
                    workout.requestAuthorization()
                }
        }
    }
}

/// Top-level router: picks the screen from the recorder's phase.
struct ContentView: View {
    @EnvironmentObject var workout: WorkoutManager
    @State private var summary: [String: Any]? = nil

    var body: some View {
        switch workout.phase {
        case .idle, .requesting:
            StartView()
        case .recording, .paused:
            RecordingView(onFinish: { summary = $0 })
        case .finished:
            SummaryView(payload: summary, onDone: { summary = nil; workout.reset() })
        }
    }
}
