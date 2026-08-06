import SwiftUI

/// A single bill, read top to bottom like an article.
///
/// The AI explanation renders as marginalia — a left-ruled annotation block,
/// not a chat bubble (DESIGN.md § Layout). It's labelled as AI-generated and
/// sits below the official summary, never in place of it.
struct BillDetailScreen: View {
    let billID: String
    var focusRollCallID: String?

    @StateObject private var model: BillDetailModel
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    init(billID: String, focusRollCallID: String? = nil) {
        self.billID = billID
        self.focusRollCallID = focusRollCallID
        _model = StateObject(wrappedValue: BillDetailModel(billID: billID))
    }

    private var key: BillKey? { BillKey(id: billID) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                masthead

                switch model.state {
                case .loading where model.bill == nil:
                    LoadingView(label: "Loading bill")
                case .failed(let message) where model.bill == nil:
                    ErrorStateView(message: message) { Task { await model.load() } }
                default:
                    if let bill = model.bill {
                        if let summary = bill.bestSummary { summarySection(summary) }
                        explanationSection
                        if !model.rollCalls.isEmpty { votesSection }
                        if !model.routings.isEmpty { routingSection }
                        sponsorSection(bill)
                        sourceSection(bill)
                    } else if model.state == .loaded {
                        EmptyStateView(
                            title: "Bill not found",
                            message: "We don't hold a record for \(key?.display ?? billID).",
                            systemImage: "doc.questionmark"
                        )
                    }
                }
            }
            .padding(.horizontal, Space.md)
            .padding(.bottom, Space.xxl)
        }
        .paperBackground()
        .navigationTitle(key?.display ?? billID)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    userData.toggleWatch(billID: billID)
                } label: {
                    Image(systemName: userData.isWatching(billID: billID) ? "bookmark.fill" : "bookmark")
                        .foregroundStyle(userData.isWatching(billID: billID) ? theme.accent : theme.textSecondary)
                }
                .accessibilityLabel(userData.isWatching(billID: billID) ? "Stop watching bill" : "Watch bill")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if let url = key?.congressGovURL {
                    ShareLink(item: url) {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundStyle(theme.textSecondary)
                    }
                }
            }
        }
        .task {
            await model.loadIfNeeded()
            userData.noteViewed(billID: billID)
        }
    }

    // MARK: Masthead

    private var masthead: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            HStack(spacing: Space.xs) {
                Kicker(key?.chamber.label ?? "Congress", color: theme.textSecondary)
                if let congress = key?.congress {
                    Kicker("\(congress)th Congress")
                }
                Spacer()
            }

            Text(key?.display ?? billID)
                .font(Typo.display)
                .foregroundStyle(theme.accent)

            if let bill = model.bill, bill.hasRealTitle {
                Text(bill.title)
                    .font(Typo.h2)
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: Space.xs) {
                if let date = model.bill?.introducedDate {
                    Text("Introduced \(DateParsing.medium(date))")
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.textMuted)
                }
                if let area = model.bill?.policyArea, !area.isEmpty {
                    Tag(text: area)
                }
            }

            RuleLine(weight: .heavy)
        }
        .padding(.top, Space.xs)
    }

    // MARK: Summary

    private func summarySection(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(
                title: model.bill?.crsSummary?.trimmed.isEmpty == false
                    ? "Official summary" : "Summary"
            )
            Text(summary.strippingHTML)
                .font(Typo.body)
                .foregroundStyle(theme.text)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if model.bill?.crsSummary?.trimmed.isEmpty == false {
                Text("Congressional Research Service")
                    .font(Typo.micro)
                    .foregroundStyle(theme.textMuted)
            }
        }
    }

    // MARK: AI explanation — marginalia

    private var explanationSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "In plain English")

            if let explanation = model.explanation {
                HStack(alignment: .top, spacing: Space.sm) {
                    Rectangle()
                        .fill(theme.info)
                        .frame(width: 2)
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Text(explanation)
                            .font(Typo.body)
                            .foregroundStyle(theme.text)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                        // Don't point the reader at an official summary that
                        // isn't on the page — many bills have none, and the
                        // explanation is then inferred from the title alone.
                        Text(model.bill?.bestSummary == nil
                             ? "AI-generated. No official summary has been published for this bill yet, so this is inferred from its title — read the full text on congress.gov below."
                             : "AI-generated explanation. Read the official summary above for the authoritative text.")
                            .font(Typo.micro)
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            } else if model.isExplaining {
                LoadingView(label: "Writing an explanation")
            } else {
                Button("Explain this bill") {
                    Task { await model.explain() }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    // MARK: Votes

    private var votesSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Recorded votes", trailing: "\(model.rollCalls.count)")

            ForEach(model.rollCalls) { call in
                let stats = model.statsByRollCall[call.id]
                VStack(alignment: .leading, spacing: Space.xs) {
                    HStack(spacing: Space.xs) {
                        if let meta = call.meta {
                            Kicker(meta.chamber.label, color: theme.textSecondary)
                            Kicker("Roll call \(meta.number)")
                        }
                        Spacer()
                        if let date = call.date {
                            Text(DateParsing.medium(date))
                                .font(Typo.monoMicro)
                                .foregroundStyle(theme.textMuted)
                        }
                    }

                    if let question = call.question {
                        Text(question)
                            .font(Typo.bodySM)
                            .foregroundStyle(theme.text)
                    }

                    // Only shown when the tally survives the sanity check —
                    // some ingested rows are double-counted.
                    if let tally = model.trustworthyTally(for: call) {
                        TallyBar(yea: tally.yea, nay: tally.nay)
                        if let result = FloorVotes.deriveResult(
                            question: call.question, yea: tally.yea, nay: tally.nay,
                            chamber: call.meta?.chamber
                        ) {
                            Text(result)
                                .font(Typo.captionMedium)
                                .foregroundStyle(theme.textSecondary)
                        }
                    }

                    if let stats, let breakdown = PartyBreakdown(stats: stats) {
                        PartyBreakdownView(breakdown: breakdown)
                    }

                    NavigationLink {
                        RollCallMembersScreen(rollCallID: call.id, question: call.question)
                    } label: {
                        Text("See how each member voted")
                            .font(Typo.captionMedium)
                            .foregroundStyle(theme.accent)
                    }
                    .padding(.top, 2)
                }
                .padding(.vertical, Space.sm)
                .id(call.id)
                RuleLine()
            }
        }
    }

    // MARK: Routing

    private var routingSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Where this bill went")
            ForEach(Array(model.routings.enumerated()), id: \.offset) { _, routing in
                VStack(alignment: .leading, spacing: 2) {
                    Text(routing.committeeName ?? routing.committeeCode ?? "Committee")
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.text)
                    HStack(spacing: Space.xs) {
                        if let sub = routing.subcommitteeName, !sub.isEmpty {
                            Text(sub)
                                .font(Typo.caption)
                                .foregroundStyle(theme.textSecondary)
                        }
                        if let referred = DateParsing.date(from: routing.referredAt) {
                            Text(DateParsing.medium(referred))
                                .font(Typo.monoMicro)
                                .foregroundStyle(theme.textMuted)
                        }
                    }
                }
                .padding(.vertical, Space.xs)
                RuleLine()
            }
        }
    }

    // MARK: Sponsor

    @ViewBuilder
    private func sponsorSection(_ bill: Bill) -> some View {
        if let sponsorName = bill.sponsorName, !sponsorName.isEmpty {
            VStack(alignment: .leading, spacing: Space.sm) {
                SectionHead(title: "Sponsor")
                if let bioguideID = bill.sponsorBioguideID, let sponsor = model.sponsor {
                    NavigationLink { PoliticianDetailScreen(politician: sponsor) } label: {
                        MemberRow(member: sponsor)
                    }
                    .buttonStyle(.plain)
                    .id(bioguideID)
                } else {
                    HStack(spacing: Space.xs) {
                        Text(sponsorName)
                            .font(Typo.bodyMedium)
                            .foregroundStyle(theme.text)
                        PartyTag(party: bill.sponsor, seat: bill.sponsorState)
                    }
                }
            }
        }
    }

    // MARK: Source

    private func sourceSection(_ bill: Bill) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Source")
            Button {
                if let url = URL(string: bill.sourceURL ?? "") ?? key?.congressGovURL {
                    openURL(url)
                }
            } label: {
                HStack {
                    Text("Read the full text on congress.gov")
                        .font(Typo.bodySM)
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundStyle(theme.accent)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Party breakdown

struct PartyBreakdown {
    let rows: [(party: Party, yea: Int, nay: Int)]

    /// Nil when the table holds no party split at all — better to show nothing
    /// than a row of zeros implying unanimity.
    init?(stats: RollCallStats) {
        var rows: [(Party, Int, Int)] = []
        if (stats.demYea ?? 0) + (stats.demNay ?? 0) > 0 {
            rows.append((.democrat, stats.demYea ?? 0, stats.demNay ?? 0))
        }
        if (stats.repYea ?? 0) + (stats.repNay ?? 0) > 0 {
            rows.append((.republican, stats.repYea ?? 0, stats.repNay ?? 0))
        }
        if (stats.indYea ?? 0) + (stats.indNay ?? 0) > 0 {
            rows.append((.independent, stats.indYea ?? 0, stats.indNay ?? 0))
        }
        guard !rows.isEmpty else { return nil }
        self.rows = rows
    }
}

struct PartyBreakdownView: View {
    let breakdown: PartyBreakdown
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(breakdown.rows, id: \.party) { row in
                HStack(spacing: Space.xs) {
                    Text(row.party.letter)
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.party(row.party))
                        .frame(width: 14, alignment: .leading)
                    Text("\(row.yea)")
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.success)
                        .tabularFigures()
                    Text("–")
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.textMuted)
                    Text("\(row.nay)")
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.error)
                        .tabularFigures()
                    Spacer()
                }
            }
        }
        .padding(.top, 2)
    }
}

