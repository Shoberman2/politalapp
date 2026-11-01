import SwiftUI

/// What a person tapped that led to the paywall, so the sheet can say why
/// it opened.
enum ProFeature: String, Identifiable, CaseIterable {
    case billAlerts, memberAlerts, askDome, districtMap, compare, csvExport, general
    var id: String { rawValue }

    var reason: String? {
        switch self {
        case .billAlerts: return "Bill Watch alerts are part of Pro."
        case .memberAlerts: return "Vote alerts are part of Pro."
        case .askDome: return "Asking Dome is part of Pro."
        case .districtMap: return "District maps are part of Pro."
        case .compare: return "Comparing members is part of Pro."
        case .csvExport: return "CSV export is part of Pro."
        case .general: return nil
        }
    }
}

/// The App Store paywall. Shows price, period, trial terms, auto-renew terms,
/// Terms and Privacy links and Restore Purchases, as guideline 3.1.2 asks.
struct PaywallSheet: View {
    var feature: ProFeature = .general

    @EnvironmentObject private var pro: ProStore
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var banners: BannerCenter
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var selected: ProProduct = .yearly
    @State private var buyTap = 0

    private var plan: ProPlan? { pro.plans.first { $0.product == selected } }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                DomeView(width: 88)
                    .padding(.top, 36)
                    .padding(.bottom, 20)

                Text("BallotWatch Pro")
                    .font(Typo.inter(34, 600, relativeTo: .largeTitle))
                    .webTracking(-0.035, size: 34)
                    .foregroundStyle(theme.text)
                    .multilineTextAlignment(.center)

                Text(feature.reason ?? "Know the moment Congress acts on what you follow.")
                    .font(Typo.inter(17, relativeTo: .body))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 10)
                    .padding(.horizontal, 12)

                benefits
                    .padding(.top, 32)

                plans
                    .padding(.top, 32)

                purchaseButton
                    .padding(.top, 20)

                termsText
                    .padding(.top, 14)

                footerLinks
                    .padding(.top, 8)

                Text("Your representatives, votes and bills stay free.")
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .padding(.top, 20)
                    .padding(.bottom, 32)
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(theme.bg.ignoresSafeArea())
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
        .sensoryFeedback(.selection, trigger: selected)
        .sensoryFeedback(.impact(weight: .medium), trigger: buyTap)
        .task { await pro.loadPlans() }
        .onChange(of: pro.isPro) { _, isPro in
            if isPro {
                banners.show("Welcome to BallotWatch Pro")
                dismiss()
            }
        }
    }

    // MARK: Benefits

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 22) {
            BenefitRow(symbol: "bell", title: "Bill Watch alerts", detail: "A push when a bill you watch moves. Watch as many as you like.")
            BenefitRow(symbol: "person.wave.2", title: "Vote alerts", detail: "Hear when the members you follow cast a recorded vote.")
            BenefitRow(symbol: "bubble.left", title: "Ask \(DomeCharacter.name)", detail: "Plain-English answers about Congress, with sources.")
            BenefitRow(symbol: "map", title: "District maps and comparisons", detail: "See your district's lines and how two members line up.")
            BenefitRow(symbol: "square.and.arrow.down", title: "CSV export", detail: "Download any member's voting record.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Plans

    @ViewBuilder
    private var plans: some View {
        if pro.plans.isEmpty {
            VStack(spacing: 12) {
                if pro.isLoadingPlans {
                    ProgressView().tint(theme.textMuted)
                    Text("Loading plans")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textMuted)
                } else {
                    Text(pro.lastError ?? "Plans are not available right now.")
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                        .multilineTextAlignment(.center)
                    Button("Try again") { Task { await pro.loadPlans() } }
                        .buttonStyle(SecondaryButtonStyle())
                }
            }
            .frame(maxWidth: .infinity, minHeight: 148)
        } else {
            VStack(spacing: 12) {
                ForEach(pro.plans) { plan in
                    PlanRow(plan: plan, isSelected: plan.product == selected) {
                        selected = plan.product
                    }
                }
            }
        }
    }

    private var purchaseButton: some View {
        Button {
            buyTap += 1
            guard let plan else { return }
            Task {
                let token = auth.user.flatMap { UUID(uuidString: $0.id) }
                await pro.purchase(plan, appAccountToken: token)
                if let error = pro.lastError { banners.show(error, kind: .error) }
            }
        } label: {
            HStack(spacing: 10) {
                if pro.isPurchasing { ProgressView().tint(theme.onAccent) }
                Text(plan?.trial != nil ? "Start free trial" : "Subscribe")
            }
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(plan == nil || pro.isPurchasing)
        .accessibilityIdentifier("paywallSubscribe")
    }

    @ViewBuilder
    private var termsText: some View {
        if let plan {
            let start = plan.trial.map { "\($0), then \(plan.priceLine)." } ?? "\(plan.priceLine)."
            Text("\(start) Renews automatically until you cancel. Cancel anytime in Settings at least 24 hours before the period ends. Payment is charged to your Apple ID.")
                .font(Typo.inter(14))
                .foregroundStyle(theme.textMuted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var footerLinks: some View {
        HStack(spacing: 4) {
            Button("Restore Purchases") {
                Task {
                    await pro.restore()
                    if let error = pro.lastError { banners.show(error, kind: .error) }
                }
            }
            Text("·").foregroundStyle(theme.textMuted).accessibilityHidden(true)
            Button("Terms") { openURL(Config.siteURL.appendingPathComponent("terms")) }
            Text("·").foregroundStyle(theme.textMuted).accessibilityHidden(true)
            Button("Privacy") { openURL(Config.siteURL.appendingPathComponent("privacy")) }
        }
        .font(Typo.inter(15, 500))
        .foregroundStyle(theme.accent)
        .frame(minHeight: 44)
        .disabled(pro.isPurchasing)
    }
}

private struct BenefitRow: View {
    let symbol: String
    let title: String
    let detail: String
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .regular))
                .foregroundStyle(theme.text)
                .frame(width: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(Typo.inter(17, 600, relativeTo: .headline))
                    .foregroundStyle(theme.text)
                Text(detail)
                    .font(Typo.inter(16))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct PlanRow: View {
    let plan: ProPlan
    let isSelected: Bool
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .regular))
                    .foregroundStyle(isSelected ? theme.accent : theme.textMuted)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(plan.title)
                        .font(Typo.inter(17, 600, relativeTo: .headline))
                        .foregroundStyle(theme.text)
                    Text(subtitle)
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Text(plan.displayPrice)
                    .font(Typo.mono(17, 600))
                    .foregroundStyle(theme.text)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(minHeight: 64)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(theme.surface))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(isSelected ? theme.accent : theme.cardEdge, lineWidth: isSelected ? 2 : 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("plan-\(plan.product.rawValue)")
    }

    private var subtitle: String {
        var parts = ["Billed every \(plan.periodUnit)"]
        if let monthly = plan.monthlyEquivalent { parts = ["\(monthly) a month, billed yearly"] }
        if let trial = plan.trial { parts.append(trial) }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Gate

extension View {
    /// Presents the paywall for `feature` whenever it is non-nil.
    func proPaywall(_ feature: Binding<ProFeature?>) -> some View {
        sheet(item: feature) { feature in
            PaywallSheet(feature: feature)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .sheetChrome()
        }
    }
}
