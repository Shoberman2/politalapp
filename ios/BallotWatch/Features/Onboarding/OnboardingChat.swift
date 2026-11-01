import AuthenticationServices
import SwiftUI

/// First launch: a short chat with Dome, one question at a time, four
/// questions at most. Where you vote, whether to follow your members, alerts,
/// and an optional account. Everything here can be changed later in the
/// settings sheet, so nothing is asked twice.
struct OnboardingChat: View {
    enum Step: Equatable { case place, follow, alerts, account, done }

    struct Message: Identifiable, Equatable {
        enum Kind: Equatable { case dome, user, members, steps([String]) }
        let id = UUID()
        let kind: Kind
        var text: String = ""
    }

    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var userData: UserData
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var pro: ProStore
    @EnvironmentObject private var alerts: AlertsStore
    @EnvironmentObject private var banners: BannerCenter
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @StateObject private var reps = MyRepModel()
    @State private var messages: [Message] = []
    @State private var step: Step = .place
    @State private var input = ""
    @State private var isThinking = false
    @State private var showEmail = false
    @State private var paywall: ProFeature?
    @State private var appleNonce = ""
    @State private var tapCount = 0
    @FocusState private var inputFocused: Bool

    private var members: [MyRepModel.Rep] { reps.house + reps.senate }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        ForEach(messages) { message in
                            bubble(message)
                                .id(message.id)
                                .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                        }
                        if isThinking {
                            DomeView(width: 44, isThinking: true)
                                .padding(.leading, 2)
                                .id("thinking")
                        }
                        Color.clear.frame(height: 8).id("bottom")
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                    .frame(maxWidth: 640)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: messages.count) { _, _ in
                    withAnimation(Motion.medium) { proxy.scrollTo("bottom", anchor: .bottom) }
                }
                .onChange(of: step) { _, _ in
                    withAnimation(Motion.medium) { proxy.scrollTo("bottom", anchor: .bottom) }
                }
            }
            answerArea
                .padding(.horizontal, 20)
                .padding(.top, 10)
                .padding(.bottom, 12)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
                .background(theme.bg)
        }
        .background(theme.bg.ignoresSafeArea())
        .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.4, dampingFraction: 0.92), value: messages)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: step)
        .sensoryFeedback(.impact(weight: .light), trigger: tapCount)
        .sheet(isPresented: $showEmail) {
            AuthScreen(startWithEmail: true)
                .presentationDetents([.large])
                .sheetChrome()
        }
        .proPaywall($paywall)
        .onChange(of: paywall) { old, new in
            // Paywall closed during the alerts question.
            if old != nil, new == nil, step == .alerts { finishAlerts(turnedOn: pro.isPro) }
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn, step == .account { finishAccount(signedIn: true) }
        }
        .task { start() }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 14) {
            DomeView(width: 96, isThinking: isThinking)
            Text("Meet \(DomeCharacter.name)")
                .font(Typo.inter(30, 600, relativeTo: .largeTitle))
                .webTracking(-0.03, size: 30)
                .foregroundStyle(theme.text)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
        .padding(.bottom, 18)
        .accessibilityElement(children: .combine)
    }

    // MARK: Bubbles

    @ViewBuilder
    private func bubble(_ message: Message) -> some View {
        switch message.kind {
        case .dome:
            Text(message.text)
                .font(Typo.inter(17, relativeTo: .body))
                .lineSpacing(3)
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surface))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(theme.cardEdge, lineWidth: scheme == .dark ? 0 : 1))
                .frame(maxWidth: 320, alignment: .leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .user:
            Text(message.text)
                .font(Typo.inter(17, relativeTo: .body))
                .foregroundStyle(theme.onAccent)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.accent))
                .frame(maxWidth: 300, alignment: .trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        case .members:
            VStack(alignment: .leading, spacing: 12) {
                ForEach(members) { rep in
                    HStack(spacing: 12) {
                        MemberPhoto(bioguideID: rep.politician.id, name: rep.politician.name, size: 44)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(rep.politician.name)
                                .font(Typo.inter(17, 600, relativeTo: .headline))
                                .foregroundStyle(theme.text)
                            PartyTag(party: rep.politician.party, seat: rep.politician.seatLabel(districtOverride: rep.district))
                        }
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(16)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(theme.surface))
            .frame(maxWidth: 340, alignment: .leading)
        case .steps(let steps):
            VStack(alignment: .leading, spacing: 8) {
                ForEach(steps, id: \.self) { item in
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(theme.success)
                        Text(item)
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.textSecondary)
                    }
                }
            }
            .padding(.leading, 4)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: Answers

    @ViewBuilder
    private var answerArea: some View {
        if isThinking {
            Color.clear.frame(height: 52)
        } else {
            switch step {
            case .place: placeInput
            case .follow:
                QuickReplies(primary: "Follow them", secondary: "Not now") { yes in
                    tapCount += 1
                    answerFollow(yes)
                }
            case .alerts:
                QuickReplies(primary: "Turn on alerts", secondary: "Not now") { yes in
                    tapCount += 1
                    answerAlerts(yes)
                }
            case .account: accountOptions
            case .done:
                Button("Open BallotWatch") {
                    tapCount += 1
                    settings.hasOnboarded = true
                }
                .buttonStyle(PrimaryButtonStyle())
                .accessibilityIdentifier("onboardingFinish")
            }
        }
    }

    private var placeInput: some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                TextField("ZIP code or street address", text: $input)
                    .font(Typo.inter(17))
                    .foregroundStyle(theme.text)
                    .textContentType(.fullStreetAddress)
                    .submitLabel(.search)
                    .focused($inputFocused)
                    .onSubmit(submitPlace)
                    .padding(.horizontal, 16)
                    .frame(minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.surfaceDim))
                    .accessibilityIdentifier("onboardingPlace")
                Button("Find", action: submitPlace)
                    .buttonStyle(PrimaryButtonStyle(fullWidth: false))
                    .frame(minHeight: 50)
                    .disabled(input.trimmed.isEmpty)
            }
            Button("Use my location") {
                tapCount += 1
                Task { await findByLocation() }
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    private var accountOptions: some View {
        VStack(spacing: 10) {
            SignInWithAppleButton(.continue) { request in
                appleNonce = AppleSignIn.prepare(request)
            } onCompletion: { result in
                Task { await completeApple(result) }
            }
            .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
            .frame(height: 50)
            .clipShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))

            Button("Continue with email") {
                tapCount += 1
                showEmail = true
            }
            .buttonStyle(QuietButtonStyle())

            Button("Not now") {
                tapCount += 1
                finishAccount(signedIn: false)
            }
            .buttonStyle(SecondaryButtonStyle())
        }
    }

    // MARK: Flow

    private func start() {
        guard messages.isEmpty else { return }
        Task {
            await say("Hi, I'm \(DomeCharacter.name). I read every recorded vote in Congress and tell you what happened, in plain English.")
            await say("Where do you vote? A ZIP code or street address finds your members.")
        }
    }

    private func say(_ text: String, pause: Double = 0.45) async {
        if !reduceMotion {
            isThinking = true
            try? await Task.sleep(nanoseconds: UInt64(pause * 1_000_000_000))
            isThinking = false
        }
        messages.append(Message(kind: .dome, text: text))
    }

    private func submitPlace() {
        let text = input.trimmed
        guard !text.isEmpty else { return }
        tapCount += 1
        inputFocused = false
        messages.append(Message(kind: .user, text: text))
        input = ""
        Task { await findPlace { try await DistrictLookup.lookup(freeform: text) } }
    }

    private func findByLocation() async {
        messages.append(Message(kind: .user, text: "Use my location"))
        await findPlace {
            let coordinate = try await LocationProvider().requestLocation()
            return try await DistrictLookup.district(for: coordinate)
        }
    }

    private func findPlace(_ lookup: () async throws -> DistrictResult) async {
        isThinking = true
        do {
            let result = try await lookup()
            let place = UserData.SavedPlace(state: result.state, district: result.district, label: result.city)
            userData.save(place: place)
            await reps.loadReps(for: place, force: true)
            isThinking = false
            messages.append(Message(kind: .steps(["Found your district", "Matched your members"])))
            guard !members.isEmpty else {
                await say("I found \(USStates.name(for: result.state)) but couldn't load its members just now. You'll see them on My Reps.")
                await askAlertsOrAccount()
                return
            }
            messages.append(Message(kind: .members))
            if result.needsDistrict {
                await say("A ZIP code can cross district lines, so these are your senators. Add your street address on My Reps to find your House member.")
            }
            await say("Want to follow \(members.count == 1 ? "them" : "all \(members.count)")? Their votes show up first.")
            step = .follow
        } catch {
            isThinking = false
            await say("I couldn't match that. Try a 5-digit ZIP code or a full street address.")
        }
    }

    private func answerFollow(_ yes: Bool) {
        messages.append(Message(kind: .user, text: yes ? "Follow them" : "Not now"))
        if yes {
            for rep in members where !userData.isFollowing(memberID: rep.id) {
                userData.toggleFollow(memberID: rep.id)
            }
        }
        Task {
            if yes { await say("Done. They're on My Reps.") }
            await askAlertsOrAccount()
        }
    }

    private func askAlertsOrAccount() async {
        await say("I can send you a push when they vote. Turn on alerts?")
        step = .alerts
    }

    private func answerAlerts(_ yes: Bool) {
        messages.append(Message(kind: .user, text: yes ? "Turn on alerts" : "Not now"))
        guard yes else { finishAlerts(turnedOn: false); return }
        if pro.isPro {
            finishAlerts(turnedOn: true)
        } else {
            paywall = .memberAlerts
        }
    }

    private func finishAlerts(turnedOn: Bool) {
        // Move on exactly once per answer.
        guard step == .alerts else { return }
        step = .account
        Task {
            if turnedOn, await alerts.ensurePermission() {
                for rep in members where !alerts.isAlerting(memberID: rep.id) {
                    _ = await alerts.toggle(memberID: rep.id)
                }
                await say("Alerts are on.")
            } else if turnedOn {
                await say("Notifications are off for BallotWatch. You can allow them in Settings any time.")
            } else {
                await say("No problem. Alerts are in BallotWatch Pro whenever you want them.")
            }
            await say("Last one. Save this to a free account so it's on all your devices?")
        }
    }

    private func completeApple(_ result: Result<ASAuthorization, Error>) async {
        do {
            guard let token = try AppleSignIn.identityToken(from: result) else { return }
            try await auth.signInWithApple(idToken: token, nonce: appleNonce)
        } catch {
            banners.show(error.localizedDescription, kind: .error)
        }
    }

    private func finishAccount(signedIn: Bool) {
        guard step == .account else { return }
        step = .done
        messages.append(Message(kind: .user, text: signedIn ? "Signed in" : "Not now"))
        Task {
            await say(signedIn ? "Saved. You're all set." : "You're all set. Everything works without an account.")
            await say("BallotWatch is independent. It is not affiliated with any government entity, and it doesn't take sides.")
        }
    }
}

/// Two tap answers stacked: the outcome first, the quiet "no" below it.
private struct QuickReplies: View {
    let primary: String
    let secondary: String
    let answer: (Bool) -> Void

    var body: some View {
        VStack(spacing: 6) {
            Button(primary) { answer(true) }
                .buttonStyle(PrimaryButtonStyle())
            Button(secondary) { answer(false) }
                .buttonStyle(SecondaryButtonStyle())
        }
    }
}

/// A full-width neutral button for the second sign-in option: soft fill,
/// ink label, no border.
struct QuietButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.inter(16, 500))
            .foregroundStyle(theme.text)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(
                RoundedRectangle(cornerRadius: Radius.button, style: .continuous)
                    .fill(configuration.isPressed ? theme.fillSoft : theme.surfaceDim)
            )
            .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
            .opacity(isEnabled ? 1 : 0.55)
    }
}
