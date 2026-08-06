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
        var title: String { self == .signIn ? "Sign in" : "Create account" }
        var action: String { self == .signIn ? "Sign in" : "Create account" }
        var toggle: String {
            self == .signIn ? "New here? Create an account" : "Already have an account? Sign in"
        }
    }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 6 && !isWorking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.md) {
                    Text(mode == .signIn ? "Welcome back." : "Save what matters to you.")
                        .font(Typo.h1)
                        .foregroundStyle(theme.text)
                        .padding(.top, Space.xs)

                    Text("An account only syncs your watched bills and followed members. Everything else is free to read without one.")
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)

                    RuleLine()

                    VStack(alignment: .leading, spacing: Space.sm) {
                        FieldLabel("Email")
                        TextField("you@example.com", text: $email)
                            .textContentType(.emailAddress)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .fieldStyle()

                        FieldLabel("Password")
                        SecureField("At least 6 characters", text: $password)
                            .textContentType(mode == .signIn ? .password : .newPassword)
                            .fieldStyle()
                    }

                    if let error {
                        Text(error)
                            .font(Typo.caption)
                            .foregroundStyle(theme.error)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button {
                        Task { await submit() }
                    } label: {
                        if isWorking {
                            ProgressView().tint(.white)
                        } else {
                            Text(mode.action)
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(!canSubmit)

                    Button(mode.toggle) {
                        withAnimation(Motion.short) {
                            mode = mode == .signIn ? .signUp : .signIn
                            error = nil
                        }
                    }
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.accent)
                    .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, Space.md)
                .padding(.bottom, Space.xxl)
            }
            .paperBackground()
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.textSecondary)
                }
            }
        }
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

private struct FieldLabel: View {
    let text: String
    @Environment(\.theme) private var theme
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .kickerStyle(theme.textMuted)
    }
}

private extension View {
    func fieldStyle() -> some View {
        modifier(FieldStyle())
    }
}

private struct FieldStyle: ViewModifier {
    @Environment(\.theme) private var theme

    func body(content: Content) -> some View {
        content
            .font(Typo.body)
            .foregroundStyle(theme.text)
            .padding(.horizontal, Space.sm)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: Radius.sm).fill(theme.surface))
            .overlay(
                RoundedRectangle(cornerRadius: Radius.sm).stroke(theme.border, lineWidth: 1)
            )
    }
}
