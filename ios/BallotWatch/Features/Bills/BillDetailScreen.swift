import SwiftUI

/// The website's bill page, /bill/:congress/:type/:number, at its phone
/// breakpoint (BillDetail.jsx + BillDetail.css, ≤760px): masthead
/// with status pill and byline, the plain-English card built from the
/// official summary, the collapsed official summary, floor votes, "Tell your
/// rep", the legislative timeline, then the rail cards (sponsor, cosponsors,
/// committees, bill text) stacked below as the web does on a phone.
struct BillDetailScreen: View {
    let billID: String
    var focusRollCallID: String?

    @StateObject private var model: BillDetailModel
    @EnvironmentObject private var userData: UserData
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    @State private var summaryOpen = false
    @State private var showAllCosponsors = false
    @State private var openSponsor = false

    init(billID: String, focusRollCallID: String? = nil) {
        self.billID = billID
        self.focusRollCallID = focusRollCallID
        _model = StateObject(wrappedValue: BillDetailModel(billID: billID))
    }

    private var key: BillKey? { BillKey(id: billID) }
    private var display: String { key?.display ?? billID }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if model.isLoading {
                        BillsPageLoading(label: "Loading bill details...", mono: false)
                    } else if let page = model.page {
                        content(page)
                    } else {
                        BillsPageError(message: model.errorMessage ?? "Bill not found", buttonTitle: "Back to Bills") {
                            dismiss()
                        }
                    }
                }
                // Standard 16pt iOS gutters.
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 88)
            }
            .onChange(of: model.isLoading) { _, loading in
                guard !loading, let focusRollCallID else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                    withAnimation(Motion.medium) { proxy.scrollTo(focusRollCallID, anchor: .top) }
                }
            }
        }
        .paperBackground()
        .navigationTitle(display)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) { EmptyView() }
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
                ShareLink(item: shareURL) {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundStyle(theme.textSecondary)
                }
            }
        }
        .navigationDestination(isPresented: $openSponsor) {
            if let id = model.page?.sponsor?.bioguideID {
                BillsMemberLoader(bioguideID: id, name: model.page?.sponsor?.name ?? "")
            }
        }
        .task {
            await model.loadIfNeeded()
            userData.noteViewed(billID: billID)
        }
    }

    /// The web's share link (`/s/bill/...`), which unfurls with a card.
    private var shareURL: URL {
        guard let key else { return Config.siteURL }
        return Config.siteURL.appendingPathComponent("s/bill/\(key.congress)/\(key.type)/\(key.number)")
    }

    // MARK: Content

    @ViewBuilder
    private func content(_ page: BillPage) -> some View {
        masthead(page)

        explanationCard(page)

        if model.plain != nil, !page.summaryParagraphs.isEmpty {
            summaryBlock(page.summaryParagraphs)
        }

        if !model.tallies.isEmpty {
            tallies
        }

        // CSS margins collapse: .tyr's 32pt top margin against the 24pt below
        // the card (no summary) leaves 8 to add; the summary block's 32 covers
        // it; a votes section has padding, not margin, so the full 32.
        tellYourRep
            .padding(.top, !model.tallies.isEmpty ? 32 : (model.plain == nil || page.summaryParagraphs.isEmpty ? 8 : 0))

        if !page.actions.isEmpty {
            timeline(page.actions)
        }

        // Rail, stacked below the main column on phones (grid gap 32).
        VStack(alignment: .leading, spacing: 16) {
            if let sponsor = page.sponsor { sponsorCard(sponsor) }
            if !page.cosponsors.isEmpty { cosponsorCard(page.cosponsors) }
            if !page.committees.isEmpty || page.committeeCount > 0 { committeeCard(page) }
            if !page.textVersions.isEmpty { textCard(page) }
        }
        .padding(.top, 32)
    }

    // MARK: Masthead (`.bill-masthead`)

    private func masthead(_ page: BillPage) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            FlowLayout(spacing: 16, lineSpacing: 16) {
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text(display)
                        .font(Typo.mono(13, 500))
                        .webTracking(0.02, size: 13)
                        .foregroundStyle(theme.accent)
                    InfoTerm("billNumber")
                }
                if let congress = key?.congress {
                    Text("\(congress)th Congress".uppercased())
                        .font(Typo.mono(11))
                        .webTracking(0.12, size: 11)
                        .foregroundStyle(theme.textMuted)
                }
                HStack(spacing: 0) {
                    BillsPagePill(status: page.status)
                    InfoTerm(page.status.glossaryTerm)
                }
            }
            .padding(.bottom, 16)

            Text(page.title)
                .font(Typo.inter(36, 600, relativeTo: .largeTitle).leading(.tight))
                .webTracking(-0.02, size: 36)
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, 24)

            Text(byline(page))
                .lineSpacing(BillsCSS.leading(15, 1.65))
                .fixedSize(horizontal: false, vertical: true)
                .tint(theme.text)
                .environment(\.openURL, OpenURLAction { url in
                    if url.scheme == "ballotwatch-sponsor" {
                        openSponsor = true
                        return .handled
                    }
                    return .systemAction
                })

            HStack(spacing: 8) {
                if let url = page.fullTextURL {
                    Button("Read full text \u{2197}") { openURL(url) }
                        .buttonStyle(BillsSmallTextButtonStyle())
                } else if page.isFallback, let url = key?.congressGovURL {
                    Button("Congress.gov \u{2197}") { openURL(url) }
                        .buttonStyle(BillsSmallTextButtonStyle())
                }
                ShareLink(item: shareURL) {
                    Text("Share \u{2197}")
                }
                .buttonStyle(BillsSmallTextButtonStyle())
            }
            .padding(.top, 24)
        }
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Rectangle().fill(theme.border).frame(height: 1) }
        .padding(.bottom, 48)
    }

    private func byline(_ page: BillPage) -> AttributedString {
        func run(_ s: String, _ font: Font = Typo.inter(15), _ color: Color? = nil) -> AttributedString {
            var a = AttributedString(s)
            a.font = font
            a.foregroundColor = color ?? theme.textSecondary
            return a
        }
        var text = AttributedString()
        if let sponsor = page.sponsor {
            text += run("Sponsored by ")
            var name = run(sponsor.name, Typo.inter(15, 500), theme.text)
            if sponsor.bioguideID != nil { name.link = URL(string: "ballotwatch-sponsor://open") }
            text += name
            if let letter = sponsor.partyLetter {
                text += run(" ")
                text += run(letter + (sponsor.state.map { "-\($0)" } ?? ""), Typo.mono(11), theme.party(BillsParty.party(letter)))
            }
            text += run(" · ")
        }
        if let introduced = page.introducedAt, !BillsFormat.date(introduced).isEmpty {
            text += run("introduced ")
            text += run(BillsFormat.date(introduced), Typo.mono(13))
        }
        if !page.cosponsors.isEmpty {
            text += run(" · with ")
            text += run("\(page.cosponsors.count)", Typo.inter(15, 600))
            text += run(page.cosponsors.count == 1 ? " cosponsor" : " cosponsors")
        }
        if let area = page.policyArea, !area.isEmpty {
            text += run(" · policy area ")
            text += run(area, Typo.inter(15).italic())
        }
        return text
    }

    // MARK: Plain-English card (`.bill-ai-card`)

    private func explanationCard(_ page: BillPage) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                BillsPulseDot()
                Text((model.plain != nil ? "The bill, in plain English" : "The bill, in brief").uppercased())
                    .font(Typo.mono(11))
                    .webTracking(0.12, size: 11)
                    .foregroundStyle(theme.info)
                InfoTerm(model.plain != nil ? "plainEnglish" : "officialSummary")
            }
            .padding(.bottom, 4)

            Group {
                if model.plainLoading {
                    Text("Reading the bill\u{2026}")
                } else if let plain = model.plain {
                    Text(plain.sourceLine)
                } else {
                    Text(page.summaryParagraphs.isEmpty
                         ? "Official summary not yet available \u{00B7} nothing guessed from the title"
                         : "Official summary by the Congressional Research Service, Congress\u{2019}s nonpartisan research office")
                }
            }
            .font(Typo.inter(12))
            .lineSpacing(BillsCSS.leading(12, 1.6))
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, model.plain?.sourceURL == nil ? 18 : 6)

            if let url = model.plain?.sourceURL {
                Link("Read the text \u{2197}", destination: url)
                    .font(Typo.inter(12, 500))
                    .foregroundStyle(theme.info)
                    .padding(.bottom, 18)
            }

            Text("What this bill would do")
                .font(Typo.inter(22, 600, relativeTo: .title2))
                .webTracking(-0.01, size: 22)
                .foregroundStyle(theme.text)
                .padding(.bottom, 24)

            if model.plainLoading {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("The first explanation of a bill takes a few seconds.")
                        .font(Typo.inter(15))
                        .foregroundStyle(theme.textMuted)
                }
            } else if let plain = model.plain {
                BillsProseView(
                    paragraphs: [plain.summary] + plain.paragraphs,
                    textColor: UIColor(theme.text),
                    capColor: UIColor(theme.info)
                )
                if !plain.keyPoints.isEmpty {
                    Text("What it does")
                        .font(Typo.inter(18, 600, relativeTo: .headline))
                        .foregroundStyle(theme.text)
                        .padding(.top, 24)
                        .padding(.bottom, 10)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(plain.keyPoints.enumerated()), id: \.offset) { _, point in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\u{2022}").foregroundStyle(theme.info)
                                Text(point)
                                    .font(Typo.inter(16))
                                    .lineSpacing(BillsCSS.leading(16, 1.6))
                                    .foregroundStyle(theme.text)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("What it does: " + plain.keyPoints.joined(separator: ". "))
                }
            } else {
                BillsProseView(
                    paragraphs: page.explanationParagraphs,
                    textColor: UIColor(theme.text),
                    capColor: UIColor(theme.info)
                )
            }
        }
        // 20pt padding inside a 1pt border, 3pt on the left.
        .padding(.leading, 23)
        .padding([.top, .bottom, .trailing], 21)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: 0, bottomLeading: 0, bottomTrailing: 8, topTrailing: 8))
                .fill(theme.surface)
        )
        .overlay(
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: 0, bottomLeading: 0, bottomTrailing: 8, topTrailing: 8))
                .stroke(theme.border, lineWidth: 1)
        )
        .overlay(alignment: .leading) { Rectangle().fill(theme.info).frame(width: 3) }
        .padding(.bottom, 24)
    }

    // MARK: Official summary (`details.bill-summary-block`)

    private func summaryBlock(_ paragraphs: [String]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(Motion.short) { summaryOpen.toggle() }
            } label: {
                HStack(spacing: 0) {
                    Text(summaryOpen ? "\u{2212} " : "+ ")
                        .font(Typo.mono(12, 600))
                        .padding(.trailing, 4)
                    Text(summaryOpen ? "Hide official Congress.gov summary".uppercased() : "Show official Congress.gov summary".uppercased())
                        .font(Typo.mono(12))
                }
                .webTracking(0.04, size: 12)
                .foregroundStyle(theme.accent)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(summaryOpen ? "Expanded" : "Collapsed")

            if summaryOpen {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { _, paragraph in
                        Text(paragraph)
                            .font(Typo.inter(14))
                            .lineSpacing(BillsCSS.leading(14, 1.7))
                            .foregroundStyle(theme.text)
                            .fixedSize(horizontal: false, vertical: true)
                            .textSelection(.enabled)
                    }
                }
                .padding(.top, 16)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(RoundedRectangle(cornerRadius: 4).fill(theme.accentSubtle))
        .padding(.bottom, 32)
    }

    // MARK: Floor votes (`.bill-tally-card`)

    private var tallies: some View {
        BillsEditorialSection(label: "Floor votes", title: "How the chambers voted") {
            VStack(spacing: 12) {
                ForEach(model.tallies) { tally in
                    NavigationLink {
                        RollCallMembersScreen(rollCallID: tally.id, question: tally.question)
                    } label: {
                        BillsTallyCard(tally: tally)
                    }
                    .buttonStyle(.plain)
                    .id(tally.id)
                }
            }
            .padding(.top, 8)
        }
    }

    // MARK: Tell your rep (`.tyr`)

    private var tellYourRep: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Tell your rep".uppercased())
                .font(Typo.mono(11))
                .webTracking(0.12, size: 11)
                .foregroundStyle(theme.textMuted)
                .padding(.bottom, 12)
            // The writing hand-off lives on the website; open this bill's
            // panel there.
            Button("Write to your representative about this") {
                if let key {
                    openURL(Config.siteURL.appendingPathComponent("bill/\(key.congress)/\(key.type)/\(key.number)"))
                }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .padding(.top, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }
        .padding(.bottom, 48)
    }

    // MARK: Timeline (`.bill-timeline`)

    private func timeline(_ actions: [BillsCongressGov.Action]) -> some View {
        BillsEditorialSection(label: "Legislative timeline", title: "What's happened so far") {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(actions.prefix(12).enumerated()), id: \.offset) { index, action in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(BillsFormat.date(action.actionDate))
                            .font(Typo.mono(11))
                            .webTracking(0.04, size: 11)
                            .foregroundStyle(theme.textMuted)
                        Text(timelineText(action))
                            .lineSpacing(BillsCSS.leading(14, 1.5))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.trailing, 8)
                    .padding(.bottom, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .topLeading) {
                        Circle()
                            .strokeBorder(index == 0 ? theme.accent : theme.textMuted, lineWidth: 2)
                            .background(Circle().fill(index == 0 ? theme.accent : theme.surface))
                            .frame(width: 9, height: 9)
                            .offset(x: -21, y: 6)
                    }
                }
            }
            .padding(.leading, 24)
            .background(alignment: .topLeading) {
                GeometryReader { geo in
                    Rectangle()
                        .fill(theme.border)
                        .frame(width: 1, height: max(0, geo.size.height - 16))
                        .offset(x: 7, y: 8)
                }
            }
        }
    }

    private func timelineText(_ action: BillsCongressGov.Action) -> AttributedString {
        var text = AttributedString(action.text ?? "")
        text.font = Typo.inter(14)
        text.foregroundColor = theme.text
        if let code = action.actionCode, !code.isEmpty {
            text += AttributedString("  ")
            var chip = AttributedString("\u{2009}\(code)\u{2009}")
            chip.font = Typo.mono(10)
            chip.foregroundColor = theme.textMuted
            chip.backgroundColor = theme.borderSoft
            chip.tracking = 0.4
            text += chip
        }
        return text
    }

    // MARK: Rail cards (`.bill-rail-card`)

    private func sponsorCard(_ sponsor: BillPage.Sponsor) -> some View {
        BillsRailCard {
            BillsRailHeading("Sponsor", term: "sponsor")
            Button {
                if sponsor.bioguideID != nil { openSponsor = true }
            } label: {
                Text(sponsor.name)
                    .font(Typo.inter(22, 400, relativeTo: .title2))
                    .lineSpacing(BillsCSS.leading(22, 1.2))
                    .foregroundStyle(theme.text)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.plain)
            .disabled(sponsor.bioguideID == nil)
            .padding(.bottom, 4)
            if let meta = sponsor.meta {
                Text(meta)
                    .font(Typo.inter(13))
                    .foregroundStyle(theme.textSecondary)
            }
        }
    }

    private func cosponsorCard(_ cosponsors: [BillsCongressGov.Person]) -> some View {
        let counts = Dictionary(grouping: cosponsors) { BillsParty.party($0.party) }.mapValues(\.count)
        let rows: [(Party, String)] = [(.democrat, "Democrats"), (.republican, "Republicans"), (.independent, "Independents")]
            .filter { (counts[$0.0] ?? 0) > 0 }
        return BillsRailCard {
            BillsRailHeading("Cosponsors (\(cosponsors.count))", term: "cosponsor")
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    HStack {
                        Text(row.1.uppercased())
                            .font(Typo.mono(11))
                            .webTracking(0.06, size: 11)
                            .foregroundStyle(theme.party(row.0))
                        Spacer()
                        Text("\(counts[row.0] ?? 0)")
                            .font(Typo.mono(13))
                            .foregroundStyle(theme.text)
                    }
                    .padding(.vertical, 6)
                    .overlay(alignment: .bottom) {
                        if index < rows.count - 1 { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                    }
                }
            }
            .padding(.bottom, 12)

            Button(showAllCosponsors ? "Hide list" : "View all \(cosponsors.count) \u{2192}") {
                withAnimation(Motion.short) { showAllCosponsors.toggle() }
            }
            .buttonStyle(.plain)
            .font(Typo.inter(12))
            .foregroundStyle(theme.accent)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)

            if showAllCosponsors {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(cosponsors.enumerated()), id: \.offset) { _, person in
                        NavigationLink {
                            BillsMemberLoader(bioguideID: person.bioguideId ?? "", name: person.displayName)
                        } label: {
                            HStack {
                                Text(person.displayName)
                                    .font(Typo.inter(13))
                                    .foregroundStyle(theme.text)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 8)
                                if let letter = BillsParty.letter(person.party) {
                                    Text(letter)
                                        .font(Typo.mono(11))
                                        .foregroundStyle(theme.party(BillsParty.party(letter)))
                                }
                            }
                            .padding(.vertical, 4)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(person.bioguideId == nil)
                    }
                }
                .padding(.top, 12)
                .overlay(alignment: .top) { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                .padding(.top, 12)
            }
        }
    }

    private func committeeCard(_ page: BillPage) -> some View {
        BillsRailCard {
            BillsRailHeading("Committees", term: "committee")

            VStack(alignment: .leading, spacing: 0) {
                if page.committees.isEmpty {
                    Text("\(page.committeeCount) referred · see Congress.gov for details")
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.text)
                        .padding(.vertical, 8)
                } else {
                    ForEach(Array(page.committees.enumerated()), id: \.offset) { index, committee in
                        VStack(alignment: .leading, spacing: 2) {
                            if let chamber = committee.chamber, !chamber.isEmpty {
                                Text(chamber.uppercased())
                                    .font(Typo.mono(10))
                                    .webTracking(0.08, size: 10)
                                    .foregroundStyle(theme.textMuted)
                            }
                            Text(committee.name ?? "")
                                .font(Typo.inter(13))
                                .foregroundStyle(theme.text)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8)
                        .overlay(alignment: .bottom) {
                            if index < page.committees.count - 1 { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                        }
                    }
                }
            }
        }
    }

    private func textCard(_ page: BillPage) -> some View {
        let versions = Array(page.textVersions.prefix(3))
        return BillsRailCard {
            BillsRailHeading("Bill text")
            VStack(spacing: 0) {
                ForEach(Array(versions.enumerated()), id: \.offset) { index, version in
                    Button {
                        if let url = URL(string: version.formats?.first?.url ?? "") ?? page.congressGovURL {
                            openURL(url)
                        }
                    } label: {
                        HStack {
                            Text(version.type ?? "Full Text")
                                .font(Typo.inter(13, 500))
                                .foregroundStyle(theme.text)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 8)
                            Text(BillsFormat.date(version.date))
                                .font(Typo.mono(11))
                                .foregroundStyle(theme.textMuted)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .overlay(alignment: .bottom) {
                        if index < versions.count - 1 { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                    }
                }
            }
        }
    }
}

// MARK: - Pieces

/// `.bill-status-pill`: square-ish tinted pill, uppercase mono.
struct BillsPagePill: View {
    let status: BillsStatus
    @Environment(\.theme) private var theme

    private var colors: (fg: Color, bg: Color, dot: Color) {
        switch status {
        case .law, .both: return (theme.success, theme.subtle(theme.success), theme.success)
        case .passedHouse, .passedSenate: return (theme.info, theme.subtle(theme.info), theme.info)
        case .committee: return (theme.warning, theme.subtle(theme.warning), theme.warning)
        case .introduced, .progress: return (theme.textSecondary, theme.borderSoft, theme.textMuted)
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(colors.dot).frame(width: 6, height: 6)
            Text(status.pageLabel.uppercased())
                .font(Typo.mono(11))
                .webTracking(0.08, size: 11)
                .foregroundStyle(colors.fg)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 3).fill(colors.bg))
    }
}

