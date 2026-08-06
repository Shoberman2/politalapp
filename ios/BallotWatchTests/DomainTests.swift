import XCTest
@testable import BallotWatch

/// Tests for the domain rules ported from the web app. These encode the
/// judgment calls — which tallies are trustworthy, what "passed" means for a
/// given motion — so a future refactor can't quietly loosen them.
final class FloorVoteRulesTests: XCTestCase {

    // MARK: Tally sanity

    func testRejectsTallyLargerThanChamber() {
        // The double-counting bug this guard exists for: party columns summed
        // twice produce ~870 in a 435-seat chamber.
        XCTAssertFalse(FloorVotes.isSane(yea: 500, nay: 400, chamber: .house))
        XCTAssertFalse(FloorVotes.isSane(yea: 80, nay: 60, chamber: .senate))
    }

    func testRejectsEmptyTally() {
        XCTAssertFalse(FloorVotes.isSane(yea: 0, nay: 0, chamber: .house))
    }

    func testAcceptsPlausibleTally() {
        XCTAssertTrue(FloorVotes.isSane(yea: 218, nay: 210, chamber: .house))
        XCTAssertTrue(FloorVotes.isSane(yea: 51, nay: 49, chamber: .senate))
        // Exactly full attendance is legitimate.
        XCTAssertTrue(FloorVotes.isSane(yea: 235, nay: 200, chamber: .house))
    }

    func testUnknownChamberFallsBackToHouseSize() {
        XCTAssertTrue(FloorVotes.isSane(yea: 300, nay: 100, chamber: nil))
        XCTAssertFalse(FloorVotes.isSane(yea: 300, nay: 200, chamber: nil))
    }

    // MARK: Result derivation

    func testClotureNeedsSixty() {
        // A simple majority is not enough for cloture — this is the case a
        // naive yea > nay check gets wrong.
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On the Cloture Motion", yea: 50, nay: 44, chamber: .senate),
            "Cloture rejected"
        )
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On the Cloture Motion", yea: 60, nay: 40, chamber: .senate),
            "Cloture invoked"
        )
    }

    func testSuspensionNeedsTwoThirds() {
        // 280/420 is exactly two-thirds — passes.
        XCTAssertEqual(
            FloorVotes.deriveResult(
                question: "On Motion to Suspend the Rules and Pass", yea: 280, nay: 140, chamber: .house
            ),
            "Passed"
        )
        // A clear majority that falls short of two-thirds fails.
        XCTAssertEqual(
            FloorVotes.deriveResult(
                question: "On Motion to Suspend the Rules and Pass", yea: 250, nay: 170, chamber: .house
            ),
            "Failed"
        )
    }

    func testNominationLanguage() {
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On the Nomination", yea: 51, nay: 44, chamber: .senate),
            "Confirmed"
        )
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On the Nomination", yea: 44, nay: 51, chamber: .senate),
            "Rejected"
        )
    }

    func testMotionToProceed() {
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On the Motion to Proceed", yea: 48, nay: 50, chamber: .senate),
            "Motion rejected"
        )
    }

    func testTieFails() {
        XCTAssertEqual(
            FloorVotes.deriveResult(question: "On Passage", yea: 215, nay: 215, chamber: .house),
            "Failed on a tie"
        )
    }

    func testNoResultWithoutTally() {
        XCTAssertNil(FloorVotes.deriveResult(question: "On Passage", yea: nil, nay: 10, chamber: .house))
        XCTAssertNil(FloorVotes.deriveResult(question: "On Passage", yea: 10, nay: nil, chamber: .house))
    }
}

// MARK: - Bill identity

final class BillKeyTests: XCTestCase {

    func testParsesCanonicalID() {
        let key = BillKey(id: "119-hr-1234")
        XCTAssertEqual(key?.congress, 119)
        XCTAssertEqual(key?.type, "hr")
        XCTAssertEqual(key?.number, 1234)
        XCTAssertEqual(key?.display, "H.R. 1234")
        XCTAssertEqual(key?.chamber, .house)
    }

    func testParsesCompoundTypes() {
        XCTAssertEqual(BillKey(id: "119-sjres-187")?.display, "S.J.Res. 187")
        XCTAssertEqual(BillKey(id: "119-hconres-5")?.display, "H.Con.Res. 5")
        XCTAssertEqual(BillKey(id: "119-sjres-187")?.chamber, .senate)
    }

    func testRejectsMalformedID() {
        XCTAssertNil(BillKey(id: "nonsense"))
        XCTAssertNil(BillKey(id: "119-hr"))
        XCTAssertNil(BillKey(id: ""))
    }

