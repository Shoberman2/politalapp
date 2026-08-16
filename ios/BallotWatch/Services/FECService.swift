import Foundation

/// Current-cycle campaign-finance data from the official OpenFEC API.
///
/// Candidate totals come from `/candidate/{id}/totals/`. Committee metadata
/// does not contain receipts, which was the source of the web app's former $0
/// totals. The receipt list is intentionally limited to the largest itemized
/// receipts for the selected candidate's principal campaign committee.
enum FECService {
    private static let baseURL = URL(string: "https://api.open.fec.gov/v1")!

    enum ServiceError: LocalizedError {
        case invalidURL
        case requestFailed(Int)
        case candidateNotFound
        case totalsNotFound

        var errorDescription: String? {
            switch self {
            case .invalidURL:
                return "The FEC request could not be created."
            case .requestFailed:
                return "The FEC service is unavailable right now."
            case .candidateNotFound:
                return "No matching federal candidate filing was found."
            case .totalsNotFound:
                return "No campaign totals are available for this election cycle."
            }
        }
    }

    struct ItemizedReceipt: Identifiable, Hashable, Sendable {
        let name: String
        let employer: String?
        let state: String?
        let amount: Double
        let contributionCount: Int
        let entityType: String?

        var id: String { "\(name.lowercased())|\((employer ?? "").lowercased())" }
    }

    struct CampaignFinance: Hashable, Sendable {
        let candidateID: String
        let candidateName: String
        let committeeID: String?
        let committeeName: String?
        let cycle: Int
        let totalRaised: Double
        let totalSpent: Double
        let cashOnHand: Double
        let individualTotal: Double
        let pacTotal: Double
        let coverageEndDate: String?
        let largestReceipts: [ItemizedReceipt]
    }

    static func currentCycle(for date: Date = Date()) -> Int {
        let year = Calendar(identifier: .gregorian).dateComponents(
            in: TimeZone(secondsFromGMT: 0)!, from: date
        ).year ?? 0
        return year.isMultiple(of: 2) ? year : year + 1
    }

    static func searchURL(name: String) -> URL {
        var components = URLComponents(string: "https://www.fec.gov/data/candidates/")!
        components.queryItems = [URLQueryItem(name: "q", value: name)]
        return components.url!
    }

    static func candidateURL(candidateID: String, cycle: Int) -> URL {
        var components = URLComponents(
            string: "https://www.fec.gov/data/candidate/\(candidateID)/"
        )!
        components.queryItems = [
            URLQueryItem(name: "cycle", value: String(cycle)),
            URLQueryItem(name: "election_full", value: "true"),
        ]
        return components.url!
    }

    static func campaignFinance(
        name: String,
        state: String,
        chamber: Chamber,
        date: Date = Date()
    ) async throws -> CampaignFinance {
        let activeCycle = currentCycle(for: date)
        let candidates = try await searchCandidates(name: name)
            .filter { $0.state.caseInsensitiveCompare(state) == .orderedSame }
            .filter { $0.office == (chamber == .house ? "H" : "S") }

        guard let candidate = candidates.max(by: {
            candidateScore($0, activeCycle: activeCycle) < candidateScore($1, activeCycle: activeCycle)
        }) else {
            throw ServiceError.candidateNotFound
        }

        let selectedCycle = candidate.availableCycles
            .filter { $0 <= activeCycle }
            .sorted(by: >)
            .first ?? activeCycle

        async let totalsTask: APIResponse<CandidateTotals> = request(
            path: "candidate/\(candidate.candidateID)/totals/",
            query: ["cycle": String(selectedCycle), "per_page": "1"]
        )
        async let committeesTask: APIResponse<Committee> = request(
            path: "candidate/\(candidate.candidateID)/committees/",
            query: ["cycle": String(selectedCycle), "per_page": "100"]
        )

        guard let totals = try await totalsTask.results.first else {
            throw ServiceError.totalsNotFound
        }
        let committees = try await committeesTask.results
        let committee = principalCommittee(from: committees, cycle: selectedCycle)

        let receipts: [Receipt]
        if let committee {
            let common = [
                "committee_id": committee.committeeID,
                "per_page": "100",
                "sort": "-contribution_receipt_amount",
                "two_year_transaction_period": String(selectedCycle),
            ]
            async let peopleTask: APIResponse<Receipt> = request(
                path: "schedules/schedule_a/",
                query: common.merging(["is_individual": "true"], uniquingKeysWith: { _, new in new })
            )
            async let committeesTask: APIResponse<Receipt> = request(
                path: "schedules/schedule_a/",
                query: common.merging(["contributor_type": "committee"], uniquingKeysWith: { _, new in new })
            )
            receipts = try await peopleTask.results + committeesTask.results
        } else {
            receipts = []
        }

        return CampaignFinance(
            candidateID: candidate.candidateID,
            candidateName: candidate.name,
            committeeID: committee?.committeeID,
            committeeName: committee?.name,
            cycle: selectedCycle,
            totalRaised: totals.receipts ?? 0,
            totalSpent: totals.disbursements ?? 0,
            cashOnHand: totals.cashOnHand ?? 0,
            individualTotal: totals.individualContributions ?? 0,
            pacTotal: totals.pacContributions ?? 0,
            coverageEndDate: totals.coverageEndDate,
            largestReceipts: aggregate(receipts)
        )
    }

