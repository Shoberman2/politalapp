import SwiftUI

/// Account, saved items, and the honesty pages — methodology, sources, data
/// freshness. A transparency tool has to be transparent about itself.
struct MoreScreen: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme
    @State private var showingAuth = false
    @State private var confirmingDelete = false
    @State private var deleteError: String?
    @State private var lastETLRun: Date?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    InfoSection { accountSection }
                    if !userData.followedMembers.isEmpty { InfoSection { followingSection } }
                    if !userData.watchedBills.isEmpty { InfoSection { watchingSection } }
                    InfoSection { learnSection }
                    InfoSection { dataSection }
                    InfoSection(isLast: true) { aboutSection }
                }
            }
            .paperBackground()
            .tabRoot("More")
            .sheet(isPresented: $showingAuth) { AuthScreen() }
            .task { lastETLRun = try? await BallotWatchAPI.lastETLRun() }
        }
    }

    // MARK: Account

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            InfoHeading("Account")
            if let user = auth.user {
                InfoFacts(rows: [("Signed in", user.email ?? "Your account")])
                accountSyncStatus(userID: user.id)
                    .padding(.top, 12)
                HStack(spacing: 24) {
                    Button("Sign out") { Task { await auth.signOut() } }
                        .buttonStyle(SecondaryButtonStyle())
                    Button("Delete account") { confirmingDelete = true }
                        .font(Typo.inter(15, 500))
                        .foregroundStyle(theme.error)
                        .frame(minHeight: 44)
                        .disabled(auth.isLoading)
                        .accessibilityIdentifier("deleteAccountButton")
                }
                .padding(.top, 10)
                if let deleteError {
                    Text(deleteError)
                        .font(Typo.inter(14))
                        .foregroundStyle(theme.error)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                InfoParagraph("Congressional voting records are public, and everything here is free to read. A free account keeps your representatives, saved bills and followed members on every device.")
                VStack(alignment: .leading, spacing: 4) {
                    Button("Sign in") { showingAuth = true }
                        .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                }
                .padding(.top, 18)
            }
        }
        .confirmationDialog(
            "Delete your account?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete account", role: .destructive) {
                Task {
                    do {
                        try await auth.deleteAccount()
                        deleteError = nil
                    } catch {
                        deleteError = error.localizedDescription
                    }
                }
            }
        } message: {
            Text("This permanently deletes your account and the bills and members synced to it. Items saved on this device stay here.")
        }
    }

    @ViewBuilder
    private func accountSyncStatus(userID: String) -> some View {
        switch userData.syncStatus {
        case .localOnly:
            InfoMuted("Saved items are stored on this device while account sync starts.")
        case .syncing:
            HStack(spacing: Space.xs) {
                ProgressView().controlSize(.small)
                InfoMuted("Syncing saved bills and members…")
            }
        case .synced:
            InfoMuted("Your watched bills and followed members sync to this account.")
        case .failed(let message):
            VStack(alignment: .leading, spacing: 4) {
                Text("Saved on this device. Account sync failed: \(message)")
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.error)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Retry sync") {
                    Task {
                        guard await auth.prepareDataAccess() != nil else { return }
                        await userData.syncAccount(userID: userID)
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    // MARK: Saved

    private var followingSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            InfoHeading("Following", count: userData.followedMembers.count)
            FollowedMembersList(ids: Array(userData.followedMembers).sorted())
        }
    }

    private var watchingSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            InfoHeading("Watching", count: userData.watchedBills.count)
            VStack(spacing: 0) {
                ForEach(Array(userData.watchedBills).sorted(), id: \.self) { billID in
                    NavigationLink { BillDetailScreen(billID: billID) } label: {
                        IndexRow(title: BillKey(id: billID)?.display ?? billID, mono: true)
                    }
                    .buttonStyle(.plain)
                }
            }
            .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }
        }
    }

    // MARK: Data

    private var dataSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Kicker("The data").padding(.bottom, 16)
            InfoHeading("Where the numbers come from")
            InfoFacts(rows: [
                ("Votes", "Congress.gov, the House Clerk and the Senate"),
                ("Members", "Congress.gov"),
                ("Districts", "U.S. Census Geocoder"),
                ("Money", "Federal Election Commission"),
            ] + (lastETLRun.map { [("Updated", DateParsing.medium($0))] } ?? []))
            InfoParagraph("We show a vote tally only when it passes a sanity check against the chamber's size. Where a count is missing or implausible, we show nothing rather than a number we can't stand behind.")
                .padding(.top, 18)
        }
    }

    // MARK: Learn

    private var learnSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            InfoHeading("New to Congress?")
            NavigationLink { GlossaryScreen() } label: {
                IndexRow(title: "Glossary", dek: "Congress in plain English: what every term in the app means.")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("moreGlossary")
            .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }
        }
    }

    // MARK: About

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            InfoHeading("About")
            VStack(spacing: 0) {
                NavigationLink { MethodologyScreen() } label: {
                    IndexRow(title: "Methodology", dek: "How each number is made, and the caveat that belongs beside it.")
                }
                .buttonStyle(.plain)
                ForEach(Self.siteLinks, id: \.title) { link in
                    Link(destination: Config.siteURL.appendingPathComponent(link.path)) {
                        IndexRow(title: link.title, dek: link.dek, external: true)
                    }
                    .buttonStyle(.plain)
                }
            }
            .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }

            Text("\(Brand.name) for iPhone · Version \(Self.version)")
                .font(Typo.mono(11.5))
                .tracking(11.5 * 0.04)
                .foregroundStyle(theme.textMuted)
                .padding(.top, 24)
        }
    }

    private static let siteLinks: [(title: String, dek: String, path: String)] = [
        ("How it works", "Where the record comes from and what we do with it.", "how-it-works"),
        ("Data sources", "Every source BallotWatch reads, and what each one supports.", "data-sources"),
        ("About", "Who builds BallotWatch and why.", "about"),
        ("Privacy", "What we collect, and what never leaves your device.", "privacy"),
        ("Terms", "The terms of using BallotWatch.", "terms"),
        ("Contact", "Corrections, privacy requests and questions.", "contact"),
    ]

    private static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }
}

