import SwiftUI
import UIKit

/// The website's roll-call page, /vote/:congress/:chamber/:session/:roll.
///
/// Ported from RollCallPage.jsx and RollCall.css: breadcrumbs, the kicker,
/// the question as the headline, the tally with its bar and party split, the
/// official record, then "How each member voted" with the name filter, the
/// position toggles and the member table. Data is read the way
/// src/services/rollCall.js reads it: the roll call, its stats row (member
/// votes as the fallback count), the bill, and every member's vote.
///
/// The web's "Tell your rep" block is left out: the app has no rep-writing
/// feature yet, and a dead link would be worse than no link.
struct RollCallScreen: View {
    let rollCallID: String

    @StateObject private var model: RollCallModel
    @Environment(\.theme) private var theme

    init(rollCallID: String, question: String? = nil) {
        self.rollCallID = rollCallID
        _model = StateObject(wrappedValue: RollCallModel(rollCallID: rollCallID))
    }

    var body: some View {
        Group {
            switch model.state {
            case .idle, .loading:
                VStack(spacing: 16) {
                    ProgressView().tint(theme.textMuted)
                    Text("Loading the roll call\u{2026}")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                ErrorStateView(message: message) { Task { await model.load() } }
                    .frame(maxHeight: .infinity)
            case .notFound:
                RollCallNotFound(rollCallID: rollCallID)
            case .loaded(let rc):
                RollCallPage(rc: rc)
            }
        }
        .paperBackground()
        .navigationTitle("Roll call")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.loadIfNeeded() }
    }
}

/// Bills and Members push this name; it is the same page.
typealias RollCallMembersScreen = RollCallScreen

/// Home pushes a feed row by value; it opens the same roll-call page.
struct RollCallDetailScreen: View {
    let vote: FloorVote

    var body: some View {
        RollCallScreen(rollCallID: vote.id, question: vote.question)
    }
}

// MARK: - Page

private struct RollCallPage: View {
    let rc: RollCallData

