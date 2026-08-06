import Foundation
import CoreLocation

/// Address / ZIP / location → congressional district.
///
/// Google's Civic Information Representatives endpoint was shut down on
/// 2025-04-30, so the web app moved to the US Census Geocoder; this mirrors
/// that. The Census lookup is the accurate one — it returns the actual district
/// for a street address. A bare ZIP can straddle several districts, so that
/// path resolves to a state and asks the user which district, rather than
/// guessing.

struct DistrictResult: Equatable, Sendable {
    let state: String           // two-letter
    let district: String?       // "12", "0" for at-large, nil if unresolved
    let city: String?
    /// True when we got a state but still need the user to pick a district.
    var needsDistrict: Bool { district == nil }
}

enum DistrictLookupError: LocalizedError {
    case noMatch
    case network(Error)
    case locationDenied

    var errorDescription: String? {
        switch self {
        case .noMatch:
            return "We couldn't find a congressional district for that address."
        case .network(let error):
            return (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        case .locationDenied:
            return "Location access is off. You can enter a ZIP code instead."
        }
    }
}

enum DistrictLookup {

    /// States with a single at-large House district, as of the 119th Congress.
    /// Census returns "00" for these; the app normalizes to "0".
    ///
    /// Montana is deliberately NOT in this list: it gained a second seat in the
    /// 2022 reapportionment and has had two districts since January 2023.
    /// Treating it as at-large resolves every Montana ZIP to district "0",
    /// which matches no sitting member.
    static let atLargeStates: Set<String> = ["AK", "DE", "ND", "SD", "VT", "WY"]

    // MARK: - Full address → district (most accurate)

    /// Census "onelineaddress" geocoder with the congressional-district layer.
    /// Layer 54 is the 119th Congressional Districts layer in the current
    /// vintage; the response also names it, so parsing keys off the name.
    static func district(forAddress address: String) async throws -> DistrictResult {
        var components = URLComponents(
            string: "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
        )!
        components.queryItems = [
            .init(name: "address", value: address),
            .init(name: "benchmark", value: "Public_AR_Current"),
            .init(name: "vintage", value: "Current_Current"),
            .init(name: "format", value: "json"),
        ]
        return try await censusLookup(url: components.url!)
    }

    /// Same geocoder, by coordinate — used by "use my location".
    static func district(for coordinate: CLLocationCoordinate2D) async throws -> DistrictResult {
        var components = URLComponents(
            string: "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
        )!
        components.queryItems = [
            .init(name: "x", value: String(coordinate.longitude)),
            .init(name: "y", value: String(coordinate.latitude)),
            .init(name: "benchmark", value: "Public_AR_Current"),
            .init(name: "vintage", value: "Current_Current"),
            .init(name: "format", value: "json"),
        ]
        return try await censusLookup(url: components.url!)
    }

    private static func censusLookup(url: URL) async throws -> DistrictResult {
        let data: Data
        do {
            (data, _) = try await URLSession.shared.data(from: url)
        } catch {
            throw DistrictLookupError.network(error)
        }

        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = root["result"] as? [String: Any] else {
            throw DistrictLookupError.noMatch
        }

        // Address lookups nest under addressMatches; coordinate lookups put
        // geographies at the top level.
        let geographies: [String: Any]?
        if let matches = result["addressMatches"] as? [[String: Any]], let first = matches.first {
            geographies = first["geographies"] as? [String: Any]
        } else {
            geographies = result["geographies"] as? [String: Any]
        }
        guard let geographies else { throw DistrictLookupError.noMatch }

        // The layer key carries the Congress number ("119th Congressional
        // Districts"), which changes every two years — match on the suffix so
        // this doesn't need a code change each cycle.
        guard let districtsKey = geographies.keys.first(where: {
            $0.localizedCaseInsensitiveContains("Congressional District")
        }), let districts = geographies[districtsKey] as? [[String: Any]],
              let entry = districts.first else {
            throw DistrictLookupError.noMatch
        }

        // GEOID is state FIPS + district, e.g. "0612" = CA-12.
        let geoid = entry["GEOID"] as? String
        let stateFIPS = (entry["STATE"] as? String) ?? geoid.map { String($0.prefix(2)) }
        guard let stateFIPS, let state = FIPS.state(stateFIPS) else {
            throw DistrictLookupError.noMatch
        }

        var district = (entry["CD119"] as? String)
            ?? (entry["CD118"] as? String)
            ?? (entry["BASENAME"] as? String)
            ?? geoid.map { String($0.dropFirst(2)) }

        // At-large districts come back as "00"; normalize to "0".
        if let d = district, let n = Int(d) { district = String(n) }
        // "98"/"ZZ" mark non-voting delegations and unassigned water areas.
        if district == "98" || district == "ZZ" { district = "0" }

        let city = (result["addressMatches"] as? [[String: Any]])?
            .first.flatMap { $0["matchedAddress"] as? String }

        return DistrictResult(state: state, district: district, city: city)
    }

    // MARK: - ZIP → state

    /// A ZIP code is not a district — plenty of ZIPs cross district lines — so
    /// this resolves the state (and the district only when the state has just
    /// one) and leaves the rest to the user.
    static func lookup(zip: String) async throws -> DistrictResult {
        let clean = zip.filter(\.isNumber)
        guard clean.count == 5 else { throw DistrictLookupError.noMatch }

        let url = URL(string: "https://api.zippopotam.us/us/\(clean)")!
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(from: url)
        } catch {
            throw DistrictLookupError.network(error)
        }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let places = root["places"] as? [[String: Any]],
              let place = places.first,
              let state = place["state abbreviation"] as? String else {
            throw DistrictLookupError.noMatch
        }