// MARK: - Info page system
//
// Port of src/styles/InfoPage.css, the one layout for every explanatory page
// on the web: a hero (mono kicker, display title, lede), sections split by
// thin rules, and index rows of title + one line + arrow.

struct InfoHero: View {
    let kicker: String
    let title: String
    var lede: String?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(kicker.uppercased())
                .font(Typo.mono(11))
                .tracking(11 * 0.12)
                .foregroundStyle(theme.textSecondary)
                .padding(.bottom, 16)
            Text(title)
                .font(Typo.inter(36, 600, relativeTo: .largeTitle))
                .webTracking(-0.035, size: 36)
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
            if let lede {
                Text(lede)
                    .font(Typo.inter(17))
                    .lineSpacing(5)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 18)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.top, 56)
        .padding(.bottom, 40)
        .overlay(alignment: .bottom) { Rectangle().fill(theme.border).frame(height: 1) }
    }
}

struct InfoSection<Content: View>: View {
    var isLast = false
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, isLast ? 32 : 8)
    }
}

/// `.info-page h2`.
struct InfoHeading: View {
    let text: String
    var count: Int?
    @Environment(\.theme) private var theme

    init(_ text: String, count: Int? = nil) {
        self.text = text
        self.count = count
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text)
                .font(Typo.inter(28, 600, relativeTo: .title))
                .webTracking(-0.025, size: 28)
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let count {
                Text("\(count)")
                    .font(Typo.mono(13))
                    .foregroundStyle(theme.textMuted)
            }
        }
        .padding(.bottom, 20)
        .accessibilityAddTraits(.isHeader)
    }
}

struct InfoParagraph: View {
    let text: String
    @Environment(\.theme) private var theme
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Typo.inter(16))
            .lineSpacing(5)
            .foregroundStyle(theme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct InfoMuted: View {
    let text: String
    @Environment(\.theme) private var theme
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Typo.inter(14))
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// `.ip-facts`: mono label column, plain value, thin rule above each row.
struct InfoFacts: View {
    let rows: [(String, String)]
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .firstTextBaseline, spacing: 16) {
                    Text(row.0.uppercased())
                        .font(Typo.mono(11))
                        .tracking(11 * 0.12)
                        .foregroundStyle(theme.textMuted)
                        .frame(width: 96, alignment: .leading)
                    Text(row.1)
                        .font(Typo.inter(15))
                        .foregroundStyle(theme.text)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 12)
                .overlay(alignment: .top) { Rectangle().fill(theme.borderSoft).frame(height: 1) }
            }
        }
    }
}