    /// Placeholder titles that merely repeat the bill number carry no
    /// information, and the UI shows the number alone instead.
    func testDetectsPlaceholderTitle() {
        let placeholder = Bill(
            id: "119-hr-915", title: "HR 915", introducedAt: nil, summary: nil,
            crsSummary: nil, policyArea: nil, sourceURL: nil, sponsorBioguideID: nil,
            sponsorName: nil, sponsorParty: nil, sponsorState: nil, legislativeStage: nil
        )
        XCTAssertFalse(placeholder.hasRealTitle)

        let real = Bill(
            id: "119-hr-915", title: "Clean Water Restoration Act", introducedAt: nil,
            summary: nil, crsSummary: nil, policyArea: nil, sourceURL: nil,
            sponsorBioguideID: nil, sponsorName: nil, sponsorParty: nil,
            sponsorState: nil, legislativeStage: nil
        )
        XCTAssertTrue(real.hasRealTitle)
    }

    /// Placeholder titles appear in several spellings for the same bill. A
    /// naive comparison against the display form ("S.J.Res. 82") lets the
    /// table's own spelling ("SJRES 82") through, and it renders as a title
    /// directly beneath the number it repeats.
    func testPlaceholderDetectionIgnoresPunctuationAndCase() {
        let key = BillKey(id: "119-sjres-82")
        XCTAssertFalse(BillKey.isRealTitle("SJRES 82", for: key))
        XCTAssertFalse(BillKey.isRealTitle("S.J.Res. 82", for: key))
        XCTAssertFalse(BillKey.isRealTitle("sjres-82", for: key))
        XCTAssertFalse(BillKey.isRealTitle("  SJRes 82  ", for: key))
        XCTAssertFalse(BillKey.isRealTitle("", for: key))
        XCTAssertFalse(BillKey.isRealTitle(nil, for: key))

        XCTAssertTrue(BillKey.isRealTitle("A joint resolution of disapproval", for: key))
        // A different bill's number is still information.
        XCTAssertTrue(BillKey.isRealTitle("SJRES 83", for: key))
    }

    func testPrefersCRSSummaryOverAISummary() {
        let bill = Bill(
            id: "119-hr-1", title: "T", introducedAt: nil, summary: "ai text",
            crsSummary: "official text", policyArea: nil, sourceURL: nil,
            sponsorBioguideID: nil, sponsorName: nil, sponsorParty: nil,
            sponsorState: nil, legislativeStage: nil
        )
        XCTAssertEqual(bill.bestSummary, "official text")
    }
}

// MARK: - Roll call identity

final class RollCallMetaTests: XCTestCase {

    func testParsesRollCallID() {
        let meta = RollCallMeta(id: "house-119-2-225")
        XCTAssertEqual(meta?.chamber, .house)
        XCTAssertEqual(meta?.congress, 119)
        XCTAssertEqual(meta?.session, 2)
        XCTAssertEqual(meta?.number, 225)
    }

    func testParsesSenate() {
        XCTAssertEqual(RollCallMeta(id: "senate-119-2-222")?.chamber, .senate)
    }

    func testRejectsMalformed() {
        XCTAssertNil(RollCallMeta(id: "house-119-2"))
        XCTAssertNil(RollCallMeta(id: "unknown-119-2-1"))
    }
}

// MARK: - Voting patterns

final class VotingPatternsTests: XCTestCase {

    private func stats(
        _ id: String, demYea: Int = 0, demNay: Int = 0, repYea: Int = 0, repNay: Int = 0
    ) -> RollCallStats {
        RollCallStats(
            rollCallID: id, demYea: demYea, demNay: demNay,
            repYea: repYea, repNay: repNay, indYea: 0, indNay: 0
        )
    }

    private func vote(
        _ rollCallID: String, _ position: String, policyArea: String? = nil
    ) -> BallotWatchAPI.VoteWithBill {
        let json = """
        {
          "politician_id": "X000001",
          "bill_id": "119-hr-1",
          "roll_call_id": "\(rollCallID)",
          "position": "\(position)",
          "voted_at": "2026-01-15",
          "source_url": "https://example.gov",
          "bills": {
            "id": "119-hr-1",
            "title": "A bill",
            "policy_area": \(policyArea.map { "\"\($0)\"" } ?? "null")
          }
        }
        """
        return try! JSONDecoder().decode(
            BallotWatchAPI.VoteWithBill.self, from: Data(json.utf8)
        )
    }

    func testPartyMajorityDirection() {
        let s = stats("r1", demYea: 190, demNay: 10, repYea: 5, repNay: 200)
        XCTAssertEqual(VotingPatterns.partyMajorityDirection(stats: s, party: .democrat), .yea)
        XCTAssertEqual(VotingPatterns.partyMajorityDirection(stats: s, party: .republican), .nay)
        // No independents recorded — we can't claim a direction.
        XCTAssertNil(VotingPatterns.partyMajorityDirection(stats: s, party: .independent))
    }

