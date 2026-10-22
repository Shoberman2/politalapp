import SwiftUI

/// Email sign-in. Optional throughout — nothing in the app is gated behind it,
/// so this sheet is always dismissible and never blocks a read.
struct AuthScreen: View {
    @EnvironmentObject private var auth: AuthStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isWorking = false

    private enum Mode { case signIn, signUp
        var title: String { self == .signIn ? "Sign in" : "Create your account" }
        var action: String { self == .signIn ? "Sign in" : "Create account" }
        var prompt: String { self == .signIn ? "New here?" : "Already have an account?" }
        var toggle: String { self == .signIn ? "Create an account" : "Sign in" }
        var passwordPlaceholder: String { self == .signIn ? "Your password" : "At least 6 characters" }
    }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 6 && !isWorking
    }

    // Port of the web /auth page (src/components/Auth.jsx, src/styles/Auth.css):
    // a centered card with the wordmark, title, tagline and the form.
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    Text(Brand.name)
                        .font(Typo.inter(18, 600))
                        .webTracking(-0.02, size: 18)
                        .foregroundStyle(theme.text)
                        .padding(.bottom, 20)
                    Text(mode.title)
                        .font(Typo.inter(28, 600, relativeTo: .title))
                        .webTracking(-0.025, size: 28)
                        .foregroundStyle(theme.text)
                        .padding(.bottom, 10)
                    Text("Free. With an account you can keep your representatives, saved bills and followed members on every device.")
                        .font(Typo.inter(15))
                        .lineSpacing(4)
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.bottom, 28)

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        FieldLabel("Email")
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .fieldStyle()
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        FieldLabel("Password")
                        SecureField(mode.passwordPlaceholder, text: $password)
                            .textContentType(mode == .signIn ? .password : .newPassword)
                            .fieldStyle()
                    }

                    if let error {
                        Text(error)
                            .font(Typo.inter(14))
                            .foregroundStyle(theme.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        Text(isWorking ? "Please wait…" : mode.action)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canSubmit)
                }

                HStack(spacing: 4) {
                    Text(mode.prompt)
                        .foregroundStyle(theme.textSecondary)
                    Button(mode.toggle) {
                        withAnimation(Motion.short) {
                            mode = mode == .signIn ? .signUp : .signIn
                            error = nil
                        }
                    }
                    .foregroundStyle(theme.accent)
                }
                .font(Typo.inter(14))
                .padding(.top, 20)

                Button("Not now") { dismiss() }
                    .font(Typo.inter(14, 500))
                    .foregroundStyle(theme.textSecondary)
                    .padding(.top, 16)
            }
            .padding(28)
            .background(RoundedRectangle(cornerRadius: Radius.lg).fill(theme.surface))
            .overlay(RoundedRectangle(cornerRadius: Radius.lg).stroke(theme.border, lineWidth: 1))
            .padding(.horizontal, 24)
            .padding(.vertical, 48)
        }
        .paperBackground()
        .scrollDismissesKeyboard(.interactively)
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if signedIn { dismiss() }
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
}

/// `.auth-field label`: Inter 14/500 in --ink.
private struct FieldLabel: View {
    let text: String
    @Environment(\.theme) private var theme
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Typo.inter(14, 500))
            .foregroundStyle(theme.text)
    }
}

private extension View {
    func fieldStyle() -> some View {
        modifier(FieldStyle())
    }
}

/// `.auth-field input`: 44pt, 12pt side padding, 1px rule, 8pt radius.
private struct FieldStyle: ViewModifier {
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .font(Typo.inter(15))
            .foregroundStyle(theme.text)
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 8).fill(theme.surface))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(theme.border, lineWidth: 1))
    }
}
