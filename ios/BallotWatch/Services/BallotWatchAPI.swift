import Foundation

/// Every read the app makes against Supabase, in one place.
///
/// Query shapes mirror `src/services/*.js` on the web so the two clients show
/// the same numbers. Where the web has a domain rule (which tallies are
/// trustworthy, how a result is derived), that rule is ported rather than
/// reinvented — see `FloorVotes` and `VotingPatterns`.
enum BallotWatchAPI {

    // MARK: - Politicians

    static let politicianColumns = "id, name, chamber, state, district, party, photo_url"

    static func allPoliticians() async throws -> [Politician] {
        try await PostgREST.shared.select(
            "politicians",
            columns: politicianColumns,
            order: [Order("name", ascending: true)],
            limit: 1000,
            as: Politician.self
        )
    }

    static func politician(id: String) async throws -> Politician? {
        try await PostgREST.shared.selectOne(
            "politicians",
            columns: politicianColumns,
            filters: [.eq("id", id)],
            as: Politician.self
        )
    }

    static func politicians(state: String, chamber: Chamber? = nil) async throws -> [Politician] {
        var filters: [Filter] = [.eq("state", state)]
        if let chamber { filters.append(.eq("chamber", chamber.rawValue)) }
        return try await PostgREST.shared.select(
            "politicians",
            columns: politicianColumns,
            filters: filters,
            order: [Order("name", ascending: true)],
            as: Politician.self
        )
    }

    static func memberStats(politicianID: String) async throws -> MemberStats? {
        try await PostgREST.shared.selectOne(
            "member_stats",
            filters: [.eq("politician_id", politicianID)],
            order: [Order("congress", ascending: false)],
            as: MemberStats.self
        )
    }

    // MARK: - Votes

    /// A member's vote joined to the bill it was on. PostgREST embeds the
    /// related row under `bills`, so this decodes into a wrapper.
    struct VoteWithBill: Decodable, Identifiable, Hashable {
        let politicianID: String
        let billID: String?
        let rollCallID: String?
        let positionRaw: String
        let votedAt: String
        let sourceURL: String?
        let bill: EmbeddedBill?

        enum CodingKeys: String, CodingKey {
            case politicianID = "politician_id"
            case billID = "bill_id"
            case rollCallID = "roll_call_id"
            case positionRaw = "position"
            case votedAt = "voted_at"
            case sourceURL = "source_url"
            case bill = "bills"
        }

        struct EmbeddedBill: Decodable, Hashable {
            let id: String
            let title: String?
            let crsSummary: String?
            let summary: String?
            let policyArea: String?
            let sourceURL: String?

            enum CodingKeys: String, CodingKey {
                case id, title, summary
                case crsSummary = "crs_summary"
                case policyArea = "policy_area"
                case sourceURL = "source_url"
            }
        }

        var position: VotePosition { VotePosition(raw: positionRaw) }
        var date: Date? { DateParsing.date(from: votedAt) }

        /// A member votes at most once per roll call, so that pair is unique.
        /// Roll-call-less rows fall back to the bill and date.
        var id: String {
            "\(politicianID)-\(rollCallID ?? billID ?? "")-\(votedAt)"
        }
    }

    static func memberVotes(politicianID: String, limit: Int = 300) async throws -> [VoteWithBill] {
        try await PostgREST.shared.select(
            "votes",
            columns: "politician_id, bill_id, roll_call_id, position, voted_at, source_url, bills:bill_id(id, title, crs_summary, summary, policy_area, source_url)",
            filters: [.eq("politician_id", politicianID)],
            order: [Order("voted_at", ascending: false)],
            limit: limit,
            as: VoteWithBill.self
        )
    }

    /// Every recorded vote on one roll call, used for the member-by-member
    /// breakdown on a bill.
    static func votesForRollCall(_ rollCallID: String) async throws -> [Vote] {
        try await PostgREST.shared.select(
            "votes",
            columns: "politician_id, bill_id, roll_call_id, position, voted_at, source_url",
            filters: [.eq("roll_call_id", rollCallID)],
            limit: 600,
            as: Vote.self
        )
    }

    static func votePositionCount(rollCallID: String, position: VotePosition) async throws -> Int {
        try await PostgREST.shared.count("votes", filters: [
            .eq("roll_call_id", rollCallID),
            .eq("position", position.rawValue),
        ])
    }

    // MARK: - Roll calls

