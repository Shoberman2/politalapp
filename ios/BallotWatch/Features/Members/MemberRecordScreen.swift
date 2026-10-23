import SwiftUI

/// "Record in 60 seconds" — the website's /politician/:id/record
/// (src/components/MemberRecord.jsx, src/styles/MemberRecord.css,
/// shared/memberRecord.js): identity, three counts, the ten most recent
/// recorded votes with their derived results, share links, and sources.
/// Every member gets the same template and the same facts.
struct MemberRecordScreen: View {
    let politician: Politician

    @StateObject private var model: MemberRecordModel
    @State private var copied: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    init(politician: Politician) {
        self.politician = politician
        _model = StateObject(wrappedValue: MemberRecordModel(politician: politician))
    }

    private var recordURL: URL {
        URL(string: "https://www.ballotwatch.io/politician/\(politician.id.uppercased())/record")!
    }

    private var shareTitle: String { "\(politician.name)'s record in 60 seconds" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                switch model.state {
                case .idle, .loading:
                    MembersLoading(text: "Loading the record")
                case .failed:
                    VStack(alignment: .leading, spacing: 8) {
                        Text("The record could not be loaded")
                            .font(Typo.inter(28, 600))
                            .foregroundStyle(theme.text)
                        Text("Please try again in a moment.")
                            .font(Typo.inter(14))
                            .foregroundStyle(theme.textSecondary)
                        Button("Try again") { Task { await model.load() } }
                            .buttonStyle(MembersTextButtonStyle())
                    }
                case .loaded:
                    head
                    facts
                    votes
                    actions
                    share
                    colophon
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 64)
        }
        .background(theme.bg.ignoresSafeArea())
        .navigationTitle("Record in 60 seconds")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadIfNeeded() }
    }

    // MARK: Head

    private var head: some View {
        HStack(alignment: .top, spacing: 16) {
            MembersPortrait(
                bioguideID: politician.id, name: politician.name,
                aspect: 72.0 / 88.0, cornerRadius: 8, monogramSize: 32, grayscale: 0, congressFirst: true
            )
            .frame(width: 72, height: 88)

            VStack(alignment: .leading, spacing: 0) {
                Text(("Record in 60 seconds" + (model.congress.map { " · \(MembersCongress.ordinal($0)) Congress" } ?? "")).uppercased())
                    .font(Typo.mono(11))
                    .tracking(11 * 0.12)
                    .foregroundStyle(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 8)
                Text(politician.name)
                    .font(Typo.inter(28, 600, relativeTo: .title))
                    .webTracking(-0.01, size: 28)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.bottom, 12)
                (Text("\u{2003}\u{2003}") + Text(model.seatLine))
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.textSecondary)
                    .membersLineHeight(1.5, size: 14)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .topLeading) {
                        Text(politician.party.letter)
                            .font(Typo.mono(11))
                            .tracking(11 * 0.08)
                            .foregroundStyle(theme.party(politician.party))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(theme.party(politician.party), lineWidth: 1))
                            .padding(.top, 1)
                    }
                if let since = model.servingSince, let congress = model.congress {
                    (Text("Serving in the \(MembersCongress.ordinal(congress)) Congress since ")
                        + Text(MembersFormat.longDate(since)).font(Typo.mono(12)).foregroundColor(theme.textSecondary))
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 8)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 24)
        .overlay(alignment: .bottom) { MembersRule() }
    }

    // MARK: Facts

    @ViewBuilder
    private var facts: some View {
        if let s = model.stats {
            HStack(alignment: .top, spacing: 12) {
                fact("Roll calls, \(MembersCongress.ordinal(s.congress)) Congress", value: "\(s.total)", sub: nil)
                fact("Votes cast", value: "\(s.cast)", sub: nil)
                fact("Not voting", value: "\(s.notVoting)", sub: "(\(s.notVotingPct)%)")
            }
            .padding(.vertical, 24)
            .overlay(alignment: .bottom) { MembersRule() }
        } else {
            Text("Vote totals for the current Congress are not available yet.")
                .font(Typo.inter(14))
                .foregroundStyle(theme.textSecondary)
                .padding(.vertical, 24)
        }
    }

    private func fact(_ label: String, value: String, sub: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(Typo.mono(10))
                .tracking(10 * 0.08)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            (Text(value).font(Typo.mono(22)).foregroundColor(theme.text)
                + Text(sub.map { " \($0)" } ?? "").font(Typo.inter(14)).foregroundColor(theme.textSecondary))
                .tabularFigures()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    // MARK: Votes table

    private var votes: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.votes.isEmpty
                 ? "RECORDED VOTES"
                 : "\(model.votes.count) MOST RECENT RECORDED VOTE\(model.votes.count == 1 ? "" : "S")")
                .font(Typo.mono(11))
                .tracking(11 * 0.12)
                .foregroundStyle(theme.textMuted)
                .padding(.bottom, 12)

            if model.votes.isEmpty {
                Text("No recorded votes for \(politician.name) in BallotWatch data yet. A member who took office recently may not have voted on a roll call yet.")
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                if model.votes.count < 10 {
                    Text("\(politician.name) has \(model.votes.count) recorded vote\(model.votes.count == 1 ? "" : "s") so far. All are shown.")
                        .font(Typo.inter(14))
                        .foregroundStyle(theme.textSecondary)
                        .padding(.bottom, 12)
                }
                Grid(alignment: .topLeading, horizontalSpacing: 12, verticalSpacing: 0) {
                    GridRow {
                        header("Date")
                        header("Question")
                        header("Vote")
                        header("Result")
                    }
                    .padding(.top, 12)
                    .padding(.bottom, 8)
                    MembersRule()

                    ForEach(model.votes) { row in
                        GridRow(alignment: .top) {
                            Text(MembersFormat.shortDate(row.date))
                                .font(Typo.mono(12))
                                .foregroundStyle(theme.textSecondary)
                                .fixedSize()
                            question(row)
                            Text(row.position.label)
                                .font(Typo.mono(12))
                                .tracking(12 * 0.04)
                                .foregroundStyle(positionColor(row.position))
                                .fixedSize()
                            Group {
                                if let result = row.result {
                                    Text(result.uppercased())
                                        .font(Typo.mono(12))
                                        .tracking(12 * 0.08)
                                        .foregroundStyle(MembersRollCallResult.passed(result) ? theme.success : theme.error)
                                } else {
                                    Text("Not derived")
                                        .font(Typo.mono(11))
                                        .foregroundStyle(theme.textMuted)
                                }
                            }
                            .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 8)
                        MembersRule(color: theme.borderSoft)
                    }
                }
                .overlay(alignment: .top) { MembersRule(color: theme.ruleStrong) }
            }
        }
        .padding(.vertical, 24)
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased())
            .font(Typo.mono(11, 500))
            .tracking(11 * 0.08)
            .foregroundStyle(theme.textMuted)
    }

    private func positionColor(_ p: VotePosition) -> Color {
        switch p {
        case .yea: return theme.success
        case .nay: return theme.error
        default: return theme.textMuted
        }
    }

    private func question(_ row: MemberRecordModel.Row) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let rollCallID = row.rollCallID {
                NavigationLink {
                    RollCallMembersScreen(rollCallID: rollCallID, question: row.question)
                } label: {
                    Text(row.question ?? "Recorded vote")
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.accent)
                        .multilineTextAlignment(.leading)
                }
                .buttonStyle(.plain)
            } else {
                Text(row.question ?? "Recorded vote").font(Typo.inter(13)).foregroundStyle(theme.text)
            }
            if let billID = row.billID, let key = BillKey(id: billID) {
                NavigationLink { BillDetailScreen(billID: billID) } label: {
                    Text(key.display)
                        .font(Typo.mono(12))
                        .foregroundStyle(theme.accent)
                }
                .buttonStyle(.plain)
            }
            if let title = row.billTitle {
                Text(title.count > 110 ? String(title.prefix(109)).trimmingCharacters(in: .whitespaces) + "…" : title)
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textSecondary)
                    .membersLineHeight(1.4, size: 13)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Actions and share

    private var actions: some View {
        FlowLayout(spacing: 12, lineSpacing: 8) {
            Button { dismiss() } label: { Text("Full record") }
                .buttonStyle(MembersTextButtonStyle(arrow: true))
            ShareLink(item: recordURL, subject: Text(shareTitle)) { Text("Share") }
                .buttonStyle(MembersTextButtonStyle())
            Button("Copy link") {
                UIPasteboard.general.url = recordURL
                copied = "Link copied"
                Task {
                    try? await Task.sleep(for: .seconds(2.5))
                    copied = nil
                }
            }
            .buttonStyle(MembersTextButtonStyle())
            if let copied {
                Text(copied)
                    .font(Typo.mono(12))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 24)
    }

    private var share: some View {
        let url = recordURL.absoluteString
        let enc = { (s: String) in s.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? s }
        let links: [(String, String)] = [
            ("X", "https://x.com/intent/tweet?text=\(enc(shareTitle))&url=\(enc(url))"),
            ("Bluesky", "https://bsky.app/intent/compose?text=\(enc("\(shareTitle) \(url)"))"),
            ("Facebook", "https://www.facebook.com/sharer/sharer.php?u=\(enc(url))"),
            ("Email", "mailto:?subject=\(enc(shareTitle))&body=\(enc(url))"),
        ]
        return FlowLayout(spacing: 12, lineSpacing: 8) {
            Text("SHARE ON")
                .font(Typo.mono(11))
                .tracking(11 * 0.08)
                .foregroundStyle(theme.textMuted)
            ForEach(links, id: \.0) { link in
                if let dest = URL(string: link.1) {
                    Link(link.0, destination: dest)
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.accent)
                        .padding(.trailing, 4)
                }
            }
        }
        .padding(.top, -8)
        .padding(.bottom, 24)
    }

    private var colophon: some View {
        let chamberVotes = politician.chamber == .senate
            ? ("Senate.gov roll call votes", "https://www.senate.gov/legislative/votes_new.htm")
            : ("House Clerk roll call votes", "https://clerk.house.gov/Votes")
        let id = politician.id.uppercased()
        return VStack(alignment: .leading, spacing: 8) {
            Text("Every member's card uses this same template and the same facts. The votes listed are the 10 most recent on record, not a selection. Results are derived from the official tally and the question.")
            FlowLayout(spacing: 0, lineSpacing: 4) {
                Text((model.updatedAt.map { "Data recorded through \(MembersFormat.longDate($0)). " } ?? "") + "Sources: ")
                sourceLink("Congress.gov", "https://www.congress.gov/member/\(id)")
                Text(" · ")
                sourceLink("Bioguide", "https://bioguide.congress.gov/search/bio/\(id)")
                Text(" · ")
                sourceLink(chamberVotes.0, chamberVotes.1)
                Text(" · ")
                sourceLink("Methodology", "https://www.ballotwatch.io/methodology")
            }
        }
        .font(Typo.inter(13))
        .foregroundStyle(theme.textMuted)
        .membersLineHeight(1.6, size: 13)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.top, 16)
        .overlay(alignment: .top) { MembersRule() }
    }

    private func sourceLink(_ title: String, _ url: String) -> some View {
        Link(destination: URL(string: url)!) {
            Text(title).underline().foregroundStyle(theme.textSecondary)
        }
    }
}