    func testCrossoverCountsOnlyVotesAgainstOwnParty() {
        let statsMap = [
            "r1": stats("r1", demYea: 190, demNay: 10, repYea: 5, repNay: 200),
            "r2": stats("r2", demYea: 180, demNay: 20, repYea: 10, repNay: 195),
        ]
        // A Democrat voting Yea then Nay: the second breaks with the party.
        let votes = [vote("r1", "Yea"), vote("r2", "Nay")]
        let result = VotingPatterns.partyCrossover(
            bioguideID: "X000001", party: .democrat,
            votes: votes, statsByRollCall: statsMap
        )
        XCTAssertEqual(result.substantiveCount, 2)
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.rate, 50)
    }

    func testCrossoverIgnoresPresentAndNotVoting() {
        let statsMap = ["r1": stats("r1", demYea: 190, demNay: 10)]
        let result = VotingPatterns.partyCrossover(
            bioguideID: "X000001", party: .democrat,
            votes: [vote("r1", "Present"), vote("r1", "Not Voting")],
            statsByRollCall: statsMap
        )
        // Neither takes a position, so neither counts toward the denominator.
        XCTAssertEqual(result.substantiveCount, 0)
        XCTAssertEqual(result.rate, 0)
    }

    func testCrossoverSkipsRollCallsWithoutPartyBreakdown() {
        let result = VotingPatterns.partyCrossover(
            bioguideID: "X000001", party: .democrat,
            votes: [vote("r1", "Yea")], statsByRollCall: [:]
        )
        XCTAssertEqual(result.substantiveCount, 0)
    }

    func testCaucusingIndependentMeasuredAgainstCaucus() {
        // Sanders is an independent who caucuses with Democrats, so voting
        // with the Democratic majority is NOT a crossover.
        let statsMap = ["r1": stats("r1", demYea: 190, demNay: 10, repYea: 5, repNay: 200)]
        let json = """
        {"politician_id":"S000033","bill_id":null,"roll_call_id":"r1",
         "position":"Yea","voted_at":"2026-01-15","source_url":"u","bills":null}
        """
        let sandersVote = try! JSONDecoder().decode(
            BallotWatchAPI.VoteWithBill.self, from: Data(json.utf8)
        )
        let result = VotingPatterns.partyCrossover(
            bioguideID: "S000033", party: .independent,
            votes: [sandersVote], statsByRollCall: statsMap
        )
        XCTAssertEqual(result.substantiveCount, 1)
        XCTAssertEqual(result.count, 0, "Voting with the caucus is not a crossover")
    }

    func testNotableVotesRankNarrowestMarginFirst() {
        // Both roll calls have a Democratic majority voting Yea, so a Democrat
        // voting Yea on each stays "typical" — only the margin differs.
        let statsMap = [
            // 400–0 overall.
            "wide": stats("wide", demYea: 200, demNay: 0, repYea: 200, repNay: 0),
            // 210–191 overall: a close call the member showed up for.
            "narrow": stats("narrow", demYea: 150, demNay: 50, repYea: 60, repNay: 141),
        ]
        let votes = [vote("wide", "Yea"), vote("narrow", "Yea")]
        let notable = VotingPatterns.rankNotableVotes(
            bioguideID: "X000001", party: .democrat,
            votes: votes, statsByRollCall: statsMap
        )
        XCTAssertEqual(notable.typical.map(\.rollCallID), ["narrow", "wide"])
        XCTAssertTrue(notable.atypical.isEmpty)
    }

    func testNotableVotesSeparatesPartyBreaks() {
        // Democratic majority went Nay; a Yea vote breaks with the party and
        // belongs in the atypical list, not the typical one.
        let statsMap = [
            "r1": stats("r1", demYea: 20, demNay: 180, repYea: 200, repNay: 5),
            "r2": stats("r2", demYea: 190, demNay: 10, repYea: 10, repNay: 195),
        ]
        let notable = VotingPatterns.rankNotableVotes(
            bioguideID: "X000001", party: .democrat,
            votes: [vote("r1", "Yea"), vote("r2", "Yea")],
            statsByRollCall: statsMap
        )
        XCTAssertEqual(notable.atypical.map(\.rollCallID), ["r1"])
        XCTAssertEqual(notable.typical.map(\.rollCallID), ["r2"])
    }

    func testPolicyBreakdownDropsSingleVoteAreas() {
        let statsMap: [String: RollCallStats] = [:]
        _ = statsMap
        let votes = [
            vote("r1", "Yea", policyArea: "Health"),
            vote("r2", "Nay", policyArea: "Health"),
            vote("r3", "Yea", policyArea: "Taxation"),  // only one — noise
        ]
        let breakdown = VotingPatterns.policyBreakdown(votes: votes)
        XCTAssertEqual(breakdown.count, 1)
        XCTAssertEqual(breakdown.first?.area, "Health")
        XCTAssertEqual(breakdown.first?.yea, 1)
        XCTAssertEqual(breakdown.first?.nay, 1)
    }
}

