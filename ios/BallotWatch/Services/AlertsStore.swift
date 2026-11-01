import SwiftUI
import UIKit
import UserNotifications

/// Pro alerts: Bill Watch (a watched bill moves) and member vote alerts (a
/// followed member casts a recorded vote).
///
/// This side is client-only: it asks for notification permission, registers
/// with APNs and keeps the device token and the alert choices on the device.
/// Sending pushes needs a server holding the APNs key, which is deliberately
/// not in this app; ios/README.md lists the server work that remains.
@MainActor
final class AlertsStore: ObservableObject {
    @Published private(set) var billAlerts: Set<String> = [] {
        didSet { defaults.set(Array(billAlerts).sorted(), forKey: Keys.bills) }
    }
    @Published private(set) var memberAlerts: Set<String> = [] {
        didSet { defaults.set(Array(memberAlerts).sorted(), forKey: Keys.members) }
    }
    @Published private(set) var deviceToken: String? {
        didSet { defaults.set(deviceToken, forKey: Keys.token) }
    }
    @Published private(set) var authorization: UNAuthorizationStatus = .notDetermined

    private let defaults: UserDefaults
    private enum Keys {
        static let bills = "alerts.bills"
        static let members = "alerts.members"
        static let token = "alerts.apnsToken"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if ProcessInfo.processInfo.arguments.contains("--reset-state") {
            [Keys.bills, Keys.members].forEach(defaults.removeObject(forKey:))
        }
        billAlerts = Set(defaults.stringArray(forKey: Keys.bills) ?? [])
        memberAlerts = Set(defaults.stringArray(forKey: Keys.members) ?? [])
        deviceToken = defaults.string(forKey: Keys.token)
        AppDelegate.onToken = { [weak self] token in
            Task { @MainActor in self?.deviceToken = token }
        }
        Task { await refreshAuthorization() }
    }

    var hasAnyAlerts: Bool { !billAlerts.isEmpty || !memberAlerts.isEmpty }

    func isAlerting(billID: String) -> Bool { billAlerts.contains(billID) }
    func isAlerting(memberID: String) -> Bool { memberAlerts.contains(memberID) }

    /// Turns an alert on or off. Returns the new state, or nil when the
    /// person declined notification permission.
    func toggle(billID: String) async -> Bool? {
        if billAlerts.contains(billID) { billAlerts.remove(billID); return false }
        guard await ensurePermission() else { return nil }
        billAlerts.insert(billID)
        return true
    }

    func toggle(memberID: String) async -> Bool? {
        if memberAlerts.contains(memberID) { memberAlerts.remove(memberID); return false }
        guard await ensurePermission() else { return nil }
        memberAlerts.insert(memberID)
        return true
    }

    func clearAll() {
        billAlerts = []
        memberAlerts = []
    }

    /// Asks once, then registers with APNs. Safe to call repeatedly.
    @discardableResult
    func ensurePermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        var status = await center.notificationSettings().authorizationStatus
        if status == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            status = await center.notificationSettings().authorizationStatus
        }
        authorization = status
        let allowed = status == .authorized || status == .provisional || status == .ephemeral
        if allowed { UIApplication.shared.registerForRemoteNotifications() }
        return allowed
    }

    func refreshAuthorization() async {
        authorization = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        if hasAnyAlerts, authorization == .authorized {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// APNs hands the token over as bytes; servers expect lowercase hex.
    nonisolated static func hex(_ token: Data) -> String {
        token.map { String(format: "%02x", $0) }.joined()
    }
}

/// UIKit delivers the APNs token to the app delegate, so SwiftUI needs one.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static var onToken: ((String) -> Void)?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Self.onToken?(AlertsStore.hex(deviceToken))
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // The simulator and unsigned builds land here; alerts stay saved and
        // registration retries on the next launch.
    }

    /// Show alerts while the app is open too.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
