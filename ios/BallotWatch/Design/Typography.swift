import SwiftUI

// Typography ported from DESIGN.md (2026-10-06: Inter for display and body,
// no serif, no italic accents). Two families, each with a job:
//
//   Inter       — everything readable. Headlines are 600; display sizes use
//                 Inter Display, the optical cut the web gets from
//                 `font-optical-sizing: auto`, which also carries the tighter
//                 headline spacing.
//   Geist Mono  — data. Vote counts, bill numbers, percentages, dates.
//
// Everything scales with Dynamic Type via `relativeTo:`, which the web app
// gets for free from rem units and the app would otherwise lose.

enum FontFamily {
    static let display      = "InterDisplay-SemiBold"
    static let sans         = "Inter-Regular"
    static let sansMedium   = "Inter-Medium"
    static let sansSemibold = "Inter-SemiBold"
    static let mono         = "GeistMono-Regular"
    static let monoMedium   = "GeistMono-Medium"
    static let monoSemibold = "GeistMono-SemiBold"
}

enum Typo {
    // MARK: Display — Inter Display 600

    /// Landing hero. 52px on web; trimmed to 44 on phone where line length is
    /// short enough that the web size would only fit two or three words.
    static let displayXL = Font.custom(FontFamily.display, size: 44, relativeTo: .largeTitle)
    /// Page titles.
    static let display   = Font.custom(FontFamily.display, size: 34, relativeTo: .largeTitle)
    static let h1        = Font.custom(FontFamily.display, size: 28, relativeTo: .title)
    static let h2        = Font.custom(FontFamily.display, size: 22, relativeTo: .title2)

    // MARK: UI headings — Inter 600
    static let h3        = Font.custom(FontFamily.sansSemibold, size: 18, relativeTo: .title3)
    static let headline  = Font.custom(FontFamily.sansSemibold, size: 16, relativeTo: .headline)

    // MARK: Body — Inter 400, labels 500
    static let body      = Font.custom(FontFamily.sans, size: 16, relativeTo: .body)
    static let bodyMedium = Font.custom(FontFamily.sansMedium, size: 16, relativeTo: .body)
    static let bodySM    = Font.custom(FontFamily.sans, size: 14, relativeTo: .subheadline)
    static let bodySMMedium = Font.custom(FontFamily.sansMedium, size: 14, relativeTo: .subheadline)
    static let caption   = Font.custom(FontFamily.sans, size: 13, relativeTo: .caption)
    static let captionMedium = Font.custom(FontFamily.sansMedium, size: 13, relativeTo: .caption)
    static let micro     = Font.custom(FontFamily.sansMedium, size: 12, relativeTo: .caption2)

    // MARK: Data — Geist Mono
    static let mono      = Font.custom(FontFamily.mono, size: 13, relativeTo: .footnote)
    static let monoSM    = Font.custom(FontFamily.mono, size: 12, relativeTo: .caption)
    static let monoMicro = Font.custom(FontFamily.mono, size: 11, relativeTo: .caption2)
    static let monoMedium = Font.custom(FontFamily.monoMedium, size: 13, relativeTo: .footnote)
    static let monoData  = Font.custom(FontFamily.monoSemibold, size: 15, relativeTo: .body)
    /// Big tallies — the "218–210" on a vote card.
    static let monoLarge = Font.custom(FontFamily.monoSemibold, size: 22, relativeTo: .title2)

    /// Small caps-style eyebrow label. Mono, tracked out, uppercase at the call
    /// site — the newspaper kicker above a headline.
    static let kicker    = Font.custom(FontFamily.monoMedium, size: 11, relativeTo: .caption2)

    // MARK: Web sizes
    //
    // The website's CSS sets type in px; these take the same numbers so a
    // screen can be ported rule by rule. Pair display sizes with
    // `.webTracking(_:size:)` for the CSS letter-spacing in em.

    /// Inter at a CSS size and weight (400, 500 or 600). 600 at 22px and up
    /// uses Inter Display, which is what optical sizing picks on the web.
    static func inter(_ size: CGFloat, _ weight: Int = 400, relativeTo style: Font.TextStyle = .body) -> Font {
        let name: String
        switch weight {
        case ..<450: name = FontFamily.sans
        case ..<550: name = FontFamily.sansMedium
        default: name = size >= 22 ? FontFamily.display : FontFamily.sansSemibold
        }
        return Font.custom(name, size: size, relativeTo: style)
    }

    /// Geist Mono at a CSS size and weight (400, 500 or 600).
    /// Numbers, codes and small labels. The app sets them in Inter with
    /// fixed-width digits rather than Geist Mono, so counts and dates still
    /// line up but nothing reads like a typewriter.
    static func mono(_ size: CGFloat, _ weight: Int = 400, relativeTo style: Font.TextStyle = .footnote) -> Font {
        inter(size, weight, relativeTo: style).monospacedDigit()
    }
}

extension View {
    /// Newspaper kicker: uppercase, tracked, muted. Pair with `.textCase(.uppercase)`
    /// at the call site or pass already-uppercased text.
    func kickerStyle(_ color: Color) -> some View {
        // Web `.kicker` / `.dateline`: 11px mono, 0.14em tracking.
        self.font(Typo.kicker)
            .tracking(11 * 0.14)
            .foregroundStyle(color)
    }

    /// CSS `letter-spacing` in em at a given px size (e.g. -0.03em at 48px).
    func webTracking(_ em: CGFloat, size: CGFloat) -> some View {
        self.tracking(em * size)
    }

    /// Tabular figures so vote counts and dates don't jitter as they change.
    func tabularFigures() -> some View {
        self.monospacedDigit()
    }
}