// MARK: - District lookup

final class DistrictLookupTests: XCTestCase {

    /// Montana gained a second seat in the 2022 reapportionment. Treating it
    /// as at-large resolves every Montana ZIP to district "0", which matches
    /// no sitting member.
    func testMontanaIsNotAtLarge() {
        XCTAssertFalse(DistrictLookup.atLargeStates.contains("MT"))
    }

    func testKnownAtLargeStates() {
        for state in ["AK", "DE", "ND", "SD", "VT", "WY"] {
            XCTAssertTrue(
                DistrictLookup.atLargeStates.contains(state),
                "\(state) should be at-large in the 119th Congress"
            )
        }
    }

    func testFIPSMapping() {
        XCTAssertEqual(FIPS.state("06"), "CA")
        XCTAssertEqual(FIPS.state("30"), "MT")
        XCTAssertEqual(FIPS.state("11"), "DC")
        XCTAssertNil(FIPS.state("99"))
    }
}

// MARK: - Party normalization

final class PartyTests: XCTestCase {

    /// Congress.gov says "Democratic", Supabase says "Democrat", the FEC uses
    /// single letters. All three have to land on the same case.
    func testNormalizesSpellings() {
        XCTAssertEqual(Party(raw: "Democratic"), .democrat)
        XCTAssertEqual(Party(raw: "Democrat"), .democrat)
        XCTAssertEqual(Party(raw: "D"), .democrat)
        XCTAssertEqual(Party(raw: "Republican"), .republican)
        XCTAssertEqual(Party(raw: "R"), .republican)
        XCTAssertEqual(Party(raw: "Independent"), .independent)
        XCTAssertEqual(Party(raw: "ID"), .independent)
        XCTAssertEqual(Party(raw: nil), .unknown)
        XCTAssertEqual(Party(raw: ""), .unknown)
    }

    func testSeatLabels() {
        let houseMember = Politician(
            id: "A1", name: "A", chamberRaw: "house", state: "CA",
            district: "12", partyRaw: "D", photoURL: nil
        )
        XCTAssertEqual(houseMember.seatLabel(), "CA-12")

        let atLarge = Politician(
            id: "A2", name: "B", chamberRaw: "house", state: "WY",
            district: "0", partyRaw: "R", photoURL: nil
        )
        XCTAssertEqual(atLarge.seatLabel(), "WY-AL")

        let senator = Politician(
            id: "A3", name: "C", chamberRaw: "senate", state: "CA",
            district: nil, partyRaw: "D", photoURL: nil
        )
        XCTAssertEqual(senator.seatLabel(), "CA")
    }

    /// The roster stores district as null for House members, so the override
    /// from Congress.gov has to win.
    func testDistrictOverrideWins() {
        let member = Politician(
            id: "A1", name: "A", chamberRaw: "house", state: "CA",
            district: nil, partyRaw: "D", photoURL: nil
        )
        XCTAssertEqual(member.seatLabel(), "CA")
        XCTAssertEqual(member.seatLabel(districtOverride: "12"), "CA-12")
    }
}

// MARK: - Member stats

final class MemberStatsTests: XCTestCase {

    func testParticipationExcludesOnlyNotVoting() {
        let stats = MemberStats(
            politicianID: "X", congress: 119, totalVotes: 100,
            yeaCount: 60, nayCount: 35, presentCount: 2,
            notVotingCount: 3, partyLoyaltyPct: 90
        )
        // Present counts as showing up; only Not Voting is an absence.
        XCTAssertEqual(stats.participationPct, 97)
    }

    func testParticipationNilWithoutTotal() {
        let stats = MemberStats(
            politicianID: "X", congress: nil, totalVotes: 0, yeaCount: nil,
            nayCount: nil, presentCount: nil, notVotingCount: nil, partyLoyaltyPct: nil
        )
        XCTAssertNil(stats.participationPct)
    }
}

// MARK: - Query building

final class PostgRESTTests: XCTestCase {

    /// PostgREST reads `or=(...)` as a comma-separated filter list, so unescaped
    /// commas and parens in user input would break the query.
    func testSanitizesOrFilterInput() {
        XCTAssertEqual(PostgREST.sanitizeForOr("health, care (act)"), "health  care  act")
        XCTAssertEqual(PostgREST.sanitizeForOr("  100% *"), "100")
    }
}

// MARK: - HTML

final class HTMLStrippingTests: XCTestCase {

    func testStripsMarkupAndEntities() {
        let input = "<p>Amends the <b>Act</b> &amp; adds &quot;rules&quot;.</p>"
        XCTAssertEqual("Amends the Act & adds \"rules\".", input.strippingHTML)
    }
}