/// The pulsing info dot of `.bill-ai-pulse`.
struct BillsPulseDot: View {
    @State private var pulse = false
    @Environment(\.theme) private var theme

    var body: some View {
        Circle()
            .fill(theme.info)
            .frame(width: 6, height: 6)
            .background(
                Circle()
                    .fill(theme.info.opacity(pulse ? 0 : 0.4))
                    .frame(width: pulse ? 22 : 6, height: pulse ? 22 : 6)
            )
            .onAppear {
                withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
            }
            .accessibilityHidden(true)
    }
}

/// `.btn-secondary.btn-sm`: 14px/500 accent text, 36pt tall, 2pt side padding.
struct BillsSmallTextButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.inter(14, 500))
            .foregroundStyle(theme.accent)
            .underline(configuration.isPressed, color: theme.accent)
            .padding(.horizontal, 2)
            .frame(minHeight: 36)
            .contentShape(Rectangle())
    }
}

/// `.bill-editorial-section`: hairline above, mono label, display title.
struct BillsEditorialSection<Content: View>: View {
    let label: String
    let title: String
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label.uppercased())
                .font(Typo.mono(11))
                .webTracking(0.12, size: 11)
                .foregroundStyle(theme.textMuted)
                .padding(.bottom, 12)
            Text(title)
                .font(Typo.inter(24, 600, relativeTo: .title2).leading(.tight))
                .webTracking(-0.01, size: 24)
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 20)
            content
        }
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(theme.border).frame(height: 1) }
    }
}

