import StoreKit
import SwiftUI

/// Account and settings, as a sheet over whatever tab is open. Rows are
/// settings-style (small label over the value) and separated by space.
struct SettingsSheet: View {
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var userData: UserData
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var pro: ProStore
    @EnvironmentObject private var alerts: AlertsStore
    @EnvironmentObject private var banners: BannerCenter
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var showAuth = false
    @State private var paywall: ProFeature?
    @State private var confirmingDelete = false
    @State private var isDeleting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 36) {
                    account
                    proSection
                    alertsSection
                    appearance
                    sources
                    if auth.isSignedIn { dangerZone }
                    Text("\(Brand.name) for iPhone \(Self.version)")
                        .font(Typo.inter(13))
                        .foregroundStyle(theme.textMuted)
                        .frame(maxWidth: .infinity)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
            .background(theme.bg.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .font(Typo.inter(17, 600))
                        .foregroundStyle(theme.accent)
                }
            }
        }
        .sheet(isPresented: $showAuth) {
            AuthScreen().presentationDetents([.large]).sheetChrome()
        }
        .proPaywall($paywall)
        .manageSubscriptionsSheet(isPresented: $pro.showManageSubscriptions)
        .confirmationDialog("Delete your account?", isPresented: $confirmingDelete, titleVisibility: .visible) {
            Button("Delete account", role: .destructive) { Task { await deleteAccount() } }
        } message: {
            Text("This permanently deletes your account and everything synced to it. A BallotWatch Pro subscription is billed by Apple: cancel it in Manage subscription first.")
        }
    }

    // MARK: Sections

    private var account: some View {
        SettingsGroup(title: "Account") {
            if let user = auth.user {
                SettingsRow(label: "Signed in as", value: user.email ?? "Apple ID")
                SettingsRow(label: "Saved items", value: syncText)
            } else {
                Text("Reading the record never needs an account. A free account keeps your members and bills on every device.")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Button("Sign in") { showAuth = true }
                    .buttonStyle(PrimaryButtonStyle())
                    .accessibilityIdentifier("settingsSignIn")
            }
        }
    }

    private var syncText: String {
        switch userData.syncStatus {
        case .localOnly: return "On this device"
        case .syncing: return "Syncing"
        case .synced: return "Synced to your account"
        case .failed: return "On this device. Sync will retry."
        }
    }

    private var proSection: some View {
        SettingsGroup(title: "BallotWatch Pro") {
            if pro.isPro {
                SettingsRow(label: "Status", value: "Active")
                SettingsButtonRow(title: "Manage subscription") { pro.showManageSubscriptions = true }
            } else {
                SettingsRow(label: "Status", value: "Free")
                Button("See BallotWatch Pro") { paywall = .general }
                    .buttonStyle(QuietButtonStyle())
                    .accessibilityIdentifier("settingsSeePro")
            }
            SettingsButtonRow(title: "Restore Purchases") {
                Task {
                    await pro.restore()
                    if pro.isPro { banners.show("BallotWatch Pro restored") }
                    else if let error = pro.lastError { banners.show(error, kind: .error) }
                }
            }
        }
    }

    private var alertsSection: some View {
        SettingsGroup(title: "Alerts") {
            SettingsRow(label: "Bills", value: countText(alerts.billAlerts.count, "bill"))
            SettingsRow(label: "Members", value: countText(alerts.memberAlerts.count, "member"))
            SettingsRow(label: "Notifications", value: permissionText)
            if alerts.authorization == .denied {
                SettingsButtonRow(title: "Open iPhone Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
            }
            if alerts.hasAnyAlerts {
                SettingsButtonRow(title: "Turn off all alerts") {
                    alerts.clearAll()
                    banners.show("Alerts off")
                }
            }
        }
    }

    private func countText(_ count: Int, _ noun: String) -> String {
        count == 0 ? "None" : "\(count) \(noun)\(count == 1 ? "" : "s")"
    }

    private var permissionText: String {
        switch alerts.authorization {
        case .authorized, .provisional, .ephemeral: return "Allowed"
        case .denied: return "Off in iPhone Settings"
        default: return "Not asked yet"
        }
    }

    private var appearance: some View {
        SettingsGroup(title: "Appearance") {
            Picker("Appearance", selection: $settings.appearance) {
                ForEach(AppSettings.Appearance.allCases) { option in
                    Text(option.label).tag(option)
                }
            }
            .pickerStyle(.segmented)
            .sensoryFeedback(.selection, trigger: settings.appearance)
            .accessibilityIdentifier("appearancePicker")
        }
    }

    private var sources: some View {
        SettingsGroup(title: "Sources") {
            Text("BallotWatch is independent and not affiliated with any government entity. It reports the public record and takes no side.")
                .font(Typo.inter(16))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(SourceLinks.all, id: \.title) { source in
                SettingsButtonRow(title: source.title, detail: source.detail) { openURL(source.url) }
            }
            SettingsButtonRow(title: "Privacy") { openURL(Config.siteURL.appendingPathComponent("privacy")) }
            SettingsButtonRow(title: "Terms") { openURL(Config.siteURL.appendingPathComponent("terms")) }
        }
    }

    private var dangerZone: some View {
        SettingsGroup(title: "Account actions") {
            SettingsButtonRow(title: "Sign out") {
                Task {
                    await auth.signOut()
                    banners.show("Signed out")
                }
            }
            SettingsButtonRow(title: isDeleting ? "Deleting" : "Delete account", destructive: true) {
                confirmingDelete = true
            }
            .disabled(isDeleting)
            .accessibilityIdentifier("deleteAccountButton")
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await auth.deleteAccount()
            banners.show("Account deleted")
        } catch {
            banners.show(error.localizedDescription, kind: .error)
        }
    }

    private static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    }
}

