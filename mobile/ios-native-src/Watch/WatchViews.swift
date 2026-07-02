//  WatchViews.swift
//  TEAM 3332 — watchOS SwiftUI screens (Apple Watch support, session 17)
//
//  StartView      — pick Run/Walk and begin (shows who runs will sync to).
//  RecordingView  — live time / distance / pace / HR with pause-resume-finish.
//  SummaryView    — the finished run + its sync status.
//
//  Target membership: the **watchOS app** target only.

import SwiftUI

// Brand palette (mirrors the web app's dark + blue theme).
private let brandBlue = Color(red: 0.20, green: 0.55, blue: 1.0)
private let brandBG   = Color(red: 0.03, green: 0.04, blue: 0.07)

// MARK: - Start

struct StartView: View {
    @EnvironmentObject var workout: WorkoutManager
    @EnvironmentObject var phone: WatchSessionDelegate

    var body: some View {
        VStack(spacing: 10) {
            Text("TEAM 3332").font(.headline).foregroundStyle(brandBlue)

            if let name = phone.memberName, phone.loggedIn {
                Text("Runs save to \(name)").font(.caption2).foregroundStyle(.secondary)
            } else {
                Text("Open TEAM 3332 on your iPhone and sign in to sync runs.")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }

            Button { workout.start(type: "Run") } label: {
                Label("Run", systemImage: "figure.run").frame(maxWidth: .infinity)
            }.tint(brandBlue)

            Button { workout.start(type: "Walk") } label: {
                Label("Walk", systemImage: "figure.walk").frame(maxWidth: .infinity)
            }.tint(.gray)

            if let msg = workout.authMessage {
                Text(msg).font(.caption2).foregroundStyle(.orange).multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 6)
    }
}

// MARK: - Recording

struct RecordingView: View {
    @EnvironmentObject var workout: WorkoutManager
    @EnvironmentObject var phone: WatchSessionDelegate
    var onFinish: ([String: Any]?) -> Void
    @State private var confirmingFinish = false

    var body: some View {
        VStack(spacing: 6) {
            // Primary metric: elapsed time.
            Text(WorkoutManager.clock(workout.elapsed))
                .font(.system(size: 40, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(workout.phase == .paused ? .secondary : .primary)

            HStack {
                metric(String(format: "%.2f", workout.distanceMiles), "MI")
                Spacer()
                metric(paceOrDash, "/MI")
            }
            HStack {
                metric(workout.heartRate > 0 ? "\(workout.heartRate)" : "—", "♥ BPM")
                Spacer()
                metric(workout.activityType.uppercased(), "")
            }

            if confirmingFinish {
                // Stop was tapped — the run is paused underneath. Require an explicit
                // FINISH to actually end it, or Resume to continue the same activity.
                Text("Finish activity?")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Button {
                        workout.resume()
                        confirmingFinish = false
                    } label: { Label("Resume", systemImage: "play.fill") }
                    .tint(brandBlue)
                    Button {
                        let payload = workout.finish()
                        if let p = payload { phone.sendActivity(p) }
                        onFinish(payload)
                    } label: { Label("Finish", systemImage: "flag.checkered") }
                    .tint(.red)
                }
                .font(.footnote)
            } else {
                HStack(spacing: 8) {
                    if workout.phase == .paused {
                        Button { workout.resume() } label: { Image(systemName: "play.fill") }.tint(brandBlue)
                    } else {
                        Button { workout.pause() } label: { Image(systemName: "pause.fill") }.tint(.yellow)
                    }
                    Button {
                        workout.pause()          // pause underneath so nothing is lost (no-op if already paused)
                        confirmingFinish = true
                    } label: { Image(systemName: "stop.fill") }.tint(.red)
                }
                .font(.title3)
            }
        }
        .padding(.horizontal, 6)
    }

    private var paceOrDash: String {
        let p = WorkoutManager.paceText(seconds: workout.elapsed, miles: workout.distanceMiles)
        return p.isEmpty ? "—:—" : p
    }

    private func metric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value).font(.system(size: 18, weight: .semibold, design: .rounded)).monospacedDigit()
            if !label.isEmpty { Text(label).font(.system(size: 9)).foregroundStyle(.secondary) }
        }
    }
}

// MARK: - Summary

struct SummaryView: View {
    @EnvironmentObject var workout: WorkoutManager
    @EnvironmentObject var phone: WatchSessionDelegate
    var payload: [String: Any]?
    var onDone: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text("\(workout.activityType) complete").font(.headline).foregroundStyle(brandBlue)

            if let p = payload {
                let miles = (p["distanceMiles"] as? Double) ?? 0
                let secs  = (p["durationSeconds"] as? Int) ?? 0
                let avgHr = (p["avgHr"] as? Int) ?? 0
                Text(String(format: "%.2f mi", miles)).font(.system(size: 30, weight: .bold, design: .rounded))
                Text(WorkoutManager.clock(TimeInterval(secs))).font(.body).monospacedDigit()
                if avgHr > 0 { Text("♥ avg \(avgHr) bpm").font(.caption).foregroundStyle(.secondary) }
            }

            if let msg = phone.lastSyncMessage {
                Text(msg).font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }

            Button("Done") { onDone() }.tint(brandBlue)
        }
        .padding(.horizontal, 6)
    }
}
