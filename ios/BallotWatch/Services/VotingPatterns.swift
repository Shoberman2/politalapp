import Foundation

/// Voting pattern analysis.
///
/// Ported from `src/services/votingPatterns.js`, narrowed to the two measures
/// that run purely on data this app holds: party crossover and notable votes.
/// The web module's donor and district-lean signals need FEC contribution data
/// and 2024 presidential-lean tables that aren't in Supabase, so they're left
/// out here rather than approximated — a number the user can't trace back to a
/// source doesn't belong on a transparency tool.

enum VotingPatterns {

    /// Independents who caucus with a party vote with that party, so crossover
    /// is measured against the caucus rather than against a party of one.
    ///
    /// Must match `CAUCUS_OVERRIDES` in `src/data/caucusOverrides.js` and
    /// `INDEPENDENT_CAUCUS` in `etl/computeStats.ts`.
    static let caucusOverrides: [String: Party] = [
        "S000033": .democrat,  // Bernie Sanders (I-VT)
        "K000383": .democrat,  // Angus King (I-ME)
    ]

    static func effectiveParty(bioguideID: String, party: Party) -> Party {
        caucusOverrides[bioguideID] ?? party
    }

    /// Which way a party's majority went on a roll call.
    /// Returns nil when we hold no breakdown for that party.
    static func partyMajorityDirection(stats: RollCallStats?, party: Party) -> VotePosition? {
        guard let stats else { return nil }
        let yea: Int?
        let nay: Int?
        switch party {
        case .democrat:    yea = stats.demYea; nay = stats.demNay
        case .republican:  yea = stats.repYea; nay = stats.repNay
        case .independent: yea = stats.indYea; nay = stats.indNay
        case .unknown:     return nil
        }
        let y = yea ?? 0, n = nay ?? 0
        guard y + n > 0 else { return nil }
        return y > n ? .yea : .nay
    }

    /// Only Yea/Nay count as taking a position; Present and Not Voting are
    /// excluded from every rate below.
    private static func isSubstantive(_ position: VotePosition) -> Bool {
        position == .yea || position == .nay
    }

    // MARK: - Party crossover

    struct PolicyAreaCrossover: Identifiable, Hashable {
        let area: String
        let crossCount: Int
        let total: Int
        var crossPct: Int { total == 0 ? 0 : Int((Double(crossCount) / Double(total) * 100).rounded()) }
        var id: String { area }
    }

    struct Crossover {
        let rate: Int              // percent of substantive votes against party majority
        let count: Int
        let substantiveCount: Int
        let topPolicyAreas: [PolicyAreaCrossover]

        static let empty = Crossover(rate: 0, count: 0, substantiveCount: 0, topPolicyAreas: [])
    }

    /// Percent of substantive votes where the member voted against their
    /// effective party's majority.
    static func partyCrossover(
        bioguideID: String,
        party: Party,
        votes: [BallotWatchAPI.VoteWithBill],
        statsByRollCall: [String: RollCallStats]
    ) -> Crossover {
        let effParty = effectiveParty(bioguideID: bioguideID, party: party)
        guard !votes.isEmpty else { return .empty }

        var crossovers = 0
        var substantive = 0
        var policyCrosses: [String: Int] = [:]
        var policyTotals: [String: Int] = [:]

        for vote in votes {
            let actual = vote.position
            guard isSubstantive(actual) else { continue }
            guard let rollCallID = vote.rollCallID,
                  let direction = partyMajorityDirection(
                    stats: statsByRollCall[rollCallID], party: effParty
                  ) else { continue }

            substantive += 1
            let policy = vote.bill?.policyArea
            if let policy { policyTotals[policy, default: 0] += 1 }
            if actual != direction {
                crossovers += 1
                if let policy { policyCrosses[policy, default: 0] += 1 }
            }
        }

        let top = policyCrosses.keys
            .map { area in
                PolicyAreaCrossover(
                    area: area,
                    crossCount: policyCrosses[area] ?? 0,
                    total: policyTotals[area] ?? 0
                )
            }
            // Below three votes in an area the percentage is noise.
            .filter { $0.total >= 3 }
            .sorted {
                $0.crossPct != $1.crossPct ? $0.crossPct > $1.crossPct
                                           : $0.crossCount > $1.crossCount
            }
            .prefix(3)

        return Crossover(
            rate: substantive == 0 ? 0 : Int((Double(crossovers) / Double(substantive) * 100).rounded()),
            count: crossovers,
            substantiveCount: substantive,
            topPolicyAreas: Array(top)
        )
    }

