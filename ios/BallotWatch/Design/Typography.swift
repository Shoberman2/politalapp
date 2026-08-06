import SwiftUI

// Typography ported from DESIGN.md. Three families, each with a job:
//
//   Instrument Serif — display/hero. The broadsheet masthead voice.
//   General Sans     — body and UI. Humanist, not the geometric sans every
//                      SaaS uses.
//   Geist Mono       — data. Vote counts, bill numbers, percentages, dates.
//
// Everything scales with Dynamic Type via `relativeTo:`, which the web app
// gets for free from rem units and the app would otherwise lose.

enum FontFamily {
    static let serif        = "InstrumentSerif-Regular"
    static let serifItalic  = "InstrumentSerif-Italic"
    static let sans         = "GeneralSans-Regular"
    static let sansMedium   = "GeneralSans-Medium"
    static let sansSemibold = "GeneralSans-Semibold"
    static let sansBold     = "GeneralSans-Bold"
    static let sansItalic   = "GeneralSans-Italic"
    static let mono         = "GeistMono-Regular"
    static let monoMedium   = "GeistMono-Medium"
    static let monoSemibold = "GeistMono-SemiBold"
}

enum Typo {
    // MARK: Display — Instrument Serif

    /// Landing hero. 52px on web; trimmed to 44 on phone where line length is
    /// short enough that the web size would only fit two or three words.
    static let displayXL = Font.custom(FontFamily.serif, size: 44, relativeTo: .largeTitle)
    /// Page titles.
    static let display   = Font.custom(FontFamily.serif, size: 34, relativeTo: .largeTitle)
    static let displayItalic = Font.custom(FontFamily.serifItalic, size: 34, relativeTo: .largeTitle)
    static let h1        = Font.custom(FontFamily.serif, size: 28, relativeTo: .title)
    static let h2        = Font.custom(FontFamily.serif, size: 22, relativeTo: .title2)

    // MARK: UI headings — General Sans
    //
    // Section headers inside a page are sans, not serif: the serif is reserved
    // for the page's own voice so it keeps its weight.
    static let h3        = Font.custom(FontFamily.sansSemibold, size: 18, relativeTo: .title3)
    static let headline  = Font.custom(FontFamily.sansSemibold, size: 16, relativeTo: .headline)

    // MARK: Body — General Sans
    static let body      = Font.custom(FontFamily.sans, size: 16, relativeTo: .body)
    static let bodyMedium = Font.custom(FontFamily.sansMedium, size: 16, relativeTo: .body)
    static let bodySM    = Font.custom(FontFamily.sans, size: 14, relativeTo: .subheadline)
    static let bodySMMedium = Font.custom(FontFamily.sansMedium, size: 14, relativeTo: .subheadline)
    static let bodyItalic = Font.custom(FontFamily.sansItalic, size: 16, relativeTo: .body)
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
}

extension View {
    /// Newspaper kicker: uppercase, tracked, muted. Pair with `.textCase(.uppercase)`
    /// at the call site or pass already-uppercased text.
    func kickerStyle(_ color: Color) -> some View {
        self.font(Typo.kicker)
            .tracking(0.8)
            .foregroundStyle(color)
    }

    /// Tabular figures so vote counts and dates don't jitter as they change.
    func tabularFigures() -> some View {
        self.monospacedDigit()
    }
}