/// `.ip-index` row: title 20/600, one line in --ink-2, accent arrow, rule below.
struct IndexRow: View {
    let title: String
    var dek: String?
    var external = false
    var mono = false
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(mono ? Typo.mono(15, 500) : Typo.inter(20, 600, relativeTo: .title3))
                    .webTracking(mono ? 0 : -0.01, size: 20)
                    .foregroundStyle(mono ? theme.accent : theme.text)
                if let dek {
                    Text(dek)
                        .font(Typo.inter(15))
                        .lineSpacing(3)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            Text(external ? "\u{2197}" : "\u{2192}")
                .font(Typo.inter(18))
                .foregroundStyle(theme.accent)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 20)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) { Rectangle().fill(theme.border).frame(height: 1) }
    }
}

// MARK: - Followed members

struct FollowedMembersList: View {
    let ids: [String]
    @State private var members: [Politician] = []

    var body: some View {
        VStack(spacing: 0) {
            ForEach(members) { member in
                NavigationLink { PoliticianDetailScreen(politician: member) } label: {
                    MemberRow(member: member)
                }
                .buttonStyle(.plain)
                RuleLine()
            }
        }
        .task(id: ids) {
            var loaded: [Politician] = []
            for id in ids {
                if let member = try? await BallotWatchAPI.politician(id: id) { loaded.append(member) }
            }
            members = loaded.sorted { $0.name < $1.name }
        }
    }
}

// MARK: - Methodology

struct MethodologyScreen: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                InfoHero(
                    kicker: "Methodology",
                    title: "How each number is made",
                    lede: "For every feature that computes or explains something: the source behind it, and the caveat that belongs beside it."
                )
                InfoSection(isLast: true) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(Self.entries.enumerated()), id: \.offset) { index, entry in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(entry.title)
                                    .font(Typo.inter(20, 600, relativeTo: .title3))
                                    .webTracking(-0.01, size: 20)
                                    .foregroundStyle(theme.text)
                                    .accessibilityAddTraits(.isHeader)
                                InfoParagraph(entry.body)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 24)
                            .overlay(alignment: .top) {
                                if index > 0 { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                            }
                        }
                    }
                }
            }
        }
        .paperBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }

    private static let entries: [(title: String, body: String)] = [
        (
            "Vote tallies",
            "A Yea/Nay count is shown only when the total is greater than zero and no larger than the chamber it came from — 435 for the House, 100 for the Senate. Some ingested rows double-count party columns; those are suppressed rather than displayed. Where the batch-computed tallies lag, counts are recomputed directly from individual member votes."
        ),
        (
            "Result labels",
            "Whether a vote passed is derived from the real threshold for that motion, not a blanket majority. Cloture requires 60 votes in the Senate. Suspension of the rules requires two-thirds. Nominations and motions to proceed carry their own language. A tie is reported as a failure, because that is what it is."
        ),
        (
            "Independence",
            "The independence figure is the share of a member's recorded Yea/Nay votes that went against their own party's majority on that same roll call. It counts only votes where we hold a party breakdown. Present and Not Voting are excluded, since neither takes a position. Independents who caucus with a party are measured against that caucus."
        ),
        (
            "Notable votes",
            "Ranked by the narrowest margin first, then by recency. Close votes are where a single member most plausibly mattered. The list is deterministic — everyone sees the same votes for the same member."
        ),
        (
            "Bill titles",
            "Some bills in the record carry placeholder titles that merely repeat the bill number. Where that happens, the app shows the number alone rather than a title that says nothing."
        ),
        (
            "District lookup",
            "A street address is matched against the US Census Geocoder, which returns the actual congressional district. A ZIP code alone resolves only to a state, because ZIP codes routinely cross district lines — in that case the full state delegation is shown rather than a guess."
        ),
        (
            "Seat successions",
            "When a member leaves mid-term, their votes stay attributed to them, not to whoever holds the seat now. This matters most when a successor shares a surname with their predecessor: those votes are separated by first name and by the dates each of them actually served."
        ),
        (
            "What's missing",
            "District partisan-lean analysis, available on the web, is not yet in this app."
        ),
    ]
}
