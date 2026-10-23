import SwiftUI

/// The first tab. Once an address is saved it opens on your representatives
/// (House first, then the Senate) under a one-line address row; the address
/// form shows only before the first lookup or when you tap Change.
struct MyRepScreen: View {
    /// Anything already known, so the form starts filled in.
    struct Prefill: Hashable {
        var state = ""
        var zip = ""
        var city = ""
    }

    var prefill = Prefill()

    @StateObject private var model = MyRepModel()
    @State private var editingAddress = false
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("My Reps")
                    .font(Typo.display)
                    .foregroundStyle(theme.text)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                if let place = userData.place, !editingAddress {
                    addressRow(place)
                        .padding(.bottom, 28)
                    results
                } else {
                    intro
                        .padding(.bottom, 20)
                    addressCard
                        .padding(.bottom, 32)
                }
                if !model.favorites.isEmpty {
                    favorites
                        .padding(.bottom, 32)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 48)
            .animation(Motion.micro, value: editingAddress)
        }
        .scrollDismissesKeyboard(.interactively)
        .paperBackground()
        .onAppear { model.apply(prefill) }
        .task(id: userData.place) {
            if let place = userData.place { await model.loadReps(for: place) }
        }
        .task(id: userData.followedMembers) {
            await model.loadFavorites(ids: userData.followedMembers)
        }
        .refreshable {
            if let place = userData.place { await model.loadReps(for: place, force: true) }
        }
    }

    // MARK: Intro

    /// Before the first lookup: what this tab does.
    private var intro: some View {
        Text("Enter your address to see who represents you in Congress: one House member and two senators.")
            .font(Typo.inter(17))
            .foregroundStyle(theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Address row

    /// After a lookup: where the results are for, and a way to change it.
    private func addressRow(_ place: UserData.SavedPlace) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "mappin.circle.fill")
                .font(.system(size: 28))
                .foregroundStyle(theme.accent)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Your address")
                    .font(Typo.inter(12, 500))
                    .foregroundStyle(theme.textMuted)
                Text(model.representing(place))
                    .font(Typo.inter(15, 500))
                    .foregroundStyle(theme.text)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button("Change") { editingAddress = true }
                .font(Typo.inter(15, 500))
                .foregroundStyle(theme.accent)
                .frame(minHeight: 44)
                .accessibilityIdentifier("myRepChangeAddress")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
        .accessibilityElement(children: .contain)
    }

    // MARK: Address card

    /// `.address-card`: --surface, 8pt corners, 24pt padding on phones, a
    /// --border line; the form's fields stack into one column.
    private var addressCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            MyRepField(label: "Street Address", placeholder: "123 Main St", text: $model.street, content: .streetAddressLine1)
                .accessibilityIdentifier("myRepStreet")
            MyRepField(label: "City", placeholder: "City", text: $model.city, content: .addressCity)
            statePicker
            MyRepField(label: "Zip Code", placeholder: "12345", text: $model.zip, content: .postalCode, numeric: true)
                .accessibilityIdentifier("myRepZip")

            if let error = model.error {
                Text(error)
                    .font(Typo.inter(15.2))
                    .foregroundStyle(theme.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.vertical, 14)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 4).fill(theme.error.opacity(theme.scheme == .dark ? 0.12 : 0.08)))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(theme.error.opacity(0.3), lineWidth: 1))
            }

            VStack(spacing: 16) {
                Button(model.isLoading ? "Finding..." : "Find My Representatives") {
                    hideKeyboard()
                    Task {
                        await model.find(into: userData)
                        if model.error == nil { editingAddress = false }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(model.isLoading || model.street.trimmed.isEmpty || model.state.isEmpty)
                .accessibilityIdentifier("myRepFind")

                Button {
                    Task {
                        await model.findByLocation(into: userData)
                        if model.error == nil { editingAddress = false }
                    }
                } label: {
                    Label("Use my location", systemImage: "location.fill")
                }
                .buttonStyle(SecondaryButtonStyle())

                if userData.place != nil {
                    HStack(spacing: 24) {
                        Button("Cancel") { editingAddress = false }
                            .buttonStyle(SecondaryButtonStyle())
                        Button("Clear address") {
                            model.reset()
                            userData.clearPlace()
                            editingAddress = false
                        }
                        .font(Typo.inter(15, 500))
                        .foregroundStyle(theme.error)
                        .frame(minHeight: 44)
                    }
                }
            }
            .padding(.top, 8)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
    }

    private var statePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            MyRepLabel("State")
            Menu {
                Picker("State", selection: $model.state) {
                    Text("--").tag("")
                    ForEach(USStates.all) { state in
                        Text(state.abbr).tag(state.abbr)
                    }
                }
            } label: {
                HStack {
                    Text(model.state.isEmpty ? "--" : model.state)
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.text)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(theme.text)
                }
                .padding(.vertical, 14)
                .padding(.leading, 16)
                .padding(.trailing, 16)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(theme.border, lineWidth: 1))
                .contentShape(Rectangle())
            }
            .accessibilityLabel("State, \(model.state.isEmpty ? "none" : USStates.name(for: model.state))")
        }
    }

    // MARK: Favorites

    private var favorites: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Following")
                .font(Typo.inter(22, 600, relativeTo: .title2))
                .foregroundStyle(theme.text)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 4)
            Text("Members you starred")
                .font(Typo.inter(14))
                .foregroundStyle(theme.textSecondary)
                .padding(.bottom, 16)
            VStack(spacing: 12) {
                ForEach(model.favorites) { member in
                    MyRepCard(politician: member, district: nil)
                }
            }
        }
    }

    // MARK: Results

    @ViewBuilder
    private var results: some View {
        if let place = userData.place {
            if model.isLoadingReps && model.house.isEmpty && model.senate.isEmpty {
                VStack(spacing: 16) {
                    ProgressView().controlSize(.large).tint(theme.accent)
                    Text("Finding your representatives...")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(48)
            } else if let error = model.repsError {
                ErrorStateView(message: error) {
                    Task { await model.loadReps(for: place, force: true) }
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Your Representatives")
                        .font(Typo.inter(22, 600, relativeTo: .title2))
                        .foregroundStyle(theme.text)
                        .accessibilityAddTraits(.isHeader)
                        .padding(.bottom, 6)
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text(seatLine(place))
                            .font(Typo.inter(14))
                            .foregroundStyle(theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        InfoTerm(isAtLarge(place) ? "atLarge" : "district")
                    }
                    .padding(.bottom, 4)
                    partyKey
                        .padding(.bottom, 20)

                    if !model.house.isEmpty {
                        section("House of Representatives", term: "representative") {
                            ForEach(model.house) { rep in
                                MyRepCard(politician: rep.politician, district: rep.district)
                            }
                        }
                    } else if place.district == nil {
                        section("House of Representatives", term: "representative") {
                            Text("\(USStates.name(for: place.state)) elects its House members by district. Add your street address above for an exact match.")
                                .font(Typo.inter(15.2))
                                .foregroundStyle(theme.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    section("U.S. Senate", term: "senator") {
                        if model.senate.isEmpty {
                            Text("No senators found for your state.")
                                .font(Typo.inter(15.2))
                                .foregroundStyle(theme.textSecondary)
                                .padding(.vertical, 16)
                        } else {
                            ForEach(model.senate) { rep in
                                MyRepCard(politician: rep.politician, district: nil)
                            }
                        }
                    }
                }
            }
        }
    }

    /// `.rep-section`: an uppercase 13.6px head over a --border rule.
    private func section<Content: View>(_ title: String, term: String? = nil, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(title.uppercased())
                    .font(Typo.inter(13, 500))
                    .tracking(0.5)
                    .foregroundStyle(theme.textMuted)
                if let term { InfoTerm(term) }
            }
            .padding(.leading, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            content()
        }
        .padding(.bottom, 28)
    }

    /// The party letters on the cards, spelled out once, with the ⓘ for party.
    private var partyKey: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text("D = Democrat · R = Republican · I = Independent")
                .font(Typo.inter(13))
                .foregroundStyle(theme.textMuted)
            InfoTerm("party")
        }
    }

    /// "Delaware · at-large district" / "Texas · District 37".
    private func seatLine(_ place: UserData.SavedPlace) -> String {
        let state = USStates.name(for: place.state)
        guard let district = place.district else { return state }
        return district == "0" ? "\(state) · at-large district" : "\(state) · District \(district)"
    }

    private func isAtLarge(_ place: UserData.SavedPlace) -> Bool {
        DistrictLookup.atLargeStates.contains(place.state)
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

// MARK: - Form pieces

/// `.form-group label`: 13.6px 500 uppercase, 0.5px tracking, --ink.
private struct MyRepLabel: View {
    let text: String
    @Environment(\.theme) private var theme
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(Typo.inter(13.6, 500))
            .tracking(0.5)
            .foregroundStyle(theme.text)
    }
}

/// `.form-input`: 14×16 padding, 1px --border (accent on focus), 4pt corners.
private struct MyRepField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var content: UITextContentType?
    var numeric = false
    @FocusState private var focused: Bool
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            MyRepLabel(label)
            TextField("", text: $text, prompt: Text(placeholder).foregroundStyle(theme.textMuted))
                .font(Typo.inter(16))
                .foregroundStyle(theme.text)
                .textContentType(content)
                .keyboardType(numeric ? .numberPad : .default)
                .textInputAutocapitalization(numeric ? .never : .words)
                .autocorrectionDisabled()
                .focused($focused)
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(focused ? theme.accent : theme.border, lineWidth: 1))
                .accessibilityLabel(label)
                .onChange(of: text) { _, value in
                    guard numeric else { return }
                    let digits = String(value.filter(\.isNumber).prefix(5))
                    if digits != value { text = digits }
                }
        }
    }
}

