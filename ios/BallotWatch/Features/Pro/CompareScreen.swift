import SwiftUI

/// How often two members cast the same Yea or Nay on the same roll call.
/// Present and Not Voting take no position, so they are left out, the same
/// rule the independence score uses (see MethodologyScreen).
enum Agreement {
    struct Result: Equatable {
        let shared: Int
        let agreed: Int
        /// Roll calls where one voted Yea and the other Nay, newest first.
        let disagreements: [String]
        var percent: Int? { shared == 0 ? nil : Int((Double(agreed) / Double(shared) * 100).rounded()) }
    }

    struct Cast: Equatable {
        let rollCallID: String
        let position: VotePosition
        let votedAt: String
    }

    static func compute(_ a: [Cast], _ b: [Cast]) -> Result {
        let decisive: (Cast) -> Bool = { $0.position == .yea || $0.position == .nay }
        let byRoll = Dictionary(b.filter(decisive).map { ($0.rollCallID, $0) }, uniquingKeysWith: { first, _ in first })
        var shared = 0, agreed = 0
        var split: [(String, String)] = []
        for vote in a where decisive(vote) {
            guard let other = byRoll[vote.rollCallID] else { continue }
            shared += 1
            if other.position == vote.position { agreed += 1 } else { split.append((vote.rollCallID, vote.votedAt)) }
        }
        return Result(
            shared: shared,
            agreed: agreed,
            disagreements: split.sorted { $0.1 > $1.1 }.map(\.0)
        )
    }
}

struct CompareScreen: View {
    let first: Politician

    @Environment(\.theme) private var theme
    @State private var second: Politician?
    @State private var picking = false
    @State private var result: Agreement.Result?
    @State private var votesA: [BallotWatchAPI.VoteWithBill] = []
    @State private var votesB: [BallotWatchAPI.VoteWithBill] = []
    @State private var isLoading = false
    @State private var failed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 14) {
                    side(first)
                    if let second {
                        Text("compared with")
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.textMuted)
                        Button { picking = true } label: { side(second) }
                            .buttonStyle(.plain)
                            .accessibilityHint("Choose another member")
                    } else {
                        Button("Choose a member to compare") { picking = true }
                            .buttonStyle(PrimaryButtonStyle())
                            .accessibilityIdentifier("compareChoose")
                    }
                }

                if isLoading {
                    HStack(spacing: 12) {
                        DomeView(width: 44, isThinking: true)
                        Text("Lining up their votes")
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.textMuted)
                    }
                } else if failed {
                    Text("Couldn't load their votes. Try again.")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.error)
                } else if let result, let second {
                    summary(result, second)
                    if !result.disagreements.isEmpty { splits(result) }
                }

                SourceNote(text: "Recorded votes from the House Clerk and the Senate, via Congress.gov. Counts only votes where both cast Yea or Nay.")
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
        .background(theme.bg.ignoresSafeArea())
        .navigationTitle("Compare")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $picking) {
            MemberPickerSheet(excluding: first) { member in
                second = member
                picking = false
            }
            .presentationDetents([.medium, .large])
            .sheetChrome()
        }
        .task(id: second?.id) { await load() }
    }

    private func side(_ member: Politician) -> some View {
        HStack(spacing: 10) {
            MemberPhoto(bioguideID: member.id, name: member.name, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(member.name)
                    .font(Typo.inter(16, 600))
                    .foregroundStyle(theme.text)
                    .lineLimit(2)
                PartyTag(party: member.party, seat: member.seatLabel())
            }
        }
    }

    private func summary(_ result: Agreement.Result, _ second: Politician) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let percent = result.percent {
                Text("\(percent)%")
                    .font(Typo.inter(64, 600, relativeTo: .largeTitle).monospacedDigit())
                    .webTracking(-0.04, size: 64)
                    .foregroundStyle(theme.text)
                Text("They voted the same way on \(result.agreed) of \(result.shared) recorded votes they both cast.")
                    .font(Typo.inter(17))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("They haven't cast a Yea or Nay on the same roll call in the record we hold.")
                    .font(Typo.inter(17))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surface))
    }

    private func splits(_ result: Agreement.Result) -> some View {
        let a = Dictionary(votesA.compactMap { v in v.rollCallID.map { ($0, v) } }, uniquingKeysWith: { x, _ in x })
        let b = Dictionary(votesB.compactMap { v in v.rollCallID.map { ($0, v) } }, uniquingKeysWith: { x, _ in x })
        return VStack(alignment: .leading, spacing: 14) {
            Text("Where They Split")
                .font(Typo.inter(20, 600, relativeTo: .title3))
                .foregroundStyle(theme.text)
            ForEach(result.disagreements.prefix(12), id: \.self) { roll in
                if let va = a[roll], let vb = b[roll] {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(va.bill?.title.flatMap { $0.isEmpty ? nil : $0 } ?? va.billID.flatMap { BillKey(id: $0)?.display } ?? roll)
                            .font(Typo.inter(16, 500))
                            .foregroundStyle(theme.text)
                            .lineLimit(3)
                        HStack(spacing: 16) {
                            positionLine(first.lastNameForDisplay, va.position)
                            if let second { positionLine(second.lastNameForDisplay, vb.position) }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
                }
            }
        }
    }

    private func positionLine(_ name: String, _ position: VotePosition) -> some View {
        HStack(spacing: 6) {
            Text(name)
                .font(Typo.inter(15))
                .foregroundStyle(theme.textSecondary)
            MembersVoteBadge(position: position)
        }
    }

    private func load() async {
        guard let second else { return }
        isLoading = true
        failed = false
        defer { isLoading = false }
        do {
            async let a = BallotWatchAPI.memberVotes(politicianID: first.id, limit: 1000)
            async let b = BallotWatchAPI.memberVotes(politicianID: second.id, limit: 1000)
            (votesA, votesB) = try await (a, b)
            func casts(_ votes: [BallotWatchAPI.VoteWithBill]) -> [Agreement.Cast] {
                votes.compactMap { v in v.rollCallID.map { Agreement.Cast(rollCallID: $0, position: v.position, votedAt: v.votedAt) } }
            }
            result = Agreement.compute(casts(votesA), casts(votesB))
        } catch {
            failed = true
        }
    }
}