// MARK: - Sources

/// Where the record comes from. Shown in settings and under every record.
enum SourceLinks {
    struct Source { let title: String; let detail: String; let url: URL }

    static let all: [Source] = [
        Source(title: "Congress.gov", detail: "Bills, members and summaries", url: URL(string: "https://www.congress.gov")!),
        Source(title: "Clerk of the House", detail: "House roll call votes", url: URL(string: "https://clerk.house.gov/Votes")!),
        Source(title: "U.S. Senate", detail: "Senate roll call votes", url: URL(string: "https://www.senate.gov/legislative/votes_new.htm")!),
        Source(title: "U.S. Census Bureau", detail: "Congressional district lines", url: URL(string: "https://www.census.gov/programs-surveys/geography.html")!),
        Source(title: "Federal Election Commission", detail: "Campaign finance", url: URL(string: "https://www.fec.gov/data/")!),
    ]
}

// MARK: - Rows

struct SettingsGroup<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(Typo.inter(20, 600, relativeTo: .title3))
                .webTracking(-0.01, size: 20)
                .foregroundStyle(theme.text)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: 12) { content }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
        }
    }
}

/// Small label over a 16pt+ value.
struct SettingsRow: View {
    let label: String
    let value: String
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(Typo.inter(13, 500))
                .foregroundStyle(theme.textMuted)
            Text(value)
                .font(Typo.inter(17))
                .foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: 44)
        .accessibilityElement(children: .combine)
    }
}

struct SettingsButtonRow: View {
    let title: String
    var detail: String?
    var destructive = false
    let action: () -> Void
    @Environment(\.theme) private var theme
    @State private var taps = 0

    var body: some View {
        Button {
            taps += 1
            action()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Typo.inter(17, 500))
                    .foregroundStyle(destructive ? theme.error : theme.accent)
                if let detail {
                    Text(detail)
                        .font(Typo.inter(15))
                        .foregroundStyle(theme.textMuted)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: taps)
    }
}