struct BillsRailCard<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 8).fill(theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.border, lineWidth: 1))
    }
}

struct BillsRailHeading: View {
    let text: String
    var term: String?
    @Environment(\.theme) private var theme
    init(_ text: String, term: String? = nil) {
        self.text = text
        self.term = term
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(text.uppercased())
                .font(Typo.mono(11, 500))
                .webTracking(0.12, size: 11)
                .foregroundStyle(theme.textMuted)
            if let term { InfoTerm(term) }
        }
        .padding(.bottom, 16)
    }
}

/// One floor vote, as `.bill-tally-card`.
struct BillsTallyCard: View {
    let tally: BillDetailModel.Tally
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text((tally.chamber?.label ?? "Congress").uppercased())
                .font(Typo.mono(11))
                .webTracking(0.12, size: 11)
                .foregroundStyle(theme.textMuted)
                .padding(.bottom, 4)
            if let date = tally.date {
                Text(BillsFormat.date(date))
                    .font(Typo.mono(12))
                    .foregroundStyle(theme.textMuted)
                    .padding(.bottom, 14)
            }
            Text(tally.result)
                .font(Typo.inter(28, 400, relativeTo: .title))
                .foregroundStyle(tally.passed ? theme.success : theme.error)
                .padding(.bottom, 12)
            GeometryReader { geo in
                let total = CGFloat(max(tally.yea + tally.nay, 1))
                HStack(spacing: 0) {
                    Rectangle().fill(theme.success).frame(width: geo.size.width * CGFloat(tally.yea) / total)
                    Rectangle().fill(theme.error).frame(width: geo.size.width * CGFloat(tally.nay) / total)
                }
            }
            .frame(height: 8)
            .background(theme.borderSoft)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .padding(.bottom, 8)
            HStack {
                Text("\(tally.yea) Yea")
                Spacer(minLength: 12)
                Text("\(tally.nay) Nay")
            }
            .font(Typo.mono(12))
            .foregroundStyle(theme.textSecondary)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(theme.surface))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.border, lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Opens a member page from a bioguide id (the bill page only holds ids).
