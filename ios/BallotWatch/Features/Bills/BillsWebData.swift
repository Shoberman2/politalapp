import Foundation

// The website's bill pages read Congress.gov directly (through the site's
// proxy, which holds the key) for the parts our database doesn't keep: the
// latest action, the action timeline, cosponsors, committees and text
// versions. This mirrors the web's `services/congress.js` calls so the app
// shows the same record: `getBillDetails`, `getBillActions`,
// `getBillCosponsors`, `getBillCommittees`, `getBillText` and the
// `searchBills` list for the current Congress.

enum BillsCongressGov {
    private static var base: URL { Config.proxyURL(service: "congress") }

    // MARK: Shapes (Congress.gov v3 JSON)

    struct LatestAction: Decodable, Hashable {
        let actionDate: String?
        let text: String?
    }

    struct Person: Decodable, Hashable {
        let bioguideId: String?
        let fullName: String?
        let firstName: String?
        let lastName: String?
        let party: String?
        let state: String?
        let district: Int?

        var displayName: String {
            if let fullName, !fullName.isEmpty { return fullName }
            return [firstName, lastName].compactMap { $0 }.joined(separator: " ")
        }

        private enum CodingKeys: String, CodingKey {
            case bioguideId, fullName, firstName, lastName, party, state, district
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            bioguideId = try? c.decodeIfPresent(String.self, forKey: .bioguideId)
            fullName = try? c.decodeIfPresent(String.self, forKey: .fullName)
            firstName = try? c.decodeIfPresent(String.self, forKey: .firstName)
            lastName = try? c.decodeIfPresent(String.self, forKey: .lastName)
            party = try? c.decodeIfPresent(String.self, forKey: .party)
            state = try? c.decodeIfPresent(String.self, forKey: .state)
            if let n = try? c.decodeIfPresent(Int.self, forKey: .district) {
                district = n
            } else if let s = try? c.decodeIfPresent(String.self, forKey: .district) {
                district = Int(s)
            } else {
                district = nil
            }
        }
    }

    struct ListBill: Decodable, Hashable {
        let congress: Int?
        let type: String?
        let number: String?
        let title: String?
        let introducedDate: String?
        let latestAction: LatestAction?

        private enum CodingKeys: String, CodingKey {
            case congress, type, number, title, introducedDate, latestAction
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            congress = try? c.decodeIfPresent(Int.self, forKey: .congress)
            type = try? c.decodeIfPresent(String.self, forKey: .type)
            if let s = try? c.decodeIfPresent(String.self, forKey: .number) {
                number = s
            } else if let n = try? c.decodeIfPresent(Int.self, forKey: .number) {
                number = String(n)
            } else {
                number = nil
            }
            title = try? c.decodeIfPresent(String.self, forKey: .title)
            introducedDate = try? c.decodeIfPresent(String.self, forKey: .introducedDate)
            latestAction = try? c.decodeIfPresent(LatestAction.self, forKey: .latestAction)
        }

        var id: String? {
            guard let congress, let type, let number else { return nil }
            return "\(congress)-\(type.lowercased())-\(number)"
        }
    }

    struct Detail: Decodable {
        struct PolicyArea: Decodable { let name: String? }
        struct Count: Decodable { let count: Int? }
        struct Title: Decodable { let title: String?; let titleType: String? }

        let title: String?
        let introducedDate: String?
        let latestAction: LatestAction?
        let policyArea: PolicyArea?
        let sponsors: [Person]?
        let cosponsors: Count?
        let committees: Count?
        let legislationUrl: String?
    }

    struct Action: Decodable, Hashable {
        let actionDate: String?
        let text: String?
        let actionCode: String?
    }

    struct Committee: Decodable, Hashable {
        let chamber: String?
        let name: String?
    }

    struct TextVersion: Decodable, Hashable {
        struct Format: Decodable, Hashable { let type: String?; let url: String? }
        let type: String?
        let date: String?
        let formats: [Format]?
    }

    struct Summary: Decodable, Hashable {
        let text: String?
        let actionDate: String?
    }

    // MARK: Requests

