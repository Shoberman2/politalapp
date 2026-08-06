import Foundation
import SwiftUI

/// Supabase GoTrue email auth.
///
/// Content in this app is open — congressional voting records are public
/// record, and the web app gates nothing behind a login. Signing in only adds
/// personalization: watched bills and followed members that sync across
/// devices. Local saves work signed out.

struct AuthUser: Codable, Equatable, Sendable {
    let id: String
    let email: String?
}

private struct Session: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let user: AuthUser

    var isExpired: Bool { Date() >= expiresAt.addingTimeInterval(-60) }
}

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var user: AuthUser?
    @Published private(set) var isLoading = false

    private var session: Session? {
        didSet {
            user = session?.user
            Task { await PostgREST.shared.setAccessToken(session?.accessToken) }
        }
    }

    var isSignedIn: Bool { user != nil }

    init() {
        session = Keychain.loadSession()
        user = session?.user
        if let session {
            Task { await PostgREST.shared.setAccessToken(session.accessToken) }
            if session.isExpired { Task { await refresh() } }
        }
    }

    // MARK: - Actions

    func signUp(email: String, password: String) async throws {
        try await authenticate(path: "signup", email: email, password: password)
    }

    func signIn(email: String, password: String) async throws {
        try await authenticate(path: "token?grant_type=password", email: email, password: password)
    }

    func signOut() async {
        if let token = session?.accessToken {
            var request = URLRequest(url: Config.authURL.appendingPathComponent("logout"))
            request.httpMethod = "POST"
            request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
        session = nil
        Keychain.clearSession()
    }

    private func authenticate(path: String, email: String, password: String) async throws {
        isLoading = true
        defer { isLoading = false }

        var request = URLRequest(url: Config.authURL.appendingPathComponent(path.components(separatedBy: "?")[0]))
        if let query = path.components(separatedBy: "?").dropFirst().first {
            var components = URLComponents(
                url: Config.authURL.appendingPathComponent(path.components(separatedBy: "?")[0]),
                resolvingAgainstBaseURL: false
            )!
            components.query = query
            request = URLRequest(url: components.url!)
        }
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email, "password": password,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw AuthError.unknown }

        guard (200..<300).contains(http.statusCode) else {
            throw AuthError.message(Self.errorMessage(from: data, status: http.statusCode))
        }
        guard let parsed = Self.parseSession(data) else {
            // Sign-up with email confirmation on returns a user but no session.
            throw AuthError.message(
                "Check your email to confirm your account, then sign in."
            )
        }
        session = parsed
        Keychain.saveSession(parsed)
    }

    private func refresh() async {
        guard let refreshToken = session?.refreshToken else { return }
        var components = URLComponents(
            url: Config.authURL.appendingPathComponent("token"), resolvingAgainstBaseURL: false
        )!
        components.queryItems = [.init(name: "grant_type", value: "refresh_token")]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": refreshToken])

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
              let parsed = Self.parseSession(data) else {
            // Refresh token is dead — sign out rather than leaving a session
            // that will 401 on every write.
            session = nil
            Keychain.clearSession()
            return
        }
        session = parsed
        Keychain.saveSession(parsed)
    }

    private static func parseSession(_ data: Data) -> Session? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let accessToken = obj["access_token"] as? String,
              let refreshToken = obj["refresh_token"] as? String,
              let userObj = obj["user"] as? [String: Any],
              let id = userObj["id"] as? String else { return nil }
        let expiresIn = (obj["expires_in"] as? Double) ?? 3600
        return Session(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date().addingTimeInterval(expiresIn),
            user: AuthUser(id: id, email: userObj["email"] as? String)
        )
    }

    private static func errorMessage(from data: Data, status: Int) -> String {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "Something went wrong (\(status))."
        }
        if let message = obj["msg"] as? String { return message }
        if let message = obj["error_description"] as? String { return message }
        if let message = obj["message"] as? String { return message }
        return "Something went wrong (\(status))."
    }
}

enum AuthError: LocalizedError {
    case message(String)
    case unknown

    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        case .unknown: return "Something went wrong."
        }
    }
}

// MARK: - Keychain

/// Session tokens go in the keychain, not UserDefaults — they're credentials.
private enum Keychain {
    private static let account = "supabase.session"
    private static let service = "com.ballotwatch.app"

    static func saveSession<T: Encodable>(_ session: T) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func loadSession() -> Session? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    static func clearSession() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: account,
            kSecAttrService as String: service,
        ] as CFDictionary)
    }
}
