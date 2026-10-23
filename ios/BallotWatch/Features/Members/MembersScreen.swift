import SwiftUI

/// The Members tab: everyone in Congress, searchable from the system search
/// bar, with the House and Senate party balance on top, filters, quick
/// chips, and member cards 24 at a time. Data follows the website's
/// /members directory (AllPoliticians.jsx).
struct MembersScreen: View {
    @StateObject private var model = MembersModel()
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading where model.all.isEmpty, .idle:
                    loading
                case .failed(let message) where model.all.isEmpty:
                    ErrorStateView(message: message) { Task { await model.load() } }
                default:
                    register
                }
            }
            .background(theme.bg.ignoresSafeArea())
            .searchable(
                text: $model.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search members by name"
            )
            .tabRoot("Members")
            .task { await model.loadIfNeeded() }
        }
    }

    // Web `.all-politicians-loading`.
    private var loading: some View {
        VStack(spacing: 16) {
            ProgressView().tint(theme.accent).scaleEffect(1.1)
            Text("LOADING THE CURRENT CONGRESSIONAL ROSTER…")
                .font(Typo.mono(12))
                .tracking(12 * 0.08)
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
    }

    private var register: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                pageMasthead
                Section {
                    toolbar
                    grid
                } header: {
                    searchShell
                }
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .refreshable { await model.load() }
    }

    // MARK: Page masthead

    private var pageMasthead: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(model.all.count) members and delegates in the \(MembersCongress.ordinal(MembersCongress.current)) Congress. The bars show how many seats each party holds.")
                .font(Typo.inter(15))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 24) {
                CompositionBlock(
                    name: "House", total: 435, majority: 218,
                    counts: model.composition.house,
                    note: "\(model.composition.delegates) non-voting delegate\(model.composition.delegates == 1 ? "" : "s") listed in roster"
                )
                CompositionBlock(
                    name: "Senate", total: 100, majority: 51,
                    counts: model.composition.senate, note: nil
                )
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .padding(.top, 16)
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Search shell (sticky)

    private var searchShell: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterSelect(
                    label: "Chamber",
                    value: model.chamberFilter.map { $0 == .house ? "House of Representatives" : "Senate" } ?? "All chambers",
                    options: [("All chambers", nil), ("House of Representatives", "house"), ("Senate", "senate")]
                ) { model.chamberFilter = $0.flatMap(Chamber.init(rawValue:)) }
                FilterSelect(
                    label: "Party",
                    value: model.partyFilter.map { $0 == .democrat ? "Democrat" : $0 == .republican ? "Republican" : "Independent" } ?? "All parties",
                    options: [("All parties", nil), ("Democrat", "democrat"), ("Republican", "republican"), ("Independent", "independent")]
                ) { model.partyFilter = $0.flatMap(Party.init(rawValue:)) }
                FilterSelect(
                    label: "State",
                    value: model.stateFilter ?? "All states",
                    options: [("All states", nil)] + model.states.map { ($0, $0) }
                ) { model.stateFilter = $0 }
            }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.bg)
    }

    // MARK: Toolbar

    private var toolbar: some View {
        VStack(alignment: .leading, spacing: 12) {
            (Text("Showing ")
                + Text("\(model.visible.count)").font(Typo.mono(14)).foregroundColor(theme.text)
                + Text(" of ")
                + Text("\(model.filtered.count)").font(Typo.mono(14)).foregroundColor(theme.text)
                + Text(" members and delegates / sorted by surname"))
                .font(Typo.inter(14))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 2) {
                ForEach(MembersModel.Chip.allCases, id: \.self) { chip in
                    Button(chip.label) { model.chip = chip }
                        .buttonStyle(ToggleButtonStyle(isSelected: model.chip == chip))
                        .accessibilityAddTraits(model.chip == chip ? .isSelected : [])
                }
            }
        }
        .padding(.bottom, 12)
        .padding(.top, 8)
        .padding(.horizontal, 16)
    }

    // MARK: Grid

    @ViewBuilder
    private var grid: some View {
        if model.filtered.isEmpty {
            Text("No members found matching your criteria")
                .font(Typo.inter(16))
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 32)
                .padding(.top, 60)
                .padding(.bottom, 100)
        } else {
            ForEach(model.visible) { member in
                MemberCard(member: member, district: model.district(for: member))
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            }

            if model.hasMore {
                Button("Load more members") { model.showMore() }
                    .buttonStyle(SecondaryButtonStyle())
                    .frame(maxWidth: .infinity)
                    .padding(.top, 52)
                    .padding(.bottom, 80)
            } else {
                Color.clear.frame(height: 52)
            }
        }
    }
}

