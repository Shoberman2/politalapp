import SwiftUI

/// A member's profile — the website's /politician/:id
/// (src/components/PoliticianDetail.jsx and src/styles/PoliticianDetail.css),
/// section for section at phone width: portrait, kicker, name with
/// party tag, standfirst, facts, actions; "The record, up front"; Voting
/// Pattern Analysis; records of service; "How they voted"; and "Where the
/// money comes from".
struct PoliticianDetailScreen: View {
    let politician: Politician

    @StateObject private var model: PoliticianDetailModel
    @State private var methodOpen = false
    @State private var showVPAMethodology = false
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme

    /// `.pol` at <=760px: 16px inside the 16px `.main-content` padding.
    private let gutter: CGFloat = 16

    init(politician: Politician) {
        self.politician = politician
        _model = StateObject(wrappedValue: PoliticianDetailModel(politician: politician))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                masthead
                recordSummary
                    .padding(.top, 48)
                patternAnalysis
                if !model.tenure.isEmpty { tenureSection }
                votesSection
                financeSection
                photoAttribution
            }
            .padding(.horizontal, gutter)
            .padding(.top, 12)
            .padding(.bottom, 80)
        }
        .background(theme.bg.ignoresSafeArea())
        .navigationTitle(model.displayName)
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
        .sheet(isPresented: $showVPAMethodology) { vpaMethodologySheet }
    }

    // MARK: Masthead

    private var masthead: some View {
        VStack(alignment: .leading, spacing: 0) {
            // App profile header: round photo beside the name.
            HStack(alignment: .center, spacing: 16) {
                MemberPhoto(bioguideID: politician.id, name: model.displayName, size: 96)
                    .overlay(Circle().stroke(theme.party(politician.party), lineWidth: 2))
                VStack(alignment: .leading, spacing: 6) {
                    Text(model.kicker.uppercased())
                        .font(Typo.mono(11, 500))
                        .tracking(11 * 0.06)
                        .foregroundStyle(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    nameLine
                }
            }
            .padding(.bottom, 16)

            if !model.standfirst.isEmpty {
                Text(model.standfirst)
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 20)
            }

            metaGrid

            actions
                .padding(.top, 28)
        }
        .padding(.bottom, 32)
        .overlay(alignment: .bottom) { MembersRule() }
    }

    /// `.pol-name` (36px Inter Display 600, -0.015em) with the inline
    /// `.pol-party-tag`: a 2px bar and "DEM" in mono, 12px after the name.
    private var nameLine: some View {
        let color = theme.party(politician.party)
        let short: String = {
            switch politician.party {
            case .democrat: return "DEM"
            case .republican: return "REP"
            default: return "IND"
            }
        }()
        return (
            Text(model.displayName)
                .font(Typo.inter(26, 600, relativeTo: .title))
                .kerning(-0.015 * 26)
                .foregroundColor(theme.text)
            + Text("\u{2002}").font(Typo.inter(24))
            + Text(MembersPartyBarImage.image(height: 13)).foregroundColor(color).baselineOffset(3)
            + Text("\u{2002}").font(Typo.mono(16))
            + Text(short)
                .font(Typo.mono(11))
                .kerning(11 * 0.08)
                .foregroundColor(color)
                .baselineOffset(4)
        )
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityLabel("\(model.displayName), \(politician.party.label)")
        .accessibilityAddTraits(.isHeader)
    }

    /// `.pol-meta-grid`: mono 11px labels, 14px values, 16px column gap.
    private var metaGrid: some View {
        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 10) {
            ForEach(model.facts) { fact in
                GridRow {
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(fact.label.uppercased())
                            .font(Typo.mono(11))
                            .tracking(11 * 0.08)
                            .foregroundStyle(theme.textMuted)
                        if fact.label == "Chamber" { InfoTerm("chamber") }
                    }
                    .gridCellAnchor(.leading)
                    factValue(fact)
                }
            }
        }
    }

    @ViewBuilder
    private func factValue(_ fact: PoliticianDetailModel.Fact) -> some View {
        let text = Text(fact.value).font(Typo.inter(14))
            + Text(fact.mono.isEmpty ? "" : (fact.value.isEmpty ? "" : " ")).font(Typo.inter(14))
            + Text(fact.mono).font(Typo.mono(14))
            + Text(fact.suffix).font(Typo.inter(14))
        if let url = fact.url {
            Link(destination: url) { text.foregroundStyle(theme.text) }
                .accessibilityHint("Calls the office")
        } else {
            text.foregroundStyle(theme.text)
                .membersLineHeight(1.5, size: 14)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var actions: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            NavigationLink {
                MemberRecordScreen(politician: politician)
            } label: {
                Text("Record in 60 seconds")
            }
            .buttonStyle(MembersTextButtonStyle(arrow: true))

            if let url = model.officialWebsite {
                Link(destination: url) { Text("Official website \u{2197}") }
                    .buttonStyle(PrimaryButtonStyle(fullWidth: false, small: true))
            }
        }
    }

    // MARK: The record, up front (VotingRecordSummary.jsx)

    private var recordSummary: some View {
        VStack(alignment: .leading, spacing: 0) {
            MembersSectionLabel("Voting history · at a glance")
                .padding(.bottom, 12)
            MembersSectionTitle("The record, up front")
                .padding(.bottom, 28)
            if let congress = model.ideology?.congress {
                recordMono("\(congress)th Congress")
                    .padding(.top, 8)
            }

            // `.pol-record-grid`, stacked.
            VStack(alignment: .leading, spacing: 0) {
                recordMono("Voting record most closely aligns with")
                Text(model.ideologyLabel)
                    .font(Typo.inter(28, 600, relativeTo: .title))
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .padding(.bottom, 16)
                MembersIdeologyScale(placement: model.ideology?.placement)
                VStack(alignment: .leading, spacing: 4) {
                    recordMono("Official party: \(model.partyName)")
                    if let estimate = model.ideology, estimate.available {
                        recordMono("\(estimate.confidence) model confidence")
                    }
                }
                .padding(.top, 16)
            }
            .padding(.top, 24)

            VStack(spacing: 0) {
                recordStat("Roll calls", model.totalRollCalls.map(String.init) ?? "\u{2014}")
                recordStat("Participation", model.participation.map { "\($0)%" } ?? "\u{2014}")
                recordStat("Party-majority match", model.stats?.partyLoyaltyPct.map { "\(Int($0.rounded()))%" } ?? "\u{2014}")
                recordStat("Different from party", model.crossover.substantiveCount > 0 ? "\(model.crossover.rate)%" : "\u{2014}")
            }
            .overlay(alignment: .top) { MembersRule() }
            .padding(.top, 32)

            methodDetails
                .padding(.top, 16)
        }
        .padding(.top, 32)
        .padding(.bottom, 24)
        .overlay(alignment: .top) { MembersRule() }
        .overlay(alignment: .bottom) { MembersRule() }
    }

    private func recordMono(_ text: String) -> some View {
        Text(text.uppercased())
            .font(Typo.mono(11))
            .tracking(11 * 0.04)
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func recordStat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            recordMono(label)
            Text(value)
                .font(Typo.mono(24))
                .foregroundStyle(theme.text)
                .tabularFigures()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { MembersRule() }
        .accessibilityElement(children: .combine)
    }

    /// `<details class="pol-record-method">`.
    private var methodDetails: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(Motion.short) { methodOpen.toggle() } } label: {
                Text("How this estimate works")
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.accent)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows the Voteview methodology and its limits")

            if methodOpen {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Voteview estimates a member’s position from recorded congressional roll calls. BallotWatch translates its modern first dimension into a plain-language range;" + (model.ideology.map { $0.votes > 0 ? " this estimate uses \($0.votes.formatted()) Voteview-coded votes." : " no label is shown without enough coded votes." } ?? " no label is shown without enough coded votes."))
                    Text("This is BallotWatch analysis, not an official affiliation or self-identification. Narrower labels such as “populist” or “neoconservative” are not inferred from party alone because this model does not measure those ideas reliably.")
                    HStack(spacing: 0) {
                        Link("Read the Voteview methodology \u{2197}", destination: VoteviewIdeology.methodologyURL)
                        Text(" · ")
                    }
                    Link("Request a source-linked correction \u{2197}", destination: VoteviewIdeology.correctionURL)
                }
                .font(Typo.inter(14))
                .foregroundStyle(theme.textSecondary)
                .tint(theme.accent)
                .membersLineHeight(1.65, size: 14)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
                .padding(.bottom, 4)
            }
        }
    }

    // MARK: Voting Pattern Analysis (VotingPatternAnalysis.jsx)

    private var patternAnalysis: some View {
        VStack(alignment: .leading, spacing: 0) {
            (Text("Voting Pattern Analysis")
                .font(Typo.inter(24, 600))
                .foregroundColor(theme.text)
             + Text("\u{2009}\u{2009}Record-based")
                .font(Typo.inter(13))
                .kerning(13 * 0.02)
                .foregroundColor(theme.textSecondary))
                .membersLineHeight(1.2, size: 24)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 24)

            switch model.vpa {
            case .idle:
                VStack(alignment: .leading, spacing: 16) {
                    Text("Compare this member's votes with party-majority direction, district lean, and donor-industry context. Notable votes are narrated from the recorded data.")
                        .font(Typo.inter(15))
                        .foregroundStyle(theme.textSecondary)
                        .membersLineHeight(1.6, size: 15)
                        .fixedSize(horizontal: false, vertical: true)
                    Button("Analyze voting patterns") { model.runAnalysis() }
                        .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                        .disabled(model.state != .loaded)
                }
                .padding(.top, 12)
                .padding(.bottom, 8)
            case .belowThreshold(let count):
                Text("Analysis available after \(model.displayName) has cast at least 50 roll-call votes this Congress. Currently: \(count).")
                    .font(Typo.inter(15))
                    .foregroundStyle(theme.textSecondary)
                    .membersLineHeight(1.6, size: 15)
                    .fixedSize(horizontal: false, vertical: true)
            case .analyzed(let analysis):
                analyzed(analysis)
            }
        }
        .padding(.vertical, 24)
        .padding(.vertical, 48)
        .overlay(alignment: .bottom) { MembersRule() }
    }

    private func analyzed(_ a: PoliticianDetailModel.Analysis) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Only the party-majority flag runs on data the app holds; the
            // donor-industry and district-lean flags need tables it doesn't
            // have, so they are left out rather than shown as estimates.
            MembersFlagBar(
                label: "Different from party majority",
                rate: a.crossover.substantiveCount > 0 ? a.crossover.rate : nil,
                description: a.crossover.substantiveCount > 0
                    ? "Voted differently from the party majority on \(a.crossover.count) of \(a.crossover.substantiveCount) substantive votes"
                        + (a.crossover.topPolicyAreas.isEmpty ? "." : ". Most crossovers: "
                           + a.crossover.topPolicyAreas.map { "\($0.area) (\($0.crossPct)%)" }.joined(separator: ", ") + ".")
                    : "Not enough comparable votes to compute crossover rate."
            )
            .padding(.top, 24)

            MembersRule().padding(.vertical, 24)

            // Notable votes.
            VStack(alignment: .leading, spacing: 0) {
                Text("Notable Votes")
                    .font(Typo.inter(22, 600))
                    .foregroundStyle(theme.text)
                    .padding(.bottom, 8)
                Text("Ranked by vote margin. \(a.typical.count) matched the party majority + \(a.atypical.count) differed from it.")
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textSecondary)
                    .membersLineHeight(1.6, size: 13)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 16)
                VStack(alignment: .leading, spacing: 24) {
                    notableColumn("Matched Party Majority", a.typical,
                                  empty: "No party-majority matches with substantive roll-call data.")
                    notableColumn("Different From Party Majority", a.atypical,
                                  empty: "No substantive votes differed from the party majority in this data set.")
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 8)

            VStack(alignment: .leading, spacing: 12) {
                Button("Methodology and data sources") { showVPAMethodology = true }
                Button("Refresh analysis") { model.runAnalysis() }
                    .accessibilityLabel("Re-run analysis")
            }
            .font(Typo.inter(14))
            .foregroundStyle(theme.accent)
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 16)
            .overlay(alignment: .top) { MembersRule() }
            .padding(.top, 24)
        }
    }

    private func notableColumn(_ title: String, _ items: [PoliticianDetailModel.NotableItem], empty: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(Typo.inter(12, 600))
                .tracking(12 * 0.08)
                .foregroundStyle(theme.textSecondary)
                .padding(.bottom, 12)
            if items.isEmpty {
                Text(empty)
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                VStack(alignment: .leading, spacing: 16) {
                    ForEach(items) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title ?? "Unlabeled measure")
                                    .font(Typo.inter(14, 500))
                                    .foregroundStyle(theme.text)
                                    .membersLineHeight(1.4, size: 14)
                                    .fixedSize(horizontal: false, vertical: true)
                                Text(item.position.label + (item.margin.map { " · margin \($0)" } ?? ""))
                                    .font(Typo.mono(11))
                                    .tracking(11 * 0.02)
                                    .foregroundStyle(theme.textSecondary)
                            }
                            Text(item.narration)
                                .font(Typo.inter(13))
                                .foregroundStyle(theme.text)
                                .membersLineHeight(1.6, size: 13)
                                .fixedSize(horizontal: false, vertical: true)
                                .padding(.leading, 12)
                                .overlay(alignment: .leading) {
                                    Rectangle().fill(theme.accent).frame(width: 3)
                                }
                        }
                    }
                }
            }
        }
    }

    private var vpaMethodologySheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Methodology")
                        .font(Typo.inter(24, 600))
                        .foregroundStyle(theme.text)
                        .padding(.bottom, 4)
                    Group {
                        Text("**Different from party majority** is the share of substantive votes (Yea / Nay) where the member's position differed from how most of the member's effective party voted on that roll call. Independents who caucus with a party are measured against that caucus.")
                        Text("**Notable votes** are ranked by vote margin (closest first), then by most recent. One column lists close substantive votes matching the member's party majority. The other lists close substantive votes that differed from it. Ranking is deterministic and does not use the LLM.")
                        Text("**Data sources:** Congress.gov (roll-call votes, bills, policy areas) and the House Clerk and Senate roll-call records. The website's donor-industry and district-lean comparisons are not computed in the app.")
                        Text("**About the wording:** Each one-sentence description is built directly from the recorded position and party-majority comparison. No model generates or interprets these sentences.")
                    }
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.text)
                    .membersLineHeight(1.7, size: 14)
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(theme.surface.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Close") { showVPAMethodology = false }
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: Records of service

    private var tenureSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            MembersSectionLabel("Congress history · since 2001")
                .padding(.bottom, 12)
            MembersSectionTitle("\(model.tenure.count) record\(model.tenure.count == 1 ? "" : "s") of service")
                .padding(.bottom, 28)
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 24, alignment: .top), GridItem(.flexible(), alignment: .top)],
                alignment: .leading,
                spacing: 24
            ) {
                ForEach(model.tenure) { item in
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.years)
                            .font(Typo.mono(13))
                            .tracking(13 * 0.04)
                            .foregroundStyle(theme.textMuted)
                            .padding(.bottom, 6)
                        Text(item.title)
                            .font(Typo.inter(20))
                            .foregroundStyle(theme.text)
                            .membersLineHeight(1.25, size: 20)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(item.note)
                            .font(Typo.inter(13))
                            .foregroundStyle(theme.textSecondary)
                            .padding(.top, 4)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 16)
                    .overlay(alignment: .top) {
                        Rectangle().fill(item.isLast ? theme.accent : theme.border).frame(height: 2)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .padding(.vertical, 48)
        .overlay(alignment: .bottom) { MembersRule() }
    }

    // MARK: How they voted (VoteDashboard.jsx)

    private var votesSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            MembersSectionLabel("Voting record")
                .padding(.bottom, 12)
            MembersSectionTitle("How they voted")
                .padding(.bottom, 28)

            VStack(alignment: .leading, spacing: 0) {
                Text("Voting Record")
                    .font(Typo.inter(24, 600))
                    .foregroundStyle(theme.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 8)
                    .overlay(alignment: .bottom) { MembersRule() }
                    .padding(.bottom, 8)

                if model.state == .loading || model.state == .idle {
                    MembersLoading(text: "Loading voting record...")
                } else {
                    if let stats = model.stats, (stats.totalVotes ?? 0) >= 5 { statsBar(stats) }

                    if model.votes.isEmpty {
                        VStack(spacing: 4) {
                            Text("No voting records available for this representative in the current Congress.")
                                .font(Typo.inter(15))
                                .foregroundStyle(theme.textSecondary)
                            Text("Voting records appear here after roll call votes are recorded.")
                                .font(Typo.inter(13))
                                .foregroundStyle(theme.textMuted)
                        }
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                    }

                    ForEach(Array(model.visibleVotes.enumerated()), id: \.element.id) { index, vote in
                        MembersVoteCard(
                            vote: vote,
                            rollCall: model.rollCall(for: vote),
                            isLast: index == model.visibleVotes.count - 1
                        )
                    }

                    if model.votes.count > model.visibleCount {
                        Button("Show more votes (\(model.votes.count - model.visibleCount) remaining)") {
                            model.showMore()
                        }
                        .buttonStyle(MembersTextButtonStyle())
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)
                    }
                }
            }
            .padding(.top, 48)
        }
        .padding(.vertical, 48)
        .overlay(alignment: .bottom) { MembersRule() }
    }

    /// `.dash-stats-bar` at <=767px: stacked.
    private func statsBar(_ stats: MemberStats) -> some View {
        let cast = (stats.yeaCount ?? 0) + (stats.nayCount ?? 0) + (stats.presentCount ?? 0)
        let total = max(stats.totalVotes ?? 0, 1)
        let loyalty = stats.partyLoyaltyPct ?? 0
        return VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 0) {
                Text("\(Int(loyalty.rounded()))%")
                    .font(Typo.mono(32, 600))
                    .foregroundStyle(theme.text)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("PARTY-MAJORITY MATCH")
                        .font(Typo.inter(13))
                        .tracking(13 * 0.05)
                        .foregroundStyle(theme.textSecondary)
                    InfoTerm("voteWithParty")
                }
                .padding(.top, 4)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.border)
                        Capsule().fill(theme.accent).frame(width: geo.size.width * min(max(loyalty, 0), 100) / 100)
                    }
                }
                .frame(height: 4)
                .padding(.top, 8)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("\(cast)")
                    .font(Typo.mono(20, 600))
                    .foregroundStyle(theme.text)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("OF \(stats.totalVotes ?? 0) VOTES CAST")
                        .font(Typo.inter(13))
                        .tracking(13 * 0.05)
                        .foregroundStyle(theme.textSecondary)
                    InfoTerm("rollCall")
                }
                .padding(.top, 4)
                Text("\(Int((Double(cast) / Double(total) * 100).rounded()))% attendance")
                    .font(Typo.mono(12))
                    .foregroundStyle(theme.textSecondary)
                    .padding(.top, 2)
            }
            .padding(.top, 4)
            .overlay(alignment: .top) { MembersRule(color: theme.borderSoft) }
            FlowLayout(spacing: 12, lineSpacing: 6) {
                statTerm("\(stats.yeaCount ?? 0) Yea", term: "yea", color: theme.success)
                statTerm("\(stats.nayCount ?? 0) Nay", term: "nay", color: theme.error)
                statTerm("\(stats.presentCount ?? 0) Present", term: "present", color: theme.textSecondary)
                statTerm("\(stats.notVotingCount ?? 0) Missed", term: "missedVotes", color: theme.textSecondary)
            }
            .font(Typo.mono(13, 500))
            .padding(.top, 4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { MembersRule(color: theme.borderSoft) }
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) { MembersRule() }
        .padding(.bottom, 16)
    }

    /// One count in the stats bar with the ⓘ for what it counts.
    private func statTerm(_ text: String, term: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(text).foregroundStyle(color)
            InfoTerm(term)
        }
    }

    // MARK: Where the money comes from

    private var financeSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            MembersSectionLabel("Campaign finance · " + (model.campaignFinance.map { "\($0.cycle) cycle" } ?? "most recent cycle"))
                .padding(.bottom, 12)
            MembersInfoTitle(
                title: "Where the money comes from",
                tip: Glossary.entry("campaignFinance")?.def ?? "Money raised and spent for election campaigns, reported to the Federal Election Commission (FEC)."
            )
            .padding(.bottom, 28)

            switch model.financeState {
            case .idle, .loading:
                MembersLoading(text: "Loading campaign finance data...")
            case .failed:
                Text("Campaign finance data not available for this politician.")
                    .font(Typo.inter(17))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            case .loaded:
                if let finance = model.campaignFinance {
                    financeBody(finance)
                }
            }
        }
        .padding(.vertical, 48)
    }

    private func financeBody(_ f: FECService.CampaignFinance) -> some View {
        let splits: [(String, Double)] = [
            ("From individuals", f.individualTotal),
            ("From PACs", f.pacTotal),
            ("Spent this cycle", f.totalSpent),
            ("Cash on hand", f.cashOnHand),
        ].filter { $0.1 > 0 }
        let through = f.coverageEndDate.flatMap { DateParsing.date(from: $0) }.map(MembersFormat.shortDate)
        let sectors = model.industries

        return VStack(alignment: .leading, spacing: 0) {
            Text(MembersFormat.currency(f.totalRaised))
                .font(Typo.inter(64, 600, relativeTo: .largeTitle))
                .webTracking(-0.02, size: 64)
                .foregroundStyle(theme.text)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.bottom, 4)
            Text("TOTAL RAISED" + (through.map { " · THROUGH \($0.uppercased())" } ?? ""))
                .font(Typo.mono(11))
                .tracking(11 * 0.12)
                .foregroundStyle(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 24)

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 16, alignment: .top), GridItem(.flexible(), alignment: .top)],
                      alignment: .leading, spacing: 16) {
                ForEach(splits, id: \.0) { split in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(MembersFormat.currency(split.1))
                            .font(Typo.mono(18))
                            .foregroundStyle(theme.text)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                        HStack(alignment: .firstTextBaseline, spacing: 0) {
                            Text(split.0)
                                .font(Typo.inter(12))
                                .foregroundStyle(theme.textSecondary)
                            if split.0 == "From PACs" { InfoTerm("pac") }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 12)
                    .overlay(alignment: .top) { MembersRule() }
                    .accessibilityElement(children: .combine)
                }
            }

            if !sectors.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("BY INDUSTRY")
                        .font(Typo.mono(11, 500))
                        .tracking(11 * 0.12)
                        .foregroundStyle(theme.textMuted)
                        .padding(.bottom, 16)
                    let maxTotal = max(sectors.first?.total ?? 1, 1)
                    ForEach(Array(sectors.prefix(8).enumerated()), id: \.element.id) { index, sector in
                        VStack(alignment: .leading, spacing: 16) {
                            Text(sector.industry)
                                .font(Typo.inter(14))
                                .foregroundStyle(theme.text)
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    Capsule().fill(theme.borderSoft)
                                    Capsule().fill(theme.accent)
                                        .frame(width: geo.size.width * max(sector.total / maxTotal * 100, 2) / 100)
                                }
                            }
                            .frame(height: 6)
                            HStack(spacing: 0) {
                                Text(MembersIndustry.compact(sector.total))
                                    .font(Typo.mono(13))
                                    .foregroundStyle(theme.textSecondary)
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                Color.clear.frame(width: 96)
                            }
                        }
                        .padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            if index < min(sectors.count, 8) - 1 { MembersRule(color: theme.borderSoft) }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 32)
            }

            if !f.largestReceipts.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("LARGEST ITEMIZED RECEIPTS SHOWN")
                        .font(Typo.mono(11, 500))
                        .tracking(11 * 0.12)
                        .foregroundStyle(theme.textMuted)
                        .padding(.bottom, 16)
                    let donors = Array(f.largestReceipts.prefix(10))
                    ForEach(Array(donors.enumerated()), id: \.element.id) { index, donor in
                        MembersDonorRow(donor: donor)
                            .overlay(alignment: .bottom) {
                                if index < donors.count - 1 { MembersRule(color: theme.borderSoft) }
                            }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Candidate totals include all authorized committees. This list shows the largest itemized receipts returned for the principal committee; a contributor’s employer is self-reported context, not a corporate contribution.")
                            .font(Typo.inter(13))
                            .foregroundStyle(theme.textMuted)
                            .membersLineHeight(1.6, size: 13)
                            .fixedSize(horizontal: false, vertical: true)
                        Link("View full FEC records \u{2197}", destination: URL(string: "https://www.fec.gov/data/candidate/\(f.candidateID)/")!)
                            .font(Typo.inter(13))
                            .foregroundStyle(theme.accent)
                            .frame(minHeight: 44)
                    }
                    .padding(.top, 16)
                }
                .padding(.top, 32)
                .overlay(alignment: .top) { MembersRule() }
                .padding(.top, 48)
            }
        }
    }

    // MARK: Photo attribution

    @ViewBuilder
    private var photoAttribution: some View {
        if let text = model.photoAttribution {
            Text("Photo: \(text)")
                .font(Typo.inter(11))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 16)
                .overlay(alignment: .top) { MembersRule(color: theme.borderSoft) }
                .padding(.top, 32)
        }
    }
}

