import SwiftUI

/// A member's profile.
///
/// Laid out as an article, not a dashboard (DESIGN.md § Layout): masthead,
/// then the record, then the analysis, then the votes themselves — top to
/// bottom, with thin rules between sections rather than a grid of widgets.
struct PoliticianDetailScreen: View {
    let politician: Politician

    @StateObject private var model: PoliticianDetailModel
    @State private var showingIdeologyMethod = false
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
                    campaignFinanceSection
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
        .sheet(isPresented: $showingIdeologyMethod) { ideologyMethodSheet }
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
            SectionHead(
                title: "Voting history · at a glance",
                trailing: model.ideology.map { "\($0.congress)th Congress" }
                    ?? model.stats?.congress.map { "\($0)th Congress" }
            )

            Text("The record, up front")
                .font(Typo.h2)
                .foregroundStyle(theme.text)

            VStack(alignment: .leading, spacing: Space.xs) {
                Kicker("Voting record most closely aligns with")
                Text(model.ideology?.label ?? ideologyFallbackLabel)
                    .font(Typo.h1)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)

                IdeologyScale(placement: model.ideology?.placement)

                HStack(spacing: Space.sm) {
                    Text("Official party: \(politician.party.label)")
                    if let estimate = model.ideology, estimate.available {
                        Text("·")
                        Text("\(estimate.confidence) model confidence")
                    }
                }
                .font(Typo.monoSM)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            }

            if let stats = model.stats {
                LazyVGrid(
                    columns: [GridItem(.flexible()), GridItem(.flexible())],
                    spacing: 0
                ) {
                    RecordMetric(value: "\(stats.totalVotes ?? 0)", label: "Roll calls")
                    RecordMetric(
                        value: stats.participationPct.map { "\(Int($0.rounded()))%" } ?? "—",
                        label: "Participation"
                    )
                    RecordMetric(
                        value: stats.partyLoyaltyPct.map { "\(Int($0.rounded()))%" } ?? "—",
                        label: "Party-majority match"
                    )
                    RecordMetric(
                        value: model.crossover.substantiveCount > 0 ? "\(model.crossover.rate)%" : "—",
                        label: "Different from party"
                    )
                }
            } else if model.state == .loaded {
                Text("No vote statistics recorded for this member yet.")
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textMuted)
            }

            Button("How this estimate works") { showingIdeologyMethod = true }
                .font(Typo.bodySMMedium)
                .foregroundStyle(theme.accent)
                .frame(minHeight: 44)
                .accessibilityHint("Opens Voteview methodology and classification limits")
        }
    }

    private var ideologyFallbackLabel: String {
        switch model.ideologyState {
        case .idle, .loading: return "Reading the roll-call record…"
        case .loaded: return "Insufficient voting evidence"
        case .failed: return "Ideology estimate unavailable"
        }
    }

    private var ideologyMethodSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.md) {
                    Text("How this estimate works")
                        .font(Typo.h1)
                        .foregroundStyle(theme.text)
                    Text("Voteview estimates a member’s position from recorded congressional roll calls. BallotWatch translates its modern first dimension into a plain-language liberal-to-conservative range.")
                        .font(Typo.body)
                        .foregroundStyle(theme.textSecondary)
                    if let votes = model.ideology?.votes, votes > 0 {
                        Text("This estimate uses \(votes.formatted()) Voteview-coded votes.")
                            .font(Typo.body)
                            .foregroundStyle(theme.textSecondary)
                    }
                    Text("This is BallotWatch analysis, not an official affiliation or self-identification. Narrower labels such as “populist” or “neoconservative” are not inferred from party alone because this model does not measure those ideas reliably.")
                        .font(Typo.body)
                        .foregroundStyle(theme.textSecondary)
                    Link("Read the Voteview methodology", destination: VoteviewIdeology.methodologyURL)
                        .font(Typo.bodyMedium)
                    Link("Request a source-linked correction", destination: VoteviewIdeology.correctionURL)
                        .font(Typo.bodyMedium)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.md)
            }
            .paperBackground()
            .navigationTitle("Methodology")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showingIdeologyMethod = false }
                }
            }
        }
    }

    // MARK: Campaign finance

    @ViewBuilder
    private var campaignFinanceSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(
                title: "Campaign finance",
                trailing: model.campaignFinance.map { "\($0.cycle) cycle" }
            )

            switch model.campaignFinanceState {
            case .idle, .loading:
                HStack(spacing: Space.xs) {
                    ProgressView()
                    Text("Loading current FEC filings…")
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.textMuted)
                }
                .frame(minHeight: 44)
            case .failed(let message):
                Text(message)
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textMuted)
                Link("Search this member on FEC.gov", destination: FECService.searchURL(name: politician.name))
                    .font(Typo.bodySMMedium)
                    .frame(minHeight: 44)
            case .loaded:
                if let finance = model.campaignFinance {
                    Text(formatCurrency(finance.totalRaised))
                        .font(Typo.h1)
                        .foregroundStyle(theme.text)
                        .tabularFigures()
                    Text(finance.coverageEndDate.flatMap { DateParsing.date(from: $0) }.map {
                        "Total raised through \(DateParsing.medium($0))"
                    } ?? "Total raised in the \(finance.cycle) cycle")
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.textMuted)

                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible())],
                        spacing: 0
                    ) {
                        RecordMetric(value: formatCurrency(finance.individualTotal), label: "From individuals")
                        RecordMetric(value: formatCurrency(finance.pacTotal), label: "From PACs")
                        RecordMetric(value: formatCurrency(finance.totalSpent), label: "Spent this cycle")
                        RecordMetric(value: formatCurrency(finance.cashOnHand), label: "Cash on hand")
                    }

                    if !finance.largestReceipts.isEmpty {
                        Kicker("Largest itemized receipts shown")
                            .padding(.top, Space.xs)
                        ForEach(finance.largestReceipts.prefix(6)) { receipt in
                            HStack(alignment: .firstTextBaseline, spacing: Space.sm) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(receipt.name)
                                        .font(Typo.bodySM)
                                        .foregroundStyle(theme.text)
                                        .lineLimit(2)
                                    Text([receipt.employer, receipt.state]
                                        .compactMap { $0 }
                                        .joined(separator: " · "))
                                        .font(Typo.micro)
                                        .foregroundStyle(theme.textMuted)
                                }
                                Spacer(minLength: Space.xs)
                                Text(formatCurrency(receipt.amount))
                                    .font(Typo.monoMedium)
                                    .foregroundStyle(theme.text)
                                    .tabularFigures()
                            }
                            .padding(.vertical, Space.xs)
                            RuleLine()
                        }
                    }

                    Text("Candidate totals include all authorized committees. The receipt list shows the principal committee’s largest current-cycle itemized receipts; employers are contributor-reported and are not corporate contributions.")
                        .font(Typo.micro)
                        .foregroundStyle(theme.textMuted)

                    Link("View the filing on FEC.gov", destination: FECService.candidateURL(
                        candidateID: finance.candidateID, cycle: finance.cycle
                    ))
                    .font(Typo.bodySMMedium)
                    .frame(minHeight: 44)
                }
            }
        }
    }

    private func formatCurrency(_ value: Double) -> String {
        value.formatted(.currency(code: "USD").precision(.fractionLength(0)))
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

// MARK: - Record summary

private struct IdeologyScale: View {
    let placement: Double?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: Space.xxs) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(theme.border)
                        .frame(height: 2)
                        .position(x: geometry.size.width / 2, y: 6)
                    if let placement {
                        Circle()
                            .fill(theme.accent)
                            .overlay(Circle().stroke(theme.bg, lineWidth: 3))
                            .frame(width: 12, height: 12)
                            .position(
                                x: min(max(6, geometry.size.width * placement / 100), geometry.size.width - 6),
                                y: 6
                            )
                    }
                }
            }
            .frame(height: 12)

            HStack {
                Text("Liberal")
                Spacer()
                Text("Conservative")
            }
            .font(Typo.monoMicro)
            .foregroundStyle(theme.textMuted)
            .textCase(.uppercase)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            placement.map { "Position on liberal to conservative scale: \(Int($0.rounded())) percent" }
                ?? "Position on liberal to conservative scale unavailable"
        )
    }
}

