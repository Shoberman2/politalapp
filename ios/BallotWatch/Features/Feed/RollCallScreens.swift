import SwiftUI

/// How every member voted on one roll call, grouped by position.
///
/// Both chambers are covered member-level, but a roll call we hold no votes for
/// can still come back empty — it says so rather than showing a blank list.
struct RollCallMembersScreen: View {
    let rollCallID: String
    var question: String?

    @StateObject private var model: RollCallMembersModel
    @Environment(\.theme) private var theme

    init(rollCallID: String, question: String? = nil) {
        self.rollCallID = rollCallID
        self.question = question
        _model = StateObject(wrappedValue: RollCallMembersModel(rollCallID: rollCallID))
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header

                switch model.state {
                case .loading:
                    LoadingView(label: "Loading votes")
                case .failed(let message):
                    ErrorStateView(message: message) { Task { await model.load() } }
                case .loaded where model.groups.isEmpty:
                    EmptyStateView(
                        title: "No member-level votes",
                        message: "We don't hold individual votes for this roll call yet.",
                        systemImage: "person.2.slash"
                    )
                default:
                    ForEach(model.groups, id: \.position) { group in
                        Section {
                            ForEach(group.members, id: \.politician.id) { entry in
                                NavigationLink {
                                    PoliticianDetailScreen(politician: entry.politician)
                                } label: {
                                    MemberRow(member: entry.politician)
                                }
                                .buttonStyle(.plain)
                                RuleLine()
                            }
                        } header: {
                            HStack {
                                PositionPill(position: group.position)
                                Text("\(group.members.count)")
                                    .font(Typo.monoSM)
                                    .foregroundStyle(theme.textMuted)
                                Spacer()
                            }
                            .padding(.vertical, Space.xs)
                            .padding(.horizontal, Space.md)
                            .background(theme.bg)
                        }
                    }
                }
            }
            .padding(.bottom, Space.xl)
        }
        .paperBackground()
        .navigationTitle(model.meta.map { "\($0.chamber.label) \($0.number)" } ?? "Roll call")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadIfNeeded() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            if let question {
                Text(question)
                    .font(Typo.h3)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if model.total > 0 {
                Text("\(model.total) members recorded")
                    .font(Typo.monoSM)
                    .foregroundStyle(theme.textMuted)
            }
            RuleLine(weight: .heavy)
        }
        .padding(.horizontal, Space.md)
        .padding(.top, Space.xs)
        .padding(.bottom, Space.sm)
    }
}

@MainActor
final class RollCallMembersModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    struct Entry { let politician: Politician; let position: VotePosition }
    struct Group { let position: VotePosition; let members: [Entry] }

    @Published private(set) var state: State = .idle
    @Published private(set) var groups: [Group] = []
    @Published private(set) var total = 0

    private let rollCallID: String
    var meta: RollCallMeta? { RollCallMeta(id: rollCallID) }

    init(rollCallID: String) { self.rollCallID = rollCallID }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        do {
            async let votesTask = BallotWatchAPI.votesForRollCall(rollCallID)
            async let rosterTask = BallotWatchAPI.allPoliticians()
            let votes = try await votesTask
            let roster = try await rosterTask
            let byID = Dictionary(roster.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

            let entries = votes.compactMap { vote -> Entry? in
                guard let politician = byID[vote.politicianID] else { return nil }
                return Entry(politician: politician, position: vote.position)
            }
            total = entries.count

            // Yea, Nay, then the quiet categories — the order a reader expects.
            groups = [VotePosition.yea, .nay, .present, .notVoting].compactMap { position in
                let members = entries.filter { $0.position == position }
                    .sorted { $0.politician.name < $1.politician.name }
                return members.isEmpty ? nil : Group(position: position, members: members)
            }
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }
}

// MARK: - Roll call without a bill

/// Nominations and procedural motions have no bill to link to, so they get
/// their own small page rather than a dead row in the feed.
struct RollCallDetailScreen: View {
    let vote: FloorVote
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                VStack(alignment: .leading, spacing: Space.xs) {
                    HStack(spacing: Space.xs) {
                        if let chamber = vote.chamber {
                            Kicker(chamber.label, color: theme.textSecondary)
                        }
                        if let number = vote.number { Kicker("Roll call \(number)") }
                        Spacer()
                        if let date = vote.date {
                            Text(DateParsing.medium(date))
                                .font(Typo.monoMicro)
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                    if let question = vote.question {
                        Text(question)
                            .font(Typo.h1)
                            .foregroundStyle(theme.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    RuleLine(weight: .heavy)
                }

                if let description = vote.description, !description.isEmpty {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        SectionHead(title: "What was voted on")
                        Text(description)
                            .font(Typo.body)
                            .foregroundStyle(theme.text)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                if let yea = vote.yea, let nay = vote.nay {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        SectionHead(title: "Result")
                        TallyBar(yea: yea, nay: nay)
                        if let result = vote.result {
                            Text(result)
                                .font(Typo.bodyMedium)
                                .foregroundStyle(theme.text)
                        }
                    }
                }

                NavigationLink {
                    RollCallMembersScreen(rollCallID: vote.id, question: vote.question)
                } label: {
                    Text("See how each member voted")
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(.horizontal, Space.md)
            .padding(.bottom, Space.xxl)
        }
        .paperBackground()
        .navigationTitle("Roll call")
        .navigationBarTitleDisplayMode(.inline)
    }
}