// MARK: - Model

@MainActor
final class MemberRecordModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed }

    struct Stats {
        let congress: Int
        let total: Int
        let cast: Int
        let notVoting: Int
        let notVotingPct: Double
    }

    struct Row: Identifiable {
        let id: String
        let rollCallID: String?
        let date: Date?
        let question: String?
        let billID: String?
        let billTitle: String?
        let position: VotePosition
        let result: String?
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var stats: Stats?
    @Published private(set) var votes: [Row] = []
    @Published private(set) var congress: Int?
    @Published private(set) var servingSince: Date?
    @Published private(set) var district: Int?
    @Published private(set) var updatedAt: Date?

    private let politician: Politician

    init(politician: Politician) {
        self.politician = politician
    }

    /// "Representative · New York district 14 · House", split into words so
    /// the line wraps like inline text.
    var seatLine: String { seatWords.joined(separator: " ") }

    var seatWords: [String] {
        let title: String = {
            if politician.chamber == .senate { return "Senator" }
            if politician.state.uppercased() == "PR" { return "Resident Commissioner" }
            return MembersSeats.nonVoting.contains(politician.state.uppercased()) ? "Delegate" : "Representative"
        }()
        var line = "\(title) · \(USStates.name(for: politician.state))"
        if let district, politician.chamber == .house { line += " district \(district)" }
        line += " · \(politician.chamber == .senate ? "Senate" : "House")"
        return line.split(separator: " ").map(String.init)
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        async let statsTask = try? BallotWatchAPI.memberStats(politicianID: politician.id)
        async let termsTask = try? MembersCongressTerm.all(bioguideID: politician.id)
        async let updatedTask = try? BallotWatchAPI.lastETLRun()
        let recent: [BallotWatchAPI.VoteWithBill]
        do {
            recent = try await BallotWatchAPI.memberVotes(politicianID: politician.id, limit: 10)
        } catch {
            state = .failed
            return
        }

        let ids = recent.compactMap(\.rollCallID)
        async let callsTask = try? BallotWatchAPI.rollCalls(ids: ids)
        async let callStatsTask = try? BallotWatchAPI.rollCallStats(ids: ids)
        let calls = Dictionary((await callsTask ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let callStats = Dictionary((await callStatsTask ?? []).map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a })

        votes = recent.filter { $0.rollCallID != nil }.prefix(10).map { v in
            let call = v.rollCallID.flatMap { calls[$0] }
            let meta = v.rollCallID.flatMap(RollCallMeta.init(id:))
            var result: String?
            if let s = v.rollCallID.flatMap({ callStats[$0] }), let meta {
                let yea = s.totalYea, nay = s.totalNay
                if yea + nay > 0 && yea + nay <= meta.chamber.size {
                    result = MembersRollCallResult.derive(
                        question: call?.question, description: call?.description,
                        yea: yea, nay: nay, chamber: meta.chamber
                    )
                }
            }
            let billID = v.billID ?? v.bill?.id ?? call?.billID
            let rawTitle = v.bill?.title
            let realTitle = BillKey.isRealTitle(rawTitle, for: billID.flatMap(BillKey.init(id:))) ? rawTitle : nil
            return Row(
                id: v.id, rollCallID: v.rollCallID, date: v.date, question: call?.question,
                billID: billID, billTitle: realTitle, position: v.position, result: result
            )
        }

        if let s = await statsTask, let total = s.totalVotes, total > 0 {
            let notVoting = s.notVotingCount ?? 0
            stats = Stats(
                congress: s.congress ?? MembersCongress.current,
                total: total,
                cast: (s.yeaCount ?? 0) + (s.nayCount ?? 0) + (s.presentCount ?? 0),
                notVoting: notVoting,
                notVotingPct: (Double(notVoting) / Double(total) * 1000).rounded() / 10
            )
        }

        let terms = await termsTask ?? []
        let current = terms.sorted {
            ($0.congress ?? 0, $0.termStart ?? "") > ($1.congress ?? 0, $1.termStart ?? "")
        }
        let term = current.first { $0.termEnd == nil } ?? current.first
        congress = stats?.congress ?? term?.congress
        servingSince = DateParsing.date(from: term?.termStart)
        if politician.chamber == .house,
           let d = term?.district ?? politician.district, let n = Int(d), n > 0,
           !MembersSeats.atLarge.contains(politician.state.uppercased()),
           !MembersSeats.nonVoting.contains(politician.state.uppercased()) {
            district = n
        }
        updatedAt = await updatedTask ?? nil
        state = .loaded
    }
}
