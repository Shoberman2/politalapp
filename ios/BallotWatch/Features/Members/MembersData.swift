import Foundation

// Data the Members tab needs beyond the shared services, ported from the web
// sources the profile and directory read: the Congress.gov member detail
// (office, phone, terms), `member_congress_terms` (records of service), the
// leadership map, the FEC industry classifier, the roll-call result rules and
// the record-based narration. Each is a literal port so the app shows the same
// facts the website does.

// MARK: - Congress.gov member detail

/// The fields of Congress.gov `member/{id}` the web profile renders
/// (`src/components/PoliticianDetail.jsx`). Decoded here rather than in
/// `CongressAPI` so the shared service stays untouched.
struct MembersCongressProfile: Decodable {
    let bioguideID: String
    let directOrderName: String?
    let firstName: String?
    let lastName: String?
    let state: String?
    let birthYear: String?
    let officialWebsiteUrl: String?
    let depiction: Depiction?
    let addressInformation: Address?
    let partyHistory: [PartyItem]?
    let terms: [Term]

    enum CodingKeys: String, CodingKey {
        case bioguideID = "bioguideId"
        case directOrderName, firstName, lastName, state, birthYear
        case officialWebsiteUrl, depiction, addressInformation, partyHistory, terms
    }

    struct Depiction: Decodable { let imageUrl: String?; let attribution: String? }
    struct Address: Decodable {
        let officeAddress: String?
        let city: String?
        let zipCode: Int?
        let phoneNumber: String?
    }
    struct PartyItem: Decodable { let partyName: String?; let startYear: Int? }
    struct Term: Decodable {
        let chamber: String?
        let congress: Int?
        let startYear: Int?
        let endYear: Int?
        let stateCode: String?
        let district: Int?
        let partyName: String?
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bioguideID = try c.decode(String.self, forKey: .bioguideID)
        directOrderName = try? c.decodeIfPresent(String.self, forKey: .directOrderName)
        firstName = try? c.decodeIfPresent(String.self, forKey: .firstName)
        lastName = try? c.decodeIfPresent(String.self, forKey: .lastName)
        state = try? c.decodeIfPresent(String.self, forKey: .state)
        // Congress.gov has sent birthYear as both a string and a number.
        if let s = try? c.decodeIfPresent(String.self, forKey: .birthYear) {
            birthYear = s
        } else if let n = try? c.decodeIfPresent(Int.self, forKey: .birthYear) {
            birthYear = String(n)
        } else {
            birthYear = nil
        }
        officialWebsiteUrl = try? c.decodeIfPresent(String.self, forKey: .officialWebsiteUrl)
        depiction = try? c.decodeIfPresent(Depiction.self, forKey: .depiction)
        addressInformation = try? c.decodeIfPresent(Address.self, forKey: .addressInformation)
        partyHistory = try? c.decodeIfPresent([PartyItem].self, forKey: .partyHistory)
        // `terms` is an array in the detail response and `{ item: [...] }` in
        // older shapes; accept both, as the web's getTermsArray does.
        if let list = try? c.decodeIfPresent([Term].self, forKey: .terms) {
            terms = list
        } else if let wrapped = try? c.decodeIfPresent(TermsWrapper.self, forKey: .terms) {
            terms = wrapped.item ?? []
        } else {
            terms = []
        }
    }

    private struct TermsWrapper: Decodable { let item: [Term]? }

    /// Web `getCurrentTerm`: the term with the latest start year.
    var currentTerm: Term? { terms.max { ($0.startYear ?? 0) < ($1.startYear ?? 0) } }

    /// Web `firstTermYear`.
    var firstTermYear: Int? { terms.compactMap(\.startYear).min() }

    var partyName: String? { partyHistory?.first?.partyName }

    private struct Response: Decodable { let member: MembersCongressProfile }

    static func fetch(bioguideID: String) async throws -> MembersCongressProfile {
        let url = Config.proxyURL(service: "congress").appendingPathComponent("member/\(bioguideID)")
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PostgRESTError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode(Response.self, from: data).member
    }
}

// MARK: - Current roster from Congress.gov (districts + surname order)

/// The Supabase roster stores no House districts and keeps names in reading
/// order. The web directory reads Congress.gov's current-member list, which
/// carries both, so the app enriches its roster from the same list.
enum MembersRosterEnrichment {
    struct Entry: Hashable {
        let district: Int?
        /// "Ocasio-Cortez, Alexandria" — the order the web sorts by.
        let sortName: String
    }