// MARK: - Model

@MainActor
final class BillDetailModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var bill: Bill?
    @Published private(set) var rollCalls: [RollCall] = []
    @Published private(set) var statsByRollCall: [String: RollCallStats] = [:]
    @Published private(set) var routings: [CommitteeRouting] = []
    @Published private(set) var sponsor: Politician?
    @Published private(set) var explanation: String?
    @Published private(set) var isExplaining = false

    private let billID: String

    init(billID: String) { self.billID = billID }

    /// A tally we're willing to show: present, and within the chamber's size.
    func trustworthyTally(for call: RollCall) -> (yea: Int, nay: Int)? {
        guard let stats = statsByRollCall[call.id] else { return nil }
        let yea = stats.totalYea, nay = stats.totalNay
        guard FloorVotes.isSane(yea: yea, nay: nay, chamber: call.meta?.chamber) else { return nil }
        return (yea, nay)
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        do {
            async let billTask = BallotWatchAPI.bill(id: billID)
            async let callsTask = try? BallotWatchAPI.rollCallsForBill(billID)
            async let routingsTask = try? BallotWatchAPI.routings(billID: billID)
            async let cachedTask = try? BallotWatchAPI.cachedExplanation(billKey: billID)

            let loadedBill = try await billTask
            bill = loadedBill
            rollCalls = await callsTask ?? []
            routings = await routingsTask ?? []
            explanation = await cachedTask?.explanation

            if !rollCalls.isEmpty {
                let stats = (try? await BallotWatchAPI.rollCallStats(ids: rollCalls.map(\.id))) ?? []
                statsByRollCall = Dictionary(
                    stats.map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a }
                )
            }

            if let bioguideID = loadedBill?.sponsorBioguideID {
                sponsor = try? await BallotWatchAPI.politician(id: bioguideID)
            }

            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// Cold path — asks the Edge Function to write one. The key stays
    /// server-side, and the result is cached for everyone else.
    func explain() async {
        guard let bill, !isExplaining else { return }
        isExplaining = true
        defer { isExplaining = false }
        if let generated = try? await BallotWatchAPI.generateExplanation(bill: bill) {
            explanation = generated
        } else {
            explanation = "We couldn't generate an explanation for this bill right now."
        }
    }
}

// MARK: - HTML stripping

extension String {
    /// CRS summaries arrive with light HTML markup.
    var strippingHTML: String {
        replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .trimmed
    }
}
