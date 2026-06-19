//  RunActivityAttributes.swift
//  TEAM 3332 — Live Activity (618g)
//
//  SHARED between TWO targets: the main `App` target (so the LiveActivityPlugin can
//  start/update/end the activity) AND the `Team3332Widget` extension (so the SwiftUI
//  views can render it). When you add this file in Xcode, tick BOTH targets in the
//  File Inspector → "Target Membership". If only one target has it, the build fails
//  with "cannot find type 'RunActivityAttributes'".
//
//  ActivityKit splits an activity into two parts:
//    • attributes (this struct's stored props) — FIXED for the life of the activity.
//    • ContentState                            — the live, updatable stats.

import Foundation
import ActivityKit

struct RunActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Distance so far, in miles (already converted on the JS side).
        var distanceMiles: Double
        /// Elapsed wall-clock seconds since the run started.
        var elapsedSeconds: Int
        /// Pre-formatted secondary metric value, e.g. "8:42" (pace) or "4.1" (mph).
        var metricValue: String
        /// Label for that metric, e.g. "/MI" or "MPH".
        var metricLabel: String
        /// True only for the final "Run complete" state pushed by end(): the widget swaps to a
        /// completion treatment and freezes the timer for the brief flash before dismissal.
        /// Always set explicitly by the plugin. Defaults false. (619 polish)
        var isFinished: Bool = false
    }

    /// "Run" or "Walk" — set once when the activity starts.
    var activityType: String
    /// When the run started. Lets the widget render a self-counting `Text(style: .timer)`
    /// that ticks every second on the lock screen WITHOUT app updates — iOS rate-limits
    /// app-pushed updates, so pushing elapsed seconds made the displayed time jump. (618g)
    var startedAt: Date
}
