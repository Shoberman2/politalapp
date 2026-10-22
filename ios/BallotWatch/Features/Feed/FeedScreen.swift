import SwiftUI

/// The Floor tab: the website's /this-week page ("This week on the floor").
///
/// Ported from ThisWeekPage.jsx + ThisWeekOnFloor.jsx and their CSS
/// (InfoPage.css hero, ThisWeekOnFloor.css). On a phone the web stacks its two
/// columns: what the House has scheduled (docs.house.gov, through the site's
/// public GET /api/v1/floor/schedule), then the roll calls Congress most
/// recently recorded. Rows only ever come from those two sources; tallies only
/// when they pass the sanity check in `FloorVotes`.
struct FeedScreen: View {
    @StateObject private var model = FeedModel()
    @State private var stackID = UUID()
    @Environment(\.theme) private var theme

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    FloorHero()

                    // `.twof-grid` on a phone: one column, gap var(--space-5).
                    // Recorded votes first: there are always some, while the
                    // House schedule is often empty between sessions.
                    VStack(alignment: .leading, spacing: 32) {
                        FloorRecordedColumn(votes: model.votes)
                        FloorScheduledColumn(schedule: model.schedule)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 48)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .paperBackground()
            .refreshable { await model.load() }
            .tabRoot("Floor")
            .task { await model.loadIfNeeded() }
        }
        .id(stackID)
        .environment(\.floorShowThisWeek, { stackID = UUID() })
    }
}

// MARK: - Hero

/// Under the large "Floor" title: which Congress, and one line on what the
/// floor is for someone new to it.
private struct FloorHero: View {
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("Where the whole House or Senate meets to vote. Here are the latest votes, then what House leaders plan to bring up next.")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                InfoTerm("floor")
            }
            Text("\(FloorWeb.ordinal(FloorWeb.currentCongress())) Congress · updated daily")
                .font(Typo.inter(13, 500))
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 4)
        .padding(.bottom, 20)
    }
}

// MARK: - Columns

/// A section heading in sentence case, with an optional ⓘ and a short
/// line under it.
private struct FloorColumnTitle: View {
    let title: String
    var subtitle: String?
    var term: String?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(title)
                    .font(Typo.inter(22, 600, relativeTo: .title2))
                    .foregroundStyle(theme.text)
                if let term { InfoTerm(term) }
            }
            if let subtitle {
                Text(subtitle)
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 12)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct FloorScheduledColumn: View {
    /// .none = loading, .some(nil) = failed, otherwise data.
    let schedule: FloorSchedule??
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FloorColumnTitle(title: "Coming up", subtitle: "What House leaders plan to bring to a vote. A plan, not a promise.")
            content
            Text(FloorSchedule.senateNote)
                .font(Typo.inter(13))
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch schedule {
        case .none:
            FloorSkeletonRows(count: 4)
        case .some(.none):
            FloorEmptyText(
                Text("The House floor schedule couldn\u{2019}t be loaded right now. The official copy is on ")
                    + FloorEmptyText.link("docs.house.gov", FloorSchedule.houseFloorHome)
                    + Text(".")
            )
        case .some(.some(let schedule)):
            FloorScheduleWeeks(schedule: schedule, limit: 20)
        }
    }
}

private struct FloorScheduleWeeks: View {
    let schedule: FloorSchedule
    let limit: Int
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    private struct Group: Identifiable {
        var id: String { week.week }
        let week: FloorSchedule.Week
        let shown: [FloorSchedule.Item]
        let hidden: Int
    }

    private var published: [FloorSchedule.Week] {
        schedule.weeks.filter { $0.status == "published" && !$0.items.isEmpty }
    }

    private var groups: [Group] {
        var remaining = limit
        var out: [Group] = []
        for w in published {
            if remaining <= 0 { break }
            let shown = Array(w.items.prefix(remaining))
            remaining -= shown.count
            out.append(Group(week: w, shown: shown, hidden: w.items.count - shown.count))
        }
        return out
    }