/// Pick a member of the same chamber to compare with.
private struct MemberPickerSheet: View {
    let excluding: Politician
    let pick: (Politician) -> Void

    @Environment(\.theme) private var theme
    @State private var roster: [Politician] = []
    @State private var failed = false
    @State private var query = ""

    var body: some View {
        NavigationStack {
            Group {
                if roster.isEmpty {
                    VStack(spacing: 12) {
                        if failed {
                            Button("Try again") { Task { await load() } }
                                .buttonStyle(SecondaryButtonStyle())
                        } else {
                            ProgressView().tint(theme.textMuted)
                        }
                        Text(failed ? "Couldn't load members." : "Loading members")
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.textMuted)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filtered) { member in
                        Button { pick(member) } label: {
                            HStack(spacing: 12) {
                                MemberPhoto(bioguideID: member.id, name: member.name, size: 36)
                                Text(member.name)
                                    .font(Typo.inter(17))
                                    .foregroundStyle(theme.text)
                                Spacer()
                                PartyTag(party: member.party, seat: member.seatLabel())
                            }
                            .frame(minHeight: 44)
                        }
                        .listRowBackground(theme.bg)
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(theme.bg.ignoresSafeArea())
            .searchable(text: $query, prompt: "Name or state")
            .navigationTitle("Choose a Member")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    private var filtered: [Politician] {
        let pool = roster.filter { $0.id != excluding.id && $0.chamber == excluding.chamber }
        let q = query.trimmed.lowercased()
        let matches = q.isEmpty ? pool : pool.filter { $0.name.lowercased().contains(q) || $0.state.lowercased() == q }
        return matches.sorted { $0.name < $1.name }
    }

    private func load() async {
        failed = false
        do { roster = try await BallotWatchAPI.allPoliticians() } catch { failed = true }
    }
}

private extension Politician {
    var lastNameForDisplay: String { name.split(separator: " ").last.map(String.init) ?? name }
}
