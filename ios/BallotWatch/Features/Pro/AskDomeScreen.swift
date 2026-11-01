import SwiftUI

/// Ask Dome (Pro): plain-English answers about Congress, grounded in the
/// record, each with its sources. Dome explains what happened and what the
/// rules are; it never says who is right.
struct AskDomeScreen: View {
    /// Optional context, e.g. "H.R. 1234" when opened from a bill.
    var topic: String?

    struct Entry: Identifiable, Equatable {
        enum Role: Equatable { case user, dome, error }
        let id = UUID()
        let role: Role
        let text: String
        var sources: [AskService.Source] = []
    }

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var pro: ProStore
    @Environment(\.theme) private var theme
    @Environment(\.openURL) private var openURL
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var entries: [Entry] = []
    @State private var draft = ""
    @State private var isAsking = false
    @State private var showAuth = false
    @State private var paywall: ProFeature?
    @State private var sendTap = 0
    @FocusState private var focused: Bool

    private var starters: [String] {
        if let topic {
            return ["What does \(topic) do?", "Where is \(topic) now?", "Who voted on \(topic)?"]
        }
        return ["What did the House vote on this week?", "What is a cloture vote?", "How does a bill become law?"]
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if entries.isEmpty { emptyState }
                        ForEach(entries) { entry in
                            row(entry).id(entry.id)
                                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                        }
                        if isAsking { thinking }
                        Color.clear.frame(height: 4).id("end")
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .frame(maxWidth: 680)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: entries.count) { _, _ in
                    withAnimation(Motion.medium) { proxy.scrollTo("end", anchor: .bottom) }
                }
                .onChange(of: isAsking) { _, _ in
                    withAnimation(Motion.medium) { proxy.scrollTo("end", anchor: .bottom) }
                }
            }
            chatBar
        }
        .background(theme.bg.ignoresSafeArea())
        .navigationTitle("Ask \(DomeCharacter.name)")
        .navigationBarTitleDisplayMode(.inline)
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.4, dampingFraction: 0.92), value: entries)
        .sensoryFeedback(.impact(weight: .light), trigger: sendTap)
        .sheet(isPresented: $showAuth) { AuthScreen().presentationDetents([.large]).sheetChrome() }
        .proPaywall($paywall)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            DomeView(width: 96)
                .padding(.top, 32)
            Text("Ask About Congress")
                .font(Typo.inter(28, 600, relativeTo: .title))
                .webTracking(-0.03, size: 28)
                .foregroundStyle(theme.text)
            Text("Answers come from the public record, with sources. \(DomeCharacter.name) explains; it doesn't take sides.")
                .font(Typo.inter(17))
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            VStack(alignment: .leading, spacing: 4) {
                ForEach(starters, id: \.self) { starter in
                    Button(starter) { send(starter) }
                        .font(Typo.inter(17, 500))
                        .foregroundStyle(theme.accent)
                        .frame(minHeight: 44, alignment: .leading)
                        .multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func row(_ entry: Entry) -> some View {
        switch entry.role {
        case .user:
            Text(entry.text)
                .font(Typo.inter(17))
                .foregroundStyle(theme.onAccent)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.accent))
                .frame(maxWidth: 320, alignment: .trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        case .dome, .error:
            VStack(alignment: .leading, spacing: 12) {
                Text(entry.text)
                    .font(Typo.inter(17))
                    .lineSpacing(3)
                    .foregroundStyle(entry.role == .error ? theme.error : theme.text)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                if !entry.sources.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Sources")
                            .font(Typo.inter(13, 500))
                            .foregroundStyle(theme.textMuted)
                        ForEach(entry.sources, id: \.self) { source in
                            Button(source.title) {
                                if let url = URL(string: source.url) { openURL(url) }
                            }
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.accent)
                            .multilineTextAlignment(.leading)
                            .frame(minHeight: 36, alignment: .leading)
                        }
                    }
                }
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surface))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var thinking: some View {
        HStack(spacing: 12) {
            DomeView(width: 44, isThinking: true)
            Text("Reading the record")
                .font(Typo.inter(16))
                .foregroundStyle(theme.textMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private var chatBar: some View {
        HStack(spacing: 10) {
            TextField("Ask about a bill, vote or member", text: $draft, axis: .vertical)
                .font(Typo.inter(17))
                .foregroundStyle(theme.text)
                .lineLimit(1...4)
                .focused($focused)
                .submitLabel(.send)
                .onSubmit { send(draft) }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(theme.surfaceDim))
                .accessibilityIdentifier("askField")
            Button("Ask") { send(draft) }
                .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                .disabled(draft.trimmed.isEmpty || isAsking)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(theme.bg)
    }

    private func send(_ text: String) {
        let question = text.trimmed
        guard !question.isEmpty, !isAsking else { return }
        guard pro.isPro else { paywall = .askDome; return }
        guard auth.isSignedIn else { showAuth = true; return }
        sendTap += 1
        draft = ""
        let history = entries.compactMap { entry -> AskService.Turn? in
            switch entry.role {
            case .user: return .init(role: "user", content: entry.text)
            case .dome: return .init(role: "assistant", content: entry.text)
            case .error: return nil
            }
        }
        entries.append(Entry(role: .user, text: question))
        isAsking = true
        Task {
            defer { isAsking = false }
            do {
                let answer = try await AskService.ask(question, history: history, token: await auth.validAccessToken())
                entries.append(Entry(role: .dome, text: answer.answer, sources: answer.sources))
            } catch {
                entries.append(Entry(role: .error, text: (error as? LocalizedError)?.errorDescription ?? "Dome can't answer right now."))
            }
        }
    }
}