    private static func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], as: T.Type) async throws -> T {
        var components = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw PostgRESTError.http(
                status: (response as? HTTPURLResponse)?.statusCode ?? -1,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// The web's `searchBills`: the live list for one Congress, newest update
    /// first, optionally one bill type.
    static func list(congress: Int, type: String?, limit: Int, offset: Int) async throws -> [ListBill] {
        struct Response: Decodable { let bills: [ListBill]? }
        var path = "bill/\(congress)"
        if let type { path += "/\(type.lowercased())" }
        let response = try await get(path, query: [
            .init(name: "limit", value: String(limit)),
            .init(name: "offset", value: String(offset)),
            .init(name: "sort", value: "updateDate+desc"),
        ], as: Response.self)
        return response.bills ?? []
    }

    static func detail(_ key: BillKey) async throws -> Detail? {
        struct Response: Decodable { let bill: Detail? }
        return try await get("bill/\(key.congress)/\(key.type)/\(key.number)", as: Response.self).bill
    }

    static func summaries(_ key: BillKey) async throws -> [Summary] {
        struct Response: Decodable { let summaries: [Summary]? }
        return try await get("bill/\(key.congress)/\(key.type)/\(key.number)/summaries", as: Response.self).summaries ?? []
    }

    static func actions(_ key: BillKey) async throws -> [Action] {
        struct Response: Decodable { let actions: [Action]? }
        return try await get("bill/\(key.congress)/\(key.type)/\(key.number)/actions", as: Response.self).actions ?? []
    }

    static func cosponsors(_ key: BillKey) async throws -> [Person] {
        struct Response: Decodable { let cosponsors: [Person]? }
        return try await get(
            "bill/\(key.congress)/\(key.type)/\(key.number)/cosponsors",
            query: [.init(name: "limit", value: "250")],
            as: Response.self
        ).cosponsors ?? []
    }

    static func committees(_ key: BillKey) async throws -> [Committee] {
        struct Response: Decodable { let committees: [Committee]? }
        return try await get("bill/\(key.congress)/\(key.type)/\(key.number)/committees", as: Response.self).committees ?? []
    }

    static func textVersions(_ key: BillKey) async throws -> [TextVersion] {
        struct Response: Decodable { let textVersions: [TextVersion]? }
        return try await get("bill/\(key.congress)/\(key.type)/\(key.number)/text", as: Response.self).textVersions ?? []
    }
}

// MARK: - Shared helpers (ported from the web utils)

enum BillsFormat {
    static let congressMax = 119
    static let congressMin = 107

    /// `formatCongressLabel`: "119th Congress (2025-2027)".
    static func congressLabel(_ congress: Int) -> String {
        let start = 1789 + 2 * (congress - 1)
        return "\(ordinal(congress)) Congress (\(start)-\(start + 2))"
    }

    static func ordinal(_ n: Int) -> String {
        let mod100 = n % 100
        if (11...13).contains(mod100) { return "\(n)th" }
        switch n % 10 {
        case 1: return "\(n)st"
        case 2: return "\(n)nd"
        case 3: return "\(n)rd"
        default: return "\(n)th"
        }
    }

    /// `getBillDisplayTitle` → `tidy`: drop "A bill to"/"To", the trailing
    /// "and for other purposes", capitalize, cap at 200 characters.
    static func displayTitle(_ raw: String?, key: BillKey?, latestAction: String? = nil, policyArea: String? = nil) -> String {
        if let raw, raw.trimmed.count >= 4, BillKey.isRealTitle(raw, for: key) {
            let t = tidy(raw)
            if !t.isEmpty { return t }
        }
        if let action = latestAction, action.count > 8 {
            return String(tidy(action).prefix(180))
        }
        let id = key?.display ?? "Untitled bill"
        if let policyArea, !policyArea.isEmpty { return "\(policyArea) bill \(id)" }
        return id
    }

    static func tidy(_ title: String) -> String {
        var s = title
        let rules: [(String, String)] = [
            ("^A bill to ", ""), ("^To ", ""), ("^An act to ", ""), ("^Providing for ", ""),
            ("^Expressing the sense of (the )?Congress ", "Congress Resolution: "),
            ("^Expressing the sense of (the )?House ", "House Resolution: "),
            ("^Expressing the sense of (the )?Senate ", "Senate Resolution: "),
            (", and for other purposes\\.?$", ""), ("\\.$", ""),
        ]
        for (pattern, replacement) in rules {
            s = s.replacingOccurrences(of: pattern, with: replacement, options: [.regularExpression, .caseInsensitive])
        }
        s = s.trimmed
        guard let first = s.first else { return "" }
        s = first.uppercased() + s.dropFirst()
        if s.count > 200 { s = String(s.prefix(197)) + "..." }
        return s
    }

    /// "Oct 18, 2026" — the web's `toLocaleDateString('en-US', short month)`.
    static func date(_ string: String?) -> String {
        guard let date = DateParsing.date(from: string) else { return "" }
        return shortFormatter.string(from: date)
    }

    private static let shortFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMM d, yyyy"
        return f
    }()

    /// "Wednesday, October 21, 2026"
    static func longToday() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "EEEE, MMMM d, yyyy"
        return f.string(from: Date())
    }

    /// `officialSummaryParagraphs`: HTML → paragraphs, dropping a first
    /// paragraph that only repeats the title.
    static func summaryParagraphs(_ html: String?, title: String) -> [String] {
        var text = html ?? ""
        text = text.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: "</(p|div|li|h[1-6])>", with: "\n\n", options: [.regularExpression, .caseInsensitive])
        text = text.replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
        for (entity, value) in ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'"] {
            text = text.replacingOccurrences(of: entity, with: value, options: .caseInsensitive)
        }
        var paragraphs = text
            .components(separatedBy: "\n")
            .reduce(into: [[String]]([[]])) { groups, line in
                if line.trimmingCharacters(in: .whitespaces).isEmpty {
                    if !(groups.last?.isEmpty ?? true) { groups.append([]) }
                } else {
                    groups[groups.count - 1].append(line)
                }
            }
            .map { $0.joined(separator: " ")
                .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                .trimmed }
            .filter { !$0.isEmpty }
        if paragraphs.count > 1 {
            let normalize: (String) -> String = {
                $0.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
            }
            if normalize(paragraphs[0]) == normalize(title) { paragraphs.removeFirst() }
        }
        return paragraphs
    }
}