private struct RecordMetric: View {
    let value: String
    let label: String
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: Space.xxs) {
            Text(label.uppercased())
                .font(Typo.monoMicro)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            Text(value)
                .font(Typo.monoLarge)
                .foregroundStyle(theme.text)
                .tabularFigures()
                .minimumScaleFactor(0.75)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        .padding(.vertical, Space.xs)
        .padding(.trailing, Space.xs)
        .overlay(alignment: .top) {
            Rectangle().fill(theme.border).frame(height: 0.5)
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
    enum SupplementState: Equatable { case idle, loading, loaded, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var votes: [BallotWatchAPI.VoteWithBill] = []
    @Published private(set) var stats: MemberStats?
    @Published private(set) var sponsored: [Bill] = []
    @Published private(set) var crossover: VotingPatterns.Crossover = .empty
    @Published private(set) var notable = VotingPatterns.NotableVotes(typical: [], atypical: [])
    @Published private(set) var policyBreakdown: [VotingPatterns.PolicyTally] = []
    @Published private(set) var district: String?
    @Published private(set) var servingSince: Int?
    @Published private(set) var ideology: VoteviewIdeology.Estimate?
    @Published private(set) var ideologyState: SupplementState = .idle
    @Published private(set) var campaignFinance: FECService.CampaignFinance?
    @Published private(set) var campaignFinanceState: SupplementState = .idle
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
        ideologyState = .loading
        campaignFinanceState = .loading

        async let votesTask = try? BallotWatchAPI.memberVotes(politicianID: politician.id, limit: 300)
        async let statsTask = try? BallotWatchAPI.memberStats(politicianID: politician.id)
        async let sponsoredTask = try? BallotWatchAPI.billsSponsored(by: politician.id, limit: 25)
        // The roster holds no district for House members, so fill it in from
        // Congress.gov. Purely additive — a failure just leaves the state tag.
        async let detailTask = try? CongressAPI.member(bioguideID: politician.id)
        async let ideologyTask = VoteviewIdeology.estimate(for: politician.id)
        async let financeTask = FECService.campaignFinance(
            name: politician.name,
            state: politician.state,
            chamber: politician.chamber
        )

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

        do {
            ideology = try await ideologyTask
            ideologyState = .loaded
        } catch {
            ideology = nil
            ideologyState = .failed(error.localizedDescription)
        }

        do {
            campaignFinance = try await financeTask
            campaignFinanceState = .loaded
        } catch {
            campaignFinance = nil
            campaignFinanceState = .failed(error.localizedDescription)
        }
    }
}
