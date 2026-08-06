import SwiftUI

/// The full roster of Congress — 535 voting members plus delegates.
///
/// Party is a small tag and a thin leading bar, never a card wash: the list
/// should read as a directory, not as two color-coded teams.
struct MembersScreen: View {
    @StateObject private var model = MembersModel()
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading where model.all.isEmpty:
                    LoadingView(label: "Loading the roster")
                case .failed(let message) where model.all.isEmpty:
                    ErrorStateView(message: message) { Task { await model.load() } }
                default:
                    list
                }
            }
            .paperBackground()
            .navigationTitle("Members")
            .navigationBarTitleDisplayMode(.large)
            .searchable(
                text: $model.query,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search by name or state"
            )
            .task { await model.loadIfNeeded() }
            .refreshable { await model.load() }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                filters

                if model.filtered.isEmpty {
                    EmptyStateView(
                        title: "No members found",
                        message: "Try a different name, state, or filter.",
                        systemImage: "person.slash"
                    )
                } else {
                    ForEach(model.filtered) { member in
                        NavigationLink {
                            PoliticianDetailScreen(politician: member)
                        } label: {
                            MemberRow(member: member)
                        }
                        .buttonStyle(.plain)
                        RuleLine()
                    }
                }
            }
            .padding(.bottom, Space.xl)
        }
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Space.xs) {
                    FilterChip(label: "All", isOn: model.chamber == nil) { model.chamber = nil }
                    FilterChip(label: "House", isOn: model.chamber == .house) { model.chamber = .house }
                    FilterChip(label: "Senate", isOn: model.chamber == .senate) { model.chamber = .senate }

                    Divider().frame(height: 20).padding(.horizontal, 2)

                    FilterChip(label: "Any party", isOn: model.party == nil) { model.party = nil }
                    ForEach([Party.democrat, .republican, .independent], id: \.self) { party in
                        FilterChip(
                            label: party.label,
                            isOn: model.party == party,
                            accent: theme.party(party)
                        ) { model.party = model.party == party ? nil : party }
                    }
                }
                .padding(.horizontal, Space.md)
            }

            HStack {
                Text("\(model.filtered.count) of \(model.all.count)")
                    .font(Typo.monoSM)
                    .foregroundStyle(theme.textMuted)
                Spacer()
            }
            .padding(.horizontal, Space.md)

            RuleLine()
        }
        .padding(.top, Space.xs)
        .padding(.bottom, Space.xxs)
    }
}

// MARK: - Row

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

// MARK: - Filter chip

struct FilterChip: View {
    let label: String
    let isOn: Bool
    var accent: Color?
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(Typo.captionMedium)
                .foregroundStyle(isOn ? (accent ?? theme.accent) : theme.textSecondary)
                .padding(.horizontal, Space.sm)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .fill(isOn ? (accent ?? theme.accent).opacity(0.10) : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.sm)
                        .stroke(isOn ? (accent ?? theme.accent).opacity(0.35) : theme.border, lineWidth: 0.75)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Model

@MainActor
final class MembersModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var all: [Politician] = []
    @Published var query = ""
    @Published var chamber: Chamber?
    @Published var party: Party?

    /// Filtering runs in memory: the roster is ~550 rows, fetched once, so a
    /// round trip per keystroke would be slower and no more correct.
    var filtered: [Politician] {
        var result = all
        if let chamber { result = result.filter { $0.chamber == chamber } }
        if let party { result = result.filter { $0.party == party } }

        let q = query.trimmed.lowercased()
        if !q.isEmpty {
            result = result.filter { member in
                if member.name.lowercased().contains(q) { return true }
                if member.state.lowercased() == q { return true }
                if USStates.name(for: member.state).lowercased().contains(q) { return true }
                // "Bera Ami" should find "Ami Bera" — match on any word order.
                let terms = q.split(separator: " ").map(String.init)
                let name = member.name.lowercased()
                return terms.count > 1 && terms.allSatisfy { name.contains($0) }
            }
        }
        return result
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        do {
            all = try await BallotWatchAPI.allPoliticians()
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }
}