// MARK: - Politician card

/// Web `PoliticianCard`: photo, name, role, seat, the record link, the party
/// box and the follow star, on a --surface card with a --border line.
struct MyRepCard: View {
    let politician: Politician
    let district: String?
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    private var location: String {
        guard let district, politician.chamber == .house else { return politician.state }
        return "\(politician.state)-\(district)"
    }

    var body: some View {
        NavigationLink(value: HomeScreen.Route.member(politician)) {
            HStack(spacing: 16) {
                MemberPhoto(bioguideID: politician.id, name: politician.name, size: 60)
                    .overlay(Circle().stroke(theme.borderSoft, lineWidth: 2))

                VStack(alignment: .leading, spacing: 0) {
                    Text(politician.name)
                        .font(Typo.inter(16, 500))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                        .padding(.bottom, 4)
                    Text(politician.chamber.memberTitle.uppercased())
                        .font(Typo.inter(12))
                        .tracking(0.5)
                        .foregroundStyle(theme.textSecondary)
                        .padding(.bottom, 2)
                    Text(location)
                        .font(Typo.inter(13.6, 500))
                        .foregroundStyle(theme.text)
                    Text("See how they vote")
                        .font(Typo.inter(13, 500))
                        .foregroundStyle(theme.accent)
                        .padding(.top, 5)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 12) {
                    Text(politician.party.letter)
                        .font(Typo.mono(12.8, 600))
                        .tracking(12.8 * 0.04)
                        .foregroundStyle(theme.party(politician.party))
                        .padding(.horizontal, 8)
                        .frame(minWidth: 32, minHeight: 28)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(theme.party(politician.party), lineWidth: 1))
                        .accessibilityLabel(politician.party.label)

                    let following = userData.isFollowing(memberID: politician.id)
                    Button {
                        userData.toggleFollow(memberID: politician.id)
                    } label: {
                        Image(systemName: following ? "star.fill" : "star")
                            .font(.system(size: 18))
                            .foregroundStyle(following ? theme.accent : theme.textMuted)
                            .frame(width: 32, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(following ? "Remove from favorites" : "Add to favorites")
                }
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Model

@MainActor
final class MyRepModel: ObservableObject {
    /// A roster member paired with the district Congress.gov reports, since
    /// the Supabase roster stores district as null.
    struct Rep: Identifiable {
        let politician: Politician
        let district: String?
        var id: String { politician.id }
    }

    private struct SavedAddress: Codable {
        var street = "", city = "", state = "", zip = ""
    }

    private static let storageKey = "myrep.address"

    @Published var street = "" { didSet { persist() } }
    @Published var city = "" { didSet { persist() } }
    @Published var state = "" { didSet { persist() } }
    @Published var zip = "" { didSet { persist() } }

    @Published private(set) var isLoading = false
    @Published private(set) var error: String?
    @Published private(set) var isLoadingReps = false
    @Published private(set) var repsError: String?
    @Published private(set) var house: [Rep] = []
    @Published private(set) var senate: [Rep] = []
    @Published private(set) var favorites: [Politician] = []

    private let location = LocationProvider()
    private var loadedPlace: UserData.SavedPlace?
    private var restoring = false

    init() {
        if ProcessInfo.processInfo.arguments.contains("--reset-state") {
            UserDefaults.standard.removeObject(forKey: Self.storageKey)
        }
        if let data = UserDefaults.standard.data(forKey: Self.storageKey),
           let saved = try? JSONDecoder().decode(SavedAddress.self, from: data) {
            restoring = true
            street = saved.street; city = saved.city; state = saved.state; zip = saved.zip
            restoring = false
        }
    }

    private func persist() {
        guard !restoring else { return }
        let saved = SavedAddress(street: street, city: city, state: state, zip: zip)
        if let data = try? JSONEncoder().encode(saved) {
            UserDefaults.standard.set(data, forKey: Self.storageKey)
        }
    }

    func apply(_ prefill: MyRepScreen.Prefill) {
        if !prefill.state.isEmpty { state = prefill.state }
        if !prefill.zip.isEmpty { zip = prefill.zip }
        if !prefill.city.isEmpty { city = prefill.city }
    }

    func reset() {
        street = ""; city = ""; state = ""; zip = ""
        house = []; senate = []; error = nil; repsError = nil; loadedPlace = nil
    }

    /// "Representing 123 Main St, Cheyenne, WY 82001", from what was typed,
    /// else from the saved place.
    func representing(_ place: UserData.SavedPlace) -> String {
        if !street.trimmed.isEmpty, state == place.state {
            let cityPart = city.trimmed.isEmpty ? "" : ", \(city.trimmed)"
            return "\(street.trimmed)\(cityPart), \(state) \(zip)".trimmed
        }
        let label = (place.label ?? "").trimmed
        let zipPart = zip.isEmpty || state != place.state ? "" : " \(zip)"
        if label.isEmpty || label == place.state { return "\(place.state)\(zipPart)" }
        return "\(label), \(place.state)\(zipPart)"
    }

    // MARK: Lookup

    /// Web `findRepresentatives`: street and state are required; the Census
    /// geocoder finds the district, an at-large state needs none, and
    /// otherwise only the senators are named.
    func find(into userData: UserData) async {
        guard !street.trimmed.isEmpty, !state.isEmpty else {
            error = "Please enter your street address and select a state"
            return
        }
        isLoading = true
        error = nil
        defer { isLoading = false }

        let address = [street.trimmed, city.trimmed, "\(state) \(zip)".trimmed]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
        var resolvedState = state
        var district: String?
        if let info = try? await DistrictLookup.district(forAddress: address), info.district != nil {
            resolvedState = info.state
            district = info.district
        } else if DistrictLookup.atLargeStates.contains(state) {
            district = "0"
        } else {
            error = "We couldn't determine your House district from your address. Visit house.gov/representatives/find-your-representative to find your district number."
        }
        userData.save(place: .init(
            state: resolvedState,
            district: district,
            label: city.trimmed.isEmpty ? street.trimmed : city.trimmed
        ))
    }

    func findByLocation(into userData: UserData) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let coordinate = try await location.requestLocation()
            let result = try await DistrictLookup.district(for: coordinate)
            state = result.state
            if let found = result.city { city = found }
            userData.save(place: .init(state: result.state, district: result.district, label: result.city))
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: Representatives

    func loadReps(for place: UserData.SavedPlace, force: Bool = false) async {
        guard force || place != loadedPlace else { return }
        isLoadingReps = true
        repsError = nil
        defer { isLoadingReps = false }
        loadedPlace = place
        house = []
        senate = []

        do {
            // The roster in Supabase is the source for identity and photos;
            // Congress.gov supplies the district each House member holds.
            async let rosterTask = BallotWatchAPI.politicians(state: place.state)
            async let congressTask = try? CongressAPI.members(state: place.state)

            let roster = try await rosterTask
            let congressMembers = await congressTask ?? []
            let districtByID = Dictionary(
                congressMembers.compactMap { member -> (String, String)? in
                    guard let district = member.district else { return nil }
                    return (member.bioguideID, String(district))
                },
                uniquingKeysWith: { a, _ in a }
            )

            senate = roster.filter { $0.chamber == .senate }
                .sorted { $0.name < $1.name }
                .map { Rep(politician: $0, district: nil) }

            // Only a known district names a House member, as on the web.
            if let district = place.district {
                let houseRoster = roster.filter { $0.chamber == .house }
                    .map { Rep(politician: $0, district: districtByID[$0.id] ?? $0.district) }
                let matches = houseRoster.filter { $0.district == district }
                if !matches.isEmpty {
                    house = matches
                } else if district == "0", houseRoster.count == 1 {
                    house = [Rep(politician: houseRoster[0].politician, district: "AL")]
                }
                if district == "0" {
                    house = house.map { Rep(politician: $0.politician, district: "AL") }
                }
            }
        } catch {
            repsError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func loadFavorites(ids: Set<String>) async {
        guard !ids.isEmpty else { favorites = []; return }
        var found: [Politician] = []
        await withTaskGroup(of: Politician?.self) { group in
            for id in ids {
                group.addTask { try? await BallotWatchAPI.politician(id: id) }
            }
            for await member in group { if let member { found.append(member) } }
        }
        favorites = found.sorted { $0.name < $1.name }
    }
}