struct BillsMemberLoader: View {
    let bioguideID: String
    let name: String
    @State private var politician: Politician?
    @State private var failed = false

    var body: some View {
        Group {
            if let politician {
                PoliticianDetailScreen(politician: politician)
            } else if failed {
                EmptyStateView(title: name, message: "We don't hold a member record for this person yet.", systemImage: "person.crop.circle.badge.questionmark")
            } else {
                BillsPageLoading(label: "Loading member...")
            }
        }
        .paperBackground()
        .task {
            guard politician == nil else { return }
            if let found = try? await BallotWatchAPI.politician(id: bioguideID) {
                politician = found
            } else {
                failed = true
            }
        }
    }
}

// MARK: - Page data

/// Everything the bill page shows, from Congress.gov (as the web reads it)
/// with our database copy as the fallback when Congress.gov is unreachable.
struct BillPage {
    struct Sponsor {
        let name: String
        let bioguideID: String?
        let partyLetter: String?
        let state: String?
        let district: Int?

        /// `.bill-sp-meta`: "R · CO-8".
        var meta: String? {
            let seat = state.map { s in district.map { "\(s)-\($0)" } ?? s }
            let parts = [partyLetter, seat].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " · ")
        }
    }

    let title: String
    let status: BillsStatus
    let sponsor: Sponsor?
    let introducedAt: String?
    let policyArea: String?
    let summaryParagraphs: [String]
    let actions: [BillsCongressGov.Action]
    let cosponsors: [BillsCongressGov.Person]
    let committees: [BillsCongressGov.Committee]
    let committeeCount: Int
    let textVersions: [BillsCongressGov.TextVersion]
    let congressGovURL: URL?
    let isFallback: Bool

    var fullTextURL: URL? {
        textVersions.first?.formats?.first?.url.flatMap(URL.init(string:))
    }

    /// `unavailableExplanation()` when there's no official summary.
    var explanationParagraphs: [String] {
        if !summaryParagraphs.isEmpty { return summaryParagraphs }
        return [
            "Congress.gov has not published an official summary for this bill yet.",
            "BallotWatch won\u{2019}t infer provisions from the title alone. Use the Congress.gov or full-text link for the official record.",
        ]
    }
}

