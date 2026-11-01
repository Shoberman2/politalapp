import Foundation
import StoreKit
import RevenueCat

/// BallotWatch Pro: one subscription group, two plans, one entitlement.
///
/// Free stays free: rep lookup, votes, bills, member records, the floor and
/// campaign finance never sit behind this. Pro adds alerts, Ask Dome, the
/// district map and comparisons, and CSV export.
///
/// Two backends behind one interface:
///   * RevenueCat (StoreKit 2 underneath) when `RevenueCatAPIKey` in
///     Info.plist holds a real key. The Supabase user ID is the appUserID.
///   * StoreKit 2 directly while the key is still the placeholder. That is
///     what makes the local `BallotWatch.storekit` file work in the simulator
///     before App Store Connect and RevenueCat are set up.
enum ProProduct: String, CaseIterable, Sendable {
    case monthly = "io.ballotwatch.pro.monthly"
    case yearly = "io.ballotwatch.pro.yearly"

    static let entitlementID = "pro"
    static let ids = Set(allCases.map(\.rawValue))
}

/// What the paywall needs to show for one plan, whichever backend sold it.
struct ProPlan: Identifiable, Equatable, Sendable {
    let product: ProProduct
    let displayPrice: String
    /// "month" or "year".
    let periodUnit: String
    /// e.g. "1 week free", nil when there is no introductory offer or the
    /// account already used it.
    let trial: String?
    /// Yearly price per month, for the comparison line.
    let monthlyEquivalent: String?

    var id: String { product.rawValue }
    var title: String { product == .monthly ? "Monthly" : "Yearly" }
    var priceLine: String { "\(displayPrice) per \(periodUnit)" }
}

@MainActor
final class ProStore: ObservableObject {
    @Published private(set) var isPro = false
    @Published private(set) var plans: [ProPlan] = []
    @Published private(set) var isLoadingPlans = false
    @Published private(set) var isPurchasing = false
    @Published var lastError: String?

    /// The App Store's own subscription management sheet.
    @Published var showManageSubscriptions = false

    private let usesRevenueCat: Bool
    private var storeKitProducts: [String: Product] = [:]
    private var rcPackages: [String: Package] = [:]
    private var updatesTask: Task<Void, Never>?

    static var revenueCatKey: String? {
        guard let key = Bundle.main.object(forInfoDictionaryKey: "RevenueCatAPIKey") as? String,
              Self.isRealKey(key) else { return nil }
        return key
    }

    /// The placeholder, an empty string or an unexpanded build setting all
    /// mean "not configured".
    nonisolated static func isRealKey(_ key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty
            && !trimmed.contains("PLACEHOLDER")
            && !trimmed.hasPrefix("$(")
    }

    init() {
        // Screenshots and UI tests can preview the Pro state.
        if ProcessInfo.processInfo.arguments.contains("--pro-preview") { isPro = true }

        if let key = Self.revenueCatKey {
            usesRevenueCat = true
            Purchases.logLevel = .warn
            Purchases.configure(with: Configuration.Builder(withAPIKey: key)
                .with(storeKitVersion: .storeKit2)
                .build())
        } else {
            usesRevenueCat = false
            updatesTask = Task { [weak self] in
                for await update in Transaction.updates {
                    if case .verified(let transaction) = update { await transaction.finish() }
                    await self?.refreshEntitlement()
                }
            }
        }
        Task { await refreshEntitlement() }
    }

    deinit { updatesTask?.cancel() }

    // MARK: Identity

    /// Ties purchases to the Supabase account so Pro follows the person, not
    /// the device.
    func identify(userID: String?) async {
        guard usesRevenueCat else { return }
        do {
            if let userID {
                _ = try await Purchases.shared.logIn(userID)
            } else if !Purchases.shared.isAnonymous {
                _ = try await Purchases.shared.logOut()
            }
        } catch {
            lastError = error.localizedDescription
        }
        await refreshEntitlement()
    }

    // MARK: Plans

