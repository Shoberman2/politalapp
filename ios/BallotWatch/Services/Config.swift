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
/// The Congress.gov key is a free but rate-limited per-user key, so it should
/// not be committed anywhere.
///
/// Anything genuinely secret (OpenAI, Stripe, service-role) belongs in a
/// Supabase Edge Function and never reaches the client, exactly as on the web.
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

    /// Optional. Without it the app still runs off Supabase; House members just
    /// show their state instead of their district number, since the roster
    /// stores `district` as NULL and only Congress.gov can fill it in.
    static var congressAPIKey: String? {
        let value = values["CONGRESS_API_KEY"]
        guard let value, !value.isEmpty, !value.hasPrefix("YOUR_") else { return nil }
        return value
    }

    static var hasCongressAPIKey: Bool { congressAPIKey != nil }

    static var restURL: URL { URL(string: "\(supabaseURL)/rest/v1")! }
    static var authURL: URL { URL(string: "\(supabaseURL)/auth/v1")! }
    static var functionsURL: URL { URL(string: "\(supabaseURL)/functions/v1")! }
}