// MARK: - Composition block

/// Web `CompositionBlock`: chamber name and seat math, the party bar sized by
/// seats, and the legend.
private struct CompositionBlock: View {
    let name: String
    let total: Int
    let majority: Int
    let counts: MembersModel.Counts
    let note: String?
    @Environment(\.theme) private var theme

    private struct Segment: Identifiable {
        let key: String
        let label: String
        let n: Int
        var id: String { key }
    }

    private var segments: [Segment] {
        [
            Segment(key: "r", label: "Republican", n: counts.r),
            Segment(key: "d", label: "Democrat", n: counts.d),
            Segment(key: "i", label: "Independent", n: counts.i),
            Segment(key: "v", label: "Vacant", n: counts.vacant),
        ].filter { $0.n > 0 }
    }

    private func color(_ key: String) -> Color {
        switch key {
        case "d": return theme.party(.democrat)
        case "r": return theme.party(.republican)
        case "i": return theme.party(.independent)
        default: return theme.textMuted
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 14) {
                Text(name.uppercased())
                    .font(Typo.mono(12, 600))
                    .tracking(12 * 0.1)
                    .foregroundStyle(theme.text)
                Spacer(minLength: 0)
                Text("\(total) voting seats / majority \(majority)")
                    .font(Typo.mono(11))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
            }
            .padding(.bottom, 12)

            GeometryReader { geo in
                let sum = max(segments.reduce(0) { $0 + $1.n }, 1)
                HStack(spacing: 0) {
                    ForEach(Array(segments.enumerated()), id: \.element.id) { index, seg in
                        ZStack {
                            if seg.key == "v" {
                                theme.bgTint
                            } else {
                                // color-mix(party 14%, surface)
                                theme.surface.overlay(color(seg.key).opacity(0.14))
                            }
                            if seg.key != "v" {
                                Text("\(seg.n) \(seg.key.uppercased())")
                                    .font(Typo.mono(11, 600))
                                    .foregroundStyle(color(seg.key))
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                            }
                        }
                        .frame(width: geo.size.width * CGFloat(seg.n) / CGFloat(sum))
                        .overlay(alignment: .trailing) {
                            if index < segments.count - 1 {
                                Rectangle().fill(theme.ruleStrong.opacity(0.36)).frame(width: 1)
                            }
                        }
                    }
                }
            }
            .frame(height: 26)
            .background(theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(theme.ruleStrong, lineWidth: 1))

            FlowLayout(spacing: 18, lineSpacing: 8) {
                ForEach(segments) { seg in
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(seg.key == "v" ? theme.bgTint : color(seg.key).opacity(0.12))
                            .overlay(RoundedRectangle(cornerRadius: 2).stroke(color(seg.key), lineWidth: 1))
                            .frame(width: 9, height: 9)
                        Text("\(seg.label) \(seg.n)")
                    }
                }
                if let note { Text(note) }
            }
            .font(Typo.mono(11))
            .tracking(11 * 0.03)
            .foregroundStyle(theme.textSecondary)
            .padding(.top, 10)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Filter select

/// Web `.filter-pill` <select>: mono 12px on --bg, 46pt tall, a chevron at
/// the right, a 1px --rule border.
private struct FilterSelect: View {
    let label: String
    let value: String
    let options: [(String, String?)]
    let onSelect: (String?) -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Menu {
            ForEach(options, id: \.0) { option in
                Button(option.0) { onSelect(option.1) }
            }
        } label: {
            HStack(spacing: 8) {
                Text(value)
                    .font(Typo.inter(14, 500))
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.leading, 14)
            .padding(.trailing, 12)
            .frame(height: 36)
            .background(Capsule().fill(theme.surface))
            .overlay(Capsule().stroke(theme.border, lineWidth: 0.5))
        }
        .accessibilityLabel("\(label): \(value)")
    }
}