// MARK: - Status (`getBillStatus` on /bills, `getStatusInfo` on the bill page)

enum BillsStatus: Equatable {
    case law, both, passedHouse, passedSenate, committee, introduced, progress

    init(latestAction: String?) {
        let text = (latestAction ?? "").lowercased()
        if text.contains("became public law") || text.contains("signed by president") { self = .law }
        else if text.contains("passed house") && text.contains("passed senate") { self = .both }
        else if text.contains("passed house") { self = .passedHouse }
        else if text.contains("passed senate") { self = .passedSenate }
        else if text.contains("committee") { self = .committee }
        else if text.contains("introduced") { self = .introduced }
        else { self = .progress }
    }

    /// The glossary entry that explains this stage in plain English.
    var glossaryTerm: String {
        switch self {
        case .law: return "enacted"
        case .both, .passedHouse, .passedSenate: return "passed"
        case .committee: return "referred"
        case .introduced: return "introduced"
        case .progress: return "latestAction"
        }
    }

    /// Facet key on /bills ("passed" covers either chamber).
    var facetKey: String {
        switch self {
        case .law: return "law"
        case .both: return "both"
        case .passedHouse, .passedSenate: return "passed"
        case .committee: return "committee"
        case .introduced: return "introduced"
        case .progress: return "progress"
        }
    }

    /// The /bills row label.
    var listLabel: String {
        switch self {
        case .law: return "Became Law"
        case .both: return "Passed Both"
        case .passedHouse: return "Passed House"
        case .passedSenate: return "Passed Senate"
        case .committee: return "In Committee"
        case .introduced: return "Introduced"
        case .progress: return "In Progress"
        }
    }

    /// The bill page pill label.
    var pageLabel: String {
        switch self {
        case .law: return "Became Law"
        case .both: return "Passed Both Chambers · Awaiting Signature"
        case .passedHouse: return "Passed House · Awaiting Senate"
        case .passedSenate: return "Passed Senate · Awaiting House"
        case .committee: return "In Committee"
        case .introduced: return "Introduced"
        case .progress: return "In Progress"
        }
    }
}
