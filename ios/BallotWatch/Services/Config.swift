import Foundation

/// Backend configuration, read from a bundled `Secrets.plist`.
///
/// This repository is public, so no key is written into source. `Secrets.plist`
/// is gitignored; `Secrets.example.plist` is the committed template. Generate
/// your copy from the repo-root `.env` with:
///
///     ios/scripts/make-secrets.sh
///
/// The Supabase anon key is safe to ship inside the app binary — every table it
/// reaches is protected by row-level security, and the read policies are
/// deliberately public because congressional voting records are public record.
/// It's kept out of the repo only so the app has one config path, not two.
///
/// The Congress.gov and OpenFEC keys never ship in the app: both are reached
/// through the site's proxy (see `proxyURL`). Anything genuinely secret
/// (OpenAI, Stripe, service-role) belongs server-side, exactly as on the web.
enum Config {

    private static let values: [String: String] = {
        guard let url = Bundle.main.url(forResource: "Secrets", withExtension: "plist"),
              let data = try? Data(contentsOf: url),
              let plist = try? PropertyListSerialization.propertyList(
                from: data, format: nil
              ) as? [String: String]
        else { return [:] }
        return plist
    }()

    /// Missing config is a build-setup mistake, not a runtime condition to
    /// handle — fail loudly and say exactly how to fix it.
    private static func require(_ key: String) -> String {
        guard let value = values[key], !value.isEmpty, !value.hasPrefix("YOUR_") else {
            fatalError(
                """
                Missing "\(key)" in ios/BallotWatch/Secrets.plist.
                Run: ios/scripts/make-secrets.sh
                (generates it from the repo-root .env)
                """
            )
        }
        return value
    }

    static var supabaseURL: String { require("SUPABASE_URL") }
    static var supabaseAnonKey: String { require("SUPABASE_ANON_KEY") }

    /// The public site. Congress.gov and OpenFEC are reached through its
    /// proxy (`/api/proxy/<service>/...`), which holds the api.data.gov keys
    /// server-side, the same way the web app reaches them.
    static let siteURL = URL(string: "https://www.ballotwatch.io")!

    static func proxyURL(service: String) -> URL {
        siteURL.appendingPathComponent("api/proxy/\(service)")
    }

    static var restURL: URL { URL(string: "\(supabaseURL)/rest/v1")! }
    static var authURL: URL { URL(string: "\(supabaseURL)/auth/v1")! }
    static var functionsURL: URL { URL(string: "\(supabaseURL)/functions/v1")! }
}
