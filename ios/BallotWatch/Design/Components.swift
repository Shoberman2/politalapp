import SwiftUI

// The shared vocabulary of the interface: rule lines, kickers, tags, cards.
// These are the newspaper primitives DESIGN.md calls for — thin rules as
// dividers, party as a small text tag rather than a background wash, mono for
// anything numeric.

// MARK: - Rule line

/// Thin newspaper-style divider. Hairline by default; `heavy` for the rule
/// under a masthead or section head.
struct RuleLine: View {
    enum Weight { case hairline, heavy }
    var weight: Weight = .hairline
    @Environment(\.theme) private var theme

    var body: some View {
        Rectangle()
            .fill(weight == .heavy ? theme.text.opacity(0.85) : theme.border)
            .frame(height: weight == .heavy ? 1.5 : 0.5)
    }
}

// MARK: - Kicker

/// The small uppercase mono label above a headline.
struct Kicker: View {
    let text: String
    var color: Color?
    @Environment(\.theme) private var theme

    init(_ text: String, color: Color? = nil) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .kickerStyle(color ?? theme.textMuted)
    }
}

// MARK: - Section header

/// A section head with a rule beneath it — the way a broadsheet breaks up a
/// page.
struct SectionHead: View {
    let title: String
    var trailing: String?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text(title.uppercased())
                    .kickerStyle(theme.text)
                Spacer()
                if let trailing {
                    Text(trailing)
                        .font(Typo.monoSM)
                        .foregroundStyle(theme.textMuted)
                }
            }
            RuleLine()
        }
    }
}

// MARK: - Party tag

/// Party as a small letter tag. Never a card background — party is metadata,
/// not identity (DESIGN.md decisions log, 2026-03-24).
struct PartyTag: View {
    let party: Party
    var seat: String?
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 3) {
            Text(party.letter)
                .font(Typo.monoSM)
                .foregroundStyle(theme.party(party))
            if let seat {
                Text("·")
                    .font(Typo.monoSM)
                    .foregroundStyle(theme.textMuted)
                Text(seat)
                    .font(Typo.monoSM)
                    .foregroundStyle(theme.textSecondary)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            RoundedRectangle(cornerRadius: Radius.sm)
                .fill(theme.party(party).opacity(0.10))
        )
        .accessibilityLabel("\(party.label)\(seat.map { ", \($0)" } ?? "")")
    }
}

/// The thin party indicator bar that runs down the leading edge of a member
/// row — the "thin indicator bar" the design system allows.
struct PartyBar: View {
    let party: Party
    @Environment(\.theme) private var theme

    var body: some View {
        Rectangle()
            .fill(theme.party(party))
            .frame(width: 2.5)
            .accessibilityHidden(true)
    }
}

// MARK: - Tag / chip

struct Tag: View {
    let text: String
    var color: Color?
    @Environment(\.theme) private var theme

    var body: some View {
        Text(text)
            .font(Typo.micro)
            .foregroundStyle(color ?? theme.textSecondary)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: Radius.sm)
                    .fill((color ?? theme.textSecondary).opacity(0.09))
            )
    }
}

// MARK: - Card

/// A surface panel. Cards are square-ish (8px) — the larger radius is reserved
/// for buttons, where roundness signals "pressable".
struct Card<Content: View>: View {
    var padding: CGFloat = Space.md
    @ViewBuilder var content: Content
    @Environment(\.theme) private var theme

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: Radius.md)
                    .fill(theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.md)
                    .stroke(theme.border, lineWidth: 0.5)
            )
    }
}

// MARK: - Buttons

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.bodySMMedium)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(
                RoundedRectangle(cornerRadius: Radius.button)
                    .fill(isEnabled ? theme.accent : theme.textMuted.opacity(0.4))
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(Motion.micro, value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.bodySMMedium)
            .foregroundStyle(theme.text)
            .frame(maxWidth: .infinity)
            .frame(height: 46)
            .background(
                RoundedRectangle(cornerRadius: Radius.button)
                    .fill(theme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Radius.button)
                    .stroke(theme.border, lineWidth: 1)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
            .animation(Motion.micro, value: configuration.isPressed)
    }
}

// MARK: - Member photo

/// Member headshot with the same fallback chain as the web app: the high-res
/// unitedstates collection, then the congress.gov thumbnail, then initials.
struct MemberPhoto: View {
    let bioguideID: String
    let name: String
    var size: CGFloat = 56

    @State private var triedFallback = false
    @Environment(\.theme) private var theme

