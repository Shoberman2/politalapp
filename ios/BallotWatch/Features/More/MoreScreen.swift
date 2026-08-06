import SwiftUI

/// Account, saved items, and the honesty pages — methodology, sources, data
/// freshness. A transparency tool has to be transparent about itself.
struct MoreScreen: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme
    @State private var showingAuth = false
    @State private var lastETLRun: Date?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    accountSection
                    if !userData.followedMembers.isEmpty { followingSection }
                    if !userData.watchedBills.isEmpty { watchingSection }
                    dataSection
                    aboutSection
                }
                .padding(.horizontal, Space.md)
                .padding(.bottom, Space.xxl)
            }
            .paperBackground()
            .navigationTitle("More")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingAuth) { AuthScreen() }
            .task { lastETLRun = try? await BallotWatchAPI.lastETLRun() }
        }
    }

    // MARK: Account

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Account")
            if let user = auth.user {
                Card {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Text(user.email ?? "Signed in")
                            .font(Typo.bodyMedium)
                            .foregroundStyle(theme.text)
                        Text("Your watched bills and followed members sync to this account.")
                            .font(Typo.caption)
                            .foregroundStyle(theme.textSecondary)
                        Button("Sign out") { Task { await auth.signOut() } }
                            .font(Typo.bodySMMedium)
                            .foregroundStyle(theme.error)
                            .padding(.top, Space.xxs)
                    }
                }
            } else {
                Card {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Text("Everything here is free to read")
                            .font(Typo.headline)
                            .foregroundStyle(theme.text)
                        Text("Congressional voting records are public. Sign in only if you want your saved bills and members to follow you to another device.")
                            .font(Typo.bodySM)
                            .foregroundStyle(theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Button("Sign in") { showingAuth = true }
                            .buttonStyle(SecondaryButtonStyle())
                            .padding(.top, Space.xxs)
                    }
                }
            }
        }
    }

    // MARK: Saved

    private var followingSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Following", trailing: "\(userData.followedMembers.count)")
            FollowedMembersList(ids: Array(userData.followedMembers).sorted())
        }
    }

    private var watchingSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "Watching", trailing: "\(userData.watchedBills.count)")
            ForEach(Array(userData.watchedBills).sorted(), id: \.self) { billID in
                NavigationLink { BillDetailScreen(billID: billID) } label: {
                    HStack {
                        Text(BillKey(id: billID)?.display ?? billID)
                            .font(Typo.monoMedium)
                            .foregroundStyle(theme.accent)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(theme.textMuted.opacity(0.6))
                    }
                    .padding(.vertical, Space.sm)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                RuleLine()
            }
        }
    }

    // MARK: Data

    private var dataSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "The data")
            Card {
                VStack(alignment: .leading, spacing: Space.sm) {
                    DataRow(label: "Votes and roll calls", value: "Congress.gov, via ETL")
                    RuleLine()
                    DataRow(label: "Member roster", value: "Congress.gov")
                    RuleLine()
                    DataRow(label: "District lookup", value: "US Census Geocoder")
                    if let lastETLRun {
                        RuleLine()
                        DataRow(label: "Last ingest", value: DateParsing.medium(lastETLRun))
                    }
                }
            }
            Text("We show a vote tally only when it passes a sanity check against the chamber's size. Where a count is missing or implausible, the app shows nothing rather than a number it can't stand behind.")
                .font(Typo.caption)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: About

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHead(title: "About")
            NavigationLink { MethodologyScreen() } label: {
                MoreRow(title: "Methodology", subtitle: "How the numbers are computed")
            }
            .buttonStyle(.plain)
            RuleLine()
            Link(destination: URL(string: "https://www.congress.gov")!) {
                MoreRow(title: "Congress.gov", subtitle: "The primary source", external: true)
            }
            .buttonStyle(.plain)
            RuleLine()

            HStack {
                Text("BallotWatch")
                    .font(Typo.h2)
                    .foregroundStyle(theme.textMuted)
                Spacer()
                Text("Version 1.0")
                    .font(Typo.monoSM)
                    .foregroundStyle(theme.textMuted)
            }
            .padding(.top, Space.sm)
        }
    }
}

// MARK: - Rows

private struct DataRow: View {
    let label: String
    let value: String
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(Typo.bodySM)
                .foregroundStyle(theme.text)
            Spacer()
            Text(value)
                .font(Typo.monoSM)
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct MoreRow: View {
    let title: String
    var subtitle: String?
    var external = false
    @Environment(\.theme) private var theme

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Typo.bodyMedium)
                    .foregroundStyle(theme.text)
                if let subtitle {
                    Text(subtitle)
                        .font(Typo.caption)
                        .foregroundStyle(theme.textSecondary)
                }
            }
            Spacer()
            Image(systemName: external ? "arrow.up.right" : "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(theme.textMuted.opacity(0.6))
        }
        .padding(.vertical, Space.sm)
        .contentShape(Rectangle())
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
            VStack(alignment: .leading, spacing: Space.lg) {
                ForEach(Self.entries, id: \.title) { entry in
                    VStack(alignment: .leading, spacing: Space.xs) {
                        SectionHead(title: entry.title)
                        Text(entry.body)
                            .font(Typo.body)
                            .foregroundStyle(theme.text)
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.horizontal, Space.md)
            .padding(.vertical, Space.md)
        }
        .paperBackground()
        .navigationTitle("Methodology")
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
            "Campaign finance and district partisan-lean analysis available on the web are not yet in this app."
        ),
    ]
}