    private static func searchCandidates(name: String) async throws -> [Candidate] {
        let normalized = normalize(name)
        let parts = normalized.split(separator: " ").map(String.init)
        let first = parts.first ?? ""
        let last = parts.last ?? normalized
        let variants = [normalized, "\(last), \(first)", "\(last) \(first)", last]
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }

        for variant in variants {
            let response: APIResponse<Candidate> = try await request(
                path: "candidates/search/",
                query: ["q": variant, "per_page": "20"]
            )
            if !response.results.isEmpty { return response.results }
        }
        return []
    }

    private static func normalize(_ name: String) -> String {
        name
            .replacingOccurrences(
                of: "^(Rep\\.|Sen\\.|Representative|Senator)\\s+",
                with: "",
                options: [.regularExpression, .caseInsensitive]
            )
            .replacingOccurrences(
                of: "\\s+(Jr\\.|Sr\\.|III|II|IV)$",
                with: "",
                options: [.regularExpression, .caseInsensitive]
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func candidateScore(_ candidate: Candidate, activeCycle: Int) -> Int {
        let recent = candidate.availableCycles.filter { $0 <= activeCycle }.max() ?? 0
        return (candidate.availableCycles.contains(activeCycle) ? 10_000 : 0) + recent
    }

    private static func principalCommittee(from committees: [Committee], cycle: Int) -> Committee? {
        committees.max {
            committeeScore($0, cycle: cycle) < committeeScore($1, cycle: cycle)
        }
    }

    private static func committeeScore(_ committee: Committee, cycle: Int) -> Int {
        (committee.designation == "P" ? 100 : 0)
            + ((committee.cycles ?? []).contains(cycle) ? 50 : 0)
            + (committee.designation == "A" ? 10 : 0)
    }

    private static func aggregate(_ receipts: [Receipt]) -> [ItemizedReceipt] {
        struct Accumulator {
            var displayName: String
            var employer: String?
            var state: String?
            var amount: Double
            var count: Int
            var entityType: String?
        }

        var values: [String: Accumulator] = [:]
        for receipt in receipts {
            let name = receipt.contributorName?.trimmed
            guard let name, !name.isEmpty else { continue }
            let key = "\(name.lowercased())|\((receipt.employer ?? "").lowercased())"
            if var existing = values[key] {
                existing.amount += receipt.amount ?? 0
                existing.count += 1
                values[key] = existing
            } else {
                values[key] = Accumulator(
                    displayName: name,
                    employer: receipt.employer?.trimmed.nilIfEmpty,
                    state: receipt.state?.trimmed.nilIfEmpty,
                    amount: receipt.amount ?? 0,
                    count: 1,
                    entityType: receipt.entityType
                )
            }
        }

        return values.values
            .map {
                ItemizedReceipt(
                    name: $0.displayName,
                    employer: $0.employer,
                    state: $0.state,
                    amount: $0.amount,
                    contributionCount: $0.count,
                    entityType: $0.entityType
                )
            }
            .sorted { $0.amount > $1.amount }
            .prefix(12)
            .map { $0 }
    }

    private static func request<T: Decodable>(
        path: String,
        query: [String: String]
    ) async throws -> APIResponse<T> {
        guard var components = URLComponents(
            url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false
        ) else { throw ServiceError.invalidURL }
        components.queryItems = query
            .merging(["api_key": Config.fecAPIKey], uniquingKeysWith: { _, new in new })
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        guard let url = components.url else { throw ServiceError.invalidURL }

        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.cachePolicy = .returnCacheDataElseLoad
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw ServiceError.requestFailed((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return try JSONDecoder().decode(APIResponse<T>.self, from: data)
    }

    private struct APIResponse<Result: Decodable>: Decodable {
        let results: [Result]
    }

    private struct Candidate: Decodable {
        let candidateID: String
        let name: String
        let state: String
        let office: String
        let cycles: [Int]?
        let electionYears: [Int]?

        var availableCycles: [Int] { Array(Set((cycles ?? []) + (electionYears ?? []))) }

        enum CodingKeys: String, CodingKey {
            case name, state, office, cycles
            case candidateID = "candidate_id"
            case electionYears = "election_years"
        }
    }

    private struct Committee: Decodable {
        let committeeID: String
        let name: String
        let designation: String?
        let cycles: [Int]?

        enum CodingKeys: String, CodingKey {
            case name, designation, cycles
            case committeeID = "committee_id"
        }
    }

    private struct CandidateTotals: Decodable {
        let receipts: Double?
        let disbursements: Double?
        let cashOnHand: Double?
        let individualContributions: Double?
        let pacContributions: Double?
        let coverageEndDate: String?

        enum CodingKeys: String, CodingKey {
            case receipts, disbursements
            case cashOnHand = "last_cash_on_hand_end_period"
            case individualContributions = "individual_contributions"
            case pacContributions = "other_political_committee_contributions"
            case coverageEndDate = "coverage_end_date"
        }
    }

    private struct Receipt: Decodable {
        let contributorName: String?
        let employer: String?
        let state: String?
        let amount: Double?
        let entityType: String?

        enum CodingKeys: String, CodingKey {
            case contributorName = "contributor_name"
            case employer = "contributor_employer"
            case state = "contributor_state"
            case amount = "contribution_receipt_amount"
            case entityType = "entity_type"
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
