import Foundation

// MARK: - Party

enum Party: String, Codable, CaseIterable, Sendable {
    case democrat, republican, independent, unknown

    /// Congress.gov, the Supabase roster and the FEC all spell party
    /// differently ("Democratic", "Democrat", "D", "ID"). Normalize on the way
    /// in so nothing downstream has to special-case a spelling.
    init(raw: String?) {
        let s = (raw ?? "").lowercased()
        if s.hasPrefix("d") { self = .democrat }
        else if s.hasPrefix("r") { self = .republican }
        else if s.hasPrefix("i") { self = .independent }
        else { self = .unknown }
    }

    /// Single letter for the thin party tag next to a name.
    var letter: String {
        switch self {
        case .democrat: return "D"
        case .republican: return "R"
        case .independent: return "I"
        case .unknown: return "—"
        }
    }

    var label: String {
        switch self {
        case .democrat: return "Democrat"
        case .republican: return "Republican"
        case .independent: return "Independent"
        case .unknown: return "Unknown"
        }
    }
}

// MARK: - Chamber

enum Chamber: String, Codable, CaseIterable, Sendable {
    case house, senate

    var label: String { self == .house ? "House" : "Senate" }
    var memberTitle: String { self == .house ? "Representative" : "Senator" }
    var shortTitle: String { self == .house ? "Rep." : "Sen." }

    /// Full membership, used to sanity-check roll-call tallies. A total above
    /// this means the row is double-counted and should not be shown.
    var size: Int { self == .house ? 435 : 100 }

    init?(raw: String?) {
        switch (raw ?? "").lowercased() {
        case "house", "house of representatives": self = .house
        case "senate": self = .senate
        default: return nil
        }
    }
}

// MARK: - Vote position

enum VotePosition: String, Codable, Sendable {
    case yea = "Yea"
    case nay = "Nay"
    case present = "Present"
    case notVoting = "Not Voting"

    init(raw: String?) {
        switch (raw ?? "").lowercased() {
        case "yea", "aye", "yes": self = .yea
        case "nay", "no": self = .nay
        case "present": self = .present
        default: self = .notVoting
        }
    }

    var label: String { rawValue }
}

// MARK: - Politician

struct Politician: Codable, Identifiable, Hashable, Sendable {
    let id: String          // BioGuide ID
    let name: String
    let chamberRaw: String
    let state: String
    let district: String?
    let partyRaw: String
    let photoURL: String?

    enum CodingKeys: String, CodingKey {
        case id, name, state, district
        case chamberRaw = "chamber"
        case partyRaw = "party"
        case photoURL = "photo_url"
    }

    var party: Party { Party(raw: partyRaw) }
    var chamber: Chamber { Chamber(raw: chamberRaw) ?? .house }

    /// "CA-12", "CA (Senate)", or just the state for a House member whose
    /// district we don't hold. The Supabase roster stores district as null for
    /// every House member, so this is usually filled in from Congress.gov.
    func seatLabel(districtOverride: String? = nil) -> String {
        let d = districtOverride ?? district
        if chamber == .senate { return state }
        guard let d, !d.isEmpty else { return state }
        return d == "0" ? "\(state)-AL" : "\(state)-\(d)"
    }

    var displayTitle: String { "\(chamber.shortTitle) \(name)" }
}

// MARK: - Member stats (member_stats table)

struct MemberStats: Codable, Hashable, Sendable {
    let politicianID: String
    let congress: Int?
    let totalVotes: Int?
    let yeaCount: Int?
    let nayCount: Int?
    let presentCount: Int?
    let notVotingCount: Int?
    let partyLoyaltyPct: Double?

    enum CodingKeys: String, CodingKey {
        case politicianID = "politician_id"
        case congress
        case totalVotes = "total_votes"
        case yeaCount = "yea_count"
        case nayCount = "nay_count"
        case presentCount = "present_count"
        case notVotingCount = "not_voting_count"
        case partyLoyaltyPct = "party_loyalty_pct"
    }

    /// Share of roll calls the member actually showed up for. "Not Voting" is
    /// the only absence category; Present counts as attendance.
    var participationPct: Double? {
        guard let total = totalVotes, total > 0 else { return nil }
        let missed = notVotingCount ?? 0
        return Double(total - missed) / Double(total) * 100
    }
}

