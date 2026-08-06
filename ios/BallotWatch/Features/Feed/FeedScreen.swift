import SwiftUI

/// The floor feed — what Congress actually voted on, most recent first.
///
/// This screen is deliberately conservative about what it asserts. Bill titles
/// in the table are often placeholder stubs, so rows lead with the bill number.
/// A tally appears only when it survives the sanity check in `FloorVotes`;
/// otherwise the row simply carries no count rather than a wrong one.
struct FeedScreen: View {
    @StateObject private var model = FeedModel()
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            Group {
                switch model.state {
                case .loading where model.votes.isEmpty:
                    LoadingView(label: "Reading the record")
                case .failed(let message) where model.votes.isEmpty:
                    ErrorStateView(message: message) { Task { await model.load() } }
                default:
                    content
                }
            }
            .paperBackground()
            .navigationTitle("Floor")
            .navigationBarTitleDisplayMode(.large)
            .task { await model.loadIfNeeded() }
            .refreshable { await model.load() }
        }
    }

    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header

                ForEach(model.votes) { vote in
                    FloorVoteRow(vote: vote)
                    RuleLine()
                }

                if model.votes.isEmpty {
                    EmptyStateView(
                        title: "No recorded votes yet",
                        message: "Roll calls appear here as soon as they're ingested.",
                        systemImage: "tray"
                    )
                }
            }
            .padding(.horizontal, Space.md)
            .padding(.bottom, Space.xl)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            Text("Every recorded roll call in the House and Senate, newest first.")
                .font(Typo.bodySM)
                .foregroundStyle(theme.textSecondary)
            RecordedThroughNote(date: model.recordedThrough)
        }
        .padding(.bottom, Space.md)
    }
}

// MARK: - Row

struct FloorVoteRow: View {
    let vote: FloorVote
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationLink {
            if let billID = vote.billID {
                BillDetailScreen(billID: billID, focusRollCallID: vote.id)
            } else {
                RollCallDetailScreen(vote: vote)
            }
        } label: {
            VStack(alignment: .leading, spacing: Space.xs) {
                HStack(spacing: Space.xs) {
                    if let chamber = vote.chamber {
                        Kicker(chamber.label, color: theme.textSecondary)
                    }
                    if let number = vote.number {
                        Kicker("Roll call \(number)")
                    }
                    Spacer()
                    if let date = vote.date {
                        Text(DateParsing.medium(date))
                            .font(Typo.monoMicro)
                            .foregroundStyle(theme.textMuted)
                    }
                }

                // Lead with the bill number: titles in the table are frequently
                // placeholder stubs that just repeat the number.
                if let billDisplay = vote.billDisplay {
                    Text(billDisplay)
                        .font(Typo.h2)
                        .foregroundStyle(theme.text)
                }

                if let question = vote.question, !question.isEmpty {
                    Text(question)
                        .font(vote.billDisplay == nil ? Typo.h3 : Typo.bodySM)
                        .foregroundStyle(vote.billDisplay == nil ? theme.text : theme.textSecondary)
                        .lineLimit(2)
                }

                if let description = vote.description, !description.isEmpty,
                   vote.billDisplay == nil || description.count > 40 {
                    Text(description)
                        .font(Typo.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(3)
                }

                if let yea = vote.yea, let nay = vote.nay {
                    TallyBar(yea: yea, nay: nay)
                        .padding(.top, 2)
                }

                if let result = vote.result {
                    Text(result)
                        .font(Typo.captionMedium)
                        .foregroundStyle(resultColor(result))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, Space.md)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func resultColor(_ result: String) -> Color {
        let r = result.lowercased()
        if r.contains("passed") || r.contains("agreed") || r.contains("invoked") || r.contains("confirmed") {
            return theme.success
        }
        if r.contains("failed") || r.contains("rejected") { return theme.error }
        return theme.textSecondary
    }
}

// MARK: - Model

@MainActor
final class FeedModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var votes: [FloorVote] = []
    @Published private(set) var recordedThrough: Date?

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        do {
            let feed = try await FloorVotes.recent(fetchCount: 24)
            votes = feed.votes
            recordedThrough = feed.recordedThrough
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }
}