// MARK: - Text button

/// Web `.btn-secondary.btn-sm` (with `.btn-go`): a 14px accent text action,
/// 36pt tall, the arrow trailing.
struct MembersTextButtonStyle: ButtonStyle {
    var arrow = false
    var size: CGFloat = 14
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 8) {
            configuration.label
            if arrow { Text("\u{2192}").accessibilityHidden(true) }
        }
        .font(Typo.inter(size, 500))
        .foregroundStyle(theme.accent)
        .underline(configuration.isPressed, color: theme.accent)
        .padding(.horizontal, 2)
        .padding(.vertical, 8)
        .frame(minHeight: 36)
        .contentShape(Rectangle())
    }
}

// MARK: - Ideology scale

/// `.pol-ideology-scale`: a 2px line, a 12px accent marker ringed in --bg and
/// a 1px accent halo, and the two endpoints in mono.
struct MembersIdeologyScale: View {
    let placement: Double?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 8) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(theme.border).frame(height: 2)
                        .position(x: geo.size.width / 2, y: 7)
                    if let placement {
                        Circle()
                            .fill(theme.accent)
                            .frame(width: 6, height: 6)
                            .padding(3)
                            .background(Circle().fill(theme.bg))
                            .overlay(Circle().stroke(theme.accent, lineWidth: 1))
                            .position(x: geo.size.width * placement / 100, y: 7)
                    }
                }
            }
            .frame(height: 14)
            .padding(.vertical, -6)
            HStack {
                Text("LIBERAL")
                Spacer()
                Text("CONSERVATIVE")
            }
            .font(Typo.mono(11))
            .tracking(11 * 0.04)
            .foregroundStyle(theme.textMuted)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            placement.map { "Position on liberal to conservative scale: \(Int($0.rounded())) percent" }
                ?? "Position on liberal to conservative scale unavailable"
        )
    }
}

