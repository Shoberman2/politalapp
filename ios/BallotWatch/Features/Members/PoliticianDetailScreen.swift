import SwiftUI

/// A member's profile.
///
/// Laid out as an article, not a dashboard (DESIGN.md § Layout): masthead,
/// then the record, then the analysis, then the votes themselves — top to
/// bottom, with thin rules between sections rather than a grid of widgets.
struct PoliticianDetailScreen: View {
    let politician: Politician

    @StateObject private var model: PoliticianDetailModel
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    init(politician: Politician) {
        self.politician = politician
        _model = StateObject(wrappedValue: PoliticianDetailModel(politician: politician))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                masthead

                if case .failed(let message) = model.state, model.votes.isEmpty {
                    ErrorStateView(message: message) { Task { await model.load() } }
                } else {
                    recordSection
                    if model.crossover.substantiveCount > 0 { crossoverSection }
                    if !model.policyBreakdown.isEmpty { policySection }
                    if !model.notable.isEmpty { notableSection }
                    if !model.sponsored.isEmpty { sponsoredSection }
                    votesSection
                }

                if model.state == .loading && model.votes.isEmpty {
                    LoadingView(label: "Loading the record")
                }
            }
            .padding(.horizontal, Space.md)
            .padding(.bottom, Space.xxl)
        }
        .paperBackground()
        .navigationTitle(politician.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    userData.toggleFollow(memberID: politician.id)
                } label: {
                    Image(systemName: userData.isFollowing(memberID: politician.id) ? "star.fill" : "star")
                        .foregroundStyle(userData.isFollowing(memberID: politician.id) ? theme.warning : theme.textSecondary)
                }
                .accessibilityLabel(
                    userData.isFollowing(memberID: politician.id) ? "Unfollow member" : "Follow member"
                )
            }
        }
        .task { await model.loadIfNeeded() }
    }

    // MARK: Masthead

    private var masthead: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            HStack(alignment: .top, spacing: Space.md) {
                MemberPhoto(bioguideID: politician.id, name: politician.name, size: 84)

                VStack(alignment: .leading, spacing: Space.xxs) {
                    Kicker(politician.chamber.memberTitle)
                    Text(politician.name)
                        .font(Typo.display)
                        .foregroundStyle(theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: Space.xs) {
                        PartyTag(
                            party: politician.party,
                            seat: politician.seatLabel(districtOverride: model.district)
                        )
                        if let since = model.servingSince {
                            Text("Since \(String(since))")
                                .font(Typo.monoSM)
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            Text(USStates.name(for: politician.state))
                .font(Typo.bodySM)
                .foregroundStyle(theme.textSecondary)
            RuleLine(weight: .heavy)
        }
        .padding(.top, Space.xs)
    }

    // MARK: Record

    private var recordSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "The record", trailing: model.stats?.congress.map { "\($0)th Congress" })

            if let stats = model.stats {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: Space.sm) {
                    // total_votes counts every roll call the member was
                    // eligible for, including the ones they missed — so this
                    // is "roll calls", not "votes cast".
                    StatTile(value: "\(stats.totalVotes ?? 0)", label: "Roll calls")
                    if let participation = stats.participationPct {
                        StatTile(value: "\(Int(participation.rounded()))%", label: "Participation")
                    }
                    StatTile(value: "\(stats.yeaCount ?? 0)", label: "Yea", color: theme.success)
                    StatTile(value: "\(stats.nayCount ?? 0)", label: "Nay", color: theme.error)
                    if let missed = stats.notVotingCount, missed > 0 {
                        StatTile(value: "\(missed)", label: "Missed", color: theme.warning)
                    }
                    if let loyalty = stats.partyLoyaltyPct {
                        StatTile(value: "\(Int(loyalty.rounded()))%", label: "Party loyalty")
                    }
                }
            } else if model.state == .loaded {
                Text("No vote statistics recorded for this member yet.")
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textMuted)
            }
        }
    }

    // MARK: Crossover

    private var crossoverSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Independence")

            Card {
                VStack(alignment: .leading, spacing: Space.xs) {
                    HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
                        Text("\(model.crossover.rate)%")
                            .font(Typo.monoLarge)
                            .foregroundStyle(theme.text)
                        Text("of votes broke with the party majority")
                            .font(Typo.bodySM)
                            .foregroundStyle(theme.textSecondary)
                    }

                    Text("\(model.crossover.count) of \(model.crossover.substantiveCount) recorded Yea/Nay votes where we hold a party breakdown.")
                        .font(Typo.caption)
                        .foregroundStyle(theme.textMuted)

                    if !model.crossover.topPolicyAreas.isEmpty {
                        RuleLine().padding(.vertical, Space.xxs)
                        Text("Most often on")
                            .font(Typo.micro)
                            .foregroundStyle(theme.textMuted)
                        ForEach(model.crossover.topPolicyAreas) { area in
                            HStack {
                                Text(area.area)
                                    .font(Typo.bodySM)
                                    .foregroundStyle(theme.text)
                                Spacer()
                                Text("\(area.crossCount)/\(area.total)")
                                    .font(Typo.monoSM)
                                    .foregroundStyle(theme.textSecondary)
                            }
                        }
                    }
                }
            }

            Text("Independents who caucus with a party are measured against that caucus.")
                .font(Typo.micro)
                .foregroundStyle(theme.textMuted)
        }
    }

    // MARK: Policy

    private var policySection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "By policy area")
            VStack(spacing: Space.sm) {
                ForEach(model.policyBreakdown) { tally in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(tally.area)
                                .font(Typo.bodySM)
                                .foregroundStyle(theme.text)
                                .lineLimit(1)
                            Spacer()
                            Text("\(tally.total)")
                                .font(Typo.monoSM)
                                .foregroundStyle(theme.textMuted)
                        }
                        TallyBar(yea: tally.yea, nay: tally.nay, showLabels: false)
                    }
                }
            }
        }
    }

    // MARK: Notable votes

    private var notableSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Notable votes")

            if !model.notable.atypical.isEmpty {
                Text("Broke with the party")
                    .font(Typo.captionMedium)
                    .foregroundStyle(theme.textSecondary)
                ForEach(model.notable.atypical, id: \.id) { vote in
                    VoteRow(vote: vote, rollCall: model.rollCall(for: vote))
                    RuleLine()
                }
            }

            if !model.notable.typical.isEmpty {
                Text("Close calls, held the line")
                    .font(Typo.captionMedium)
                    .foregroundStyle(theme.textSecondary)
                    .padding(.top, Space.xs)
                ForEach(model.notable.typical, id: \.id) { vote in
                    VoteRow(vote: vote, rollCall: model.rollCall(for: vote))
                    RuleLine()
                }
            }

            Text("Ranked by narrowest margin, then most recent.")
                .font(Typo.micro)
                .foregroundStyle(theme.textMuted)
        }
    }

    // MARK: Sponsored

    private var sponsoredSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Sponsored legislation", trailing: "\(model.sponsored.count)")
            ForEach(model.sponsored) { bill in
                NavigationLink { BillDetailScreen(billID: bill.id) } label: {
                    BillRow(bill: bill)
                }
                .buttonStyle(.plain)
                RuleLine()
            }
        }
    }

    // MARK: Votes

    private var votesSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Voting history", trailing: "\(model.votes.count) recorded")

            if model.votes.isEmpty && model.state == .loaded {
                Text("No votes recorded for this member yet.")
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textMuted)
            }

            ForEach(model.visibleVotes, id: \.id) { vote in
                VoteRow(vote: vote, rollCall: model.rollCall(for: vote))
                RuleLine()
            }

            if model.visibleVotes.count < model.votes.count {
                Button("Show more votes") { model.showMore() }
                    .buttonStyle(SecondaryButtonStyle())
                    .padding(.top, Space.xs)
            }
        }
    }
}