// MARK: - Member card

/// Web `.member-card`: a 3px party bar across the top, a square portrait
/// (grayscale 0.45), then role, name, leadership title, the seat and party
/// tag, and the "Record in 60 seconds" link.
private struct MemberCard: View {
    let member: Politician
    let district: Int?
    @Environment(\.theme) private var theme

    private var location: String {
        if member.chamber == .senate { return USStates.name(for: member.state) }
        if let district, district > 0 { return "\(member.state)-\(district)" }
        return member.state
    }

    var body: some View {
        NavigationLink {
            PoliticianDetailScreen(politician: member)
        } label: {
            HStack(spacing: 14) {
                MemberPhoto(bioguideID: member.id, name: member.name, size: 52)
                VStack(alignment: .leading, spacing: 3) {
                    Text(member.name)
                        .font(Typo.inter(16, 600))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    Text("\(MembersSeats.role(member)) · \(location)")
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                    if let title = MembersLeadership.titles[member.id] {
                        Text(title)
                            .font(Typo.inter(12, 500))
                            .foregroundStyle(theme.accent)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                PartyTag(party: member.party)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Opens the member profile")
    }
}

// MARK: - Row (shared)

/// Compact member row used by other screens (My Rep, bill sponsor, roll-call
/// lists).
struct MemberRow: View {
    let member: Politician
    var districtOverride: String?
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 0) {
            PartyBar(party: member.party)
            HStack(spacing: Space.sm) {
                MemberPhoto(bioguideID: member.id, name: member.name, size: 46)

                VStack(alignment: .leading, spacing: 3) {
                    Text(member.name)
                        .font(Typo.headline)
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                    HStack(spacing: Space.xs) {
                        Text(member.chamber.memberTitle)
                            .font(Typo.caption)
                            .foregroundStyle(theme.textSecondary)
                        PartyTag(
                            party: member.party,
                            seat: member.seatLabel(districtOverride: districtOverride)
                        )
                    }
                }

                Spacer(minLength: Space.xs)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(theme.textMuted.opacity(0.6))
            }
            .padding(.leading, Space.sm)
            .padding(.trailing, Space.md)
            .padding(.vertical, Space.sm)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - Filter chip (shared)

/// Web `.btn-toggle` as a chip; used by the Bills screen.
struct FilterChip: View {
    let label: String
    let isOn: Bool
    var accent: Color?
    let action: () -> Void

    var body: some View {
        Button(label, action: action)
            .buttonStyle(ToggleButtonStyle(isSelected: isOn))
            .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

// MARK: - Model

@MainActor
final class MembersModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    enum Chip: CaseIterable {
        case all, leadership, house, senate
        var label: String {
            switch self {
            case .all: return "All"
            case .leadership: return "Leadership"
            case .house: return "House"
            case .senate: return "Senate"
            }
        }
    }

    struct Counts: Equatable { var r = 0, d = 0, i = 0, vacant = 0 }
    struct Composition: Equatable {
        var house = Counts()
        var senate = Counts()
        var delegates = 0
    }

    static let pageSize = 24

    @Published private(set) var state: State = .idle
    @Published private(set) var roster: [Politician] = []
    @Published private(set) var enrichment: [String: MembersRosterEnrichment.Entry] = [:]
    @Published var query = "" { didSet { visibleCount = Self.pageSize } }
    @Published var chamberFilter: Chamber? { didSet { visibleCount = Self.pageSize } }
    @Published var partyFilter: Party? { didSet { visibleCount = Self.pageSize } }
    @Published var stateFilter: String? { didSet { visibleCount = Self.pageSize } }
    @Published var chip: Chip = .all { didSet { visibleCount = Self.pageSize } }
    @Published private(set) var visibleCount = MembersModel.pageSize

    /// The web lists Congress.gov's current members; once that list is in,
    /// the Supabase roster is narrowed to it so former members and
    /// mid-Congress departures don't inflate the seat counts.
    var all: [Politician] {
        guard enrichment.count > 400 else { return roster }
        return roster.filter { enrichment[$0.id] != nil }
    }

    var states: [String] { Array(Set(all.map(\.state))).sorted() }

    func district(for member: Politician) -> Int? {
        if let d = enrichment[member.id]?.district { return d }
        return member.district.flatMap(Int.init)
    }

    /// Web `getRosterComposition`: voting seats only; delegates counted apart.
    var composition: Composition {
        var c = Composition()
        for m in all {
            switch (m.chamber, MembersSeats.isDelegate(m), m.party) {
            case (_, _, .unknown): continue
            case (.senate, _, let p): Self.add(p, to: &c.senate)
            case (.house, true, _): c.delegates += 1
            case (.house, false, let p): Self.add(p, to: &c.house)
            }
        }
        c.house.vacant = max(0, 435 - (c.house.r + c.house.d + c.house.i))
        c.senate.vacant = max(0, 100 - (c.senate.r + c.senate.d + c.senate.i))
        return c
    }

    private static func add(_ party: Party, to counts: inout Counts) {
        switch party {
        case .democrat: counts.d += 1
        case .republican: counts.r += 1
        case .independent: counts.i += 1
        case .unknown: break
        }
    }

    /// Surname order, as the web sorts Congress.gov's "Last, First" names.
    private func sortKey(_ m: Politician) -> String {
        if let name = enrichment[m.id]?.sortName, !name.isEmpty { return name.lowercased() }
        let suffixes: Set<String> = ["jr.", "jr", "sr.", "sr", "ii", "iii", "iv"]
        let parts = m.name.split(separator: " ").map(String.init)
        let core = parts.last.map { suffixes.contains($0.lowercased()) } == true ? parts.dropLast() : parts[...]
        let last = core.last ?? m.name
        return "\(last), \(core.dropLast().joined(separator: " "))".lowercased()
    }

    var filtered: [Politician] {
        var result = all
        let q = query.trimmed.lowercased()
        if !q.isEmpty {
            let terms = q.split(separator: " ").map(String.init)
            result = result.filter { member in
                let name = member.name.lowercased()
                return name.contains(q) || terms.allSatisfy { name.contains($0) }
            }
        }
        if let chamberFilter { result = result.filter { $0.chamber == chamberFilter } }
        if let partyFilter { result = result.filter { $0.party == partyFilter } }
        if let stateFilter { result = result.filter { $0.state == stateFilter } }
        switch chip {
        case .all: break
        case .house: result = result.filter { $0.chamber != .senate }
        case .senate: result = result.filter { $0.chamber == .senate }
        case .leadership: result = result.filter { MembersLeadership.titles[$0.id] != nil }
        }
        return result.sorted { sortKey($0) < sortKey($1) }
    }

    var visible: [Politician] { Array(filtered.prefix(visibleCount)) }
    var hasMore: Bool { visibleCount < filtered.count }

    func showMore() { visibleCount += Self.pageSize }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        async let enrichmentTask = MembersRosterEnrichment.fetch()
        do {
            roster = try await BallotWatchAPI.allPoliticians()
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
        let extra = await enrichmentTask
        if !extra.isEmpty { enrichment = extra }
    }
}
