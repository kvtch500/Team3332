//  RunLiveActivity.swift
//  TEAM 3332 — Live Activity UI (618g; end-flash polish 619)
//
//  Lock-screen banner + Dynamic Island presentations for an in-progress run.
//  Reads RunActivityAttributes (shared file — must be a member of THIS target too).
//
//  Requires iOS 16.1+. The whole widget is gated by ActivityKit availability; on older
//  systems the extension simply renders nothing and the app falls back to no Live Activity.

import ActivityKit
import WidgetKit
import SwiftUI

// TEAM 3332 brand palette (matches the web app's --dark / gold accent).
private let brandGold = Color(red: 0xD4 / 255, green: 0xAF / 255, blue: 0x37 / 255)
private let brandDark = Color(red: 0x0B / 255, green: 0x0F / 255, blue: 0x14 / 255)

// MARK: - Formatting helpers

private func miles(_ d: Double) -> String { String(format: "%.2f", max(0, d)) }

// Seconds -> "H:MM:SS" or "M:SS". Used only for the frozen FINAL time in the completion
// flash; the in-progress card uses a self-counting Text(style: .timer) instead. (619)
private func clock(_ secs: Int) -> String {
    let s = max(0, secs)
    let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
    return h > 0
        ? String(format: "%d:%02d:%02d", h, m, sec)
        : String(format: "%d:%02d", m, sec)
}

private func icon(for type: String) -> String {
    type.lowercased() == "walk" ? "figure.walk" : "figure.run"
}

// MARK: - Lock-screen / banner view

private struct LockScreenView: View {
    let context: ActivityViewContext<RunActivityAttributes>

    var body: some View {
        let st = context.state
        Group {
            if st.isFinished {
                finishedBody(st)
            } else {
                liveBody(st)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .activityBackgroundTint(brandDark)
        .activitySystemActionForegroundColor(brandGold)
        // Tapping the lock-screen card opens team3332://run → the app's record screen. (619)
        .widgetURL(URL(string: "team3332://run"))
    }

    // In-progress: live distance + self-counting timer + secondary metric.
    private func liveBody(_ st: RunActivityAttributes.ContentState) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: icon(for: context.attributes.activityType))
                        .foregroundColor(brandGold)
                    Text("TEAM 3332")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(brandGold)
                        .tracking(1.5)
                }
                Text("\(miles(st.distanceMiles)) mi")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 8) {
                timerMetric(from: context.attributes.startedAt, label: "TIME")
                metric(value: st.metricValue, label: st.metricLabel)
            }
        }
    }

    // Finished: "RUN COMPLETE" with frozen final stats, shown for the brief end flash
    // before iOS dismisses the card. The time is static (clock), not the live timer. (619)
    private func finishedBody(_ st: RunActivityAttributes.ContentState) -> some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundColor(brandGold)
                    Text("RUN COMPLETE")
                        .font(.caption2).fontWeight(.bold)
                        .foregroundColor(brandGold)
                        .tracking(1.5)
                }
                Text("\(miles(st.distanceMiles)) mi")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 8) {
                metric(value: clock(st.elapsedSeconds), label: "TIME")
                metric(value: st.metricValue, label: st.metricLabel)
            }
        }
    }

    private func metric(value: String, label: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.gray)
                .tracking(0.5)
        }
    }

    // Self-counting elapsed timer. iOS renders/ticks this locally every second on the lock
    // screen — no app updates needed, so it never jumps the way app-pushed seconds did. (618g)
    private func timerMetric(from start: Date, label: String) -> some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(start, style: .timer)
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .lineLimit(1)
            Text(label)
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(.gray)
                .tracking(0.5)
        }
    }
}

// MARK: - Widget definition

struct RunLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RunActivityAttributes.self) { context in
            // Lock screen + banner
            LockScreenView(context: context)
        } dynamicIsland: { context in
            let st = context.state
            return DynamicIsland {
                // Expanded — labeled-stat treatment mirroring the lock screen. (619 polish)
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(st.isFinished ? "COMPLETE" : context.attributes.activityType.uppercased())
                            .font(.caption2).fontWeight(.bold)
                            .foregroundColor(brandGold)
                    } icon: {
                        Image(systemName: st.isFinished ? "checkmark.seal.fill" : icon(for: context.attributes.activityType))
                            .foregroundColor(brandGold)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    // Self-counting timer while live; frozen final time when finished. Now labeled
                    // "TIME" to match the lock-screen metric stack.
                    VStack(alignment: .trailing, spacing: 1) {
                        Group {
                            if st.isFinished {
                                Text(clock(st.elapsedSeconds))
                            } else {
                                Text(context.attributes.startedAt, style: .timer)
                            }
                        }
                        .font(.system(.body, design: .rounded)).fontWeight(.semibold)
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .lineLimit(1)
                        .frame(maxWidth: 70, alignment: .trailing)
                        Text("TIME")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.gray)
                            .tracking(0.5)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 0) {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text(miles(st.distanceMiles))
                                .font(.system(size: 26, weight: .heavy, design: .rounded))
                                .foregroundColor(.white)
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                            Text("mi")
                                .font(.caption).foregroundColor(.gray)
                        }
                        Text("DISTANCE")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.gray)
                            .tracking(0.5)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if st.isFinished {
                        // Clean completion line, centered, instead of a faint gray caption.
                        HStack(spacing: 6) {
                            Image(systemName: "checkmark.seal.fill")
                                .foregroundColor(brandGold).font(.caption)
                            Text("Run complete · \(st.metricValue) \(st.metricLabel)")
                                .font(.caption).fontWeight(.medium)
                                .foregroundColor(.white)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 2)
                    } else {
                        // Labeled secondary metric (pace for runs, speed for walks).
                        HStack(alignment: .firstTextBaseline) {
                            Label {
                                Text(context.attributes.activityType.lowercased() == "walk" ? "AVG SPEED" : "AVG PACE")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundColor(.gray)
                                    .tracking(0.5)
                            } icon: {
                                Image(systemName: "speedometer")
                                    .foregroundColor(brandGold).font(.caption2)
                            }
                            Spacer(minLength: 8)
                            Text("\(st.metricValue) \(st.metricLabel)")
                                .font(.system(.callout, design: .rounded)).fontWeight(.semibold)
                                .foregroundColor(.white)
                                .monospacedDigit()
                                .lineLimit(1)
                        }
                        .padding(.top, 2)
                    }
                }
            } compactLeading: {
                Image(systemName: st.isFinished ? "checkmark.seal.fill" : icon(for: context.attributes.activityType))
                    .foregroundColor(brandGold)
            } compactTrailing: {
                Text("\(miles(st.distanceMiles)) mi")
                    .font(.caption2).fontWeight(.semibold)
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: st.isFinished ? "checkmark.seal.fill" : icon(for: context.attributes.activityType))
                    .foregroundColor(brandGold)
            }
            .widgetURL(URL(string: "team3332://run"))
            .keylineTint(brandGold)
        }
    }
}