// MARK: - Stat tile

struct StatTile: View {
    let value: String
    let label: String
    var color: Color?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(Typo.monoLarge)
                .foregroundStyle(color ?? theme.text)
                .tabularFigures()
            Text(label)
                .font(Typo.micro)
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.sm)
        .background(
            RoundedRectangle(cornerRadius: Radius.md).fill(theme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md).stroke(theme.border, lineWidth: 0.5)
        )
    }
}

// MARK: - Vote row

struct VoteRow: View {
    let vote: BallotWatchAPI.VoteWithBill
    /// The roll call this vote belongs to, when we hold it. Supplies the
    /// question for procedural votes that carry no bill.
    var rollCall: RollCall?
    @Environment(\.theme) private var theme

    private var billKey: BillKey? { vote.billID.flatMap { BillKey(id: $0) } }

    var body: some View {
        Group {
            if let billID = vote.billID {
                NavigationLink { BillDetailScreen(billID: billID) } label: { content }
                    .buttonStyle(.plain)
            } else if let rollCallID = vote.rollCallID {
                NavigationLink {
                    RollCallMembersScreen(rollCallID: rollCallID, question: rollCall?.question)
                } label: { content }
                .buttonStyle(.plain)
            } else {
                content
            }
        }
    }

    private var content: some View {
        HStack(alignment: .top, spacing: Space.sm) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: Space.xs) {
                    if let display = billKey?.display {
                        Text(display)
                            .font(Typo.monoMedium)
                            .foregroundStyle(theme.accent)
                    } else if let meta = RollCallMeta(id: vote.rollCallID ?? "") {
                        // No bill — identify it by chamber and roll call number
                        // so the row still says what it is.
                        Text("\(meta.chamber.label) \(meta.number)")
                            .font(Typo.monoMedium)
                            .foregroundStyle(theme.accent)
                    }
                    if let date = vote.date {
                        Text(DateParsing.medium(date))
                            .font(Typo.monoMicro)
                            .foregroundStyle(theme.textMuted)
                    }
                }

