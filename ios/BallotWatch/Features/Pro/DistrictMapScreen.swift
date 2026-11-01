import MapKit
import SwiftUI

/// Pro: the lines of a congressional district, drawn from the Census
/// Bureau's own boundary file (TIGERweb, 119th Congress, ACS 2025 vintage,
/// the maps in force until 2027-01-03; see DistrictLookup.vintage).
enum DistrictShapes {
    struct Shape: Sendable {
        let rings: [[CLLocationCoordinate2D]]
        var region: MKCoordinateRegion {
            let points = rings.flatMap { $0 }
            guard let first = points.first else { return MKCoordinateRegion() }
            var minLat = first.latitude, maxLat = first.latitude
            var minLon = first.longitude, maxLon = first.longitude
            for p in points {
                minLat = min(minLat, p.latitude); maxLat = max(maxLat, p.latitude)
                minLon = min(minLon, p.longitude); maxLon = max(maxLon, p.longitude)
            }
            return MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2),
                span: MKCoordinateSpan(latitudeDelta: max(0.05, (maxLat - minLat) * 1.3), longitudeDelta: max(0.05, (maxLon - minLon) * 1.3))
            )
        }
    }

    static let sourceURL = URL(string: "https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html")!

    /// "0" (at-large) is "00" in the Census file.
    static func censusDistrict(_ district: String) -> String {
        let digits = district.filter(\.isNumber)
        let number = Int(digits) ?? 0
        return String(format: "%02d", number)
    }

    static func shape(state: String, district: String) async throws -> Shape {
        guard let fips = FIPS.code(forState: state) else { throw DistrictLookupError.noMatch }
        var components = URLComponents(string: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer/8/query")!
        components.queryItems = [
            .init(name: "where", value: "STATE='\(fips)' AND CD119='\(censusDistrict(district))'"),
            .init(name: "outFields", value: "NAME"),
            .init(name: "returnGeometry", value: "true"),
            .init(name: "maxAllowableOffset", value: "0.002"),
            .init(name: "outSR", value: "4326"),
            .init(name: "f", value: "geojson"),
        ]
        let (data, _) = try await URLSession.shared.data(from: components.url!)
        return try parse(data)
    }

    /// GeoJSON Polygon or MultiPolygon, outer rings only.
    static func parse(_ data: Data) throws -> Shape {
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let features = root["features"] as? [[String: Any]],
              let geometry = features.first?["geometry"] as? [String: Any],
              let type = geometry["type"] as? String,
              let coordinates = geometry["coordinates"] as? [Any] else {
            throw DistrictLookupError.noMatch
        }
        func ring(_ raw: Any) -> [CLLocationCoordinate2D] {
            (raw as? [[Double]] ?? []).compactMap { pair in
                pair.count >= 2 ? CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0]) : nil
            }
        }
        var rings: [[CLLocationCoordinate2D]] = []
        if type == "Polygon", let outer = coordinates.first {
            rings = [ring(outer)]
        } else if type == "MultiPolygon" {
            rings = coordinates.compactMap { ($0 as? [Any])?.first }.map(ring)
        }
        rings = rings.filter { $0.count > 2 }
        guard !rings.isEmpty else { throw DistrictLookupError.noMatch }
        return Shape(rings: rings)
    }
}

struct DistrictMapScreen: View {
    let state: String
    let district: String
    /// The House member and senators, for "Compare" below the map.
    var members: [Politician] = []

    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL
    @State private var shape: DistrictShapes.Shape?
    @State private var failed = false
    @State private var camera: MapCameraPosition = .automatic
    @State private var compare: Politician?

    private var title: String {
        district == "0" || district == "00"
            ? "\(USStates.name(for: state)) At Large"
            : "\(USStates.name(for: state)) \(Self.ordinal(Int(district) ?? 0)) District"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(title)
                    .font(Typo.inter(30, 600, relativeTo: .largeTitle))
                    .webTracking(-0.03, size: 30)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)

                map
                    .frame(height: 360)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                if !members.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Compare Your Members")
                            .font(Typo.inter(20, 600, relativeTo: .title3))
                            .foregroundStyle(theme.text)
                        ForEach(members) { member in
                            Button { compare = member } label: {
                                HStack(spacing: 12) {
                                    MemberPhoto(bioguideID: member.id, name: member.name, size: 44)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(member.name)
                                            .font(Typo.inter(17, 600))
                                            .foregroundStyle(theme.text)
                                        Text("See who they vote with")
                                            .font(Typo.inter(15))
                                            .foregroundStyle(theme.textSecondary)
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(theme.textMuted)
                                }
                                .padding(14)
                                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                SourceNote(
                    text: "District lines: U.S. Census Bureau, 119th Congress.",
                    link: ("TIGERweb", DistrictShapes.sourceURL)
                )
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(theme.bg.ignoresSafeArea())
        .navigationTitle("District Map")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $compare) { member in
            CompareScreen(first: member)
        }
        .task {
            do {
                let loaded = try await DistrictShapes.shape(state: state, district: district)
                shape = loaded
                camera = .region(loaded.region)
            } catch {
                failed = true
            }
        }
    }

    @ViewBuilder
    private var map: some View {
        if let shape {
            Map(position: $camera, interactionModes: [.pan, .zoom]) {
                ForEach(Array(shape.rings.enumerated()), id: \.offset) { _, ring in
                    MapPolygon(coordinates: ring)
                        .foregroundStyle(theme.accent.opacity(0.14))
                        .stroke(theme.accent, lineWidth: 2)
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .accessibilityLabel("Map of \(title)")
        } else {
            ZStack {
                theme.surface
                if failed {
                    Text("The Census map service didn't answer. Try again later.")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(24)
                } else {
                    ProgressView().tint(theme.textMuted)
                }
            }
        }
    }

    static func ordinal(_ n: Int) -> String {
        let suffix: String
        switch (n % 100, n % 10) {
        case (11...13, _): suffix = "th"
        case (_, 1): suffix = "st"
        case (_, 2): suffix = "nd"
        case (_, 3): suffix = "rd"
        default: suffix = "th"
        }
        return "\(n)\(suffix)"
    }
}

/// The source line under a record: what it says, where it came from, and
/// that BallotWatch is not the government.
struct SourceNote: View {
    let text: String
    var link: (String, URL)?
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(text)
                .font(Typo.inter(15))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            if let link {
                Button(link.0) { openURL(link.1) }
                    .font(Typo.inter(15, 500))
                    .foregroundStyle(theme.accent)
                    .frame(minHeight: 44, alignment: .leading)
            }
            Text(Disclaimer.short)
                .font(Typo.inter(15))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

enum Disclaimer {
    static let short = "BallotWatch is not affiliated with any government entity."
}
