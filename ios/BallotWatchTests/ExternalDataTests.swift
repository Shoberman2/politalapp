import XCTest
@testable import BallotWatch

final class FECServiceTests: XCTestCase {
    func testCurrentCycleUsesNextEvenYear() {
        let calendar = Calendar(identifier: .gregorian)
        let oddYear = calendar.date(from: DateComponents(year: 2025, month: 7, day: 1))!
        let evenYear = calendar.date(from: DateComponents(year: 2026, month: 7, day: 1))!

        XCTAssertEqual(FECService.currentCycle(for: oddYear), 2026)
        XCTAssertEqual(FECService.currentCycle(for: evenYear), 2026)
    }

    func testFECLinksPreserveCandidateAndCycle() {
        let url = FECService.candidateURL(candidateID: "H8NY15148", cycle: 2026)
        XCTAssertTrue(url.absoluteString.contains("H8NY15148"))
        XCTAssertTrue(url.absoluteString.contains("cycle=2026"))
    }
}

final class VoteviewIdeologyTests: XCTestCase {
    func testClassificationMatchesWebThresholds() {
        XCTAssertEqual(VoteviewIdeology.classify(score: -0.6, votes: 300).label,
                       "Progressive-aligned voting record")
        XCTAssertEqual(VoteviewIdeology.classify(score: -0.3, votes: 300).label,
                       "Liberal-aligned voting record")
        XCTAssertEqual(VoteviewIdeology.classify(score: 0, votes: 300).label,
                       "Cross-partisan voting record")
        XCTAssertEqual(VoteviewIdeology.classify(score: 0.3, votes: 300).label,
                       "Conservative-aligned voting record")
        XCTAssertEqual(VoteviewIdeology.classify(score: 0.6, votes: 300).label,
                       "Very conservative-aligned voting record")
    }

    func testClassificationRequiresEnoughVotesAndReportsConfidence() {
        XCTAssertFalse(VoteviewIdeology.classify(score: -0.7, votes: 24).available)
        XCTAssertEqual(VoteviewIdeology.classify(score: -0.2, votes: 25).confidence, "Limited")
        XCTAssertEqual(VoteviewIdeology.classify(score: -0.2, votes: 75).confidence, "Medium")
        XCTAssertEqual(VoteviewIdeology.classify(score: -0.2, votes: 200).confidence, "High")
    }

    func testParsesVoteviewCSVByBioguideID() throws {
        let csv = """
        congress,chamber,icpsr,state_icpsr,district_code,state_abbrev,party_code,occupancy,last_means,bioguide_id,bioname,born,died,nominate_dim1,nominate_dim2,nominate_log_likelihood,nominate_geo_mean_probability,nominate_number_of_votes,nominate_number_of_errors,conditional
        119,House,21949,13,5,NY,100,0,1,O000172,"OCASIO-CORTEZ, Alexandria",1989,,-0.333,0.1,-20,0.95,535,12,
        """

        let estimate = try VoteviewIdeology.parseRecord(csv: csv, bioguideID: "O000172")
        XCTAssertTrue(estimate.available)
        XCTAssertEqual(estimate.label, "Liberal-aligned voting record")
        XCTAssertEqual(estimate.votes, 535)
        XCTAssertEqual(estimate.placement ?? -1, 33.35, accuracy: 0.001)
    }
}