                // A placeholder title just restates the number above it.
                if BillKey.isRealTitle(vote.bill?.title, for: billKey), let title = vote.bill?.title {
                    Text(title)
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                } else if let question = rollCall?.question, !question.isEmpty {
                    Text(question)
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.text)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }

                if let area = vote.bill?.policyArea, !area.isEmpty {
                    Tag(text: area)
                }
            }
            Spacer(minLength: Space.xs)
            PositionPill(position: vote.position)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, Space.sm)
        .contentShape(Rectangle())
    }
}

// MARK: - Model

@MainActor
final class PoliticianDetailModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var votes: [BallotWatchAPI.VoteWithBill] = []
    @Published private(set) var stats: MemberStats?
    @Published private(set) var sponsored: [Bill] = []
    @Published private(set) var crossover: VotingPatterns.Crossover = .empty
    @Published private(set) var notable = VotingPatterns.NotableVotes(typical: [], atypical: [])
    @Published private(set) var policyBreakdown: [VotingPatterns.PolicyTally] = []
    @Published private(set) var district: String?
    @Published private(set) var servingSince: Int?
    @Published private(set) var visibleCount = 15
    /// Roll calls keyed by id, so a vote with no bill can still show what the
    /// chamber was actually voting on.
    @Published private(set) var rollCallsByID: [String: RollCall] = [:]

    private let politician: Politician

    init(politician: Politician) {
        self.politician = politician
        self.district = politician.district
    }

    var visibleVotes: [BallotWatchAPI.VoteWithBill] { Array(votes.prefix(visibleCount)) }

    func showMore() { visibleCount += 25 }

    func rollCall(for vote: BallotWatchAPI.VoteWithBill) -> RollCall? {
        vote.rollCallID.flatMap { rollCallsByID[$0] }
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading

        async let votesTask = try? BallotWatchAPI.memberVotes(politicianID: politician.id, limit: 300)
        async let statsTask = try? BallotWatchAPI.memberStats(politicianID: politician.id)
        async let sponsoredTask = try? BallotWatchAPI.billsSponsored(by: politician.id, limit: 25)
        // The roster holds no district for House members, so fill it in from
        // Congress.gov. Purely additive — a failure just leaves the state tag.
        async let detailTask = try? CongressAPI.member(bioguideID: politician.id)

        let loadedVotes = await votesTask ?? []
        stats = await statsTask
        sponsored = await sponsoredTask ?? []
        if let detail = await detailTask {
            if let d = detail.district { district = String(d) }
            servingSince = detail.servingSince
        }

        votes = loadedVotes

        // Party-majority direction needs the per-roll-call breakdown, and the
        // roll call rows supply the question for bill-less procedural votes.
        let rollCallIDs = Array(Set(loadedVotes.compactMap(\.rollCallID)))
        async let statsFetch = try? BallotWatchAPI.rollCallStats(ids: rollCallIDs)
        async let callsFetch = try? BallotWatchAPI.rollCalls(ids: rollCallIDs)

        let statsList = await statsFetch ?? []
        let statsMap = Dictionary(statsList.map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a })
        rollCallsByID = Dictionary(
            (await callsFetch ?? []).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a }
        )

        crossover = VotingPatterns.partyCrossover(
            bioguideID: politician.id, party: politician.party,
            votes: loadedVotes, statsByRollCall: statsMap
        )
        notable = VotingPatterns.rankNotableVotes(
            bioguideID: politician.id, party: politician.party,
            votes: loadedVotes, statsByRollCall: statsMap
        )
        policyBreakdown = VotingPatterns.policyBreakdown(votes: loadedVotes)

        state = .loaded
    }
}
