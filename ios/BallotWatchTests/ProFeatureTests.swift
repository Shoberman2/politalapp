import CoreLocation
import XCTest
@testable import BallotWatch

/// The Pro plumbing: product IDs and entitlement, key detection, and the
/// pure helpers behind comparisons, CSV export, district maps and sign-in.
final class ProStoreTests: XCTestCase {
    func testProductIDsMatchAppStoreConnect() {
        XCTAssertEqual(ProProduct.monthly.rawValue, "io.ballotwatch.pro.monthly")
        XCTAssertEqual(ProProduct.yearly.rawValue, "io.ballotwatch.pro.yearly")
        XCTAssertEqual(ProProduct.entitlementID, "pro")
    }

    func testPlaceholderKeyIsNotTreatedAsReal() {
        XCTAssertFalse(ProStore.isRealKey("REVENUECAT_API_KEY_PLACEHOLDER"))
        XCTAssertFalse(ProStore.isRealKey(""))
        XCTAssertFalse(ProStore.isRealKey("$(REVENUECAT_API_KEY)"))
        XCTAssertTrue(ProStore.isRealKey("appl_AbCdEf123"))
    }

    func testInfoPlistCarriesTheRevenueCatKeySetting() {
        // A real key must never be committed; the bundled one comes from the
        // committed xcconfig unless Secrets.local.xcconfig overrides it.
        let key = Bundle.main.object(forInfoDictionaryKey: "RevenueCatAPIKey") as? String
        XCTAssertNotNil(key)
    }

    func testPeriodText() {
        XCTAssertEqual(ProStore.periodText(value: 1, unit: "week"), "1 week")
        XCTAssertEqual(ProStore.periodText(value: 3, unit: "day"), "3 days")
    }

    func testStoreKitConfigurationListsBothPlans() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("BallotWatch/BallotWatch.storekit")
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let groups = try XCTUnwrap(json["subscriptionGroups"] as? [[String: Any]])
        XCTAssertEqual(groups.count, 1, "Both plans belong to one subscription group")
        let subs = try XCTUnwrap(groups.first?["subscriptions"] as? [[String: Any]])
        let prices = Dictionary(uniqueKeysWithValues: subs.map { ($0["productID"] as! String, $0["displayPrice"] as! String) })
        XCTAssertEqual(prices, ["io.ballotwatch.pro.monthly": "4.99", "io.ballotwatch.pro.yearly": "39.99"])
    }
}

final class AgreementTests: XCTestCase {
    private func cast(_ roll: String, _ position: VotePosition, _ date: String = "2026-10-01") -> Agreement.Cast {
        .init(rollCallID: roll, position: position, votedAt: date)
    }

    func testCountsOnlySharedYeaNay() {
        let a = [cast("r1", .yea), cast("r2", .nay), cast("r3", .present), cast("r4", .yea), cast("r5", .yea, "2026-10-05")]
        let b = [cast("r1", .yea), cast("r2", .yea, "2026-10-02"), cast("r3", .nay), cast("r5", .nay)]
        let result = Agreement.compute(a, b)
        XCTAssertEqual(result.shared, 3)          // r1, r2, r5 (r3 Present, r4 only one)
        XCTAssertEqual(result.agreed, 1)
        XCTAssertEqual(result.percent, 33)
        XCTAssertEqual(result.disagreements, ["r5", "r2"], "Newest split first")
    }

    func testNoSharedVotesHasNoPercent() {
        XCTAssertNil(Agreement.compute([cast("r1", .yea)], [cast("r2", .yea)]).percent)
    }
}

final class VoteCSVTests: XCTestCase {
    func testEscapingFollowsRFC4180() {
        XCTAssertEqual(VoteCSV.escape("plain"), "plain")
        XCTAssertEqual(VoteCSV.escape("a, b"), "\"a, b\"")
        XCTAssertEqual(VoteCSV.escape("say \"hi\""), "\"say \"\"hi\"\"\"")
    }

    func testFormulaInjectionIsDefused() {
        XCTAssertEqual(VoteCSV.escape("=HYPERLINK(1)"), "'=HYPERLINK(1)")
        XCTAssertEqual(VoteCSV.escape("+1"), "'+1")
    }

