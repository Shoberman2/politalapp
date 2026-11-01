import AuthenticationServices
import CryptoKit
import Foundation

/// Nonce handling for Sign in with Apple. Apple gets the SHA-256 of a random
/// nonce; Supabase gets the raw nonce and checks the two match, which stops a
/// stolen identity token from being replayed.
enum AppleSignIn {
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Configures the Apple request and returns the raw nonce to keep.
    static func prepare(_ request: ASAuthorizationAppleIDRequest) -> String {
        let nonce = randomNonce()
        request.requestedScopes = [.email]
        request.nonce = sha256(nonce)
        return nonce
    }

    /// Pulls the identity token out of Apple's result.
    static func identityToken(from result: Result<ASAuthorization, Error>) throws -> String? {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let data = credential.identityToken,
                  let token = String(data: data, encoding: .utf8) else {
                throw AuthError.message("Apple did not return a sign-in token. Try again.")
            }
            return token
        case .failure(let error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return nil }
            throw error
        }
    }
}