    private struct ListResponse: Decodable {
        let members: [Item]
        struct Item: Decodable {
            let bioguideId: String
            let name: String?
            let district: Int?
        }
    }

    static func fetch() async -> [String: Entry] {
        var result: [String: Entry] = [:]
        await withTaskGroup(of: [ListResponse.Item].self) { group in
            for offset in [0, 250, 500] {
                group.addTask {
                    var components = URLComponents(
                        url: Config.proxyURL(service: "congress").appendingPathComponent("member"),
                        resolvingAgainstBaseURL: false
                    )!
                    components.queryItems = [
                        .init(name: "currentMember", value: "true"),
                        .init(name: "limit", value: "250"),
                        .init(name: "offset", value: String(offset)),
                    ]
                    guard let url = components.url,
                          let (data, response) = try? await URLSession.shared.data(from: url),
                          let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                          let decoded = try? JSONDecoder().decode(ListResponse.self, from: data)
                    else { return [] }
                    return decoded.members
                }
            }
            for await items in group {
                for item in items {
                    result[item.bioguideId] = Entry(district: item.district, sortName: item.name ?? "")
                }
            }
        }
        return result
    }
}

// MARK: - member_congress_terms

/// One row of `member_congress_terms` (migration 008): a member's seat in one
/// Congress. The web profile's "records of service" and the record card's
/// "serving since" both read it.
struct MembersCongressTerm: Decodable, Hashable {
    let bioguideID: String
    let congress: Int?
    let termStart: String?
    let termEnd: String?
    let chamber: String?
    let state: String?
    let district: String?
    let party: String?
    let caucus: String?

    enum CodingKeys: String, CodingKey {
        case bioguideID = "bioguide_id"
        case congress
        case termStart = "term_start"
        case termEnd = "term_end"
        case chamber, state, district, party, caucus
    }

    static func all(bioguideID: String) async throws -> [MembersCongressTerm] {
        try await PostgREST.shared.select(
            "member_congress_terms",
            columns: "bioguide_id, congress, term_start, term_end, chamber, state, district, party, caucus",
            filters: [.eq("bioguide_id", bioguideID)],
            order: [Order("congress", ascending: true), Order("term_start", ascending: true)],
            as: MembersCongressTerm.self
        )
    }
}

// MARK: - Congress numbering

enum MembersCongress {
    /// Web `CONGRESS_MAX` and `BILL_CONGRESS_MIN` (src/utils/congressUtil.ts).
    static let current = 119
    static let historyFloor = 107

    static func startYear(_ congress: Int) -> Int { 2025 + (congress - 119) * 2 }
    static func endYear(_ congress: Int) -> Int { startYear(congress) + 2 }

    /// "119th".
    static func ordinal(_ n: Int) -> String {
        let v = n % 100
        let suffixes = ["th", "st", "nd", "rd"]
        let s: String
        if (v - 20) % 10 >= 1 && (v - 20) % 10 <= 3 && v > 20 {
            s = suffixes[(v - 20) % 10]
        } else if v >= 1 && v <= 3 {
            s = suffixes[v]
        } else {
            s = "th"
        }
        return "\(n)\(s)"
    }

    /// "116th Congress (2019-2021)" — web `formatCongressLabel`.
    static func label(_ congress: Int) -> String {
        "\(ordinal(congress)) Congress (\(startYear(congress))-\(endYear(congress)))"
    }

    static func year(from date: String?) -> Int? {
        guard let date, date.count >= 4 else { return nil }
        return Int(date.prefix(4))
    }
}

// MARK: - Seats

enum MembersSeats {
    /// Web `NON_VOTING_JURISDICTIONS`.
    static let nonVoting: Set<String> = ["AS", "DC", "GU", "MP", "PR", "VI"]
    /// Web `AT_LARGE_STATES`.
    static let atLarge: Set<String> = ["AK", "DE", "ND", "SD", "VT", "WY"]

    static func isDelegate(_ p: Politician) -> Bool {
        p.chamber == .house && nonVoting.contains(p.state.uppercased())
    }

    /// Card role line on the web directory.
    static func role(_ p: Politician) -> String {
        if p.chamber == .senate { return "Senator" }
        if p.state.uppercased() == "PR" { return "Resident Commissioner" }
        return nonVoting.contains(p.state.uppercased()) ? "Delegate" : "Representative"
    }
}

// MARK: - Leadership

