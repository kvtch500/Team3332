//  RunLiveActivity.swift
//  TEAM 3332 — Live Activity UI (618g)
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

private func icon(for type: String) -> String {
    type.lowercased() == "walk" ? "figure.walk" : "figure.run"
}

// MARK: - Lock-screen / banner view

private struct LockScreenView: View {
    let context: ActivityViewContext<RunActivityAttributes>

    var body: some View {
        let st = context.state
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
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .activityBackgroundTint(brandDark)
        .activitySystemActionForegroundColor(brandGold)
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
                // Expanded
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.attributes.activityType.uppercased())
                            .font(.caption2).fontWeight(.bold)
                            .foregroundColor(brandGold)
                    } icon: {
                        Image(systemName: icon(for: context.attributes.activityType))
                            .foregroundColor(brandGold)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.attributes.startedAt, style: .timer)
                        .font(.system(.body, design: .rounded)).fontWeight(.semibold)
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 64, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text(miles(st.distanceMiles))
                            .font(.system(size: 28, weight: .heavy, design: .rounded))
                            .foregroundColor(.white)
                        Text("mi")
                            .font(.caption).foregroundColor(.gray)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("\(st.metricValue) \(st.metricLabel)")
                        .font(.caption).foregroundColor(.gray)
                }
            } compactLeading: {
                Image(systemName: icon(for: context.attributes.activityType))
                    .foregroundColor(brandGold)
            } compactTrailing: {
                Text("\(miles(st.distanceMiles)) mi")
                    .font(.caption2).fontWeight(.semibold)
                    .foregroundColor(.white)
            } minimal: {
                Image(systemName: icon(for: context.attributes.activityType))
                    .foregroundColor(brandGold)
            }
            .widgetURL(URL(string: "team3332://run"))
            .keylineTint(brandGold)
        }
    }
}
