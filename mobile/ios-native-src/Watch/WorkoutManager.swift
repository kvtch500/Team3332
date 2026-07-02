//  WorkoutManager.swift
//  TEAM 3332 — watchOS recording engine (Apple Watch support, session 17, June 25 2026)
//
//  Records a run/walk straight from the wrist, Strava-style:
//    • HealthKit HKWorkoutSession + HKLiveWorkoutBuilder — keeps the app running in the
//      background (the green "workout in progress" indicator) and streams heart rate from
//      the Watch's optical sensor, no chest strap needed.
//    • CoreLocation — GPS fixes → route polyline + great-circle distance, in the SAME
//      [lat, lon, tSecsSinceStart] shape the phone records, so the backend's fastest-split
//      logic (routes/activities.js) works identically for watch runs.
//
//  On finish it hands a finished-run dictionary to WatchSessionDelegate, which transfers it
//  to the iPhone over WatchConnectivity; the phone (WatchSyncPlugin → app.jsx) POSTs it to
//  /api/activities using the member's existing session. The watch never needs its own login.
//
//  Target membership: the **watchOS app** target only (see APPLE-WATCH-SETUP.md).

import Foundation
import HealthKit
import CoreLocation
import Combine

@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    enum Phase { case idle, requesting, recording, paused, finished }

    // ── Published state the SwiftUI views observe ────────────────────────────
    @Published var phase: Phase = .idle
    @Published var activityType: String = "Run"      // "Run" or "Walk"
    @Published var elapsed: TimeInterval = 0          // seconds, excludes paused time
    @Published var distanceMeters: Double = 0
    @Published var heartRate: Int = 0                 // live bpm (0 = no reading yet)
    @Published var authMessage: String? = nil         // non-nil when HealthKit denied

    // Convenience read-outs for the UI.
    var distanceMiles: Double { distanceMeters / 1609.344 }

    // ── HealthKit ────────────────────────────────────────────────────────────
    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    // ── Location ─────────────────────────────────────────────────────────────
    private let locationManager = CLLocationManager()
    private var lastLocation: CLLocation?

    // ── Timing / samples ─────────────────────────────────────────────────────
    private var startDate: Date?
    private var accumulated: TimeInterval = 0         // elapsed banked before the current pause-free run
    private var segmentStart: Date?                   // when the current (un-paused) segment began
    private var ticker: AnyCancellable?
    private var hrSamples: [Int] = []
    private var points: [[Double]] = []               // [lat, lon, tSecsSinceStart]

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        // NOTE: do NOT set allowsBackgroundLocationUpdates on watchOS — it throws at launch
        // unless the app declares the 'location' background mode. The HKWorkoutSession
        // (workout-processing) already keeps the app — and GPS — alive while recording.
        locationManager.activityType = .fitness
    }

    // MARK: - Permissions

    /// Ask for HealthKit (HR + workouts) and location up front. Safe to call repeatedly.
    func requestAuthorization() {
        // Location: when-in-use is enough; the workout session grants background runtime.
        locationManager.requestWhenInUseAuthorization()

        guard HKHealthStore.isHealthDataAvailable() else {
            authMessage = "Health data isn't available on this device."
            return
        }
        let share: Set = [HKObjectType.workoutType()]
        let read: Set = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
            HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!,
        ]
        healthStore.requestAuthorization(toShare: share, read: read) { [weak self] ok, _ in
            Task { @MainActor in
                if !ok { self?.authMessage = "Enable Health access in Settings to record from your watch." }
            }
        }
    }

    // MARK: - Controls

    func start(type: String) {
        guard phase == .idle || phase == .finished else { return }
        activityType = type
        resetState()
        phase = .requesting

        let config = HKWorkoutConfiguration()
        config.activityType = (type == "Walk") ? .walking : .running
        config.locationType = .outdoor

        do {
            let s = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b

            let now = Date()
            startDate = now
            segmentStart = now
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
        } catch {
            // HealthKit unavailable (e.g. simulator) — still record GPS-only so the feature
            // degrades gracefully instead of dead-ending.
            startDate = Date()
            segmentStart = startDate
        }

        locationManager.startUpdatingLocation()
        startTicker()
        phase = .recording
    }

    func pause() {
        guard phase == .recording else { return }
        session?.pause()
        bankSegment()
        locationManager.stopUpdatingLocation()
        ticker?.cancel()
        phase = .paused
    }

    func resume() {
        guard phase == .paused else { return }
        session?.resume()
        segmentStart = Date()
        locationManager.startUpdatingLocation()
        startTicker()
        phase = .recording
    }

    /// Stop, finalize, and return the finished-run payload (or nil if nothing was recorded).
    func finish() -> [String: Any]? {
        guard phase == .recording || phase == .paused else { return nil }
        bankSegment()
        ticker?.cancel()

        // GPS fixes arrive a few seconds behind real time, so by the moment Finish is tapped the
        // last stretch of the route (e.g. the tail end of a return trip) usually hasn't been
        // appended yet. Grab CoreLocation's most-recent cached fix and add it as the closing
        // point BEFORE we cut GPS, so the route ends where the run actually ended instead of
        // stranding the end marker mid-path.
        if let last = locationManager.location,
           last.horizontalAccuracy >= 0, last.horizontalAccuracy < 50,
           let start = startDate {
            let t = last.timestamp.timeIntervalSince(start)
            let newer = (points.last?[2] ?? -1) < t
            if newer {
                if let prev = lastLocation {
                    let d = last.distance(from: prev)
                    if d > 0.5 { distanceMeters += d }
                }
                points.append([last.coordinate.latitude, last.coordinate.longitude, max(0, t)])
                lastLocation = last
            }
        }

        locationManager.stopUpdatingLocation()

        let end = Date()
        session?.end()
        builder?.endCollection(withEnd: end) { [weak self] _, _ in
            self?.builder?.finishWorkout { _, _ in }   // saves to the Health app
        }

        phase = .finished
        return buildPayload(startedAt: startDate ?? end)
    }

    func discard() {
        ticker?.cancel()
        locationManager.stopUpdatingLocation()
        session?.end()
        builder?.discardWorkout()
        resetState()
        phase = .idle
    }

    /// Dismiss the post-run summary and return to the start screen. The workout session is
    /// already ended by finish(); this just clears state so a new run can begin.
    func reset() {
        resetState()
        phase = .idle
    }

    // MARK: - Internals

    private func resetState() {
        elapsed = 0; distanceMeters = 0; heartRate = 0; authMessage = nil
        accumulated = 0; segmentStart = nil; startDate = nil; lastLocation = nil
        hrSamples.removeAll(); points.removeAll()
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
            .sink { [weak self] _ in
                guard let self, let seg = self.segmentStart else { return }
                self.elapsed = self.accumulated + Date().timeIntervalSince(seg)
            }
    }

    private func bankSegment() {
        if let seg = segmentStart { accumulated += Date().timeIntervalSince(seg); segmentStart = nil }
        elapsed = accumulated
    }

    private func buildPayload(startedAt: Date) -> [String: Any] {
        // Downsample the route to ~200 points to keep the WatchConnectivity message small.
        let step = max(1, Int(ceil(Double(points.count) / 200.0)))
        var route: [[Double]] = []
        for (i, p) in points.enumerated() where i % step == 0 {
            route.append([ (p[0]*1e5).rounded()/1e5, (p[1]*1e5).rounded()/1e5, p[2].rounded() ])
        }
        let avgHr = hrSamples.isEmpty ? 0 : Int((Double(hrSamples.reduce(0, +)) / Double(hrSamples.count)).rounded())
        let maxHr = hrSamples.max() ?? 0

        return [
            "v": 1,
            "source": "watch",
            // Stable per-run id so the phone can dedup the sendMessage + transferUserInfo paths.
            "clientId": UUID().uuidString,
            "type": activityType,
            "name": "Apple Watch \(activityType)",
            "distanceMiles": distanceMiles,
            "durationSeconds": Int(elapsed.rounded()),
            "paceText": Self.paceText(seconds: elapsed, miles: distanceMiles),
            "avgHr": avgHr,
            "maxHr": maxHr,
            "startedAtEpoch": startedAt.timeIntervalSince1970,
            "points": route,
        ]
    }

    // MARK: - Formatting (shared with the views)

    static func clock(_ seconds: TimeInterval) -> String {
        let s = Int(seconds.rounded()); let h = s/3600, m = (s%3600)/60, sec = s%60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }

    /// Average pace as mm:ss per mile; "" when distance is too small to be meaningful.
    static func paceText(seconds: TimeInterval, miles: Double) -> String {
        guard miles >= 0.01, seconds > 0 else { return "" }
        let perMile = seconds / miles
        let m = Int(perMile) / 60, s = Int(perMile) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession,
                                    didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState,
                                    date: Date) {}
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {}
}

// MARK: - HKLiveWorkoutBuilderDelegate (heart rate stream)

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                    didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
              collectedTypes.contains(hrType),
              let stats = workoutBuilder.statistics(for: hrType),
              let q = stats.mostRecentQuantity() else { return }
        let bpm = Int(q.doubleValue(for: HKUnit.count().unitDivided(by: .minute())).rounded())
        guard bpm > 0 else { return }
        Task { @MainActor in
            self.heartRate = bpm
            if self.phase == .recording { self.hrSamples.append(bpm) }
        }
    }
}

// MARK: - CLLocationManagerDelegate (route + distance)

extension WorkoutManager: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            guard self.phase == .recording, let start = self.startDate else { return }
            for loc in locations where loc.horizontalAccuracy >= 0 && loc.horizontalAccuracy < 50 {
                if let prev = self.lastLocation {
                    let d = loc.distance(from: prev)
                    if d > 0.5 { self.distanceMeters += d }   // ignore sub-meter GPS jitter
                }
                self.lastLocation = loc
                let t = loc.timestamp.timeIntervalSince(start)
                self.points.append([loc.coordinate.latitude, loc.coordinate.longitude, max(0, t)])
            }
        }
    }
}