    @State private var filter = ""
    @State private var position: VotePosition?
    @State private var showBill = false
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    private var visible: [RollCallData.MemberVote] {
        let q = filter.trimmingCharacters(in: .whitespaces).lowercased()
        return rc.votes.filter { v in
            (position == nil || v.position == position)
                && (q.isEmpty || v.member.name.lowercased().contains(q) || v.member.state.lowercased() == q)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                masthead

                members
                    .padding(.bottom, 48)

                colophon
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 64)
        }
        .scrollDismissesKeyboard(.interactively)
        .navigationDestination(isPresented: $showBill) {
            if let bill = rc.bill { BillDetailScreen(billID: bill.id, focusRollCallID: rc.id) }
        }
    }

    // MARK: Masthead

    private var kicker: String {
        var parts = [
            rc.meta.chamber.label, "Roll call \(rc.meta.number)", "Session \(rc.meta.session)",
            "\(FloorWeb.ordinal(rc.meta.congress)) Congress",
        ]
        if let date = rc.votedAt { parts.append(FloorWeb.longDate(date)) }
        return parts.joined(separator: " · ").uppercased()
    }

    private var title: Text {
        let head = Text(rc.question ?? "Recorded vote")
        guard let bill = rc.bill else { return head }
        var link = AttributedString(bill.label)
        link.link = URL(string: "bwfloor://bill")
        return head + Text(" on ") + Text(link)
    }

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(kicker)
                    .font(Typo.mono(12))
                    .tracking(12 * 0.06)
                    .foregroundStyle(theme.textSecondary)
                    .cssLineHeight(1.6, size: 12, mono: true)
                    .fixedSize(horizontal: false, vertical: true)
                InfoTerm("rollCall")
            }
            .padding(.bottom, 16)

            title
                .font(Typo.inter(28, 600, relativeTo: .title))
                .webTracking(-0.01, size: 28)
                .foregroundStyle(theme.text)
                .tint(theme.accent)
                .cssLineHeight(1.1, size: 28)
                .fixedSize(horizontal: false, vertical: true)
                .environment(\.openURL, OpenURLAction { url in
                    if url.scheme == "bwfloor" { showBill = true; return .handled }
                    return .systemAction
                })
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 12)

            if let id = Glossary.termForQuestion(rc.question), let entry = Glossary.entry(id) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("Key term: \(entry.term)")
                        .font(Typo.inter(14, 500))
                        .foregroundStyle(theme.textSecondary)
                    InfoTerm(id)
                }
                .padding(.bottom, 12)
            }

            if let standfirst = rc.bill?.title ?? rc.description {
                Text(standfirst)
                    .font(Typo.inter(18))
                    .foregroundStyle(theme.textSecondary)
                    .cssLineHeight(1.5, size: 18)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 24)
            }

            if let tally = rc.tally {
                tallyBlock(tally)
                    .padding(.top, rc.bill?.title ?? rc.description == nil ? 24 : 0)
                    .padding(.bottom, 24)
            } else {
                Text("Tally not yet recorded.")
                    .font(Typo.inter(18))
                    .foregroundStyle(theme.textMuted)
                    .cssLineHeight(1.5, size: 18)
                    .padding(.bottom, 24)
            }

            let actions = actionLinks
            if !actions.isEmpty {
                HStack(spacing: 12) {
                    ForEach(actions, id: \.0) { label, url in
                        Button("\(label) \u{2197}") { openURL(url) }
                            .buttonStyle(FloorSmallTextButtonStyle())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 32)
        .overlay(alignment: .bottom) {
            Rectangle().fill(theme.border).frame(height: 1)
        }
        .padding(.bottom, 32)
    }

    private var actionLinks: [(String, URL)] {
        var out: [(String, URL)] = []
        if let url = rc.sourceURL { out.append(("Official record", url)) }
        if let url = rc.bill?.sourceURL { out.append(("Bill on Congress.gov", url)) }
        return out
    }

    private func tallyBlock(_ tally: RollCallData.Tally) -> some View {
        let total = tally.yea + tally.nay
        let yeaShare = total > 0 ? CGFloat(tally.yea) / CGFloat(total) : 0

        return VStack(alignment: .leading, spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    tallyNumbers(tally).fixedSize()
                    Spacer(minLength: 0)
                    resultLabel
                }
                VStack(alignment: .leading, spacing: 12) {
                    tallyNumbers(tally).fixedSize(horizontal: false, vertical: true)
                    resultLabel
                }
            }

            // `.rc-tally-bar`: 8px, 2px radius, --border behind.
            GeometryReader { geo in
                HStack(spacing: 0) {
                    Rectangle().fill(theme.success).frame(width: geo.size.width * yeaShare)
                    Rectangle().fill(theme.error)
                }
            }
            .frame(height: 8)
            .background(theme.border)
            .clipShape(RoundedRectangle(cornerRadius: 2))
            .padding(.top, 12)
            .accessibilityHidden(true)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("Yea means yes. Nay means no.")
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textSecondary)
                if tally.present > 0 || tally.notVoting > 0 { InfoTerm("notVoting") }
            }
            .padding(.top, 12)

            if let party = rc.party {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(partyLine(party))
                        .font(Typo.mono(12))
                        .foregroundStyle(theme.textMuted)
                        .cssLineHeight(1.6, size: 12, mono: true)
                    InfoTerm("partySplit")
                }
                .padding(.top, 8)
            }
        }
        .padding(.top, 16)
        .overlay(alignment: .top) {
            Rectangle().fill(theme.ruleStrong).frame(height: 2)
        }
    }

    private func tallyNumbers(_ tally: RollCallData.Tally) -> some View {
        var text = Text("\(tally.yea) Yea").foregroundColor(theme.success)
            + Text(" · ")
            + Text("\(tally.nay) Nay").foregroundColor(theme.error)
        if tally.present > 0 { text = text + Text(" · \(tally.present) Present") }
        if tally.notVoting > 0 { text = text + Text(" · \(tally.notVoting) Not voting") }
        return text
            .font(Typo.mono(18))
            .foregroundStyle(theme.text)
            .cssLineHeight(1.6, size: 18, mono: true)
    }

    @ViewBuilder
    private var resultLabel: some View {
        if let result = rc.result {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(result.uppercased())
                    .font(Typo.mono(12))
                    .tracking(12 * 0.08)
                    .foregroundStyle(FloorWeb.pageResultPassed(result) ? theme.success : theme.error)
                    .cssLineHeight(1.6, size: 12, mono: true)
                InfoTerm("voteResult")
            }
        }
    }

    private func partyLine(_ p: RollCallData.PartySplit) -> String {
        var s = "D \(p.demYea)\u{2013}\(p.demNay) · R \(p.repYea)\u{2013}\(p.repNay)"
        if p.indYea + p.indNay > 0 { s += " · I \(p.indYea)\u{2013}\(p.indNay)" }
        return s
    }

    // MARK: Members

    private var members: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Every member · \(rc.votes.count) recorded".uppercased())
                .font(Typo.mono(11))
                .tracking(11 * 0.12)
                .foregroundStyle(theme.textMuted)
                .cssLineHeight(1.6, size: 11, mono: true)
                .padding(.bottom, 12)

            Text("How each member voted")
                .font(Typo.inter(36, 600, relativeTo: .largeTitle))
                .webTracking(-0.01, size: 36)
                .foregroundStyle(theme.text)
                .cssLineHeight(1.1, size: 36)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 24)

            if rc.votes.isEmpty {
                Text("Member-level votes for this roll call have not been ingested yet.")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textMuted)
                    .cssLineHeight(1.6, size: 16)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                filterBar.padding(.bottom, 16)
                RollCallMemberTable(votes: visible)
                if visible.isEmpty {
                    Text("No members match that filter.")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textMuted)
                        .cssLineHeight(1.6, size: 16)
                        .padding(.vertical, 16)
                }
            }
        }
    }

    private var filterBar: some View {
        VStack(alignment: .leading, spacing: 12) {
            // `.rc-filter input`: 8px 12px, 1px --border, --r-sm, --surface, 14px.
            TextField(
                "",
                text: $filter,
                prompt: Text("Filter by name or state").foregroundColor(theme.textMuted)
            )
            .font(Typo.inter(14))
            .foregroundStyle(theme.text)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.search)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(minHeight: 40)
            .background(RoundedRectangle(cornerRadius: Radius.sm).fill(theme.surface))
            .overlay(RoundedRectangle(cornerRadius: Radius.sm).stroke(theme.border, lineWidth: 1))
            .accessibilityLabel("Filter members by name or state")
            .accessibilityIdentifier("rollCallFilter")

            // `.rc-filter-positions`: gap 4px, wraps.
            FlowLayout(spacing: 4, lineSpacing: 4) {
                positionToggle("All", nil)
                positionToggle("Yea", .yea)
                positionToggle("Nay", .nay)
                positionToggle("Present", .present)
                positionToggle("Not Voting", .notVoting)
            }
        }
    }

    private func positionToggle(_ label: String, _ value: VotePosition?) -> some View {
        Button(label) { position = value }
            .buttonStyle(ToggleButtonStyle(isSelected: position == value))
            .accessibilityAddTraits(position == value ? .isSelected : [])
    }

    // MARK: Colophon

    private var colophon: some View {
        var methodology = AttributedString("Methodology")
        methodology.link = Config.siteURL.appendingPathComponent("methodology")
        return (Text("Data from Congress.gov, the House Clerk, and the Senate. The result is derived from the tally and the question. ")
            + Text(methodology))
            .font(Typo.inter(13))
            .foregroundStyle(theme.textMuted)
            .tint(theme.textSecondary)
            .cssLineHeight(1.6, size: 13)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 16)
            .overlay(alignment: .top) {
                Rectangle().fill(theme.border).frame(height: 1)
            }
    }
}