    var body: some View {
        let thisWeek = schedule.weeks.first
        let nextWeek = schedule.weeks.count > 1 ? schedule.weeks[1] : nil

        if published.isEmpty {
            let weekPart: Text = thisWeek.map {
                Text(" (week of ") + Text(FloorWeb.weekLabel($0.week)).font(Typo.mono(14)) + Text(")")
            } ?? Text("")
            FloorEmptyText(
                Text("No floor schedule published for this week") + weekPart
                    + Text(". The House may be out of session. ")
                    + FloorEmptyText.link("Check docs.house.gov", thisWeek?.sourceURL ?? FloorSchedule.houseFloorHome)
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                if let thisWeek, thisWeek.status != "published" {
                    FloorEmptyText(
                        Text("Nothing published for this week (")
                            + Text(FloorWeb.weekLabel(thisWeek.week)).font(Typo.mono(14))
                            + Text(").")
                    )
                }
                ForEach(groups) { group in
                    VStack(alignment: .leading, spacing: 0) {
                        Text("\(group.week.week == nextWeek?.week ? "Next week" : "This week") · week of \(FloorWeb.weekLabel(group.week.week))")
                            .font(Typo.inter(14, 600))
                            .foregroundStyle(theme.textSecondary)
                            .padding(.top, 4)
                            .padding(.bottom, 8)
                        ForEach(Array(group.shown.enumerated()), id: \.element.id) { index, item in
                            FloorScheduledRow(item: item, isLast: index == group.shown.count - 1)
                        }
                        if group.hidden > 0, let url = group.week.sourceURL {
                            FloorMoreLink(text: "\(group.hidden) more on the official schedule", url: url)
                        }
                    }
                }
                ForEach(published.dropFirst(groups.count)) { week in
                    if let url = week.sourceURL {
                        FloorMoreLink(text: "Week of \(FloorWeb.weekLabel(week.week)): \(week.items.count) items on the official schedule", url: url)
                    }
                }
            }
        }
    }
}

/// `.twof-more`
private struct FloorMoreLink: View {
    let text: String
    let url: URL
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button { openURL(url) } label: {
            Text(text)
                .font(Typo.inter(14, 500))
                .foregroundStyle(theme.accent)
        }
        .buttonStyle(.plain)
        .padding(.vertical, 8)
    }
}

/// `.twof-empty` / `.twof-note`: 14px, line-height 1.5, --ink-2. Links
/// inherit the paragraph color (`.bw a { color: inherit }`).
private struct FloorEmptyText: View {
    let text: Text
    @Environment(\.theme) private var theme

    init(_ text: Text) { self.text = text }

    static func link(_ label: String, _ url: URL) -> Text {
        var s = AttributedString(label)
        s.link = url
        return Text(s)
    }

    var body: some View {
        text
            .font(Typo.inter(15))
            .foregroundStyle(theme.textSecondary)
            .tint(theme.accent)
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .padding(.bottom, 10)
    }
}

private struct FloorRecordedColumn: View {
    /// nil = loading.
    let votes: [FloorVote]?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            FloorColumnTitle(title: "Latest votes", subtitle: "Tap a vote to see how every member voted.", term: "rollCall")
            if let votes {
                if votes.isEmpty {
                    FloorEmptyText(Text("No recorded votes to show right now."))
                } else {
                    ForEach(Array(votes.enumerated()), id: \.element.id) { index, vote in
                        FloorRecordedRow(vote: vote, isLast: index == votes.count - 1)
                    }
                }
            } else {
                FloorSkeletonRows(count: 4)
            }
        }
    }
}

// MARK: - Rows

/// A rounded card; scheduled items get an amber edge so plans read
/// differently from votes already taken.
private struct FloorRowFrame<Content: View>: View {
    var isLast: Bool
    var scheduled = false
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .overlay(alignment: .leading) {
                if scheduled {
                    UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, style: .continuous)
                        .fill(theme.warning)
                        .frame(width: 4)
                }
            }
            .padding(.bottom, 10)
    }
}

/// The question or bill title, in full: up to four lines, never cut to one.
private struct FloorRowTitle: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(Typo.inter(17, 500, relativeTo: .headline))
            .foregroundStyle(theme.text)
            .lineLimit(4)
            .lineSpacing(2)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A small rounded label: chamber, bill number, schedule category.
private struct FloorChip: View {
    let text: String
    var color: Color? = nil
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(Typo.inter(13, 600))
            .foregroundStyle(color ?? theme.textSecondary)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill((color ?? theme.textSecondary).opacity(0.1)))
    }
}

struct FloorRecordedRow: View {
    let vote: FloorVote
    var isLast = false
    @Environment(\.theme) private var theme

    private var rollLabel: String {
        vote.number.map { "Roll call \($0)" } ?? "Roll call"
    }

    private var dateLabel: String? {
        vote.date.map { $0.formatted(.dateTime.month(.abbreviated).day()) }
    }

    private var text: String { vote.description ?? vote.question ?? "" }