// MARK: - Bill

struct Bill: Codable, Identifiable, Hashable, Sendable {
    let id: String          // "119-hr-1234"
    let title: String
    let introducedAt: String?
    let summary: String?
    let crsSummary: String?
    let policyArea: String?
    let sourceURL: String?
    let sponsorBioguideID: String?
    let sponsorName: String?
    let sponsorParty: String?
    let sponsorState: String?
    let legislativeStage: String?

    enum CodingKeys: String, CodingKey {
        case id, title, summary
        case introducedAt = "introduced_at"
        case crsSummary = "crs_summary"
        case policyArea = "policy_area"
        case sourceURL = "source_url"
        case sponsorBioguideID = "sponsor_bioguide_id"
        case sponsorName = "sponsor_name"
        case sponsorParty = "sponsor_party"
        case sponsorState = "sponsor_state"
        case legislativeStage = "legislative_stage"
    }

    /// Decodes the "{congress}-{type}-{number}" primary key.
    var key: BillKey? { BillKey(id: id) }

    /// "H.R. 1234" — the way the bill is cited in print.
    var displayNumber: String { key?.display ?? id }

    /// Titles in the table are sometimes placeholder stubs that just repeat the
    /// bill number ("HR 915"). Those carry no information, so callers show the
    /// number alone rather than a title that says nothing.
    var hasRealTitle: Bool { BillKey.isRealTitle(title, for: key) }

    var sponsor: Party { Party(raw: sponsorParty) }

    /// Prefer the official CRS summary; the AI summary is the fallback.
    var bestSummary: String? {
        if let c = crsSummary, !c.trimmed.isEmpty { return c }
        if let s = summary, !s.trimmed.isEmpty { return s }
        return nil
    }

    var introducedDate: Date? { DateParsing.date(from: introducedAt) }
}

struct BillKey: Hashable, Sendable {
    let congress: Int
    let type: String        // lowercase: hr, s, hres, ...
    let number: Int

    init?(id: String) {
        let parts = id.split(separator: "-")
        guard parts.count >= 3,
              let congress = Int(parts[0]),
              let number = Int(parts[2]) else { return nil }
        self.congress = congress
        self.type = String(parts[1]).lowercased()
        self.number = number
    }

    init(congress: Int, type: String, number: Int) {
        self.congress = congress
        self.type = type.lowercased()
        self.number = number
    }

    var id: String { "\(congress)-\(type)-\(number)" }

    static let typeLabels: [String: String] = [
        "hr": "H.R.", "s": "S.", "hres": "H.Res.", "sres": "S.Res.",
        "hjres": "H.J.Res.", "sjres": "S.J.Res.",
        "hconres": "H.Con.Res.", "sconres": "S.Con.Res.",
    ]

    var display: String {
        "\(Self.typeLabels[type] ?? type.uppercased()) \(number)"
    }

    var chamber: Chamber { type.hasPrefix("h") ? .house : .senate }

    /// True when a title says more than the bill number already does.
    ///
    /// Placeholder stubs show up in several spellings for the same bill —
    /// "SJRES 82", "S.J.Res. 82", "sjres-82" — so both sides are reduced to
    /// bare alphanumerics before comparing. Without that, "SJRES 82" survives a
    /// naive comparison against the display form and renders as a title.
    static func isRealTitle(_ title: String?, for key: BillKey?) -> Bool {
        guard let title, !title.trimmed.isEmpty else { return false }
        guard let key else { return true }
        let stripped = title.lowercased().replacingOccurrences(
            of: "[^a-z0-9]", with: "", options: .regularExpression
        )
        return !stripped.isEmpty && stripped != "\(key.type)\(key.number)"
    }

    var congressGovURL: URL? {
        let slug: String = {
            switch type {
            case "hr": return "house-bill"
            case "s": return "senate-bill"
            case "hres": return "house-resolution"
            case "sres": return "senate-resolution"
            case "hjres": return "house-joint-resolution"
            case "sjres": return "senate-joint-resolution"
            case "hconres": return "house-concurrent-resolution"
            case "sconres": return "senate-concurrent-resolution"
            default: return "bill"
            }
        }()
        return URL(string: "https://www.congress.gov/bill/\(congress)th-congress/\(slug)/\(number)")
    }
}

