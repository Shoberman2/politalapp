import SwiftUI

/// The front door: find out who represents you, then see what they've done.
///
/// Before a place is saved this is the lookup; after, it's a standing briefing
/// on your own House member and two senators.
struct MyRepScreen: View {
    @StateObject private var model = MyRepModel()
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    if userData.place == nil {
                        lookupHero
                    } else {
                        representatives
                    }
                }
                .padding(.horizontal, Space.md)
                .padding(.bottom, Space.xxl)
            }
            .paperBackground()
            .navigationTitle("BallotWatch")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                if userData.place != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Change") { model.isChangingPlace = true }
                            .font(Typo.bodySMMedium)
                            .foregroundStyle(theme.accent)
                    }
                }
            }
            .sheet(isPresented: $model.isChangingPlace) {
                LookupSheet(model: model)
            }
            .task {
                if let place = userData.place { await model.loadReps(for: place) }
            }
            .refreshable {
                if let place = userData.place { await model.loadReps(for: place, force: true) }
            }
            .onChange(of: userData.place) { _, newPlace in
                guard let newPlace else { return }
                Task { await model.loadReps(for: newPlace, force: true) }
            }
        }
    }

    // MARK: Lookup hero

    private var lookupHero: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            VStack(alignment: .leading, spacing: Space.sm) {
                Text("See how Congress votes.")
                    .font(Typo.displayXL)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)

                Text("Find the three people who vote on your behalf — and the record they've built.")
                    .font(Typo.body)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, Space.xs)

            RuleLine(weight: .heavy)

            LookupField(model: model)

            if !model.isLoading, model.error == nil {
                Text("A ZIP code finds your state; a full street address pins the exact district.")
                    .font(Typo.caption)
                    .foregroundStyle(theme.textMuted)
            }
        }
    }

    // MARK: Representatives

    @ViewBuilder
    private var representatives: some View {
        if let place = userData.place {
            VStack(alignment: .leading, spacing: Space.lg) {
                VStack(alignment: .leading, spacing: Space.xxs) {
                    Kicker("Your delegation")
                    Text(placeLabel(place))
                        .font(Typo.h1)
                        .foregroundStyle(theme.text)
                    RuleLine(weight: .heavy)
                }
                .padding(.top, Space.xs)

                if model.isLoading && model.house.isEmpty && model.senate.isEmpty {
                    LoadingView(label: "Finding your representatives")
                } else if let error = model.error {
                    ErrorStateView(message: error) {
                        Task { await model.loadReps(for: place, force: true) }
                    }
                } else {
                    if !model.house.isEmpty {
                        delegationSection(
                            title: place.district == nil
                                ? "House members" : "Your representative",
                            members: model.house
                        )
                    }
                    if !model.senate.isEmpty {
                        delegationSection(title: "Your senators", members: model.senate)
                    }
                    if model.house.isEmpty && model.senate.isEmpty {
                        EmptyStateView(
                            title: "No members found",
                            message: "We couldn't match a delegation to \(placeLabel(place)).",
                            systemImage: "person.slash"
                        )
                    }
                    if place.district == nil {
                        districtPrompt(place)
                    }
                }
            }
        }
    }

    private func delegationSection(title: String, members: [MyRepModel.Rep]) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: title)
            ForEach(members) { rep in
                NavigationLink {
                    PoliticianDetailScreen(politician: rep.politician)
                } label: {
                    MemberRow(member: rep.politician, districtOverride: rep.district)
                }
                .buttonStyle(.plain)
                RuleLine()
            }
        }
    }

    /// A ZIP can straddle districts, so rather than guess we show the whole
    /// state delegation and offer to narrow it.
    private func districtPrompt(_ place: UserData.SavedPlace) -> some View {
        Card {
            VStack(alignment: .leading, spacing: Space.xs) {
                Text("Which district are you in?")
                    .font(Typo.headline)
                    .foregroundStyle(theme.text)
                Text("A ZIP code can cover several districts. Enter your street address to pin down your representative.")
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Enter address") { model.isChangingPlace = true }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, Space.xxs)
            }
        }
    }

    private func placeLabel(_ place: UserData.SavedPlace) -> String {
        if let district = place.district {
            return district == "0"
                ? "\(USStates.name(for: place.state)) at-large"
                : "\(place.state)-\(district)"
        }
        return USStates.name(for: place.state)
    }
}

// MARK: - Lookup field