    static func recentRollCalls(limit: Int = 16) async throws -> [RollCall] {
        do {
            return try await PostgREST.shared.select(
                "roll_calls",
                columns: "id, bill_id, question, description, created_at, voted_at",
                order: [
                    // Order by when the vote happened, not when we ingested it.
                    // A history backfill writes months-old roll calls with fresh
                    // created_at timestamps, which is how old procedural motions
                    // used to climb to the top of this feed.
                    Order("voted_at", ascending: false, nullsFirst: false),
                    Order("created_at", ascending: false),
                ],
                limit: limit,
                as: RollCall.self
            )
        } catch let error as PostgRESTError where error.isMissingSchema {
            // `voted_at` ships with its own migration; fall back where it
            // hasn't landed rather than showing an empty feed.
            return try await PostgREST.shared.select(
                "roll_calls",
                columns: "id, bill_id, question, description, created_at",
                order: [Order("created_at", ascending: false)],
                limit: limit,
                as: RollCall.self
            )
        }
    }

    static func rollCalls(ids: [String]) async throws -> [RollCall] {
        guard !ids.isEmpty else { return [] }
        return try await PostgREST.shared.select(
            "roll_calls",
            columns: "id, bill_id, question, description, created_at, voted_at",
            filters: [.inList("id", ids)],
            as: RollCall.self
        )
    }

    static func rollCallsForBill(_ billID: String) async throws -> [RollCall] {
        try await PostgREST.shared.select(
            "roll_calls",
            columns: "id, bill_id, question, description, created_at, voted_at",
            filters: [.eq("bill_id", billID)],
            order: [Order("voted_at", ascending: false, nullsFirst: false)],
            as: RollCall.self
        )
    }

    static func rollCallStats(ids: [String]) async throws -> [RollCallStats] {
        guard !ids.isEmpty else { return [] }
        return try await PostgREST.shared.select(
            "roll_call_stats",
            columns: "roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay",
            filters: [.inList("roll_call_id", ids)],
            as: RollCallStats.self
        )
    }

    /// The most recent vote date we hold, shown as the feed's "recorded
    /// through" watermark so staleness is visible rather than implied.
    static func lastRecordedVoteDate() async throws -> String? {
        struct Row: Decodable { let votedAt: String?
            enum CodingKeys: String, CodingKey { case votedAt = "voted_at" } }
        let rows: [Row] = try await PostgREST.shared.select(
            "votes", columns: "voted_at",
            order: [Order("voted_at", ascending: false)], limit: 1, as: Row.self
        )
        return rows.first?.votedAt
    }

    // MARK: - Bills

    static let billColumns = "id, title, introduced_at, summary, crs_summary, policy_area, source_url"
    /// The sponsor/stage columns arrived in migration 006. Requesting them
    /// against an environment that predates it 400s the whole query, so reads
    /// fall back to `billColumns`.
    static let billColumnsFull = billColumns + ", sponsor_bioguide_id, sponsor_name, sponsor_party, sponsor_state, legislative_stage"

    static func recentBills(limit: Int = 50, offset: Int = 0) async throws -> [Bill] {
        try await selectBills(
            filters: [.notNull("introduced_at")],
            order: [Order("introduced_at", ascending: false, nullsFirst: false)],
            limit: limit, offset: offset
        )
    }

    /// Search that mirrors `searchBillsInDb` on the web, including its
    /// bill-number handling: "S 4214" and "hr-1234" match the id, free text
    /// matches the title.
    static func searchBills(
        query: String?,
        congress: Int? = nil,
        billType: String? = nil,
        sponsorBioguideID: String? = nil,
        limit: Int = 50,
        offset: Int = 0
    ) async throws -> [Bill] {
        var filters: [Filter] = []

        if let sponsorBioguideID {
            filters.append(.eq("sponsor_bioguide_id", sponsorBioguideID))
        }

        if let query, !query.trimmed.isEmpty {
            let safe = PostgREST.sanitizeForOr(query)
            if let idFragment = billIDPattern(safe) {
                filters.append(.or(["title.ilike.*\(safe)*", "id.ilike.*\(idFragment)*"]))
            } else if safe.allSatisfy(\.isNumber) {
                filters.append(.or(["title.ilike.*\(safe)*", "id.ilike.*-\(safe)*"]))
            } else {
                filters.append(.ilike("title", "*\(safe)*"))
            }
        }

        if let congress {
            if let billType, !billType.isEmpty {
                filters.append(.like("id", "\(congress)-\(billType.lowercased())-*"))
            } else {
                filters.append(.like("id", "\(congress)-*"))
            }
        } else if let billType, !billType.isEmpty {
            filters.append(.like("id", "*-\(billType.lowercased())-*"))
        }

        return try await selectBills(
            filters: filters,
            order: [Order("introduced_at", ascending: false, nullsFirst: false)],
            limit: limit, offset: offset
        )
    }