// MARK: - Member table

/// `.rc-table`: Member / Seat / Vote. Columns size to their widest visible
/// cell, as an auto-layout HTML table does.
private struct RollCallMemberTable: View {
    let votes: [RollCallData.MemberVote]
    @Environment(\.theme) private var theme

    private static func textWidth(_ s: String, size: CGFloat, weight: Int = 400, tracking: CGFloat = 0) -> CGFloat {
        let name = weight >= 500 ? FontFamily.monoMedium : FontFamily.mono
        let font = UIFont(name: name, size: size) ?? .monospacedSystemFont(ofSize: size, weight: .regular)
        return ceil((s as NSString).size(withAttributes: [.font: font, .kern: tracking]).width)
    }

    private var seatWidth: CGFloat {
        let widest = votes.map { Self.textWidth($0.seat, size: 12) }.max() ?? 0
        return max(widest, Self.textWidth("SEAT", size: 11, weight: 500, tracking: 11 * 0.08)) + 12
    }

    private var voteWidth: CGFloat {
        let widest = votes.map { Self.textWidth($0.position.label, size: 12, tracking: 12 * 0.04) }.max() ?? 0
        return max(widest, Self.textWidth("VOTE", size: 11, weight: 500, tracking: 11 * 0.08)) + 12
    }

