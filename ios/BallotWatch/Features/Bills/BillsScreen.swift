import SwiftUI

/// The Bills tab: every bill, searchable from the system search bar under
/// the large title, filtered by Congress and type, newest first. Rows and
/// data follow the website's /bills page (BillsPage.jsx).
struct BillsScreen: View {
    @StateObject private var model = BillsDeskModel()
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            Group {
                if model.isLoading {
                    ScrollView { BillsPageLoading(label: "Loading bills...") }
                } else if let error = model.error {
                    ScrollView {
                        BillsPageError(message: error, buttonTitle: "Try Again") {
                            Task { await model.fetchBills(reset: true) }
                        }
                    }
                } else {
                    desk
                }
            }
            .paperBackground()
            .searchable(
                text: $model.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Title, bill number or sponsor"
            )
            .tabRoot("Bills")
            .task { await model.loadIfNeeded() }
        }
    }

    private var desk: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                Section {
                    results
                } header: {
                    searchShell
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable { await model.refresh() }
    }

    // MARK: Search shell

    private var searchShell: some View {
        HStack(spacing: 10) {
            BillsSelectPill(
                accessibilityLabel: "Congress",
                options: BillsDeskModel.congressOptions,
                selection: $model.congress
            )
            BillsSelectPill(
                accessibilityLabel: "Bill type",
                options: BillsDeskModel.typeOptions,
                selection: $model.billType
            )
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.bg)
    }

    // MARK: Results

    @ViewBuilder
    private var results: some View {
        VStack(alignment: .leading, spacing: 0) {
            resultsBar
            let rows = model.displayedItems
            if rows.isEmpty {
                VStack(spacing: 18) {
                    Text("No bills found matching your criteria")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                    Button("Reset filters") { model.resetAll() }
                        .buttonStyle(SecondaryButtonStyle())
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
                .padding(.bottom, 80)
            } else {
                ForEach(rows) { item in
                    NavigationLink {
                        BillDetailScreen(billID: item.id)
                    } label: {
                        BillsDeskRow(item: item)
                    }
                    .buttonStyle(BillsRowButtonStyle())
                }
                if model.hasMore && !model.isSearchMode {
                    Button {
                        Task { await model.fetchBills(reset: false) }
                    } label: {
                        if model.isLoadingMore {
                            HStack(spacing: 8) {
                                BillsSmallSpinner(color: theme.accent)
                                Text("Loading...")
                            }
                        } else {
                            Text("Load more bills")
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(model.isLoadingMore)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
                    .padding(.bottom, 10)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 28)
    }

    private var resultsBar: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("A bill is a proposed law. Each one is explained in plain English.")
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                InfoTerm("bill")
            }
            Text(model.resultsCountText(theme: theme))
                .fixedSize(horizontal: false, vertical: true)
            Menu {
                Picker("Sort", selection: $model.sort) {
                    ForEach(BillsDeskModel.Sort.allCases, id: \.self) { sort in
                        Text(sort.label).tag(sort)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Text("SORT").foregroundStyle(theme.textMuted)
                    HStack(spacing: 4) {
                        Text(model.sort.label.uppercased())
                        Image(systemName: "chevron.down").font(.system(size: 8, weight: .semibold))
                    }
                    .foregroundStyle(theme.accent)
                }
                .font(Typo.mono(11))
                .webTracking(0.08, size: 11)
            }
            .accessibilityLabel("Sort")
            .accessibilityValue(model.sort.label)
        }
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Bill row (`.bill-row` at ≤560px)

/// One bill as the web's /bills list shows it, from either source.
struct BillsListItem: Identifiable, Hashable {
    let id: String
    let key: BillKey?
    let title: String
    let introducedAt: String?
    let latestActionText: String?
    let latestActionDate: String?
    let policyArea: String?
    let sponsorName: String?
    let sponsorParty: String?
    let sponsorState: String?

    var status: BillsStatus { BillsStatus(latestAction: latestActionText) }
    var chamber: Chamber? { key?.chamber }

    init(bill: Bill) {
        id = bill.id
        key = bill.key
        title = BillsFormat.displayTitle(bill.title, key: bill.key, policyArea: bill.policyArea)
        introducedAt = bill.introducedAt
        latestActionText = nil
        latestActionDate = nil
        policyArea = bill.policyArea
        sponsorName = bill.sponsorName
        sponsorParty = bill.sponsorParty
        sponsorState = bill.sponsorState
    }

    init?(live: BillsCongressGov.ListBill, sponsor: Bill?) {
        guard let id = live.id else { return nil }
        self.id = id
        key = BillKey(id: id)
        title = BillsFormat.displayTitle(live.title, key: key, latestAction: live.latestAction?.text)
        introducedAt = live.introducedDate
        latestActionText = live.latestAction?.text
        latestActionDate = live.latestAction?.actionDate
        policyArea = nil
        sponsorName = sponsor?.sponsorBioguideID == nil ? nil : sponsor?.sponsorName
        sponsorParty = sponsor?.sponsorBioguideID == nil ? nil : sponsor?.sponsorParty
        sponsorState = sponsor?.sponsorBioguideID == nil ? nil : sponsor?.sponsorState
    }
}

struct BillsDeskRow: View {
    let item: BillsListItem
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Rail
            VStack(alignment: .leading, spacing: 8) {
                Text(item.key?.display ?? item.id)
                    .font(Typo.mono(14, 600))
                    .foregroundStyle(theme.accent)
                if let policy = item.policyArea, !policy.isEmpty {
                    Text(policy.uppercased())
                        .font(Typo.mono(10.5))
                        .webTracking(0.04, size: 10.5)
                        .foregroundStyle(theme.textMuted)
                }
            }

            // Main
            VStack(alignment: .leading, spacing: 10) {
                Text(item.title)
                    .font(Typo.inter(18, 600, relativeTo: .headline))
                    .lineLimit(4)
                    .foregroundStyle(theme.text)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let sponsor = item.sponsorName, !sponsor.isEmpty {
                    byline(sponsor)
                }
                if let action = item.latestActionText, !action.isEmpty {
                    Text(action)
                        .font(Typo.inter(13.5))
                        .lineSpacing(BillsCSS.leading(13.5, 1.5))
                        .foregroundStyle(theme.textMuted)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }

            // Side, laid out as a row on phones
            HStack(alignment: .center, spacing: 14) {
                BillsRowStatus(status: item.status)
                if let date = item.latestActionDate, !BillsFormat.date(date).isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("LAST ACTION")
                            .font(Typo.mono(10.5))
                            .webTracking(0.04, size: 10.5)
                            .foregroundStyle(theme.textMuted)
                        Text(BillsFormat.date(date))
                            .font(Typo.mono(13, 600))
                            .foregroundStyle(theme.textSecondary)
                    }
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
        .padding(.bottom, 10)
        .contentShape(Rectangle())
    }

    private func byline(_ sponsor: String) -> some View {
        FlowLayout(spacing: 4, lineSpacing: 4) {
            Text("Sponsored by").foregroundStyle(theme.textSecondary)
            Text(sponsor).fontWeight(.semibold).foregroundStyle(theme.text)
                .font(Typo.inter(13.5, 600))
            if let letter = BillsParty.letter(item.sponsorParty) {
                let party = BillsParty.party(item.sponsorParty)
                Text(letter + (item.sponsorState.map { "-\($0)" } ?? ""))
                    .font(Typo.mono(11, 600))
                    .webTracking(0.04, size: 11)
                    .foregroundStyle(theme.party(party))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(theme.party(party), lineWidth: 1))
                    .padding(.horizontal, 2)
            }
            if let date = item.introducedAt, !BillsFormat.date(date).isEmpty {
                Text("/ introduced \(BillsFormat.date(date))").foregroundStyle(theme.textSecondary)
            }
        }
        .font(Typo.inter(13.5))
    }
}

/// `.bill-status`: mono pill outlined in its own color with a leading dot.
struct BillsRowStatus: View {
    let status: BillsStatus
    @Environment(\.theme) private var theme

    private var color: Color {
        switch status {
        case .law: return theme.success
        case .passedHouse, .passedSenate: return theme.info
        case .both: return theme.accent
        case .committee: return theme.warning
        case .introduced, .progress: return theme.textMuted
        }
    }

    var body: some View {
        HStack(spacing: 7) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(status.listLabel)
                .font(Typo.mono(11, 500))
                .webTracking(0.04, size: 11)
                .lineLimit(1)
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .overlay(Capsule().stroke(color, lineWidth: 1))
        .fixedSize()
    }
}

/// Row press state: the web's hover tint plus the 3px accent edge.
struct BillsRowButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .animation(Motion.micro, value: configuration.isPressed)
    }
}

// MARK: - Legacy row
//
// Still used by the member page's sponsored-bills list.

struct BillRow: View {
    let bill: Bill
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: Space.xxs) {
            HStack(spacing: Space.xs) {
                Text(bill.displayNumber)
                    .font(Typo.monoMedium)
                    .foregroundStyle(theme.accent)
                Spacer()
                if let date = bill.introducedDate {
                    Text(DateParsing.medium(date))
                        .font(Typo.monoMicro)
                        .foregroundStyle(theme.textMuted)
                }
            }

            // A placeholder title just repeats the bill number, which tells the
            // reader nothing — show the number alone in that case.
            if bill.hasRealTitle {
                Text(bill.title)
                    .font(Typo.bodyMedium)
                    .foregroundStyle(theme.text)
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: Space.xs) {
                if let area = bill.policyArea, !area.isEmpty {
                    Tag(text: area)
                }
                if let sponsorName = bill.sponsorName, !sponsorName.isEmpty {
                    Text(sponsorName)
                        .font(Typo.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(1)
                    if bill.sponsor != .unknown {
                        Text(bill.sponsor.letter)
                            .font(Typo.monoSM)
                            .foregroundStyle(theme.party(bill.sponsor))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Space.sm)
        .contentShape(Rectangle())
    }
}

// MARK: - Model

@MainActor
final class BillsDeskModel: ObservableObject {
    enum Sort: String, CaseIterable {
        case latest, cosponsors, introduced, number
        var label: String {
            switch self {
            case .latest: return "Latest action"
            case .cosponsors: return "Most cosponsors"
            case .introduced: return "Recently introduced"
            case .number: return "Bill number"
            }
        }
    }

    /// nil means "All Congresses Since 2001".
    static let congressOptions: [(value: Int?, label: String)] =
        (BillsFormat.congressMin...BillsFormat.congressMax).reversed().map { (Optional($0), BillsFormat.congressLabel($0)) }
        + [(nil, "All Congresses Since 2001")]

    static let typeOptions: [(value: String?, label: String)] = [
        (nil, "All bill types"),
        ("hr", "House Bills (H.R.)"),
        ("s", "Senate Bills (S.)"),
        ("hjres", "House Joint Resolutions"),
        ("sjres", "Senate Joint Resolutions"),
        ("hres", "House Resolutions"),
        ("sres", "Senate Resolutions"),
    ]

    private static let limit = 20
    private static let liveRetryCooldown: TimeInterval = 60

    @Published private(set) var items: [BillsListItem] = []
    @Published private(set) var isLoading = true
    @Published private(set) var isLoadingMore = false
    @Published private(set) var isSearching = false
    @Published private(set) var hasMore = true
    @Published private(set) var error: String?
    @Published var sort: Sort = .latest

    @Published var query = "" {
        didSet {
            guard query != oldValue else { return }
            let wasSearch = BillsDeskModel.isSearch(oldValue)
            if isSearchMode { scheduleSearch() }
            else if wasSearch { searchTask?.cancel(); isSearching = false; Task { await fetchBills(reset: true) } }
        }
    }
    @Published var congress: Int? = BillsFormat.congressMax {
        didSet { if congress != oldValue { filtersChanged() } }
    }
    @Published var billType: String? {
        didSet { if billType != oldValue { filtersChanged() } }
    }

    private var offset = 0
    private var liveListFailed = false
    private var liveFailedAt: Date?
    private var started = false
    private var searchTask: Task<Void, Never>?

    var isSearchMode: Bool { Self.isSearch(query) }
    private static func isSearch(_ q: String) -> Bool { q.trimmed.count >= 2 }

    var congressFilterLabel: String {
        congress.map(BillsFormat.congressLabel) ?? "All Congresses Since 2001"
    }

    private var usesArchiveBrowse: Bool {
        !isSearchMode && (congress == nil || (congress ?? 0) < BillsFormat.congressMax)
    }

    var displayedItems: [BillsListItem] {
        var list = items
        switch sort {
        case .latest:
            list.sort { (DateParsing.date(from: $0.latestActionDate) ?? .distantPast) > (DateParsing.date(from: $1.latestActionDate) ?? .distantPast) }
        case .cosponsors:
            break // The list endpoints carry no cosponsor counts; order is unchanged, as on the web.
        case .introduced:
            list.sort { (DateParsing.date(from: $0.introducedAt) ?? .distantPast) > (DateParsing.date(from: $1.introducedAt) ?? .distantPast) }
        case .number:
            list.sort { ($0.key?.number ?? 0) < ($1.key?.number ?? 0) }
        }
        return list
    }

    func loadIfNeeded() async {
        guard !started else { return }
        started = true
        await fetchBills(reset: true)
    }

    func refresh() async {
        if isSearchMode { await runSearch() } else { await fetchBills(reset: true) }
    }

    func resetAll() {
        query = ""
        congress = BillsFormat.congressMax
        billType = nil
    }

    private func filtersChanged() {
        if isSearchMode { scheduleSearch() } else { Task { await fetchBills(reset: true) } }
    }

    // MARK: Browse

    func fetchBills(reset: Bool) async {
        if reset {
            isLoading = true
            offset = 0
        } else {
            isLoadingMore = true
        }
        defer {
            isLoading = false
            isLoadingMore = false
        }

        let currentOffset = reset ? 0 : offset
        let congress = self.congress
        let billType = self.billType

        func browseDB() async throws -> [BillsListItem] {
            try await BallotWatchAPI.searchBills(
                query: nil, congress: congress, billType: billType,
                limit: Self.limit, offset: currentOffset
            ).map(BillsListItem.init(bill:))
        }

        do {
            var newItems: [BillsListItem]
            let coolingDown = liveFailedAt.map { Date().timeIntervalSince($0) < Self.liveRetryCooldown } ?? false
            if usesArchiveBrowse || (!reset && liveListFailed) || (reset && coolingDown) {
                newItems = try await browseDB()
            } else {
                do {
                    let live = try await BillsCongressGov.list(
                        congress: congress ?? BillsFormat.congressMax, type: billType,
                        limit: Self.limit, offset: currentOffset
                    )
                    // The list endpoint omits sponsors; one database read fills
                    // the bylines, as the web's enrichBillsWithSponsorsFromDb.
                    let ids = live.compactMap(\.id)
                    let rows = (try? await BallotWatchAPI.bills(ids: ids)) ?? []
                    let byID = Dictionary(rows.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
                    newItems = live.compactMap { bill in
                        BillsListItem(live: bill, sponsor: bill.id.flatMap { byID[$0] })
                    }
                    liveListFailed = false
                } catch {
                    // Congress.gov slow or down: the ETL keeps the current
                    // Congress in the database too, so show that copy.
                    liveFailedAt = Date()
                    newItems = try await browseDB()
                    liveListFailed = true
                }
            }

            // A stale response for filters that have since changed is dropped.
            guard congress == self.congress, billType == self.billType, !isSearchMode else { return }

            if reset {
                items = newItems
            } else {
                let existing = Set(items.map(\.id))
                items.append(contentsOf: newItems.filter { !existing.contains($0.id) })
            }
            hasMore = newItems.count == Self.limit
            offset = currentOffset + newItems.count
            error = nil
        } catch {
            self.error = "Failed to load bills: \((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)"
        }
    }

    // MARK: Search

    private func scheduleSearch() {
        searchTask?.cancel()
        isSearching = true
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await runSearch()
        }
    }

    private func runSearch() async {
        let term = query.trimmed
        let congress = self.congress
        let billType = self.billType
        isSearching = true
        do {
            let results = try await BallotWatchAPI.searchBills(
                query: term, congress: congress, billType: billType, limit: 100, offset: 0
            )
            guard term == query.trimmed, congress == self.congress, billType == self.billType else { return }
            items = results.map(BillsListItem.init(bill:))
            hasMore = false
            offset = results.count
            error = nil
        } catch is CancellationError {
            return
        } catch {
            if (error as? URLError)?.code == .cancelled { return }
            self.error = "Search failed: \((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)"
        }
        isSearching = false
    }

    // MARK: Results bar text

    func resultsCountText(theme: Theme) -> AttributedString {
        func plain(_ s: String, _ color: Color) -> AttributedString {
            var a = AttributedString(s)
            a.font = Typo.inter(14)
            a.foregroundColor = color
            return a
        }
        func bold(_ s: String) -> AttributedString {
            var a = AttributedString(s)
            a.font = Typo.mono(14, 600)
            a.foregroundColor = theme.text
            return a
        }
        var text = plain("Showing ", theme.textSecondary)
        text += bold(displayedItems.count.formatted())
        text += plain(" of ", theme.textSecondary)
        text += bold(items.count.formatted())
        text += plain(" loaded / ", theme.textSecondary)
        text += plain(congressFilterLabel, theme.textMuted)
        if !query.isEmpty { text += plain(" matching \"\(query)\"", theme.textMuted) }
        if isSearching { text += plain(" / searching...", theme.textMuted) }
        return text
    }
}