    private static func selectBills(
        filters: [Filter], order: [Order], limit: Int, offset: Int
    ) async throws -> [Bill] {
        do {
            return try await PostgREST.shared.select(
                "bills", columns: billColumnsFull, filters: filters,
                order: order, limit: limit, offset: offset, as: Bill.self
            )
        } catch let error as PostgRESTError where error.isMissingSchema {
            return try await PostgREST.shared.select(
                "bills", columns: billColumns, filters: filters,
                order: order, limit: limit, offset: offset, as: Bill.self
            )
        }
    }

    static func bill(id: String) async throws -> Bill? {
        do {
            return try await PostgREST.shared.selectOne(
                "bills", columns: billColumnsFull, filters: [.eq("id", id)], as: Bill.self
            )
        } catch let error as PostgRESTError where error.isMissingSchema {
            return try await PostgREST.shared.selectOne(
                "bills", columns: billColumns, filters: [.eq("id", id)], as: Bill.self
            )
        }
    }

    static func bills(ids: [String]) async throws -> [Bill] {
        guard !ids.isEmpty else { return [] }
        return try await PostgREST.shared.select(
            "bills", columns: billColumnsFull, filters: [.inList("id", ids)], as: Bill.self
        )
    }

    static func billsSponsored(by bioguideID: String, limit: Int = 50) async throws -> [Bill] {
        try await selectBills(
            filters: [.eq("sponsor_bioguide_id", bioguideID)],
            order: [Order("introduced_at", ascending: false, nullsFirst: false)],
            limit: limit, offset: 0
        )
    }

    /// "S4214", "S. 4214", "hr-1234" → "s-4214" / "hr-1234", the fragment that
    /// appears inside a bill id.
    private static func billIDPattern(_ query: String) -> String? {
        let pattern = #"^\s*([a-zA-Z]+)[\s.\-]*(\d+)\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(
                in: query, range: NSRange(query.startIndex..., in: query)
              ),
              let typeRange = Range(match.range(at: 1), in: query),
              let numRange = Range(match.range(at: 2), in: query)
        else { return nil }
        return "\(query[typeRange].lowercased())-\(query[numRange])"
    }

    // MARK: - AI bill explanation

    /// Reads the shared explanation cache first. Every user hits the same row,
    /// so a bill someone else already opened costs one cheap select.
    static func cachedExplanation(billKey: String) async throws -> BillExplanation? {
        try await PostgREST.shared.selectOne(
            "bill_explanations",
            columns: "bill_key, explanation, model, bill_title",
            filters: [.eq("bill_key", billKey)],
            order: [Order("prompt_version", ascending: false)],
            as: BillExplanation.self
        )
    }

    /// Cold path: ask the Edge Function to generate one. The OpenAI key lives
    /// server-side, so the app never holds it.
    static func generateExplanation(bill: Bill) async throws -> String? {
        guard let key = bill.key else { return nil }
        var request = URLRequest(url: Config.functionsURL.appendingPathComponent("explain-bill"))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "congress": key.congress,
            "billType": key.type,
            "number": key.number,
            "title": bill.title,
            "summary": bill.bestSummary ?? "",
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            return nil
        }
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (obj?["explanation"] as? String) ?? (obj?["summary"] as? String)
    }

    // MARK: - Committee routing

    static func routings(billID: String) async throws -> [CommitteeRouting] {
        do {
            return try await PostgREST.shared.select(
                "bill_committee_routings",
                columns: "committee_code, committee_name, subcommittee_name, chamber, referred_at, activity_type",
                filters: [.eq("bill_id", billID)],
                order: [Order("referred_at", ascending: true, nullsFirst: false)],
                as: CommitteeRouting.self
            )
        } catch {
            // Routing is a later migration and purely additive to the page.
            return []
        }
    }

    // MARK: - ETL freshness

    static func lastETLRun() async throws -> Date? {
        struct Row: Decodable { let value: String? }
        let rows: [Row] = try await PostgREST.shared.select(
            "etl_metadata", columns: "value",
            filters: [.eq("key", "last_successful_run")], limit: 1, as: Row.self
        )
        return DateParsing.date(from: rows.first?.value)
    }
}
