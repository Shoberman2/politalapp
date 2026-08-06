import SwiftUI

/// Browse and search legislation — 180,000+ bills, so this one paginates and
/// searches server-side rather than filtering in memory the way Members does.
struct BillsScreen: View {
    @StateObject private var model = BillsModel()
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading where model.bills.isEmpty:
                    LoadingView(label: "Loading bills")
                case .failed(let message) where model.bills.isEmpty:
                    ErrorStateView(message: message) { Task { await model.reload() } }
                default:
                    list
                }
            }
            .paperBackground()
            .navigationTitle("Bills")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $model.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search bills, or try \"HR 1\""
            )
            .onSubmit(of: .search) { Task { await model.reload() } }
            .task { await model.loadIfNeeded() }
            .refreshable { await model.reload() }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                filters

                if !userData.watchedBills.isEmpty && model.query.isEmpty {
                    watchedStrip
                }

                if model.bills.isEmpty && model.state == .loaded {
                    EmptyStateView(
                        title: "No bills found",
                        message: "Try a different search, or clear the filters.",
                        systemImage: "doc.text.magnifyingglass"
                    )
                }

                ForEach(model.bills) { bill in
                    NavigationLink { BillDetailScreen(billID: bill.id) } label: {
                        BillRow(bill: bill)
                    }
                    .buttonStyle(.plain)
                    RuleLine()
                    // Pagination trigger: the last row asks for the next page
                    // as it comes into view.
                    .onAppear {
                        if bill.id == model.bills.last?.id { Task { await model.loadMore() } }
                    }
                }

                if model.isLoadingMore {
                    LoadingView(label: "Loading more")
                }
            }
            .padding(.horizontal, Space.md)
            .padding(.bottom, Space.xl)
        }
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.xs) {
                    FilterChip(label: "All types", isOn: model.billType == nil) {
                        model.billType = nil
                        Task { await model.reload() }
                    }
                    ForEach(BillsModel.types, id: \.code) { type in
                        FilterChip(label: type.label, isOn: model.billType == type.code) {
                            model.billType = model.billType == type.code ? nil : type.code
                            Task { await model.reload() }
                        }
                    }
                }
                .padding(.vertical, 1)
            }
            RuleLine()
        }
        .padding(.top, Space.xs)
        .padding(.bottom, Space.xxs)
    }

    private var watchedStrip: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            Text("Watching")
                .kickerStyle(theme.textMuted)
                .padding(.top, Space.sm)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.xs) {
                    ForEach(Array(userData.watchedBills).sorted(), id: \.self) { billID in
                        NavigationLink { BillDetailScreen(billID: billID) } label: {
                            Text(BillKey(id: billID)?.display ?? billID)
                                .font(Typo.monoMedium)
                                .foregroundStyle(theme.accent)
                                .padding(.horizontal, Space.sm)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: Radius.sm)
                                        .fill(theme.accentSubtle)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 1)
            }
            RuleLine()
        }
    }
}

// MARK: - Row

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
final class BillsModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    static let types: [(code: String, label: String)] = [
        ("hr", "H.R."), ("s", "S."),
        ("hres", "H.Res."), ("sres", "S.Res."),
        ("hjres", "H.J.Res."), ("sjres", "S.J.Res."),
    ]

    @Published private(set) var state: State = .idle
    @Published private(set) var bills: [Bill] = []
    @Published private(set) var isLoadingMore = false
    @Published var query = "" { didSet { scheduleSearch() } }
    @Published var billType: String?

    private let pageSize = 40
    private var offset = 0
    private var reachedEnd = false
    private var searchTask: Task<Void, Never>?

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await reload()
    }

    /// Debounced so typing doesn't fire a query per keystroke against a
    /// 180k-row table.
    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await reload()
        }
    }

    func reload() async {
        state = .loading
        offset = 0
        reachedEnd = false
        do {
            let results = try await fetch(offset: 0)
            bills = results
            offset = results.count
            reachedEnd = results.count < pageSize
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }

    func loadMore() async {
        guard !isLoadingMore, !reachedEnd, state == .loaded else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let results = try await fetch(offset: offset)
            // Dedupe defensively: introduced_at has ties, so a page boundary
            // can repeat a row.
            let existing = Set(bills.map(\.id))
            bills.append(contentsOf: results.filter { !existing.contains($0.id) })
            offset += results.count
            reachedEnd = results.count < pageSize
        } catch {
            reachedEnd = true
        }
    }

    private func fetch(offset: Int) async throws -> [Bill] {
        let trimmed = query.trimmed
        if trimmed.isEmpty && billType == nil {
            return try await BallotWatchAPI.recentBills(limit: pageSize, offset: offset)
        }
        return try await BallotWatchAPI.searchBills(
            query: trimmed.isEmpty ? nil : trimmed,
            billType: billType,
            limit: pageSize,
            offset: offset
        )
    }
}
