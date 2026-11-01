import SwiftUI

/// Device preferences that are not account data: appearance and whether the
/// first-run chat with Dome has happened.
@MainActor
final class AppSettings: ObservableObject {
    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String {
            switch self {
            case .system: return "System"
            case .light: return "Light"
            case .dark: return "Dark"
            }
        }
        var colorScheme: ColorScheme? {
            switch self {
            case .system: return nil
            case .light: return .light
            case .dark: return .dark
            }
        }
    }

    @Published var appearance: Appearance {
        didSet { defaults.set(appearance.rawValue, forKey: Keys.appearance) }
    }

    @Published var hasOnboarded: Bool {
        didSet { defaults.set(hasOnboarded, forKey: Keys.onboarded) }
    }

    private let defaults: UserDefaults
    private enum Keys {
        static let appearance = "appearance"
        static let onboarded = "hasOnboarded"
    }

    init(defaults: UserDefaults = .standard, arguments: [String] = ProcessInfo.processInfo.arguments) {
        self.defaults = defaults
        if arguments.contains("--reset-state") {
            defaults.removeObject(forKey: Keys.onboarded)
            defaults.removeObject(forKey: Keys.appearance)
        }
        appearance = Appearance(rawValue: defaults.string(forKey: Keys.appearance) ?? "") ?? .system
        // People who already saved a place used the app before onboarding
        // existed; they skip it.
        let returning = defaults.data(forKey: "savedPlace") != nil
        hasOnboarded = defaults.bool(forKey: Keys.onboarded) || returning
        if arguments.contains("--skip-onboarding") { hasOnboarded = true }
        if arguments.contains("--onboarding") { hasOnboarded = false }
        if let forced = arguments.firstIndex(of: "--appearance").flatMap({ arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }),
           let value = Appearance(rawValue: forced) {
            appearance = value
        }
    }
}