// MARK: - Flag bar

/// `.vpa-flag` at phone width: label and percent on one line, the track
/// under them, the description below.
private struct MembersFlagBar: View {
    let label: String
    let rate: Int?
    let description: String
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                    .font(Typo.inter(14, 500))
                    .foregroundStyle(theme.text)
                Spacer()
                Text(rate.map { "\($0)%" } ?? "\u{2014}")
                    .font(Typo.mono(13))
                    .foregroundStyle(theme.text)
                    .tabularFigures()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(theme.border)
                    if let rate {
                        Capsule().fill(theme.accent)
                            .frame(width: geo.size.width * CGFloat(min(max(rate, 0), 100)) / 100)
                    }
                }
            }
            .frame(height: 4)
            Text(description)
                .font(Typo.inter(13))
                .foregroundStyle(theme.textSecondary)
                .membersLineHeight(1.6, size: 13)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Donor row

/// `.pol-donor-row`: name, entity tag and employer wrapping on the left, the
/// amount in mono on the right.
private struct MembersDonorRow: View {
    let donor: FECService.ItemizedReceipt
    @Environment(\.theme) private var theme

    private var entity: (label: String, fg: Color, bg: Color)? {
        guard let type = donor.entityType?.uppercased(), !type.isEmpty, type != "IND" else { return nil }
        switch type {
        case "COM": return ("PAC", theme.warning, theme.warning.opacity(0.08))
        case "ORG": return ("ORG", theme.info, theme.info.opacity(0.08))
        default: return ("ORG", theme.textSecondary, theme.borderSoft)
        }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            MembersFlowLayout(spacing: 8, lineSpacing: 6) {
                Text(donor.name)
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let entity {
                    Text(entity.label)
                        .font(Typo.mono(10))
                        .tracking(10 * 0.06)
                        .foregroundStyle(entity.fg)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(entity.bg))
                }
                if let employer = donor.employer {
                    Text(employer)
                        .font(Typo.inter(12))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(MembersFormat.currency(donor.amount))
                .font(Typo.mono(14))
                .foregroundStyle(theme.text)
                .fixedSize()
        }
        .padding(.vertical, 10)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Vote card

/// `.dash-vote-card` at phone width: bill number and position badge, the
/// title, the summary clamped to two lines, and "Explain this bill".
struct MembersVoteCard: View {
    let vote: BallotWatchAPI.VoteWithBill
    var rollCall: RollCall?
    var isLast = false

    @State private var expanded = false
    @State private var explanation: [String]?
    @Environment(\.theme) private var theme

    private var billNumber: String? {
        guard let billID = vote.billID else { return nil }
        return billID.split(separator: "-").dropFirst().joined(separator: " ").uppercased()
    }

    private var question: String? {
        let q = rollCall?.question?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (q?.isEmpty == false) ? q : nil
    }

    private var title: String {
        if vote.billID == nil, let question { return question }
        if let t = vote.bill?.title, !t.isEmpty { return t }
        if let billNumber { return billNumber }
        if let date = vote.date { return "Vote on \(MembersFormat.shortDate(date))" }
        return "Vote"
    }

    private var description: String? {
        if let crs = vote.bill?.crsSummary, !crs.isEmpty {
            let plain = MembersOfficialSummary.split(crs, title: nil).joined(separator: " ")
            return plain.count > 200 ? String(plain.prefix(200)) + "..." : plain
        }
        if vote.billID == nil, let d = rollCall?.description, !d.isEmpty { return d }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if let billID = vote.billID {
                    NavigationLink { BillDetailScreen(billID: billID) } label: { content }
                } else if let rollCallID = vote.rollCallID {
                    NavigationLink {
                        RollCallMembersScreen(rollCallID: rollCallID, question: rollCall?.question)
                    } label: { content }
                } else {
                    content
                }
            }
            .buttonStyle(.plain)

            if vote.bill != nil {
                Button(expanded ? "Hide explanation" : "Explain this bill") { toggle() }
                    .font(Typo.inter(12))
                    .foregroundStyle(theme.accent)
                    .underline(true, color: theme.accent)
                    .buttonStyle(.plain)
                    .padding(.vertical, 4)
                    .frame(minHeight: 28)
            }

            if expanded {
                Group {
                    if let explanation {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(explanation, id: \.self) { p in
                                Text(p)
                                    .font(Typo.inter(14))
                                    .foregroundStyle(theme.text)
                                    .membersLineHeight(1.6, size: 14)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    } else {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Loading official summary...")
                                .font(Typo.inter(13))
                                .foregroundStyle(theme.textSecondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 4).fill(theme.bgTint))
                .padding(.top, 8)
            }
        }
        .padding(.vertical, 16)
        .overlay(alignment: .bottom) { if !isLast { MembersRule() } }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                if let billNumber {
                    Text(billNumber)
                        .font(Typo.mono(12, 500))
                        .foregroundStyle(theme.accent)
                }
                MembersVoteBadge(position: vote.position)
            }
            .padding(.bottom, 8)

            Text(title)
                .font(Typo.inter(15, 600))
                .foregroundStyle(theme.text)
                .membersLineHeight(1.35, size: 15)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)

            if let description {
                Text(description)
                    .font(Typo.inter(14))
                    .foregroundStyle(theme.textSecondary)
                    .membersLineHeight(1.6, size: 14)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func toggle() {
        withAnimation(Motion.short) { expanded.toggle() }
        guard expanded, explanation == nil, let billID = vote.billID else { return }
        Task {
            let paragraphs = await MembersOfficialSummary.paragraphs(
                billID: billID, title: vote.bill?.title, fallbackHTML: vote.bill?.crsSummary
            )
            explanation = paragraphs
        }
    }
}

// MARK: - Model

@MainActor
final class PoliticianDetailModel: ObservableObject {
    enum State: Equatable { case idle, loading, loaded, failed(String) }
    enum SupplementState: Equatable { case idle, loading, loaded, failed(String) }

    struct Fact: Identifiable {
        let label: String
        var value: String = ""
        var mono: String = ""
        var suffix: String = ""
        var url: URL?
        var id: String { label }
    }

    struct TenureItem: Identifiable {
        let id: String
        let years: String
        let title: String
        let note: String
        let isLast: Bool
    }

    struct NotableItem: Identifiable {
        let id: String
        let title: String?
        let position: VotePosition
        let margin: Int?
        let narration: String
    }

    struct Analysis {
        let crossover: VotingPatterns.Crossover
        let typical: [NotableItem]
        let atypical: [NotableItem]
    }

    enum VPAState {
        case idle
        case belowThreshold(Int)
        case analyzed(Analysis)
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var votes: [BallotWatchAPI.VoteWithBill] = []
    @Published private(set) var stats: MemberStats?
    @Published private(set) var crossover: VotingPatterns.Crossover = .empty
    @Published private(set) var profile: MembersCongressProfile?
    @Published private(set) var terms: [MembersCongressTerm] = []
    @Published private(set) var ideology: VoteviewIdeology.Estimate?
    @Published private(set) var ideologyState: SupplementState = .idle
    @Published private(set) var campaignFinance: FECService.CampaignFinance?
    @Published private(set) var financeState: SupplementState = .idle
    @Published private(set) var visibleCount = 20
    @Published private(set) var rollCallsByID: [String: RollCall] = [:]
    @Published private(set) var vpa: VPAState = .idle
    private var statsByRollCall: [String: RollCallStats] = [:]

    private let politician: Politician

    init(politician: Politician) {
        self.politician = politician
    }

    // MARK: Derived (PoliticianDetail.jsx)

    var displayName: String { profile?.directOrderName ?? politician.name }

    private var stateAbbr: String { politician.state.uppercased() }
    private var stateName: String { USStates.name(for: stateAbbr) }
    private var currentTerm: MembersCongressProfile.Term? { profile?.currentTerm }
    private var district: Int? {
        currentTerm?.district ?? politician.district.flatMap(Int.init)
    }
    private var isSenate: Bool {
        if let chamber = currentTerm?.chamber { return chamber.lowercased().contains("senate") }
        return politician.chamber == .senate
    }

    /// "NY-14", "MA".
    var seatCode: String {
        if let district, district != 0 { return "\(stateAbbr)-\(district)" }
        return stateAbbr
    }

    var kicker: String {
        let title = isSenate ? "U.S. Senator" : "U.S. Representative"
        let congress = currentTerm?.congress ?? MembersCongress.current
        return "\(title) · \(congress)th Congress"
    }

    var standfirst: String {
        var pieces: [String] = []
        if let first = profile?.firstTermYear {
            let years = Calendar.current.component(.year, from: Date()) - first
            pieces.append("Serving since \(first)\(years > 0 ? " — \(years) year\(years != 1 ? "s" : "") in Congress" : "").")
        }
        if isSenate {
            pieces.append("Represents \(stateName) in the U.S. Senate.")
        } else if let district, district != 0 {
            pieces.append("Represents \(stateName)'s \(MembersFormat.districtOrdinal(district)) congressional district.")
        } else {
            pieces.append("Represents \(stateName) in the U.S. House.")
        }
        return pieces.joined(separator: " ")
    }

    var facts: [Fact] {
        var list: [Fact] = []
        if let chamber = currentTerm?.chamber { list.append(Fact(label: "Chamber", value: chamber)) }
        list.append(Fact(label: "State", value: stateName, mono: seatCode))
        if let profile, let first = profile.firstTermYear {
            let n = profile.terms.count
            list.append(Fact(label: "In office", value: "Since", mono: "\(first)", suffix: " · \(n) term\(n != 1 ? "s" : "")"))
        }
        if let born = profile?.birthYear, !born.isEmpty { list.append(Fact(label: "Born", mono: born)) }
        if let office = profile?.addressInformation?.officeAddress, !office.isEmpty {
            list.append(Fact(label: "Office", value: office))
        }
        if let phone = profile?.addressInformation?.phoneNumber, !phone.isEmpty {
            let digits = phone.filter(\.isNumber)
            list.append(Fact(label: "Phone", mono: phone, url: URL(string: "tel:\(digits)")))
        }
        return list
    }

    var officialWebsite: URL? { profile?.officialWebsiteUrl.flatMap(URL.init(string:)) }

    var partyName: String {
        switch politician.party {
        case .democrat: return "Democratic"
        case .republican: return "Republican"
        case .independent: return "Independent"
        case .unknown: return "Not listed"
        }
    }

    var ideologyLabel: String {
        switch ideologyState {
        case .idle, .loading: return "Reading the roll-call record…"
        default: return ideology?.label ?? "Ideology estimate unavailable"
        }
    }

    var totalRollCalls: Int? {
        let total = stats?.totalVotes ?? votes.count
        return total > 0 ? total : nil
    }

    var participation: Int? {
        let cast: Int
        if let stats {
            cast = (stats.yeaCount ?? 0) + (stats.nayCount ?? 0) + (stats.presentCount ?? 0)
        } else {
            cast = votes.filter { $0.position != .notVoting }.count
        }
        guard let total = totalRollCalls else { return nil }
        return Int((Double(cast) / Double(total) * 100).rounded())
    }

    var photoAttribution: String? {
        guard let raw = profile?.depiction?.attribution, !raw.isEmpty else { return nil }
        let text = MembersFormat.stripTags(raw)
        return text.isEmpty ? nil : text
    }

    var industries: [MembersIndustry.Sector] {
        MembersIndustry.breakdown(campaignFinance?.largestReceipts ?? [])
    }

    /// Web `buildTenureTimeline`: member_congress_terms first, Congress.gov
    /// terms as the fallback; 107th Congress onward, oldest first.
    var tenure: [TenureItem] {
        struct Raw { let congress: Int?; let years: String; let chamber: String; let note: String; let isCurrent: Bool }

        func chamberName(_ raw: String?) -> String {
            let v = (raw ?? "").lowercased()
            if v.contains("senate") { return "Senate" }
            if v.contains("house") || v.contains("representative") { return "House" }
            return raw ?? ""
        }

        var rows: [Raw] = []
        if !terms.isEmpty {
            rows = terms.compactMap { t in
                guard let congress = t.congress, congress >= MembersCongress.historyFloor else { return nil }
                let start = MembersCongress.year(from: t.termStart) ?? MembersCongress.startYear(congress)
                let end = MembersCongress.year(from: t.termEnd) ?? MembersCongress.endYear(congress)
                let party = (t.caucus ?? t.party ?? "").uppercased()
                let state = t.state ?? ""
                let seat = t.district.map { "\(state)-\($0)" } ?? state
                let note = [chamberName(t.chamber), party, seat].filter { !$0.isEmpty }.joined(separator: " · ")
                return Raw(congress: congress, years: "\(start)-\(end)", chamber: chamberName(t.chamber), note: note,
                           isCurrent: t.termEnd == nil && congress == MembersCongress.current)
            }
        } else if let profile {
            rows = profile.terms
                .sorted { ($0.congress ?? 0, $0.startYear ?? 0) < ($1.congress ?? 0, $1.startYear ?? 0) }
                .compactMap { t in
                    let congress = t.congress
                    if let congress, congress < MembersCongress.historyFloor { return nil }
                    if congress == nil, let end = t.endYear, end < 2001 { return nil }
                    guard let start = t.startYear ?? congress.map(MembersCongress.startYear) else { return nil }
                    let end = t.endYear ?? congress.map(MembersCongress.endYear)
                    let party = Party(raw: t.partyName).letter
                    let state = t.stateCode ?? ""
                    let seat = t.district.map { "\(state)-\($0)" } ?? state
                    let note = [chamberName(t.chamber), party, seat].filter { !$0.isEmpty }.joined(separator: " · ")
                    return Raw(congress: congress, years: "\(start)-\(end.map(String.init) ?? "present")",
                               chamber: chamberName(t.chamber), note: note,
                               isCurrent: t.endYear == nil && (congress == nil || congress == MembersCongress.current))
                }
        }
        return rows.enumerated().map { index, row in
            TenureItem(
                id: "\(row.congress ?? 0)-\(index)",
                years: row.years,
                title: row.congress.map(MembersCongress.label) ?? row.chamber,
                note: row.isCurrent ? "Current term" : (row.note.isEmpty ? row.chamber : row.note),
                isLast: row.isCurrent || index == rows.count - 1
            )
        }
    }

    var visibleVotes: [BallotWatchAPI.VoteWithBill] { Array(votes.prefix(visibleCount)) }

    func showMore() { visibleCount += 20 }

    func rollCall(for vote: BallotWatchAPI.VoteWithBill) -> RollCall? {
        vote.rollCallID.flatMap { rollCallsByID[$0] }
    }

    // MARK: Voting Pattern Analysis

    func runAnalysis() {
        guard state == .loaded else { return }
        guard votes.count >= 50 else {
            vpa = .belowThreshold(votes.count)
            return
        }
        let effParty = VotingPatterns.effectiveParty(bioguideID: politician.id, party: politician.party)
        let notable = VotingPatterns.rankNotableVotes(
            bioguideID: politician.id, party: politician.party, votes: votes, statsByRollCall: statsByRollCall
        )
        func annotate(_ list: [BallotWatchAPI.VoteWithBill]) -> [NotableItem] {
            list.map { vote in
                let stats = vote.rollCallID.flatMap { statsByRollCall[$0] }
                let direction = VotingPatterns.partyMajorityDirection(stats: stats, party: effParty) ?? vote.position
                let margin = stats.flatMap { s in s.totalYea + s.totalNay > 0 ? abs(s.totalYea - s.totalNay) : nil }
                return NotableItem(
                    id: vote.id,
                    title: vote.bill?.title,
                    position: vote.position,
                    margin: margin,
                    narration: MembersNarration.sentence(
                        position: vote.position, title: vote.bill?.title, partyDirection: direction
                    )
                )
            }
        }
        vpa = .analyzed(Analysis(
            crossover: crossover,
            typical: annotate(notable.typical),
            atypical: annotate(notable.atypical)
        ))
    }

    // MARK: Loading

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await load()
    }

    func load() async {
        state = .loading
        ideologyState = .loading
        financeState = .loading

        async let votesTask = try? BallotWatchAPI.memberVotes(politicianID: politician.id, limit: 500)
        async let statsTask = try? BallotWatchAPI.memberStats(politicianID: politician.id)
        async let profileTask = try? MembersCongressProfile.fetch(bioguideID: politician.id)
        async let termsTask = try? MembersCongressTerm.all(bioguideID: politician.id)
        async let ideologyTask = VoteviewIdeology.estimate(for: politician.id)
        async let financeTask = FECService.campaignFinance(
            name: politician.name, state: politician.state, chamber: politician.chamber
        )

        profile = await profileTask
        terms = await termsTask ?? []
        let loadedVotes = await votesTask ?? []
        stats = await statsTask
        votes = loadedVotes

        // Roll-call rows give the question for bill-less votes; their stats
        // give party-majority direction. Fetched in chunks to keep URLs short.
        let ids = Array(Set(loadedVotes.compactMap(\.rollCallID)))
        var calls: [RollCall] = []
        var callStats: [RollCallStats] = []
        await withTaskGroup(of: ([RollCall], [RollCallStats]).self) { group in
            for start in stride(from: 0, to: ids.count, by: 150) {
                let chunk = Array(ids[start..<min(start + 150, ids.count)])
                group.addTask {
                    async let c = try? BallotWatchAPI.rollCalls(ids: chunk)
                    async let s = try? BallotWatchAPI.rollCallStats(ids: chunk)
                    return (await c ?? [], await s ?? [])
                }
            }
            for await (c, s) in group {
                calls += c
                callStats += s
            }
        }
        rollCallsByID = Dictionary(calls.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        statsByRollCall = Dictionary(callStats.map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a })
        crossover = VotingPatterns.partyCrossover(
            bioguideID: politician.id, party: politician.party,
            votes: loadedVotes, statsByRollCall: statsByRollCall
        )
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
            financeState = .loaded
        } catch {
            campaignFinance = nil
            financeState = .failed(error.localizedDescription)
        }
    }
}