/// Web `src/data/leadership.js` (119th Congress).
enum MembersLeadership {
    static let titles: [String: String] = [
        "J000299": "Speaker of the House",
        "S001176": "House Majority Leader",
        "E000294": "House Majority Whip",
        "J000294": "House Minority Leader",
        "C001101": "House Minority Whip",
        "T000250": "Senate Majority Leader",
        "B001261": "Senate Majority Whip",
        "S000148": "Senate Minority Leader",
        "D000563": "Senate Minority Whip",
        "G000386": "President pro tempore",
    ]
}

// MARK: - Industry classifier

/// Web `src/data/industryMap.js`: keyword classification of FEC employers.
enum MembersIndustry {
    private static let special: [(String, [String])] = [
        ("Retired", ["retired", "retired person", "retiree", "homemaker", "home maker", "not employed - retired"]),
        ("Self-Employed", ["self-employed", "self employed", "self", "sole proprietor", "owner", "freelance", "consultant"]),
        ("Not Disclosed", ["not employed", "none", "n/a", "na", "information requested",
                           "information requested per best efforts", "refused", "unknown", "not available", ""]),
    ]

    private static let industries: [(String, [String])] = [
        ("Healthcare", ["pfizer", "johnson & johnson", "unitedhealth", "cigna", "anthem", "merck", "abbvie",
                        "eli lilly", "amgen", "bristol-myers", "hospital", "medical", "pharma", "health",
                        "clinic", "physician", "nurse", "dental", "biotech", "therapeutics"]),
        ("Finance", ["jpmorgan", "goldman sachs", "morgan stanley", "bank of america", "citigroup",
                     "wells fargo", "blackrock", "fidelity", "charles schwab", "investment", "hedge fund",
                     "private equity", "banking", "financial", "insurance", "capital management",
                     "asset management"]),
        ("Technology", ["google", "alphabet", "apple", "microsoft", "amazon", "meta", "oracle", "salesforce",
                        "adobe", "nvidia", "intel", "software", "tech", "computing", "data", "cyber", "ai ",
                        "artificial intelligence", "startup"]),
        ("Energy", ["exxon", "chevron", "conocophillips", "shell", "bp ", "halliburton", "schlumberger", "oil",
                    "gas", "petroleum", "energy", "mining", "coal", "solar", "wind power", "renewable"]),
        ("Defense", ["lockheed", "raytheon", "boeing", "northrop", "general dynamics", "l3harris",
                     "bae systems", "leidos", "defense", "military", "aerospace", "weapons"]),
        ("Real Estate", ["real estate", "property", "realty", "housing", "construction", "developer",
                         "building", "architecture", "mortgage"]),
        ("Legal", ["law firm", "attorney", "legal", "llp", "counsel", "lawyer", "law office", "pllc"]),
        ("Education", ["university", "college", "school", "education", "professor", "teacher", "academic",
                       "research"]),
        ("Retail", ["walmart", "target", "costco", "home depot", "kroger", "retail", "store", "restaurant",
                    "food service", "hospitality"]),
        ("Telecom & Media", ["at&t", "verizon", "comcast", "t-mobile", "disney", "netflix", "telecom", "media",
                             "broadcast", "entertainment", "publishing"]),
        ("Agriculture", ["farm", "ranch", "agriculture", "crop", "livestock", "dairy", "cargill",
                         "archer daniels", "deere"]),
        ("Transportation", ["airline", "railroad", "trucking", "shipping", "logistics", "fedex", "ups",
                            "united airlines", "delta air"]),
    ]

    static func classify(_ employer: String?) -> String {
        let emp = (employer ?? "").lowercased().trimmingCharacters(in: .whitespaces)
        for (category, keywords) in special
        where keywords.contains(where: { emp == $0 || (!$0.isEmpty && emp.contains($0)) }) {
            return category
        }
        let text = "\(emp) "
        for (industry, keywords) in industries where keywords.contains(where: { text.contains($0) }) {
            return industry
        }
        return "Other"
    }

    struct Sector: Identifiable, Hashable {
        let industry: String
        var total: Double
        var id: String { industry }
    }

    /// Web `getIndustryBreakdown`, over the receipts the app holds.
    static func breakdown(_ receipts: [FECService.ItemizedReceipt]) -> [Sector] {
        var sectors: [String: Sector] = [:]
        for receipt in receipts {
            let industry = classify(receipt.employer ?? receipt.name)
            sectors[industry, default: Sector(industry: industry, total: 0)].total += abs(receipt.amount)
        }
        return sectors.values.sorted { $0.total > $1.total }
    }