    // MARK: - Notable votes

    private static let notableCount = 6

    /// Absolute Yea−Nay gap. A vote we hold no breakdown for is the least
    /// notable thing we could show, so it sorts last.
    private static func margin(_ stats: RollCallStats?) -> Int {
        guard let stats else { return Int.max }
        return abs(stats.totalYea - stats.totalNay)
    }

    struct NotableVotes {
        /// Voted WITH the party majority, ranked by closest margin — the close
        /// calls where the member held the line.
        let typical: [BallotWatchAPI.VoteWithBill]
        /// Crossed the party, ranked by closest margin then most recent.
        let atypical: [BallotWatchAPI.VoteWithBill]

        var isEmpty: Bool { typical.isEmpty && atypical.isEmpty }
    }

    static func rankNotableVotes(
        bioguideID: String,
        party: Party,
        votes: [BallotWatchAPI.VoteWithBill],
        statsByRollCall: [String: RollCallStats]
    ) -> NotableVotes {
        let effParty = effectiveParty(bioguideID: bioguideID, party: party)

        struct Annotated {
            let vote: BallotWatchAPI.VoteWithBill
            let crossedParty: Bool
            let margin: Int
            let date: Date
        }

        let annotated: [Annotated] = votes.compactMap { vote in
            guard isSubstantive(vote.position), let rollCallID = vote.rollCallID,
                  let direction = partyMajorityDirection(
                    stats: statsByRollCall[rollCallID], party: effParty
                  ) else { return nil }
            return Annotated(
                vote: vote,
                crossedParty: vote.position != direction,
                margin: margin(statsByRollCall[rollCallID]),
                date: vote.date ?? .distantPast
            )
        }

        // Margin ascending, then most recent on a tie. Deterministic, so the
        // list is the same for everyone and can be explained in methodology.
        func rank(_ a: Annotated, _ b: Annotated) -> Bool {
            a.margin != b.margin ? a.margin < b.margin : a.date > b.date
        }

        return NotableVotes(
            typical: annotated.filter { !$0.crossedParty }.sorted(by: rank)
                .prefix(notableCount).map(\.vote),
            atypical: annotated.filter(\.crossedParty).sorted(by: rank)
                .prefix(notableCount).map(\.vote)
        )
    }

    // MARK: - Policy area breakdown

    struct PolicyTally: Identifiable, Hashable {
        let area: String
        let yea: Int
        let nay: Int
        var total: Int { yea + nay }
        var id: String { area }
    }

    /// How a member voted across policy areas — the "what do they actually
    /// work on" view. Areas with a single vote are dropped as noise.
    static func policyBreakdown(votes: [BallotWatchAPI.VoteWithBill], limit: Int = 8) -> [PolicyTally] {
        var yea: [String: Int] = [:]
        var nay: [String: Int] = [:]
        for vote in votes {
            guard let area = vote.bill?.policyArea, !area.isEmpty else { continue }
            switch vote.position {
            case .yea: yea[area, default: 0] += 1
            case .nay: nay[area, default: 0] += 1
            default: break
            }
        }
        return Set(yea.keys).union(nay.keys)
            .map { PolicyTally(area: $0, yea: yea[$0] ?? 0, nay: nay[$0] ?? 0) }
            .filter { $0.total > 1 }
            .sorted { $0.total > $1.total }
            .prefix(limit)
            .map { $0 }
    }
}