    var body: some View {
        let seatW = seatWidth
        let voteW = voteWidth
        LazyVStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                header("Member").frame(maxWidth: .infinity, alignment: .leading)
                header("Seat").frame(width: seatW, alignment: .leading)
                header("Vote").frame(width: voteW, alignment: .leading)
            }
            .padding(.top, 12)
            .padding(.bottom, 8)
            .overlay(alignment: .bottom) { Rectangle().fill(theme.border).frame(height: 1) }

            ForEach(votes) { v in
                RollCallMemberRow(vote: v, seatWidth: seatW, voteWidth: voteW)
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(theme.ruleStrong).frame(height: 1) }
    }

    private func header(_ text: String) -> some View {
        Text(text.uppercased())
            .font(Typo.mono(11, 500))
            .tracking(11 * 0.08)
            .foregroundStyle(theme.textMuted)
            .cssLineHeight(1.6, size: 11, mono: true)
            .padding(.trailing, 12)
    }
}

private struct RollCallMemberRow: View {
    let vote: RollCallData.MemberVote
    let seatWidth: CGFloat
    let voteWidth: CGFloat
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            NavigationLink {
                PoliticianDetailScreen(politician: vote.member)
            } label: {
                Text(vote.member.name)
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.accent)
                    .multilineTextAlignment(.leading)
                    .cssLineHeight(1.6, size: 14)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, 12)

            Text(vote.seat)
                .font(Typo.mono(12))
                .foregroundStyle(theme.textSecondary)
                .lineLimit(1)
                .cssLineHeight(1.6, size: 12, mono: true)
                .frame(width: seatWidth, alignment: .leading)

            Text(vote.position.label)
                .font(Typo.mono(12))
                .tracking(12 * 0.04)
                .foregroundStyle(color)
                .lineLimit(1)
                .cssLineHeight(1.6, size: 12, mono: true)
                .frame(width: voteWidth, alignment: .leading)
        }
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(theme.borderSoft).frame(height: 1) }
        .accessibilityElement(children: .combine)
    }

    private var color: Color {
        switch vote.position {
        case .yea: return theme.success
        case .nay: return theme.error
        case .present, .notVoting: return theme.textMuted
        }
    }
}

// MARK: - Not found

private struct RollCallNotFound: View {
    let rollCallID: String
    @Environment(\.theme) private var theme