    var body: some View {
        FloorRowFrame(isLast: isLast) {
            HStack(alignment: .center, spacing: 8) {
                if let chamber = vote.chamber {
                    FloorChip(text: chamber.label, color: theme.accent)
                }
                if let billID = vote.billID, let display = vote.billDisplay {
                    NavigationLink {
                        BillDetailScreen(billID: billID, focusRollCallID: vote.id)
                    } label: {
                        FloorChip(text: display)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Bill \(display)")
                }
                Spacer(minLength: 0)
                Text([rollLabel, dateLabel].compactMap { $0 }.joined(separator: " · "))
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textMuted)
                    .lineLimit(1)
                    .accessibilityIdentifier("floorRowNumber")
            }

            NavigationLink {
                RollCallScreen(rollCallID: vote.id, question: vote.question)
            } label: {
                VStack(alignment: .leading, spacing: 10) {
                    if !text.isEmpty { FloorRowTitle(text: text) }
                    HStack(alignment: .center, spacing: 12) {
                        foot
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("floorRow")
        }
    }

    @ViewBuilder
    private var foot: some View {
        if let result = vote.result {
            Text(result)
                .font(Typo.inter(13, 600))
                .foregroundStyle(resultColor(result))
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(resultColor(result).opacity(0.12)))
        }
        if let yea = vote.yea, let nay = vote.nay {
            Text("Yes \(yea) · No \(nay)")
                .font(Typo.inter(14, 500))
                .monospacedDigit()
                .foregroundStyle(theme.textSecondary)
        }
    }

    private func resultColor(_ result: String) -> Color {
        switch FloorWeb.feedResultKind(result) {
        case .pass: return theme.success
        case .fail: return theme.error
        case .neutral: return theme.textSecondary
        }
    }
}

private struct FloorScheduledRow: View {
    let item: FloorSchedule.Item
    var isLast = false
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL

    var body: some View {
        FloorRowFrame(isLast: isLast, scheduled: true) {
            HStack(alignment: .center, spacing: 8) {
                if let billID = item.billID {
                    NavigationLink {
                        BillDetailScreen(billID: billID)
                    } label: {
                        FloorChip(text: item.label ?? "\u{2014}", color: theme.accent)
                    }
                    .buttonStyle(.plain)
                } else if let label = item.label {
                    FloorChip(text: label)
                }
                if let category = item.category {
                    FloorChip(text: category, color: theme.warning)
                }
            }
            FloorRowTitle(text: item.title ?? "Untitled floor item")
            if let url = item.sourceURL {
                Button { openURL(url) } label: {
                    Text("Official schedule \u{2197}")
                        .font(Typo.inter(13, 500))
                        .foregroundStyle(theme.accent)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// `.twof-row--skeleton`: three bars with a calm pulse.
private struct FloorSkeletonRows: View {
    let count: Int
    @State private var dim = false
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(0..<count, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 8) {
                    bar(width: 72, height: 10)
                    GeometryReader { geo in bar(width: geo.size.width * 0.88, height: 12) }.frame(height: 12)
                    GeometryReader { geo in bar(width: geo.size.width * 0.4, height: 10) }.frame(height: 10)
                }
                .padding(16)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
                .padding(.bottom, 10)
            }
        }
        .opacity(dim ? 0.55 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { dim = true }
        }
        .accessibilityLabel("Loading")
    }

    private func bar(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: Radius.sm)
            .fill(theme.borderSoft)
            .frame(width: width, height: height)
    }
}

// MARK: - Model

@MainActor
final class FeedModel: ObservableObject {
    /// nil while loading; empty when nothing usable came back or the read failed.
    @Published private(set) var votes: [FloorVote]?
    /// .none while loading, .some(nil) when the schedule couldn't be loaded.
    @Published private(set) var schedule: FloorSchedule??

    private var started = false

    func loadIfNeeded() async {
        guard !started else { return }
        started = true
        await load()
    }

    func load() async {
        async let scheduleTask = FloorSchedule.load()
        async let votesTask = Self.recordedVotes()
        let (s, v) = await (scheduleTask, votesTask)
        schedule = .some(s)
        votes = v
    }

    /// The web asks for max(16, limit * 2) = 40, keeps rows with something to
    /// say, and shows 20. Results use the website's rule (FloorWeb).
    private static func recordedVotes() async -> [FloorVote] {
        guard let feed = try? await FloorVotes.recent(fetchCount: 40) else { return [] }
        return feed.votes
            .filter { $0.description != nil || $0.question != nil || $0.billID != nil }
            .prefix(20)
            .map { vote in
                var v = vote
                v.result = FloorVotes.deriveResult(
                    question: v.question, yea: v.yea, nay: v.nay,
                    chamber: v.chamber, description: v.description
                )
                return v
            }
    }
}
