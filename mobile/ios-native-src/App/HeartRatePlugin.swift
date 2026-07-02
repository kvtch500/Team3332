//  HeartRatePlugin.swift
//  TEAM 3332 — Capacitor bridge for a Bluetooth LE heart-rate sensor (623)
//
//  Exposes startScan / stopScan / connect / disconnect to JS as the "HeartRate" plugin and
//  emits events: "deviceFound" {id,name}, "heartRate" {bpm}, "connection" {state}. JS
//  feature-detects it (registerPlugin guard, see app.jsx HeartRate helper) and no-ops where
//  unsupported, so this is iOS-only and safe to ship before the target/Info.plist exist.
//
//  Uses CoreBluetooth + the standard BLE Heart Rate Service (0x180D) / Heart Rate Measurement
//  characteristic (0x2A37), which every compliant chest strap / armband advertises (Polar,
//  Wahoo, Garmin, Coros, etc.). No pairing UI needed — we scan, connect, and subscribe.
//
//  Add this file (and HeartRatePlugin.m) to the main `App` target only.
//  ⚠️ Requires NSBluetoothAlwaysUsageDescription in Info.plist (see HEART-RATE-SETUP.md).
//  ⚠️ The class must ALSO be listed in capacitor.config.json `packageClassList`
//     ("HeartRatePlugin"); `npx cap sync` + patch-native-config.mjs handle that.

import Foundation
import Capacitor
import CoreBluetooth

@objc(HeartRatePlugin)
public class HeartRatePlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "HeartRatePlugin"
    public let jsName = "HeartRate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScan",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan",   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect",    returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    ]

    private let hrService = CBUUID(string: "180D")        // Heart Rate Service
    private let hrMeasurement = CBUUID(string: "2A37")    // Heart Rate Measurement characteristic

    private var central: CBCentralManager?
    private var discovered: [String: CBPeripheral] = [:]  // id (uuidString) -> peripheral
    private var connected: CBPeripheral?
    private var wantScan = false                          // queued scan if BT not powered on yet
    private var pendingConnectId: String?                 // connect() arrived before central ready

    private func ensureCentral() {
        if central == nil { central = CBCentralManager(delegate: self, queue: nil) }
    }

    // MARK: - JS methods

    @objc func startScan(_ call: CAPPluginCall) {
        ensureCentral()
        wantScan = true
        if central?.state == .poweredOn { beginScan() }
        call.resolve()
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        wantScan = false
        central?.stopScan()
        call.resolve()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let id = call.getString("deviceId") else { call.reject("deviceId required"); return }
        ensureCentral()
        central?.stopScan()
        wantScan = false
        if let p = discovered[id] {
            connected = p
            p.delegate = self
            central?.connect(p, options: nil)
        } else {
            // Not seen in this scan session — remember and (re)scan to find it.
            pendingConnectId = id
            if central?.state == .poweredOn { beginScan() }
        }
        call.resolve()
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        if let p = connected { central?.cancelPeripheralConnection(p) }
        connected = nil
        call.resolve()
    }

    private func beginScan() {
        // Scan filtered to HR-service advertisers so only relevant devices surface.
        central?.scanForPeripherals(withServices: [hrService], options: nil)
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn {
            if wantScan || pendingConnectId != nil { beginScan() }
        } else {
            notifyListeners("connection", data: ["state": "disconnected"])
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let id = peripheral.identifier.uuidString
        discovered[id] = peripheral
        let name = peripheral.name
            ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
            ?? "Heart-rate sensor"
        notifyListeners("deviceFound", data: ["id": id, "name": name])

        // Auto-connect if this is the device a queued connect() was waiting for.
        if let target = pendingConnectId, target == id {
            pendingConnectId = nil
            central.stopScan()
            connected = peripheral
            peripheral.delegate = self
            central.connect(peripheral, options: nil)
        }
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        notifyListeners("connection", data: ["state": "connected"])
        peripheral.delegate = self
        peripheral.discoverServices([hrService])
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if peripheral.identifier == connected?.identifier { connected = nil }
        notifyListeners("connection", data: ["state": "disconnected"])
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        notifyListeners("connection", data: ["state": "disconnected"])
    }

    // MARK: - CBPeripheralDelegate

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let svc = peripheral.services?.first(where: { $0.uuid == hrService }) else { return }
        peripheral.discoverCharacteristics([hrMeasurement], for: svc)
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let ch = service.characteristics?.first(where: { $0.uuid == hrMeasurement }) else { return }
        peripheral.setNotifyValue(true, for: ch)   // subscribe to streaming bpm
    }

    public func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == hrMeasurement, let data = characteristic.value, data.count >= 2 else { return }
        if let bpm = Self.parseHeartRate(data) {
            notifyListeners("heartRate", data: ["bpm": bpm])
        }
    }

    // Parse the BLE Heart Rate Measurement value per the GATT spec:
    // byte 0 = flags; bit 0 = value format (0 → UInt8 bpm at byte 1; 1 → UInt16 LE at bytes 1–2).
    static func parseHeartRate(_ data: Data) -> Int? {
        let bytes = [UInt8](data)
        guard let flags = bytes.first else { return nil }
        if flags & 0x01 == 0 {
            guard bytes.count >= 2 else { return nil }
            return Int(bytes[1])
        } else {
            guard bytes.count >= 3 else { return nil }
            return Int(bytes[1]) | (Int(bytes[2]) << 8)
        }
    }
}