    func loadPlans() async {
        guard plans.isEmpty, !isLoadingPlans else { return }
        isLoadingPlans = true
        defer { isLoadingPlans = false }
        do {
            plans = usesRevenueCat ? try await loadRevenueCatPlans() : try await loadStoreKitPlans()
            if plans.isEmpty { lastError = "Plans are not available right now." }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func loadStoreKitPlans() async throws -> [ProPlan] {
        let products = try await Product.products(for: ProProduct.ids)
        storeKitProducts = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        let monthly = products.first { $0.id == ProProduct.monthly.rawValue }
        var result: [ProPlan] = []
        for kind in ProProduct.allCases.reversed() {
            guard let product = storeKitProducts[kind.rawValue],
                  let subscription = product.subscription else { continue }
            let eligible = await subscription.isEligibleForIntroOffer
            let trial = eligible ? subscription.introductoryOffer.flatMap(Self.trialText) : nil
            result.append(ProPlan(
                product: kind,
                displayPrice: product.displayPrice,
                periodUnit: Self.unitName(subscription.subscriptionPeriod.unit),
                trial: trial,
                monthlyEquivalent: kind == .yearly && monthly != nil
                    ? (product.price / 12).formatted(product.priceFormatStyle)
                    : nil
            ))
        }
        return result
    }

    private func loadRevenueCatPlans() async throws -> [ProPlan] {
        let offerings = try await Purchases.shared.offerings()
        let packages = offerings.current?.availablePackages ?? []
        rcPackages = Dictionary(packages.map { ($0.storeProduct.productIdentifier, $0) }, uniquingKeysWith: { a, _ in a })
        var result: [ProPlan] = []
        for kind in ProProduct.allCases.reversed() {
            guard let package = rcPackages[kind.rawValue] else { continue }
            let product = package.storeProduct
            let unit = product.subscriptionPeriod?.unit == .year ? "year" : "month"
            let trial: String? = product.introductoryDiscount.flatMap { discount in
                discount.paymentMode == .freeTrial
                    ? "\(Self.periodText(value: discount.subscriptionPeriod.value, unit: Self.rcUnit(discount.subscriptionPeriod.unit))) free"
                    : nil
            }
            result.append(ProPlan(
                product: kind,
                displayPrice: product.localizedPriceString,
                periodUnit: unit,
                trial: trial,
                monthlyEquivalent: kind == .yearly ? product.localizedPricePerMonth : nil
            ))
        }
        return result
    }

    // MARK: Buying

    /// Returns true when the purchase unlocked Pro.
    @discardableResult
    func purchase(_ plan: ProPlan, appAccountToken: UUID? = nil) async -> Bool {
        isPurchasing = true
        lastError = nil
        defer { isPurchasing = false }
        do {
            if usesRevenueCat {
                guard let package = rcPackages[plan.product.rawValue] else { return false }
                let result = try await Purchases.shared.purchase(package: package)
                if result.userCancelled { return false }
                isPro = result.customerInfo.entitlements[ProProduct.entitlementID]?.isActive == true
            } else {
                guard let product = storeKitProducts[plan.product.rawValue] else { return false }
                var options: Set<Product.PurchaseOption> = []
                if let appAccountToken { options.insert(.appAccountToken(appAccountToken)) }
                switch try await product.purchase(options: options) {
                case .success(.verified(let transaction)):
                    await transaction.finish()
                    await refreshEntitlement()
                case .success(.unverified):
                    lastError = "The App Store could not verify this purchase."
                case .pending:
                    lastError = "Your purchase is waiting for approval."
                case .userCancelled:
                    return false
                @unknown default:
                    return false
                }
            }
        } catch {
            lastError = error.localizedDescription
        }
        return isPro
    }

    func restore() async {
        isPurchasing = true
        lastError = nil
        defer { isPurchasing = false }
        do {
            if usesRevenueCat {
                let info = try await Purchases.shared.restorePurchases()
                isPro = info.entitlements[ProProduct.entitlementID]?.isActive == true
            } else {
                try await AppStore.sync()
                await refreshEntitlement()
            }
            if !isPro { lastError = "No active BallotWatch Pro subscription was found for this Apple ID." }
        } catch {
            lastError = error.localizedDescription
        }
    }

    func refreshEntitlement() async {
        if ProcessInfo.processInfo.arguments.contains("--pro-preview") { isPro = true; return }
        if usesRevenueCat {
            if let info = try? await Purchases.shared.customerInfo() {
                isPro = info.entitlements[ProProduct.entitlementID]?.isActive == true
            }
            return
        }
        var active = false
        for await entitlement in Transaction.currentEntitlements {
            if case .verified(let transaction) = entitlement,
               ProProduct.ids.contains(transaction.productID),
               transaction.revocationDate == nil {
                active = true
            }
        }
        isPro = active
    }

    // MARK: Formatting

    nonisolated static func unitName(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "period"
        }
    }

    nonisolated static func periodText(value: Int, unit: String) -> String {
        value == 1 ? "1 \(unit)" : "\(value) \(unit)s"
    }

    private static func trialText(_ offer: Product.SubscriptionOffer) -> String? {
        guard offer.paymentMode == .freeTrial else { return nil }
        return "\(periodText(value: offer.period.value, unit: unitName(offer.period.unit))) free"
    }

    private static func rcUnit(_ unit: RevenueCat.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "period"
        }
    }
}
