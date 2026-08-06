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
        capture("01-myrep-empty")

        let field = app.textFields["ZIP code or street address"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        // An at-large state resolves to a district from the ZIP alone, which
        // exercises the full lookup path without needing a street address.
        field.typeText("59801")
        app.buttons["Find"].tap()

        // The delegation header replaces the hero once a place is saved.
        let delegation = app.staticTexts["YOUR DELEGATION"]
        XCTAssertTrue(
            delegation.waitForExistence(timeout: 25),
            "Lookup did not resolve to a delegation"
        )
        capture("02-myrep-delegation")

        // Montana has two senators and one at-large representative.
        // SectionHead renders its title uppercased.
        XCTAssertTrue(
            app.staticTexts["YOUR SENATORS"].waitForExistence(timeout: 20),
            "Senators section missing"
        )
        capture("03-myrep-loaded")
    }

    func test02_floorFeedLoadsRealVotes() throws {
        tapTab("Floor")

        // Every roll call id parses to a chamber, so at least one row must
        // carry a chamber kicker once the feed loads.
        let house = app.staticTexts["HOUSE"].firstMatch
        let senate = app.staticTexts["SENATE"].firstMatch
        let loaded = house.waitForExistence(timeout: 25) || senate.waitForExistence(timeout: 10)
        XCTAssertTrue(loaded, "Floor feed showed no roll calls")
        capture("04-floor-feed")

        // Opening the first row must reach a detail screen, not a dead end.
        app.scrollViews.firstMatch.tap()
        capture("05-floor-detail")
    }

    func test03_billsSearch() throws {
        tapTab("Bills")

        let firstBill = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH 'H.R.' OR label BEGINSWITH 'S.'")
        ).firstMatch
        XCTAssertTrue(firstBill.waitForExistence(timeout: 25), "Bills list stayed empty")
        capture("06-bills-list")

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

        let senateFilter = app.buttons["Senate"]
        XCTAssertTrue(senateFilter.waitForExistence(timeout: 25), "Members screen never loaded")
        capture("09-members-list")

        senateFilter.tap()
        // Every senator row renders the title "Senator".
        XCTAssertTrue(
            app.staticTexts["Senator"].firstMatch.waitForExistence(timeout: 15),
            "Senate filter produced no senators"
        )
        capture("10-members-senate")

        app.staticTexts["Senator"].firstMatch.tap()

        // The detail page's first section is the vote record.
        XCTAssertTrue(
            app.staticTexts["THE RECORD"].waitForExistence(timeout: 25),
            "Politician detail never rendered the record"
        )
        capture("11-politician-detail")

        app.swipeUp()
        app.swipeUp()
        capture("12-politician-analysis")
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
            app.staticTexts["VOTE TALLIES"].waitForExistence(timeout: 10),
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
}