struct LookupField: View {
    @ObservedObject var model: MyRepModel
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            // The button sits inside the bordered container, so the container
            // radius is the button radius plus its padding — concentric curves.
            HStack(spacing: Space.xs) {
                TextField("ZIP code or street address", text: $model.input)
                    .font(Typo.body)
                    .foregroundStyle(theme.text)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .focused($focused)
                    .onSubmit { Task { await model.lookup(into: userData) } }

                Button {
                    focused = false
                    Task { await model.lookup(into: userData) }
                } label: {
                    if model.isLoading {
                        ProgressView().tint(.white).frame(width: 62)
                    } else {
                        Text("Find")
                            .font(Typo.bodySMMedium)
                            .foregroundStyle(.white)
                            .frame(width: 62)
                    }
                }
                .frame(height: 40)
                .background(
                    RoundedRectangle(cornerRadius: Radius.button)
                        .fill(model.input.trimmed.isEmpty ? theme.textMuted.opacity(0.4) : theme.accent)
                )
                .disabled(model.input.trimmed.isEmpty || model.isLoading)
            }
            .padding(6)
            .background(
                RoundedRectangle(cornerRadius: Radius.button + 6).fill(theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.button + 6)
                    .stroke(theme.border, lineWidth: 1)
            )

            Button {
                Task { await model.lookupByLocation(into: userData) }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: "location")
                        .font(.system(size: 12, weight: .medium))
                    Text("Use my location")
                        .font(Typo.captionMedium)
                }
                .foregroundStyle(theme.accent)
            }
            .buttonStyle(.plain)

            if let error = model.error {
                Text(error)
                    .font(Typo.caption)
                    .foregroundStyle(theme.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Change place sheet

struct LookupSheet: View {
    @ObservedObject var model: MyRepModel
    @EnvironmentObject private var userData: UserData
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    Text("Where do you vote?")
                        .font(Typo.h1)
                        .foregroundStyle(theme.text)

                    LookupField(model: model)

                    VStack(alignment: .leading, spacing: Space.sm) {
                        SectionHead(title: "Or pick a state")
                        LazyVGrid(
                            columns: Array(repeating: GridItem(.flexible(), spacing: Space.xs), count: 5),
                            spacing: Space.xs
                        ) {
                            ForEach(USStates.all) { state in
                                Button {
                                    userData.save(place: .init(
                                        state: state.abbr, district: nil, label: state.name
                                    ))
                                    dismiss()
                                } label: {
                                    Text(state.abbr)
                                        .font(Typo.monoSM)
                                        .foregroundStyle(theme.text)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .background(
                                            RoundedRectangle(cornerRadius: Radius.sm)
                                                .fill(theme.surface)
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: Radius.sm)
                                                .stroke(theme.border, lineWidth: 0.5)
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if userData.place != nil {
                        Button("Clear saved location") {
                            userData.clearPlace()
                            model.reset()
                            dismiss()
                        }
                        .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(.horizontal, Space.md)
                .padding(.bottom, Space.xxl)
            }
            .paperBackground()
            .navigationTitle("Change location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(Typo.bodySMMedium)
                        .foregroundStyle(theme.accent)
                }
            }
        }
        .onChange(of: userData.place) { _, newValue in
            if newValue != nil { dismiss() }
        }
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

    @Published var input = ""
    @Published private(set) var isLoading = false
    @Published private(set) var error: String?
    @Published private(set) var house: [Rep] = []
    @Published private(set) var senate: [Rep] = []
    @Published var isChangingPlace = false

    private let location = LocationProvider()
    private var loadedPlace: UserData.SavedPlace?

    func reset() {
        house = []; senate = []; error = nil; input = ""; loadedPlace = nil
    }

    // MARK: Lookup

    func lookup(into userData: UserData) async {
        let text = input.trimmed
        guard !text.isEmpty else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let result = try await DistrictLookup.lookup(freeform: text)
            userData.save(place: .init(
                state: result.state,
                district: result.district,
                label: result.city ?? text
            ))
            input = ""
            isChangingPlace = false
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func lookupByLocation(into userData: UserData) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            let coordinate = try await location.requestLocation()
            let result = try await DistrictLookup.district(for: coordinate)
            userData.save(place: .init(
                state: result.state, district: result.district, label: result.city
            ))
            isChangingPlace = false
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: Representatives

    func loadReps(for place: UserData.SavedPlace, force: Bool = false) async {
        guard force || place != loadedPlace else { return }
        isLoading = true
        error = nil
        defer { isLoading = false }
        loadedPlace = place

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

            let senators = roster.filter { $0.chamber == .senate }
                .sorted { $0.name < $1.name }
                .map { Rep(politician: $0, district: nil) }

            var houseMembers = roster.filter { $0.chamber == .house }
                .map { Rep(politician: $0, district: districtByID[$0.id] ?? $0.district) }

            // With a known district, narrow to the one member who holds it.
            // If we can't match (Congress.gov unreachable, or a vacant seat),
            // fall back to the full state delegation rather than showing none.
            if let district = place.district {
                let matches = houseMembers.filter { $0.district == district }
                if !matches.isEmpty { houseMembers = matches }
            }

            house = houseMembers.sorted {
                (Int($0.district ?? "") ?? .max, $0.politician.name)
                    < (Int($1.district ?? "") ?? .max, $1.politician.name)
            }
            senate = senators
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}