    func testFileName() {
        let member = Politician(id: "O000172", name: "Alexandria Ocasio-Cortez", chamberRaw: "house", state: "NY", district: "14", partyRaw: "D", photoURL: nil)
        XCTAssertEqual(VoteCSV.fileName(for: member), "ballotwatch-alexandria-ocasio-cortez-votes.csv")
    }
}

final class DistrictShapeTests: XCTestCase {
    func testCensusDistrictCodes() {
        XCTAssertEqual(DistrictShapes.censusDistrict("0"), "00")
        XCTAssertEqual(DistrictShapes.censusDistrict("7"), "07")
        XCTAssertEqual(DistrictShapes.censusDistrict("12"), "12")
    }

    func testParsesPolygonAndMultiPolygon() throws {
        let polygon = #"{"features":[{"geometry":{"type":"Polygon","coordinates":[[[-122.3,37.8],[-122.2,37.6],[-122.1,37.7],[-122.3,37.8]]]}}]}"#
        let shape = try DistrictShapes.parse(Data(polygon.utf8))
        XCTAssertEqual(shape.rings.count, 1)
        XCTAssertEqual(shape.rings[0][0].latitude, 37.8, accuracy: 0.0001)
        XCTAssertEqual(shape.rings[0][0].longitude, -122.3, accuracy: 0.0001)

        let multi = #"{"features":[{"geometry":{"type":"MultiPolygon","coordinates":[[[[0,0],[1,0],[1,1],[0,0]]],[[[5,5],[6,5],[6,6],[5,5]]]]}}]}"#
        XCTAssertEqual(try DistrictShapes.parse(Data(multi.utf8)).rings.count, 2)
    }

    func testEmptyResultIsAnError() {
        XCTAssertThrowsError(try DistrictShapes.parse(Data(#"{"features":[]}"#.utf8)))
    }

    func testStateFIPSRoundTrip() {
        XCTAssertEqual(FIPS.code(forState: "CA"), "06")
        XCTAssertEqual(FIPS.code(forState: "wy"), "56")
    }

    func testOrdinals() {
        XCTAssertEqual(DistrictMapScreen.ordinal(1), "1st")
        XCTAssertEqual(DistrictMapScreen.ordinal(12), "12th")
        XCTAssertEqual(DistrictMapScreen.ordinal(22), "22nd")
        XCTAssertEqual(DistrictMapScreen.ordinal(53), "53rd")
    }
}

final class SignInTests: XCTestCase {
    func testNonceHashIsSHA256Hex() {
        XCTAssertEqual(AppleSignIn.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testNoncesAreRandom() {
        let a = AppleSignIn.randomNonce(), b = AppleSignIn.randomNonce()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, b)
    }

    func testAPNsTokenHex() {
        XCTAssertEqual(AlertsStore.hex(Data([0x00, 0xAB, 0x10])), "00ab10")
    }
}

@MainActor
final class AppSettingsTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let name = "test.\(UUID().uuidString)"
        return UserDefaults(suiteName: name)!
    }

    func testFirstLaunchOnboards() {
        let settings = AppSettings(defaults: defaults(), arguments: [])
        XCTAssertFalse(settings.hasOnboarded)
        XCTAssertEqual(settings.appearance, .system)
    }

    func testReturningUsersSkipOnboarding() throws {
        let store = defaults()
        store.set(try JSONEncoder().encode(UserData.SavedPlace(state: "CA", district: "12", label: nil)), forKey: "savedPlace")
        XCTAssertTrue(AppSettings(defaults: store, arguments: []).hasOnboarded)
    }

    func testAppearancePersists() {
        let store = defaults()
        AppSettings(defaults: store, arguments: []).appearance = .dark
        XCTAssertEqual(AppSettings(defaults: store, arguments: []).appearance, .dark)
        XCTAssertEqual(AppSettings.Appearance.dark.colorScheme, .dark)
        XCTAssertNil(AppSettings.Appearance.system.colorScheme)
    }
}
