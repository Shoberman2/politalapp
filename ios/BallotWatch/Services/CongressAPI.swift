import Foundation

/// Congress.gov API — the source for district-level member data.
///
/// The Supabase `politicians` roster stores `district` as null for every House
/// member, so "who represents district CA-12" has to come from here. Everything
/// else (votes, bills, tallies) comes from Supabase.
enum CongressAPI {
    private static let base = URL(string: "https://api.congress.gov/v3")!
    static let currentCongress = 119

    struct MemberSummary: Decodable, Identifiable, Hashable {
        let bioguideID: String
        let name: String
        let partyName: String?
        let state: String?
        let district: Int?
        let depiction: Depiction?
        let terms: Terms?

        enum CodingKeys: String, CodingKey {
            case bioguideID = "bioguideId"
            case name, partyName, state, district, depiction, terms
        }

        struct Depiction: Decodable, Hashable {
            let imageUrl: String?
            let attribution: String?
        }

        struct Terms: Decodable, Hashable {
            let item: [Term]?
            struct Term: Decodable, Hashable {
                let chamber: String?
                let startYear: Int?
                let endYear: Int?
            }
        }

        var id: String { bioguideID }
        var party: Party { Party(raw: partyName) }

        /// The API returns "Simon, Lateefah" in list responses and
        /// "Lateefah Simon" in detail. Normalize to natural order.
        var displayName: String {
            guard name.contains(",") else { return name }
            let parts = name.split(separator: ",", maxSplits: 1).map {
                $0.trimmingCharacters(in: .whitespaces)
            }
            guard parts.count == 2 else { return name }
            return "\(parts[1]) \(parts[0])"
        }

        var chamber: Chamber? {
            guard let raw = terms?.item?.last?.chamber else {
                return district == nil ? nil : .house
            }
            return Chamber(raw: raw)
        }
    }

    private struct MemberListResponse: Decodable { let members: [MemberSummary] }

    /// Thrown when no Congress.gov key is configured. Callers treat this as
    /// "district numbers unavailable" rather than as a failure — everything
    /// else in the app comes from Supabase and still works.
    struct MissingAPIKey: LocalizedError {
        var errorDescription: String? {
            "No Congress.gov API key configured, so district numbers are unavailable."
        }
    }

    /// Members currently serving a given state, optionally narrowed to one
    /// district. `currentMember=true` keeps former members out.
    static func members(state: String, district: Int? = nil) async throws -> [MemberSummary] {
        guard let apiKey = Config.congressAPIKey else { throw MissingAPIKey() }
        var path = "member/congress/\(currentCongress)/\(state)"
        if let district { path += "/\(district)" }
        var components = URLComponents(
            url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            .init(name: "format", value: "json"),
            .init(name: "currentMember", value: "true"),
            .init(name: "limit", value: "250"),
            .init(name: "api_key", value: apiKey),
        ]
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PostgRESTError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode(MemberListResponse.self, from: data).members
    }

    struct MemberDetail: Decodable {
        let bioguideID: String
        let directOrderName: String?
        let state: String?
        let district: Int?
        let birthYear: String?
        let depiction: MemberSummary.Depiction?
        let officialWebsiteUrl: String?
        let partyHistory: [PartyHistoryItem]?
        let terms: TermsWrapper?

        enum CodingKeys: String, CodingKey {
            case bioguideID = "bioguideId"
            case directOrderName, state, district, birthYear, depiction
            case officialWebsiteUrl, partyHistory, terms
        }

        struct PartyHistoryItem: Decodable {
            let partyName: String?
            let startYear: Int?
        }

        struct TermsWrapper: Decodable {
            let item: [Item]?
            struct Item: Decodable {
                let chamber: String?
                let startYear: Int?
                let endYear: Int?
                let congress: Int?
            }
        }

        var party: Party { Party(raw: partyHistory?.last?.partyName) }

        /// First year of the earliest term on record — "serving since 2013".
        var servingSince: Int? { terms?.item?.compactMap(\.startYear).min() }
    }

    private struct MemberDetailResponse: Decodable { let member: MemberDetail }

    static func member(bioguideID: String) async throws -> MemberDetail {
        guard let apiKey = Config.congressAPIKey else { throw MissingAPIKey() }
        var components = URLComponents(
            url: base.appendingPathComponent("member/\(bioguideID)"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            .init(name: "format", value: "json"),
            .init(name: "api_key", value: apiKey),
        ]
        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PostgRESTError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode(MemberDetailResponse.self, from: data).member
    }
}

// MARK: - Member photos

/// Resolves the best available headshot for a member.
///
/// Ported from `src/utils/memberImage.js`: the unitedstates.github.io
/// collection carries consistent high-resolution portraits for essentially
/// every current and historical member, far better than the ~5KB congress.gov
/// thumbnails, which are kept only as a fallback.
enum MemberImage {
    /// Hand-curated overrides for members Congress.gov hasn't published a photo
    /// for yet (usually a special-election arrival). Remove an entry once the
    /// collection catches up.
    private static let overrides: [String: String] = [
        "A000383": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Senator_Alan_Armstrong_swearing_in_ceremony%2C_2026.jpg/330px-Senator_Alan_Armstrong_swearing_in_ceremony%2C_2026.jpg",
    ]

    static func primary(_ bioguideID: String) -> URL? {
        if let override = overrides[bioguideID] { return URL(string: override) }
        return URL(string: "https://unitedstates.github.io/images/congress/450x550/\(bioguideID).jpg")
    }

    /// Predictable congress.gov thumbnail, used only when the primary 404s.
    static func fallback(_ bioguideID: String) -> URL? {
        URL(string: "https://www.congress.gov/img/member/\(bioguideID.lowercased()).jpg")
    }

    /// Some congress.gov depiction URLs come back with the bioguide URL
    /// concatenated onto the congress.gov prefix. Keep only the second URL.
    static func stripDoublePrefix(_ url: String?) -> String? {
        guard let url else { return nil }
        guard let range = url.range(
            of: "https://", options: [], range: url.index(url.startIndex, offsetBy: 8)..<url.endIndex
        ) else { return url }
        return String(url[range.lowerBound...])
    }
}
