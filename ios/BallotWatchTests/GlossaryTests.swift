import XCTest
@testable import BallotWatch

/// The bundled glossary.json (generated from the website's shared/glossary.js)
/// loads, and vote questions point at the same terms as on the web.
final class GlossaryTests: XCTestCase {

    func testBundledGlossaryLoads() {
        XCTAssertNotNil(Glossary.entry("cloture"))
        XCTAssertEqual(Glossary.entry("rollCall")?.term, "Roll call vote")
        XCTAssertFalse(Glossary.groups.isEmpty)
        for group in Glossary.groups {
            XCTAssertFalse(Glossary.entries(in: group.id).isEmpty, "empty group \(group.id)")
        }
    }

    func testEveryTermUsedOnScreenExists() {
        let used = ["district", "atLarge", "representative", "senator", "party", "voteWithParty",
                    "rollCall", "yea", "nay", "present", "missedVotes", "notVoting", "pac",
                    "campaignFinance", "chamber", "billNumber", "officialSummary", "sponsor",
                    "cosponsor", "committee", "enacted", "passed", "referred", "introduced",
                    "latestAction", "congressNumber", "bill", "floor", "voteResult", "partySplit"]
        for id in used { XCTAssertNotNil(Glossary.entry(id), "missing glossary term \(id)") }
    }

    func testQuestionTermsMatchTheWeb() {
        XCTAssertEqual(Glossary.termForQuestion("On Cloture on the Motion to Proceed"), "cloture")
        XCTAssertEqual(Glossary.termForQuestion("On Motion to Suspend the Rules and Pass"), "suspension")
        XCTAssertEqual(Glossary.termForQuestion("On the Nomination"), "nomination")
        XCTAssertEqual(Glossary.termForQuestion("On Agreeing to the Resolution providing for consideration"), "rule")
        XCTAssertNil(Glossary.termForQuestion("On Passage"))
        XCTAssertNil(Glossary.termForQuestion(nil))
    }
}
