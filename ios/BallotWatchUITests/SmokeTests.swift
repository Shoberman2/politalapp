import XCTest

/// End-to-end smoke tests against the live backend.
///
/// These deliberately hit the real Supabase instance rather than a fixture:
/// the thing most likely to break in this app is a query shape drifting from
/// the schema, and a mocked test would never catch that. They assert on
/// structure ("a member row appeared") rather than on specific names or
/// counts, so they don't fail every time Congress votes.
final class SmokeTests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        // Saved location and watched bills persist across launches, so each
        // test starts from a clean slate rather than inheriting the last run's.
        app.launchArguments = ["--reset-state"]
        app.launch()
    }

    /// Screenshots are attached to the result bundle so the run can be
    /// reviewed visually, not just as pass/fail.
    private func capture(_ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    private func tapTab(_ name: String) {
        let tab = app.tabBars.buttons[name]
        XCTAssertTrue(tab.waitForExistence(timeout: 10), "Tab \(name) missing")
        tab.tap()
    }

    func test01_myRepLookup() throws {
        // The first tab is the representative lookup, not a landing page:
        // with no saved address it opens on the form.
        let street = app.textFields["myRepStreet"]
        XCTAssertTrue(street.waitForExistence(timeout: 10))
        capture("01-myrep-form")

        // Dover, DE is at-large, so the lookup always resolves to one House
        // seat. (Montana is not at-large: two districts since 2023.)
        street.tap()
        street.typeText("411 Legislative Ave")
        let zip = app.textFields["myRepZip"]
        zip.tap()
        zip.typeText("19901")
        app.buttons["State, none"].tap()
        let delaware = app.buttons["DE"]
        XCTAssertTrue(delaware.waitForExistence(timeout: 5), "State menu did not open")
        delaware.tap()
        app.buttons["myRepFind"].tap()

        // The representative list replaces the form: House member, then the
        // two senators. Delaware's one at-large member must be named.
        XCTAssertTrue(
            app.staticTexts["Your Representatives"].waitForExistence(timeout: 25),
            "Representatives did not load"
        )
        XCTAssertTrue(
            app.staticTexts["HOUSE OF REPRESENTATIVES"].waitForExistence(timeout: 20),
            "House member missing"
        )
        XCTAssertTrue(app.buttons["myRepChangeAddress"].exists, "Address row missing")
        XCTAssertTrue(
            app.staticTexts["U.S. SENATE"].waitForExistence(timeout: 20),
            "Senators section missing"
        )
        capture("03-myrep-loaded")
        app.swipeUp(velocity: .slow)
        capture("03-myrep-loaded-scrolled")

        // Change reopens the form without losing the saved result.
        app.buttons["myRepChangeAddress"].tap()
        XCTAssertTrue(app.textFields["myRepStreet"].waitForExistence(timeout: 5))
        capture("03b-myrep-change")
    }

    func test02_floorFeedLoadsRealVotes() throws {
        tapTab("Floor")

        // Each recorded vote card names its roll call number.
        let rollLabel = app.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH 'Roll call'")
        ).firstMatch
        XCTAssertTrue(rollLabel.waitForExistence(timeout: 30), "Floor feed showed no roll calls")
        capture("04-floor-feed")
        app.swipeUp()
        capture("04b-floor-feed-rows")

        // Opening the first row must reach the roll-call page, not a dead end.
        let firstRow = app.buttons["floorRow"].firstMatch
        XCTAssertTrue(firstRow.waitForExistence(timeout: 5))
        firstRow.tap()
        let heading = app.staticTexts["How each member voted"]
        XCTAssertTrue(heading.waitForExistence(timeout: 25), "Roll-call page never loaded")
        capture("05-floor-detail")
        app.swipeUp()
        capture("05b-floor-detail-members")
        let nay = app.buttons["Nay"].firstMatch
        if nay.exists && nay.isHittable {
            nay.tap()
            capture("05c-floor-detail-nay")
        }
    }

    func test03_billsSearch() throws {
        tapTab("Bills")

        let firstBill = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'H.R.' OR label BEGINSWITH 'S.'")
        ).firstMatch
        XCTAssertTrue(firstBill.waitForExistence(timeout: 25), "Bills list stayed empty")
        capture("06-bills-list")

        // The system search bar under the large title.
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        search.typeText("health")

        // Debounce is 350ms; give the query room on a cold connection.
        let results = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'H.R.' OR label BEGINSWITH 'S.'")
        ).firstMatch
        XCTAssertTrue(results.waitForExistence(timeout: 25), "Search returned nothing")
        capture("07-bills-search")

        results.tap()
        capture("08-bill-detail")
    }

    func test04_membersAndDetail() throws {
        tapTab("Members")

        // The system search bar under the large title.
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 25), "Members screen never loaded")
        capture("09-members-list")
        app.swipeUp()
        capture("09b-members-cards")
        app.swipeDown()
        app.swipeDown()

        search.tap()
        search.typeText("Ocasio-Cortez")
        let member = app.buttons.matching(
            NSPredicate(format: "label CONTAINS[c] 'Ocasio-Cortez'")
        ).firstMatch
        XCTAssertTrue(
            member.waitForExistence(timeout: 15),
            "Member search did not return Alexandria Ocasio-Cortez"
        )
        capture("10-members-search")

        member.tap()

        // Voting history and the evidence-bounded ideology estimate belong at
        // the top of the profile, before the long vote list.
        XCTAssertTrue(
            app.staticTexts["VOTING HISTORY · AT A GLANCE"].waitForExistence(timeout: 25),
            "Politician detail never rendered the top voting summary"
        )
        XCTAssertTrue(
            app.staticTexts["Liberal-aligned voting record"].waitForExistence(timeout: 25),
            "Voteview analysis did not load"
        )
        capture("11-politician-detail")

        // Campaign finance is loaded directly from the current OpenFEC cycle.
        let financeLabel = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'CAMPAIGN FINANCE'")
        ).firstMatch
        XCTAssertTrue(financeLabel.waitForExistence(timeout: 30), "Campaign finance section never rendered")
        XCTAssertTrue(
            app.staticTexts["CAMPAIGN FINANCE · 2026 CYCLE"].waitForExistence(timeout: 30),
            "Current FEC cycle did not load"
        )
        let nonZeroCurrency = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH '$' AND label != '$0'")
        ).firstMatch
        XCTAssertTrue(nonZeroCurrency.waitForExistence(timeout: 30), "FEC totals stayed empty")

        // Walk the profile top to bottom for visual review.
        for index in 0..<8 {
            app.swipeUp()
            capture(String(format: "11-detail-%02d", index))
        }
        capture("12-politician-finance")

        // Record-based voting pattern analysis runs on the loaded record.
        let analyze = app.buttons["Analyze voting patterns"]
        for _ in 0..<12 where !analyze.isHittable { app.swipeDown() }
        if analyze.isHittable {
            analyze.tap()
            XCTAssertTrue(app.staticTexts["Notable Votes"].waitForExistence(timeout: 10), "Analysis did not render")
            capture("12b-politician-analysis")
            app.swipeUp()
            capture("12c-politician-analysis-notable")
        }

        // "Record in 60 seconds" opens the record card.
        let record = app.buttons["Record in 60 seconds"]
        for _ in 0..<12 where !record.isHittable { app.swipeDown() }
        record.tap()
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label ENDSWITH 'MOST RECENT RECORDED VOTES'"))
                .firstMatch.waitForExistence(timeout: 25),
            "Record card did not load its votes"
        )
        capture("13-record")
        app.swipeUp()
        capture("13b-record-votes")
        app.swipeUp()
        app.swipeUp()
        capture("13c-record-foot")
    }

    func test05_moreAndMethodology() throws {
        tapTab("More")

        XCTAssertTrue(
            app.staticTexts["THE DATA"].waitForExistence(timeout: 15),
            "More screen missing data provenance"
        )
        capture("13-more")

        app.staticTexts["Methodology"].tap()
        XCTAssertTrue(
            app.staticTexts["Vote tallies"].waitForExistence(timeout: 10),
            "Methodology page did not open"
        )
        capture("14-methodology")
    }

    func test06_darkMode() throws {
        // The design system defines a full dark palette; verify it actually
        // resolves rather than falling back to system defaults.
        XCUIDevice.shared.appearance = .dark
        tapTab("Floor")
        _ = app.staticTexts["HOUSE"].firstMatch.waitForExistence(timeout: 25)
        capture("15-dark-floor")

        tapTab("Members")
        _ = app.buttons["Senate"].waitForExistence(timeout: 20)
        capture("16-dark-members")
        XCUIDevice.shared.appearance = .light
    }

    func test07_plainEnglishTerms() throws {
        // A reader with no political background: the Bills tab says bills are
        // explained in plain English, and an ⓘ opens a definition.
        tapTab("Bills")
        XCTAssertTrue(
            app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'plain English'")).firstMatch
                .waitForExistence(timeout: 15),
            "Plain-English line missing on Bills"
        )
        let info = app.buttons["info-bill"]
        XCTAssertTrue(info.waitForExistence(timeout: 15), "Bill ⓘ missing")
        info.tap()
        let def = app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'A proposed law'")).firstMatch
        XCTAssertTrue(def.waitForExistence(timeout: 5), "Definition did not open")
        capture("17-info-term-bill")
        // A tap outside closes the bubble (the first tap is spent closing it).
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
        XCTAssertTrue(def.waitForNonExistence(timeout: 5), "Definition did not close")

        tapTab("More")
        let glossary = app.buttons["moreGlossary"]
        XCTAssertTrue(glossary.waitForExistence(timeout: 10), "Glossary link missing")
        glossary.tap()
        XCTAssertTrue(app.staticTexts["Congress in one minute"].waitForExistence(timeout: 5))
        capture("18-glossary")
    }
}