    private var url: URL? {
        triedFallback ? MemberImage.fallback(bioguideID) : MemberImage.primary(bioguideID)
    }

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: Motion.short)) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: .fill)
            case .failure:
                // One retry against congress.gov, then initials.
                Color.clear.onAppear { if !triedFallback { triedFallback = true } }
                initials
            case .empty:
                theme.borderSoft
            @unknown default:
                initials
            }
        }
        .frame(width: size, height: size)
        .background(theme.borderSoft)
        .clipShape(Circle())
        .overlay(Circle().stroke(theme.border, lineWidth: 0.5))
        .accessibilityHidden(true)
    }

    private var initials: some View {
        Text(Self.initials(from: name))
            .font(.system(size: size * 0.34, weight: .medium, design: .serif))
            .foregroundStyle(theme.textMuted)
    }

    static func initials(from name: String) -> String {
        let parts = name.split(separator: " ").filter { $0.count > 1 }
        let letters = parts.prefix(2).compactMap(\.first)
        return String(letters).uppercased()
    }
}

// MARK: - Vote tally bar

/// Yea/Nay split as a single proportional bar with the counts in mono above.
/// Only shown when the tally passed the sanity check — a missing bar means we
/// don't hold a trustworthy count, which is the honest thing to display.
struct TallyBar: View {
    let yea: Int
    let nay: Int
    var showLabels = true
    @Environment(\.theme) private var theme

    private var total: Int { max(yea + nay, 1) }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            if showLabels {
                HStack(spacing: Space.xs) {
                    Label2(count: yea, text: "Yea", color: theme.success)
                    Label2(count: nay, text: "Nay", color: theme.error)
                    Spacer()
                }
            }
            GeometryReader { geo in
                HStack(spacing: 1) {
                    Rectangle()
                        .fill(theme.success)
                        .frame(width: max(0, geo.size.width * CGFloat(yea) / CGFloat(total)))
                    Rectangle()
                        .fill(theme.error)
                }
                .clipShape(RoundedRectangle(cornerRadius: 1.5))
            }
            .frame(height: 4)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(yea) yea, \(nay) nay")
    }

    private struct Label2: View {
        let count: Int
        let text: String
        let color: Color

        var body: some View {
            HStack(spacing: 3) {
                Text("\(count)")
                    .font(Typo.monoData)
                    .foregroundStyle(color)
                    .tabularFigures()
                Text(text)
                    .font(Typo.micro)
                    .foregroundStyle(color.opacity(0.85))
            }
        }
    }
}

// MARK: - Position pill

/// How one member voted — the single most important fact on a vote row.
struct PositionPill: View {
    let position: VotePosition
    @Environment(\.theme) private var theme

    var body: some View {
        Text(position.label.uppercased())
            .font(Typo.kicker)
            .tracking(0.6)
            .foregroundStyle(theme.position(position))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(
                RoundedRectangle(cornerRadius: Radius.sm)
                    .fill(theme.position(position).opacity(0.12))
            )
    }
}

// MARK: - States

struct LoadingView: View {
    var label: String = "Loading"
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: Space.sm) {
            ProgressView()
                .tint(theme.textMuted)
            Text(label)
                .font(Typo.caption)
                .foregroundStyle(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.xxl)
    }
}

struct EmptyStateView: View {
    let title: String
    var message: String?
    var systemImage: String = "doc.text.magnifyingglass"
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: Space.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 26, weight: .light))
                .foregroundStyle(theme.textMuted)
            Text(title)
                .font(Typo.h3)
                .foregroundStyle(theme.text)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .font(Typo.bodySM)
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Space.lg)
        .padding(.vertical, Space.xxl)
    }
}

struct ErrorStateView: View {
    let message: String
    var retry: (() -> Void)?
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: Space.sm) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 24, weight: .light))
                .foregroundStyle(theme.warning)
            Text("Couldn't load this")
                .font(Typo.h3)
                .foregroundStyle(theme.text)
            Text(message)
                .font(Typo.bodySM)
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry)
                    .font(Typo.bodySMMedium)
                    .foregroundStyle(theme.accent)
                    .padding(.top, Space.xxs)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, Space.lg)
        .padding(.vertical, Space.xl)
    }
}

// MARK: - Screen background

/// Applies the warm paper background edge to edge.
struct PaperBackground: ViewModifier {
    @Environment(\.theme) private var theme
    func body(content: Content) -> some View {
        content
            .background(theme.bg.ignoresSafeArea())
            .scrollContentBackground(.hidden)
    }
}

extension View {
    func paperBackground() -> some View { modifier(PaperBackground()) }
}

// MARK: - Data staleness note

/// Says how current the record is rather than implying it's live. The web app
/// makes the same promise on the front page.
struct RecordedThroughNote: View {
    let date: Date?
    @Environment(\.theme) private var theme

    var body: some View {
        if let date {
            Text("Record complete through \(DateParsing.medium(date))")
                .font(Typo.monoMicro)
                .foregroundStyle(theme.textMuted)
        }
    }
}