// MARK: - Vote

struct Vote: Codable, Identifiable, Hashable, Sendable {
    let politicianID: String
    let billID: String?
    let rollCallID: String?
    let positionRaw: String
    let votedAt: String
    let sourceURL: String?

    enum CodingKeys: String, CodingKey {
        case politicianID = "politician_id"
        case billID = "bill_id"
        case rollCallID = "roll_call_id"
        case positionRaw = "position"
        case votedAt = "voted_at"
        case sourceURL = "source_url"
    }

    var id: String { "\(rollCallID ?? billID ?? UUID().uuidString)-\(politicianID)" }
    var position: VotePosition { VotePosition(raw: positionRaw) }
    var date: Date? { DateParsing.date(from: votedAt) }
}

// MARK: - Roll call

struct RollCall: Codable, Identifiable, Hashable, Sendable {
    let id: String          // "house-119-2-225"
    let billID: String?
    let question: String?
    let description: String?
    let votedAt: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, question, description
        case billID = "bill_id"
        case votedAt = "voted_at"
        case createdAt = "created_at"
    }

    var meta: RollCallMeta? { RollCallMeta(id: id) }
    var date: Date? { DateParsing.date(from: votedAt) }
}

struct RollCallMeta: Hashable, Sendable {
    let chamber: Chamber
    let congress: Int
    let session: Int
    let number: Int

    /// Parses "house-119-2-225".
    init?(id: String) {
        let parts = id.split(separator: "-")
        guard parts.count == 4,
              let chamber = Chamber(raw: String(parts[0])),
              let congress = Int(parts[1]),
              let session = Int(parts[2]),
              let number = Int(parts[3]) else { return nil }
        self.chamber = chamber
        self.congress = congress
        self.session = session
        self.number = number
    }
}

struct RollCallStats: Codable, Hashable, Sendable {
    let rollCallID: String
    let demYea: Int?
    let demNay: Int?
    let repYea: Int?
    let repNay: Int?
    let indYea: Int?
    let indNay: Int?

    enum CodingKeys: String, CodingKey {
        case rollCallID = "roll_call_id"
        case demYea = "dem_yea", demNay = "dem_nay"
        case repYea = "rep_yea", repNay = "rep_nay"
        case indYea = "ind_yea", indNay = "ind_nay"
    }

    var totalYea: Int { (demYea ?? 0) + (repYea ?? 0) + (indYea ?? 0) }
    var totalNay: Int { (demNay ?? 0) + (repNay ?? 0) + (indNay ?? 0) }
}

// MARK: - Bill explanation (bill_explanations cache table)

struct BillExplanation: Codable, Hashable, Sendable {
    let billKey: String
    let explanation: String
    let model: String?
    let billTitle: String?

    enum CodingKeys: String, CodingKey {
        case billKey = "bill_key"
        case explanation, model
        case billTitle = "bill_title"
    }
}

// MARK: - Committee routing

struct CommitteeRouting: Codable, Hashable, Sendable {
    let committeeCode: String?
    let committeeName: String?
    let subcommitteeName: String?
    let chamberRaw: String?
    let referredAt: String?
    let activityType: String?

    enum CodingKeys: String, CodingKey {
        case committeeCode = "committee_code"
        case committeeName = "committee_name"
        case subcommitteeName = "subcommittee_name"
        case chamberRaw = "chamber"
        case referredAt = "referred_at"
        case activityType = "activity_type"
    }
}

// MARK: - Date helpers

enum DateParsing {
    /// The API returns bare dates ("2026-08-05") for votes and full ISO-8601
    /// timestamps elsewhere. Try both.
    static func date(from string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        if string.count == 10, let d = dayFormatter.date(from: string) { return d }
        if let d = isoFormatter.date(from: string) { return d }
        if let d = isoNoFractional.date(from: string) { return d }
        return dayFormatter.date(from: String(string.prefix(10)))
    }

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoNoFractional = ISO8601DateFormatter()

    /// "Aug 5, 2026"
    static func medium(_ date: Date?) -> String {
        guard let date else { return "—" }
        return mediumFormatter.string(from: date)
    }

    private static let mediumFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()

    /// "3 days ago" — used on the feed where recency is the point.
    static func relative(_ date: Date?) -> String {
        guard let date else { return "—" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
