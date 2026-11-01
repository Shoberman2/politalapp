import SwiftUI

// Instant feedback: every tap that changes something says so with a short
// slide-down banner and a haptic. Banners are the app's only confirmation
// pattern, so they look the same everywhere.

@MainActor
final class BannerCenter: ObservableObject {
    struct Banner: Identifiable, Equatable {
        enum Kind { case success, info, error }
        let id = UUID()
        let text: String
        let kind: Kind
    }

    @Published private(set) var current: Banner?
    /// Bumped on every show so `.sensoryFeedback` fires even for repeats.
    @Published private(set) var pulse = 0
    private var hideTask: Task<Void, Never>?

    func show(_ text: String, kind: Banner.Kind = .success) {
        hideTask?.cancel()
        current = Banner(text: text, kind: kind)
        pulse += 1
        hideTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_200_000_000)
            guard !Task.isCancelled else { return }
            self?.current = nil
        }
    }

    func dismiss() {
        hideTask?.cancel()
        current = nil
    }
}

/// Hosts the banner at the top of whatever it wraps. Applied at the root and
/// inside sheets, since a sheet covers the root's banner.
struct BannerHost: ViewModifier {
    @EnvironmentObject private var banners: BannerCenter
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let banner = banners.current {
                    BannerView(banner: banner)
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                        .onTapGesture { banners.dismiss() }
                        .zIndex(10)
                }
            }
            .animation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.35, dampingFraction: 0.9), value: banners.current)
            .sensoryFeedback(trigger: banners.pulse) { _, _ in
                switch banners.current?.kind {
                case .error: return .error
                case .success: return .success
                default: return .impact(weight: .light)
                }
            }
    }
}

private struct BannerView: View {
    let banner: BannerCenter.Banner
    @Environment(\.theme) private var theme

    private var symbol: String {
        switch banner.kind {
        case .success: return "checkmark"
        case .info: return "bell"
        case .error: return "exclamationmark.circle"
        }
    }

    private var tint: Color {
        switch banner.kind {
        case .success: return theme.success
        case .info: return theme.accent
        case .error: return theme.error
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(banner.text)
                .font(Typo.inter(16, 500, relativeTo: .body))
                .foregroundStyle(theme.text)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 13)
        .frame(maxWidth: 520)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(theme.surfaceRaised)
                .shadow(color: theme.shadow, radius: 16, y: 6)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(theme.cardEdge, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

extension View {
    func bannerHost() -> some View { modifier(BannerHost()) }
}

// MARK: - Sheets

/// Everything a sheet needs that the root sets up: the appearance override,
/// a theme resolved for the sheet's own color scheme, and a banner host
/// (a sheet covers the root's).
struct SheetChrome: ViewModifier {
    @EnvironmentObject private var settings: AppSettings

    func body(content: Content) -> some View {
        content
            .bannerHost()
            .themed()
            .preferredColorScheme(settings.appearance.colorScheme)
            .presentationCornerRadius(24)
    }
}

extension View {
    func sheetChrome() -> some View { modifier(SheetChrome()) }
}