// MARK: - Model

@MainActor
final class BillDetailModel: ObservableObject {
    struct Tally: Identifiable {
        let id: String
        let chamber: Chamber?
        let date: String?
        let question: String?
        let result: String
        let passed: Bool
        let yea: Int
        let nay: Int
    }

    @Published private(set) var isLoading = true
    @Published private(set) var page: BillPage?
    @Published private(set) var tallies: [Tally] = []
    @Published private(set) var errorMessage: String?
    /// Written by AI from the bill's own text (GET /api/explain).
    @Published private(set) var plain: PlainEnglishExplanation?
    @Published private(set) var plainLoading = true

    private let billID: String
    private var started = false

    init(billID: String) { self.billID = billID }

    func loadIfNeeded() async {
        guard !started else { return }
        started = true
        await load()
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let key = BillKey(id: billID) else {
            errorMessage = "Bill not found"
            plainLoading = false
            return
        }

        // The first explanation of a bill can take several seconds to write,
        // so it loads beside the page instead of holding it up.
        Task { [billID] in
            let explanation = await BallotWatchAPI.plainEnglish(billID: billID)
            self.plain = explanation
            self.plainLoading = false
        }

        async let dbTask = try? BallotWatchAPI.bill(id: billID)
        async let detailTask = try? BillsCongressGov.detail(key)
        async let summariesTask = try? BillsCongressGov.summaries(key)
        async let actionsTask = try? BillsCongressGov.actions(key)
        async let cosponsorsTask = try? BillsCongressGov.cosponsors(key)
        async let committeesTask = try? BillsCongressGov.committees(key)
        async let textTask = try? BillsCongressGov.textVersions(key)
        async let callsTask = try? BallotWatchAPI.rollCallsForBill(billID)
        async let routingsTask = try? BallotWatchAPI.routings(billID: billID)

        let db = await dbTask ?? nil
        let detail = await detailTask ?? nil
        let summaries = await summariesTask ?? []
        let actions = await actionsTask ?? []
        let cosponsors = await cosponsorsTask ?? []
        var committees = await committeesTask ?? []
        let texts = await textTask ?? []
        let calls = await callsTask ?? []
        let routings = await routingsTask ?? []

        guard detail != nil || db != nil else {
            errorMessage = "Failed to load bill details. Please try again."
            return
        }

        let latestAction = detail?.latestAction?.text
        let title = BillsFormat.displayTitle(
            detail?.title ?? db?.title, key: key,
            latestAction: latestAction, policyArea: detail?.policyArea?.name ?? db?.policyArea
        )

        let sponsor: BillPage.Sponsor? = {
            if let s = detail?.sponsors?.first {
                return .init(name: s.displayName, bioguideID: s.bioguideId,
                             partyLetter: BillsParty.letter(s.party), state: s.state, district: s.district)
            }
            if let db, let name = db.sponsorName, !name.isEmpty {
                return .init(name: name, bioguideID: db.sponsorBioguideID,
                             partyLetter: BillsParty.letter(db.sponsorParty), state: db.sponsorState, district: nil)
            }
            return nil
        }()

        // The latest official (CRS) summary; our database keeps the same text.
        let summaryHTML = summaries.last?.text ?? db?.crsSummary
        let paragraphs = BillsFormat.summaryParagraphs(summaryHTML, title: title)

        if committees.isEmpty {
            committees = routings
                .filter { $0.subcommitteeName?.isEmpty ?? true }
                .map { .init(chamber: $0.chamberRaw.map { $0.capitalized }, name: $0.committeeName ?? $0.committeeCode) }
        }

        page = BillPage(
            title: title,
            status: BillsStatus(latestAction: latestAction),
            sponsor: sponsor,
            introducedAt: detail?.introducedDate ?? db?.introducedAt,
            policyArea: detail?.policyArea?.name ?? db?.policyArea,
            summaryParagraphs: paragraphs,
            actions: actions,
            cosponsors: cosponsors,
            committees: committees,
            committeeCount: detail?.committees?.count ?? 0,
            textVersions: texts,
            congressGovURL: detail?.legislationUrl.flatMap(URL.init(string:)) ?? key.congressGovURL,
            isFallback: detail == nil
        )

        if !calls.isEmpty {
            let stats = (try? await BallotWatchAPI.rollCallStats(ids: calls.map(\.id))) ?? []
            let byID = Dictionary(stats.map { ($0.rollCallID, $0) }, uniquingKeysWith: { a, _ in a })
            tallies = calls.compactMap { call in
                guard let s = byID[call.id] else { return nil }
                let chamber = call.meta?.chamber
                // Only tallies that pass the sanity check (some ingested rows
                // are double-counted).
                guard FloorVotes.isSane(yea: s.totalYea, nay: s.totalNay, chamber: chamber),
                      let result = FloorVotes.deriveResult(question: call.question, yea: s.totalYea, nay: s.totalNay, chamber: chamber)
                else { return nil }
                let lower = result.lowercased()
                let passed = lower.contains("passed") || lower.contains("agreed") || lower.contains("invoked") || lower.contains("confirmed")
                return Tally(id: call.id, chamber: chamber, date: call.votedAt, question: call.question,
                             result: result, passed: passed, yea: s.totalYea, nay: s.totalNay)
            }
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