    var body: some View {
        let meta = RollCallMeta(id: rollCallID)
        VStack(spacing: 8) {
            Text("Roll call not found")
                .font(Typo.inter(28, 600))
                .foregroundStyle(theme.text)
            if let meta {
                Text("We don\u{2019}t hold a \(meta.chamber.rawValue) roll call \(meta.number) for session \(meta.session) of the \(meta.congress)th Congress.")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 80)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Data

struct RollCallData: Sendable {
    struct Tally: Sendable { let yea: Int; let nay: Int; let present: Int; let notVoting: Int }
    struct PartySplit: Sendable {
        let demYea: Int, demNay: Int, repYea: Int, repNay: Int, indYea: Int, indNay: Int
    }
    struct BillRef: Sendable { let id: String; let label: String; let title: String?; let sourceURL: URL? }
    struct MemberVote: Identifiable, Sendable {
        var id: String { member.id }
        let member: Politician
        let position: VotePosition

        /// `D-CA`, `R-TX-12`, as the web's Seat column.
        var seat: String {
            let p = member.partyRaw.lowercased()
            let letter = p.hasPrefix("dem") ? "D" : p.hasPrefix("rep") ? "R" : p.hasPrefix("ind") ? "I" : String(member.partyRaw.prefix(1))
            var s = "\(letter)-\(member.state)"
            if let d = member.district, !d.isEmpty { s += "-\(d)" }
            return s
        }
    }

    let id: String
    let meta: RollCallMeta
    let question: String?
    let description: String?
    let votedAt: Date?
    let bill: BillRef?
    let tally: Tally?
    let party: PartySplit?
    let result: String?
    let sourceURL: URL?
    let votes: [MemberVote]
}

@MainActor
final class RollCallModel: ObservableObject {
    enum State { case idle, loading, loaded(RollCallData), notFound, failed(String) }

    @Published private(set) var state: State = .idle
    private let rollCallID: String

    init(rollCallID: String) { self.rollCallID = rollCallID }

    func loadIfNeeded() async {
        guard case .idle = state else { return }
        await load()
    }

    func load() async {
        state = .loading
        guard let meta = RollCallMeta(id: rollCallID) else { state = .notFound; return }
        let id = rollCallID
        do {
            async let callTask = BallotWatchAPI.rollCalls(ids: [id])
            async let statsTask = try? BallotWatchAPI.rollCallStats(ids: [id])
            async let votesTask = BallotWatchAPI.votesForRollCall(id)
            async let rosterTask = BallotWatchAPI.allPoliticians()

            guard let call = try await callTask.first else { state = .notFound; return }
            let stats = (await statsTask)?.first
            let votes = try await votesTask
            let roster = try await rosterTask

            var bill: RollCallData.BillRef?
            if let billID = call.billID {
                let row = try? await BallotWatchAPI.bill(id: billID)
                bill = RollCallData.BillRef(
                    id: billID,
                    label: BillKey(id: billID)?.display ?? billID,
                    title: row?.title,
                    sourceURL: row?.sourceURL.flatMap(URL.init(string:))
                )
            }

            let byID = Dictionary(roster.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            let members = votes.compactMap { v -> RollCallData.MemberVote? in
                byID[v.politicianID].map { RollCallData.MemberVote(member: $0, position: v.position) }
            }
            .sorted { $0.member.name.localizedCompare($1.member.name) == .orderedAscending }

            // Same tally rule as src/services/rollCall.js: the stats row when it
            // has any votes, else a count of member votes; shown only when sane.
            let present = members.filter { $0.position == .present }.count
            let notVoting = members.filter { $0.position == .notVoting }.count
            var tally: RollCallData.Tally?
            if let stats, stats.totalYea + stats.totalNay > 0 {
                tally = .init(yea: stats.totalYea, nay: stats.totalNay, present: present, notVoting: notVoting)
            } else if !members.isEmpty {
                tally = .init(
                    yea: members.filter { $0.position == .yea }.count,
                    nay: members.filter { $0.position == .nay }.count,
                    present: present, notVoting: notVoting
                )
            }
            if let t = tally, !FloorVotes.isSane(yea: t.yea, nay: t.nay, chamber: meta.chamber) { tally = nil }

            let result = tally.flatMap {
                FloorVotes.deriveResult(question: call.question, yea: $0.yea, nay: $0.nay, chamber: meta.chamber, description: call.description)
            }

            let party = stats.map {
                RollCallData.PartySplit(
                    demYea: $0.demYea ?? 0, demNay: $0.demNay ?? 0,
                    repYea: $0.repYea ?? 0, repNay: $0.repNay ?? 0,
                    indYea: $0.indYea ?? 0, indNay: $0.indNay ?? 0
                )
            }

            let votedAt = call.date ?? votes.first?.date
            let source = FloorWeb.officialRollCallURL(id) ?? votes.first?.sourceURL.flatMap(URL.init(string:))

            state = .loaded(RollCallData(
                id: id, meta: meta,
                question: call.question?.floorNonEmpty, description: call.description?.floorNonEmpty,
                votedAt: votedAt, bill: bill, tally: tally, party: party, result: result,
                sourceURL: source, votes: members
            ))
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }
}

private extension String {
    var floorNonEmpty: String? { isEmpty ? nil : self }
}
