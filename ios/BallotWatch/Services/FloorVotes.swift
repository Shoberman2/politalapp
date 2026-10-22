import Foundation

/// The recent-floor-votes feed.
///
/// Ported from `src/services/floorVotes.js`, including its restraint. Bill
/// *titles* in the table are often placeholder stubs ("HR 915") and some ETL'd
/// tallies are corrupt (party columns double-counted), so this shows the bill
/// *number* rather than a title, and a Yea/Nay count only when it survives a
/// sanity check against the chamber's size. Nothing is fabricated; missing data
/// is simply omitted.

struct FloorVote: Identifiable, Hashable, Sendable {
    let id: String
    let chamber: Chamber?
    let number: Int?
    let question: String?
    let description: String?
    let billID: String?
    let billDisplay: String?
    var yea: Int?
    var nay: Int?
    var result: String?
    let date: Date?

    var hasTally: Bool { yea != nil && nay != nil }
    var total: Int? { hasTally ? yea! + nay! : nil }
}

struct FloorVoteFeed: Sendable {
    let votes: [FloorVote]
    /// The latest vote date we actually hold, so the UI can say how current the
    /// record is instead of implying it's live.
    let recordedThrough: Date?
}

enum FloorVotes {

    /// Reject impossible totals (double-counted ETL rows) and empty rows.
    static func isSane(yea: Int, nay: Int, chamber: Chamber?) -> Bool {
        let total = yea + nay
        return total > 0 && total <= (chamber?.size ?? Chamber.house.size)
    }

    /// The result word, derived only from a tally we trust — and using the real
    /// thresholds, not a blanket majority: cloture needs 60 in the Senate,
    /// suspension of the rules needs two-thirds.
    /// Port of `deriveResult` in src/services/floorVotes.js (which mirrors
    /// api/_lib/rollCallResult.js); keep all three in step.
    ///
    /// Cloture on a nomination needs only a simple majority, but a cloture
    /// question alone doesn't say what it's about. So a cloture vote under 60
    /// reads as invoked only when the question or description names a
    /// nomination; otherwise, when yea still beat nay, no result is shown
    /// rather than a guess.
    static func deriveResult(
        question: String?, yea: Int?, nay: Int?, chamber: Chamber?, description: String? = nil
    ) -> String? {
        guard let yea, let nay else { return nil }
        let q = (question ?? "").lowercased()
        let text = "\(q) \((description ?? "").lowercased())"
        let total = yea + nay
        let twoThirds = total > 0 && Double(yea) / Double(total) >= 2.0 / 3.0
        let mentionsNomination = { (s: String) in s.contains("nominat") || s.contains("confirm") }

        if q.contains("cloture") {
            if yea >= 60 { return "Cloture invoked" }
            if mentionsNomination(text) { return yea > nay ? "Cloture invoked" : "Cloture rejected" }
            if yea <= nay { return "Cloture rejected" }
            return nil
        }
        if q.contains("override") || q.contains("veto") { return twoThirds ? "Veto overridden" : "Veto sustained" }
        if q.contains("treaty") || q.contains("ratification") { return twoThirds ? "Ratified" : "Not ratified" }
        if q.contains("suspend") { return twoThirds ? "Passed" : "Failed" }
        if q.contains("waive") && chamber == .senate { return yea >= 60 ? "Motion agreed to" : "Motion rejected" }
        if q.range(of: #"\bmotion\b"#, options: .regularExpression) != nil || q.contains("proceed") {
            return yea > nay ? "Motion agreed to" : "Motion rejected"
        }
        if mentionsNomination(q) { return yea > nay ? "Confirmed" : "Rejected" }
        if yea == nay { return "Failed on a tie" }
        return yea > nay ? "Passed" : "Failed"
    }

    private static func tally(from stats: RollCallStats?, chamber: Chamber?) -> (yea: Int?, nay: Int?) {
        guard let stats else { return (nil, nil) }
        let yea = stats.totalYea
        let nay = stats.totalNay
        return isSane(yea: yea, nay: nay, chamber: chamber) ? (yea, nay) : (nil, nil)
    }

    /// `roll_call_stats` is written by a batch ETL that lags the newest roll
    /// calls, which would leave the feed with no tallies at all. The per-member
    /// `votes` table IS populated for those same roll calls, so count Yea/Nay
    /// straight from it as a fallback — two header-only count requests rather
    /// than 435 rows of payload. Still the real record, sanity-checked the same
    /// way. Budgeted, because it's a request pair per roll call.
    private static let tallyFallbackLimit = 8

    private static func tallyFromVotes(rollCallID: String, chamber: Chamber?) async -> (yea: Int, nay: Int)? {
        async let yeaCount = try? BallotWatchAPI.votePositionCount(rollCallID: rollCallID, position: .yea)
        async let nayCount = try? BallotWatchAPI.votePositionCount(rollCallID: rollCallID, position: .nay)
        guard let yea = await yeaCount, let nay = await nayCount,
              isSane(yea: yea, nay: nay, chamber: chamber) else { return nil }
        return (yea, nay)
    }

    static func recent(fetchCount: Int = 16) async throws -> FloorVoteFeed {
        let calls = try await BallotWatchAPI.recentRollCalls(limit: fetchCount)
        guard !calls.isEmpty else { return FloorVoteFeed(votes: [], recordedThrough: nil) }

        let ids = calls.map(\.id)
        async let statsTask = try? BallotWatchAPI.rollCallStats(ids: ids)
        async let freshTask = try? BallotWatchAPI.lastRecordedVoteDate()

        let statsList = await statsTask ?? []
        let recordedThrough = DateParsing.date(from: await freshTask ?? nil)
        let statsMap = Dictionary(statsList.map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a })

        var votes: [FloorVote] = calls.map { call in
            let meta = call.meta
            let chamber = meta?.chamber
            let (yea, nay) = tally(from: statsMap[call.id], chamber: chamber)
            let key = call.billID.flatMap { BillKey(id: $0) }
            return FloorVote(
                id: call.id,
                chamber: chamber,
                number: meta?.number,
                question: call.question,
                // Nomination and procedural descriptions carry the real human
                // substance — often the only readable thing on the row.
                description: call.description,
                billID: call.billID,
                billDisplay: key?.display,
                yea: yea,
                nay: nay,
                result: deriveResult(
                    question: call.question, yea: yea, nay: nay, chamber: chamber, description: call.description
                ),
                date: call.date
            )
        }

        // Fill in tallies the stats table is missing, for just the handful the
        // feed will actually show. Bill votes go first: they're what leads the
        // feed. Both chambers are covered member-level, so this fallback is
        // about the aggregate lagging, not about missing votes.
        let missingIndexes = votes.indices.filter { votes[$0].yea == nil }
        let ordered = missingIndexes.filter { votes[$0].billID != nil }
            + missingIndexes.filter { votes[$0].billID == nil && votes[$0].description != nil }

        await withTaskGroup(of: (Int, (yea: Int, nay: Int)?).self) { group in
            for index in ordered.prefix(tallyFallbackLimit) {
                let id = votes[index].id
                let chamber = votes[index].chamber
                group.addTask { (index, await tallyFromVotes(rollCallID: id, chamber: chamber)) }
            }
            for await (index, tally) in group {
                guard let tally else { continue }
                votes[index].yea = tally.yea
                votes[index].nay = tally.nay
                votes[index].result = deriveResult(
                    question: votes[index].question,
                    yea: tally.yea, nay: tally.nay, chamber: votes[index].chamber,
                    description: votes[index].description
                )
            }
        }

        return FloorVoteFeed(votes: votes, recordedThrough: recordedThrough)
    }
}
