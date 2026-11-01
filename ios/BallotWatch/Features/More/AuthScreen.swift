import AuthenticationServices
import SwiftUI

/// Sign in or create a free account: Sign in with Apple first, email below.
/// Always dismissible. Reading the record never needs an account; an account
/// syncs saved items across devices and carries BallotWatch Pro.
struct AuthScreen: View {
    /// Onboarding's "Continue with email" opens straight on the form.
    var startWithEmail = false

    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var banners: BannerCenter
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    @Environment(\.colorScheme) private var scheme

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isWorking = false
    @State private var appleNonce = ""
    @State private var submitTap = 0
    @FocusState private var focused: Field?

    private enum Field { case email, password }

    private enum Mode { case signIn, signUp
        var title: String { self == .signIn ? "Sign In" : "Create Your Account" }
        var action: String { self == .signIn ? "Sign in" : "Create account" }
        var prompt: String { self == .signIn ? "New here?" : "Have an account?" }
        var toggle: String { self == .signIn ? "Create an account" : "Sign in" }
        var passwordPlaceholder: String { self == .signIn ? "Password" : "Password, 6 characters or more" }
    }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 6 && !isWorking
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                DomeView(width: 72)
                    .padding(.top, 40)
                    .padding(.bottom, 18)
                Text(mode.title)
                    .font(Typo.inter(30, 600, relativeTo: .largeTitle))
                    .webTracking(-0.03, size: 30)
                    .foregroundStyle(theme.text)
                Text("Free. Keeps your members and bills on every device.")
                    .font(Typo.inter(17))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
                    .padding(.bottom, 32)

                SignInWithAppleButton(mode == .signIn ? .signIn : .signUp) { request in
                    appleNonce = AppleSignIn.prepare(request)
                } onCompletion: { result in
                    Task { await completeApple(result) }
                }
                .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                .accessibilityIdentifier("signInWithApple")

                Text("or with email")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textMuted)
                    .padding(.vertical, 20)

                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.next)
                        .focused($focused, equals: .email)
                        .onSubmit { focused = .password }
                        .appField()
                    SecureField(mode.passwordPlaceholder, text: $password)
                        .textContentType(mode == .signIn ? .password : .newPassword)
                        .submitLabel(.go)
                        .focused($focused, equals: .password)
                        .onSubmit { if canSubmit { Task { await submit() } } }
                        .appField()

                    if let error {
                        Text(error)
                            .font(Typo.inter(16))
                            .foregroundStyle(theme.error)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        submitTap += 1
                        Task { await submit() }
                    } label: {
                        HStack(spacing: 10) {
                            if isWorking { ProgressView().tint(theme.onAccent) }
                            Text(mode.action)
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canSubmit)
                    .padding(.top, 4)
                }

                HStack(spacing: 6) {
                    Text(mode.prompt)
                        .foregroundStyle(theme.textSecondary)
                    Button(mode.toggle) {
                        withAnimation(Motion.short) {
                            mode = mode == .signIn ? .signUp : .signIn
                            error = nil
                        }
                    }
                    .foregroundStyle(theme.accent)
                    .frame(minHeight: 44)
                }
                .font(Typo.inter(16, 500))
                .padding(.top, 16)
                .padding(.bottom, 32)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(theme.bg.ignoresSafeArea())
        .scrollDismissesKeyboard(.interactively)
        .overlay(alignment: .topTrailing) {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(theme.textSecondary)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Close")
            .padding(.trailing, 8)
            .padding(.top, 8)
        }
        .sensoryFeedback(.impact(weight: .medium), trigger: submitTap)
        .onAppear { if startWithEmail { focused = .email } }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn {
                banners.show("Signed in")
                dismiss()
            }
        }
    }

    private func submit() async {
        isWorking = true
        error = nil
        defer { isWorking = false }
        do {
            if mode == .signIn {
                try await auth.signIn(email: email.trimmed, password: password)
            } else {
                try await auth.signUp(email: email.trimmed, password: password)
            }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func completeApple(_ result: Result<ASAuthorization, Error>) async {
        do {
            guard let token = try AppleSignIn.identityToken(from: result) else { return }
            isWorking = true
            defer { isWorking = false }
            try await auth.signInWithApple(idToken: token, nonce: appleNonce)
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

extension View {
    /// The app's text field: 50pt, soft fill, 14pt radius, no border.
    func appField() -> some View { modifier(AppFieldStyle()) }
}

private struct AppFieldStyle: ViewModifier {
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .font(Typo.inter(17))
            .foregroundStyle(theme.text)
            .padding(.horizontal, 16)
            .frame(minHeight: 50)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(theme.surfaceDim))
    }
}