    /// Web `formatCurrency` in industryMap.js: "$964K", "$1.2M".
    static func compact(_ amount: Double) -> String {
        if amount >= 1_000_000 { return String(format: "$%.1fM", amount / 1_000_000) }
        if amount >= 1_000 { return "$\(Int((amount / 1_000).rounded()))K" }
        return "$\(Int(amount.rounded()))"
    }
}

// MARK: - Roll-call result

/// Web `resultKind` in api/_lib/rollCallResult.js; the result word itself is
/// `FloorVotes.deriveResult`, shared by every screen.
enum MembersRollCallResult {
    static func derive(question: String?, description: String?, yea: Int, nay: Int, chamber: Chamber?) -> String? {
        FloorVotes.deriveResult(question: question, yea: yea, nay: nay, chamber: chamber, description: description)
    }

    static func passed(_ result: String) -> Bool {
        let r = result.lowercased()
        return r.hasPrefix("passed") || r.contains("invoked") || r.contains("confirmed")
            || r.contains("agreed") || r.contains("overridden") || r == "ratified"
    }
}

// MARK: - Official summary ("Explain this bill")

/// Web `explainBillFromOfficialSummary`: the latest Congress.gov summary, split
/// into paragraphs. Nothing is generated.
enum MembersOfficialSummary {
    static let unavailable = [
        "Congress.gov has not published an official summary for this bill yet.",
        "BallotWatch won’t infer provisions from the title alone. Use the Congress.gov or full-text link for the official record.",
    ]

    private struct Response: Decodable {
        let summaries: [Item]?
        struct Item: Decodable { let text: String? }
    }

    static func paragraphs(billID: String, title: String?, fallbackHTML: String?) async -> [String] {
        var html: String?
        if let key = BillKey(id: billID) {
            let url = Config.proxyURL(service: "congress")
                .appendingPathComponent("bill/\(key.congress)/\(key.type)/\(key.number)/summaries")
            if let (data, response) = try? await URLSession.shared.data(from: url),
               let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
               let decoded = try? JSONDecoder().decode(Response.self, from: data) {
                html = decoded.summaries?.last?.text
            }
        }
        let source = (html?.isEmpty == false ? html : nil) ?? fallbackHTML ?? ""
        let paragraphs = split(source, title: title)
        return paragraphs.isEmpty ? unavailable : paragraphs
    }

    static func split(_ html: String, title: String?) -> [String] {
        var text = html
            .replacingOccurrences(of: #"<br\s*/?>"#, with: "\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"</(p|div|li|h[1-6])>"#, with: "\n\n", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
        for (entity, char) in ["&amp;": "&", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " "] {
            text = text.replacingOccurrences(of: entity, with: char)
        }
        var paragraphs = text
            .components(separatedBy: "\n\n")
            .map { $0.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        if paragraphs.count > 1 {
            let normalize = { (s: String) in s.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression) }
            if normalize(paragraphs[0]) == normalize(title ?? "") { paragraphs.removeFirst() }
        }
        return paragraphs
    }
}

// MARK: - Narration

/// Web `templateNarration` (src/services/votingPatternNarration.js).
enum MembersNarration {
    static func sentence(position: VotePosition, title: String?, partyDirection: VotePosition) -> String {
        let pos = position == .yea ? "YES" : "NO"
        let t = title ?? "an unlabeled measure"
        let dir = position == partyDirection ? "matched" : "differed from"
        let ref = partyDirection == .yea ? "the party majority (Yea)" : "the party majority (Nay)"
        return "Voted \(pos) on \(t) — \(dir) \(ref)."
    }
}

// MARK: - Formatting

enum MembersFormat {
    static func currency(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }

    /// "Sep 16, 2026" in UTC, like the web's toLocaleDateString.
    static func shortDate(_ date: Date?) -> String {
        guard let date else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMM d, yyyy"
        return f.string(from: date)
    }

    static func longDate(_ date: Date?) -> String {
        guard let date else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMMM d, yyyy"
        return f.string(from: date)
    }

    /// "14th" or "at-large" — web `ordinal()` in PoliticianDetail.jsx.
    static func districtOrdinal(_ n: Int) -> String {
        n == 0 ? "at-large" : MembersCongress.ordinal(n)
    }

    /// Web `parsePhotoAttribution`, reduced to its text.
    static func stripTags(_ html: String) -> String {
        html.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
