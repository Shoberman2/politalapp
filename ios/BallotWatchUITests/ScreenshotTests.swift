import XCTest

/// Walks every screen the Pro/auth work touched and saves a PNG of each, for
/// design review in light and dark at small and large phone sizes.
///
///     TEST_RUNNER_SHOTDIR=~/ios-shots/ballotwatch TEST_RUNNER_APPEARANCE=dark \
///       xcodebuild test ... -only-testing:BallotWatchUITests/ScreenshotTests
///
/// Skipped unless SHOTDIR is set, so the normal test run stays fast.
final class ScreenshotTests: XCTestCase {
    private var app: XCUIApplication!
    private var dir: URL!
    private var appearance = "light"
    private var device = "phone"

    override func setUpWithError() throws {
        continueAfterFailure = true
        let env = ProcessInfo.processInfo.environment
        guard let path = env["SHOTDIR"], !path.isEmpty else { throw XCTSkip("SHOTDIR not set") }
        dir = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        appearance = env["APPEARANCE"] ?? "light"
        let name = env["SIMULATOR_DEVICE_NAME"] ?? UIDevice.current.name
        device = name.contains("SE") ? "iphone-se" : (name.contains("Max") ? "iphone-pro-max" : "iphone")
    }

    private func launch(_ extra: [String]) {
        app = XCUIApplication()
        app.launchArguments = ["--appearance", appearance, "--preview-plans"] + extra
        app.launch()
    }

    private func snap(_ name: String) {
        sleep(1)
        let data = XCUIScreen.main.screenshot().pngRepresentation
        let url = dir.appendingPathComponent("\(device)-\(appearance)-\(name).png")
        XCTAssertNoThrow(try data.write(to: url))
    }

    private func tapIfExists(_ element: XCUIElement, timeout: TimeInterval = 8) -> Bool {
        guard element.waitForExistence(timeout: timeout) else { return false }
        element.tap()
        return true
    }

    func test1_freeFlow() throws {
        launch(["--reset-state", "--onboarding"])

        // Onboarding chat with Dome.
        let place = app.textFields["onboardingPlace"]
        XCTAssertTrue(place.waitForExistence(timeout: 10))
        snap("01-onboarding-start")
        place.tap()
        place.typeText("82001")
        app.buttons["Find"].tap()
        XCTAssertTrue(app.buttons["Follow them"].waitForExistence(timeout: 30))
        snap("02-onboarding-members")
        app.buttons["Follow them"].tap()
        XCTAssertTrue(app.buttons["Turn on alerts"].waitForExistence(timeout: 10))
        snap("03-onboarding-alerts")
        app.buttons["Turn on alerts"].tap()
        // Not Pro: the paywall opens from onboarding.
        XCTAssertTrue(app.buttons["paywallSubscribe"].waitForExistence(timeout: 10))
        sleep(2)
        snap("04-paywall")
        app.swipeUp()
        snap("05-paywall-terms")
        _ = tapIfExists(app.buttons["Close"])
        XCTAssertTrue(app.buttons["Not now"].waitForExistence(timeout: 10))
        snap("06-onboarding-account")
        app.buttons["Not now"].firstMatch.tap()
        XCTAssertTrue(app.buttons["onboardingFinish"].waitForExistence(timeout: 10))
        snap("07-onboarding-done")
        app.buttons["onboardingFinish"].tap()

        // My Reps with the account button and the district map row.
        XCTAssertTrue(app.buttons["openSettings"].waitForExistence(timeout: 15))
        sleep(3)
        snap("08-my-reps")
        app.swipeUp()
        snap("09-my-reps-district-row")
        if tapIfExists(app.buttons["districtMap"]) {
            XCTAssertTrue(app.buttons["paywallSubscribe"].waitForExistence(timeout: 10))
            sleep(1)
            snap("10-paywall-district")
            _ = tapIfExists(app.buttons["Close"])
        }
        app.swipeDown()

        // Settings sheet and sign-in.
        if tapIfExists(app.buttons["openSettings"]) {
            snap("11-settings")
            app.swipeUp()
            snap("12-settings-lower")
            app.swipeDown()
            if tapIfExists(app.buttons["settingsSignIn"]) {
                snap("13-sign-in")
                _ = tapIfExists(app.buttons["Close"])
            }
            _ = tapIfExists(app.buttons["Done"])
        }

        // A member page with follow, alerts and the More menu.
        let member = app.buttons.matching(NSPredicate(format: "label CONTAINS 'See how they vote'")).firstMatch
        if tapIfExists(member, timeout: 10) {
            sleep(3)
            snap("14-member")
            app.buttons["memberAlerts"].tap()
            if app.buttons["paywallSubscribe"].waitForExistence(timeout: 8) {
                _ = tapIfExists(app.buttons["Close"])
            }
            for _ in 0..<12 { app.swipeUp() }
            snap("15-member-sources")
        }

        // A bill with the alerts bell and the source note.
        app.tabBars.buttons["Bills"].tap()
        sleep(3)
        let bill = app.buttons.matching(identifier: "billRow").firstMatch
        if tapIfExists(bill, timeout: 15) {
            sleep(4)
            snap("16-bill")
            for _ in 0..<14 { app.swipeUp() }
            snap("17-bill-sources")
        }

        app.tabBars.buttons["More"].tap()
        sleep(1)
        snap("18-more")
    }

    func test2_proFlow() throws {
        launch(["--skip-onboarding", "--pro-preview"])
        XCTAssertTrue(app.buttons["openSettings"].waitForExistence(timeout: 15))
        sleep(3)
        app.swipeUp()
        if tapIfExists(app.buttons["districtMap"]) {
            sleep(6)
            snap("19-district-map")
            app.swipeUp()
            snap("20-district-map-compare")
            let compare = app.buttons.matching(NSPredicate(format: "label CONTAINS 'See who they vote with'")).firstMatch
            if tapIfExists(compare) {
                if tapIfExists(app.buttons["compareChoose"]) {
                    _ = app.collectionViews.buttons.element(boundBy: 0).waitForExistence(timeout: 20)
                    snap("21-compare-picker")
                    let row = app.collectionViews.buttons.element(boundBy: 0)
                    if tapIfExists(row, timeout: 20) {
                        sleep(8)
                        snap("22-compare")
                    } else {
                        app.swipeDown(velocity: .fast)
                    }
                }
            }
        }

        app.tabBars.buttons["More"].tap()
        if tapIfExists(app.buttons["moreAskDome"]) {
            sleep(1)
            snap("23-ask-dome")
        }
        app.tabBars.buttons["My Reps"].tap()
        if tapIfExists(app.buttons["openSettings"]) {
            snap("24-settings-pro")
        }
    }
}
