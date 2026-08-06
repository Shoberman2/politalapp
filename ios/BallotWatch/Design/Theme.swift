import SwiftUI

// Design tokens ported verbatim from DESIGN.md. Every value here has a
// counterpart in the web app's CSS custom properties — if one changes there,
// change it here too.
//
// The palette is deliberately warm: paper white rather than pure white, warm
// near-black rather than #000. That warmth is what makes the app read as a
// printed broadsheet instead of a database UI, so it survives into dark mode
// as warm near-blacks rather than neutral grays.

enum Palette {
    // MARK: Light
    static let bgLight            = Color(hex: 0xFAFAF7)   // warm paper white
    static let surfaceLight       = Color(hex: 0xFFFFFF)
    static let surfaceRaisedLight = Color(hex: 0xFFFFFF)
    static let textLight          = Color(hex: 0x1A1A18)   // near-black, warm
    static let textSecondaryLight = Color(hex: 0x6B6861)
    static let textMutedLight     = Color(hex: 0x9C9789)
    static let accentLight        = Color(hex: 0x1D4ED8)   // civic sapphire
    static let accentHoverLight   = Color(hex: 0x1E40AF)
    static let borderLight        = Color(hex: 0xE8E6E1)
    static let borderLightLight   = Color(hex: 0xF0EEEA)

    // MARK: Dark
    static let bgDark             = Color(hex: 0x111110)
    static let surfaceDark        = Color(hex: 0x1C1C1A)
    static let surfaceRaisedDark  = Color(hex: 0x242422)
    static let textDark           = Color(hex: 0xE8E6E1)
    static let textSecondaryDark  = Color(hex: 0x9C9789)
    static let textMutedDark      = Color(hex: 0x6B6861)
    static let accentDark         = Color(hex: 0x5B8DEF)
    static let accentHoverDark    = Color(hex: 0x7BA3F3)
    static let borderDark         = Color(hex: 0x2A2A27)
    static let borderLightDark    = Color(hex: 0x242422)
}

/// Colors that resolve per color scheme. Used through `@Environment(\.theme)`
/// so every view picks up light/dark automatically without a manual check.
struct Theme {
    var scheme: ColorScheme

    private var dark: Bool { scheme == .dark }

    var bg: Color            { dark ? Palette.bgDark : Palette.bgLight }
    var surface: Color       { dark ? Palette.surfaceDark : Palette.surfaceLight }
    var surfaceRaised: Color { dark ? Palette.surfaceRaisedDark : Palette.surfaceRaisedLight }
    var text: Color          { dark ? Palette.textDark : Palette.textLight }
    var textSecondary: Color { dark ? Palette.textSecondaryDark : Palette.textSecondaryLight }
    var textMuted: Color     { dark ? Palette.textMutedDark : Palette.textMutedLight }
    var accent: Color        { dark ? Palette.accentDark : Palette.accentLight }
    var accentHover: Color   { dark ? Palette.accentHoverDark : Palette.accentHoverLight }
    var border: Color        { dark ? Palette.borderDark : Palette.borderLight }
    var borderSoft: Color    { dark ? Palette.borderLightDark : Palette.borderLightLight }

    /// Background for selected/active states — the accent at 8% per DESIGN.md.
    var accentSubtle: Color { accent.opacity(dark ? 0.16 : 0.08) }

    // Semantic. Dark mode reduces saturation per the design system's dark-mode
    // strategy, so these lighten rather than staying at their light-mode values.
    var success: Color { dark ? Color(hex: 0x4ADE80) : Color(hex: 0x16A34A) }
    var warning: Color { dark ? Color(hex: 0xFBBF24) : Color(hex: 0xD97706) }
    var error: Color   { dark ? Color(hex: 0xF87171) : Color(hex: 0xDC2626) }
    var info: Color    { dark ? Color(hex: 0x38BDF8) : Color(hex: 0x0284C7) }

    /// Party colors. Secondary by design — these are for small text tags and
    /// thin indicator bars, never card background washes.
    func party(_ party: Party) -> Color {
        switch party {
        case .democrat:    return dark ? Color(hex: 0x60A5FA) : Color(hex: 0x2563EB)
        case .republican:  return dark ? Color(hex: 0xF87171) : Color(hex: 0xDC2626)
        case .independent: return dark ? Color(hex: 0xA78BFA) : Color(hex: 0x7C3AED)
        case .unknown:     return textMuted
        }
    }

    /// Vote positions borrow the semantic ramp: yea reads as success, nay as
    /// error, and the two non-votes stay deliberately quiet.
    func position(_ position: VotePosition) -> Color {
        switch position {
        case .yea:        return success
        case .nay:        return error
        case .present:    return warning
        case .notVoting:  return textMuted
        }
    }
}

private struct ThemeKey: EnvironmentKey {
    static let defaultValue = Theme(scheme: .light)
}

extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}

/// Injects a `Theme` matching the current color scheme. Applied once at the
/// root so nothing downstream has to think about it.
struct ThemedRoot: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.environment(\.theme, Theme(scheme: scheme))
    }
}

extension View {
    func themed() -> some View { modifier(ThemedRoot()) }
}

// MARK: - Spacing

/// 8px base unit, comfortable density (DESIGN.md § Spacing).
enum Space {
    static let xxs: CGFloat = 4
    static let xs:  CGFloat = 8
    static let sm:  CGFloat = 12
    static let md:  CGFloat = 16
    static let lg:  CGFloat = 24
    static let xl:  CGFloat = 32
    static let xxl: CGFloat = 48
    static let xxxl: CGFloat = 64
}

// MARK: - Radius

/// Buttons carry a larger radius than everything else on purpose: roundness is
/// the signal that something is pressable (DESIGN.md § Layout).
enum Radius {
    static let button: CGFloat = 10
    static let sm: CGFloat = 4      // tags, chips, inputs
    static let md: CGFloat = 8      // cards, panels
    static let lg: CGFloat = 12     // hero sections, modals
    static let full: CGFloat = 9999 // avatars
}

// MARK: - Motion

/// "The content is serious; motion should be calm." No springs, no bounce.
enum Motion {
    static let micro  = Animation.easeOut(duration: 0.08)
    static let short  = Animation.easeOut(duration: 0.15)
    static let medium = Animation.easeInOut(duration: 0.25)
    static let long   = Animation.easeInOut(duration: 0.4)
}

// MARK: - Color hex helper

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}