        let city = place["place name"] as? String
        if atLargeStates.contains(state) {
            return DistrictResult(state: state, district: "0", city: city)
        }
        return DistrictResult(state: state, district: nil, city: city)
    }

    /// Accepts whatever the user typed: a bare ZIP takes the fast path, a
    /// fuller address goes to the Census geocoder, and a Census miss on
    /// something containing a ZIP falls back to the ZIP path.
    static func lookup(freeform input: String) async throws -> DistrictResult {
        let trimmed = input.trimmed
        guard !trimmed.isEmpty else { throw DistrictLookupError.noMatch }

        let digits = trimmed.filter(\.isNumber)
        let isBareZIP = digits.count == 5 && trimmed.allSatisfy { $0.isNumber || $0.isWhitespace }
        if isBareZIP { return try await lookup(zip: digits) }

        do {
            return try await district(forAddress: trimmed)
        } catch {
            // Census couldn't match the street address — if there's a ZIP in
            // there, we can still get the user to the right state.
            if let zip = firstZIP(in: trimmed) {
                return try await lookup(zip: zip)
            }
            throw error
        }
    }

    private static func firstZIP(in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: #"\b(\d{5})(?:-\d{4})?\b"#),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range(at: 1), in: text) else { return nil }
        return String(text[range])
    }
}

// MARK: - FIPS

enum FIPS {
    private static let map: [String: String] = [
        "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA",
        "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
        "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
        "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
        "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS",
        "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
        "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
        "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
        "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
        "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
        "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
    ]
    static func state(_ fips: String) -> String? { map[fips] }
}

// MARK: - States

struct USState: Identifiable, Hashable {
    let abbr: String
    let name: String
    var id: String { abbr }
}

enum USStates {
    static let all: [USState] = [
        .init(abbr: "AL", name: "Alabama"), .init(abbr: "AK", name: "Alaska"),
        .init(abbr: "AZ", name: "Arizona"), .init(abbr: "AR", name: "Arkansas"),
        .init(abbr: "CA", name: "California"), .init(abbr: "CO", name: "Colorado"),
        .init(abbr: "CT", name: "Connecticut"), .init(abbr: "DE", name: "Delaware"),
        .init(abbr: "FL", name: "Florida"), .init(abbr: "GA", name: "Georgia"),
        .init(abbr: "HI", name: "Hawaii"), .init(abbr: "ID", name: "Idaho"),
        .init(abbr: "IL", name: "Illinois"), .init(abbr: "IN", name: "Indiana"),
        .init(abbr: "IA", name: "Iowa"), .init(abbr: "KS", name: "Kansas"),
        .init(abbr: "KY", name: "Kentucky"), .init(abbr: "LA", name: "Louisiana"),
        .init(abbr: "ME", name: "Maine"), .init(abbr: "MD", name: "Maryland"),
        .init(abbr: "MA", name: "Massachusetts"), .init(abbr: "MI", name: "Michigan"),
        .init(abbr: "MN", name: "Minnesota"), .init(abbr: "MS", name: "Mississippi"),
        .init(abbr: "MO", name: "Missouri"), .init(abbr: "MT", name: "Montana"),
        .init(abbr: "NE", name: "Nebraska"), .init(abbr: "NV", name: "Nevada"),
        .init(abbr: "NH", name: "New Hampshire"), .init(abbr: "NJ", name: "New Jersey"),
        .init(abbr: "NM", name: "New Mexico"), .init(abbr: "NY", name: "New York"),
        .init(abbr: "NC", name: "North Carolina"), .init(abbr: "ND", name: "North Dakota"),
        .init(abbr: "OH", name: "Ohio"), .init(abbr: "OK", name: "Oklahoma"),
        .init(abbr: "OR", name: "Oregon"), .init(abbr: "PA", name: "Pennsylvania"),
        .init(abbr: "RI", name: "Rhode Island"), .init(abbr: "SC", name: "South Carolina"),
        .init(abbr: "SD", name: "South Dakota"), .init(abbr: "TN", name: "Tennessee"),
        .init(abbr: "TX", name: "Texas"), .init(abbr: "UT", name: "Utah"),
        .init(abbr: "VT", name: "Vermont"), .init(abbr: "VA", name: "Virginia"),
        .init(abbr: "WA", name: "Washington"), .init(abbr: "WV", name: "West Virginia"),
        .init(abbr: "WI", name: "Wisconsin"), .init(abbr: "WY", name: "Wyoming"),
        .init(abbr: "DC", name: "District of Columbia"),
    ]

    static func name(for abbr: String) -> String {
        all.first { $0.abbr == abbr }?.name ?? abbr
    }
}

// MARK: - Location

/// Thin CLLocationManager wrapper for the one-shot "use my location" button.
@MainActor
final class LocationProvider: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocationCoordinate2D, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestLocation() async throws -> CLLocationCoordinate2D {
        // A district is a few miles wide, so kilometer accuracy is plenty and
        // it returns much faster than a precise fix.
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            throw DistrictLookupError.locationDenied
        }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            manager.requestLocation()
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        Task { @MainActor in
            guard let coordinate = locations.last?.coordinate else { return }
            continuation?.resume(returning: coordinate)
            continuation = nil
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            continuation?.resume(throwing: DistrictLookupError.network(error))
            continuation = nil
        }
    }
}
