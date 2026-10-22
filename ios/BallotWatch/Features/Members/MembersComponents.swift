import SwiftUI
import UIKit

// Small pieces the Members screens share, each a port of one web rule so the
// screens can be assembled class by class.

// MARK: - Line height

extension View {
    /// CSS `line-height` as a multiple of the font size. Inter's natural line
    /// is about 1.21 em, so only the extra leading is added.
    func membersLineHeight(_ lineHeight: CGFloat, size: CGFloat) -> some View {
        lineSpacing(max(0, (lineHeight - 1.21) * size))
    }
}

// MARK: - Portrait

/// A rectangular member photo (web `.pol-photo`, `.mc-photo img`,
/// `.rec-photo`) with the same source chain as `MemberPhoto`: the
/// unitedstates collection, then congress.gov, then a monogram.
struct MembersPortrait: View {
    let bioguideID: String
    let name: String
    var aspect: CGFloat = 3.0 / 4.0
    var cornerRadius: CGFloat = 4
    var monogramSize: CGFloat = 64
    var grayscale: Double = 0.05
    var contrast: Double = 1
    /// The record card starts from the congress.gov image, as the web does.
    var congressFirst = false

    @State private var triedFallback = false
    @State private var failed = false
    @Environment(\.theme) private var theme

    private var url: URL? {
        let primary = congressFirst ? MemberImage.fallback(bioguideID) : MemberImage.primary(bioguideID)
        let secondary = congressFirst ? MemberImage.primary(bioguideID) : MemberImage.fallback(bioguideID)
        return triedFallback ? secondary : primary
    }

    var body: some View {
        Color.clear
            .aspectRatio(aspect, contentMode: .fit)
            .overlay(alignment: .top) {
                ZStack {
                    monogram
                    if !failed {
                        AsyncImage(url: url, transaction: Transaction(animation: Motion.short)) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable().scaledToFill()
                                    .grayscale(grayscale)
                                    .contrast(contrast)
                            case .failure:
                                Color.clear.onAppear {
                                    if triedFallback { failed = true } else { triedFallback = true }
                                }
                            default:
                                Color.clear
                            }
                        }
                    }
                }
            }
            .background(theme.bgTint)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .accessibilityHidden(true)
    }

    private var monogram: some View {
        Text(MemberPhoto.initials(from: name))
            .font(Typo.inter(monogramSize, 400))
            .foregroundStyle(theme.textMuted)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Section label and title

/// Web `.pol-section-label`: mono 11px, 0.12em, uppercase, --text-muted.
struct MembersSectionLabel: View {
    let text: String
    var tracking: CGFloat = 0.12
    @Environment(\.theme) private var theme

    init(_ text: String, tracking: CGFloat = 0.12) {
        self.text = text
        self.tracking = tracking
    }

    var body: some View {
        Text(text.uppercased())
            .font(Typo.mono(11, 400))
            .tracking(11 * tracking)
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Web `.pol-section-title` at phone width: Inter Display 600, 28px, 1.1,
/// -0.01em.
struct MembersSectionTitle: View {
    let text: String
    @Environment(\.theme) private var theme

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(Typo.inter(28, 600, relativeTo: .title))
            .webTracking(-0.01, size: 28)
            .foregroundStyle(theme.text)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - Hairline

/// A 1px CSS border.
struct MembersRule: View {
    var color: Color?
    var height: CGFloat = 1
    @Environment(\.theme) private var theme

    var body: some View {
        Rectangle().fill(color ?? theme.border).frame(height: height)
    }
}

// MARK: - Party bar glyph

/// The 2px party bar of `.pol-party-tag` as an inline image, so it can sit in
/// a wrapping `Text` beside the name as it does on the web.
enum MembersPartyBarImage {
    static func image(height: CGFloat = 12) -> Image {
        let size = CGSize(width: 2, height: height)
        let rendered = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor.black.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }
        return Image(uiImage: rendered.withRenderingMode(.alwaysTemplate))
    }
}

// MARK: - Vote badge

/// Web `.dash-vote-badge`: mono 11px 600, uppercase, pastel fill. The web
/// hard-codes these colors in both themes, so they are fixed here too.
struct MembersVoteBadge: View {
    let position: VotePosition
    @Environment(\.theme) private var theme

    private var colors: (fg: Color, bg: Color?) {
        switch position {
        case .yea: return (Color(hex: 0x166534), Color(hex: 0xDCFCE7))
        case .nay: return (Color(hex: 0x991B1B), Color(hex: 0xFEE2E2))
        default: return (theme.textSecondary, nil)
        }
    }

    var body: some View {
        Text(position.label.uppercased())
            .font(Typo.mono(11, 600))
            .tracking(11 * 0.03)
            .foregroundStyle(colors.fg)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(colors.bg ?? Color(hex: 0xF5F5F0))
            )
            .accessibilityLabel("Voted \(position.label)")
    }
}

// MARK: - Spinner

/// Web `.loading-spinner` with a caption, as in `.pol-section-loading`.
struct MembersLoading: View {
    let text: String
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            ProgressView().tint(theme.accent)
            Text(text)
                .font(Typo.inter(16))
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(32)
    }
}

// MARK: - Expand-on-tap info tip

/// Web `InfoTip`: dotted-underlined text that explains itself on tap.
struct MembersInfoTitle: View {
    let title: String
    let tip: String
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(title)
                .font(Typo.inter(28, 600, relativeTo: .title))
                .webTracking(-0.01, size: 28)
                .foregroundStyle(theme.text)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            InfoTerm(definition: tip, name: title)
        }
    }
}

// MARK: - Wrapping flow

/// Inline flow like `FlowLayout`, but each child is offered the row width so a
/// long label wraps inside its line instead of running past the edge.
struct MembersFlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 6

    private func sizes(_ subviews: Subviews, width: CGFloat) -> [CGSize] {
        subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)) }
    }

    private func rows(_ sizes: [CGSize], width: CGFloat) -> [[Int]] {
        var rows: [[Int]] = [[]]
        var x: CGFloat = 0
        for (i, size) in sizes.enumerated() {
            if !rows[rows.count - 1].isEmpty && x + spacing + size.width > width {
                rows.append([]); x = 0
            }
            x += (rows[rows.count - 1].isEmpty ? 0 : spacing) + size.width
            rows[rows.count - 1].append(i)
        }
        return rows
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 10_000
        let s = sizes(subviews, width: width)
        let r = rows(s, width: width)
        var height: CGFloat = lineSpacing * CGFloat(max(r.count - 1, 0))
        var used: CGFloat = 0
        for row in r {
            var rowHeight: CGFloat = 0
            var rowWidth: CGFloat = spacing * CGFloat(max(row.count - 1, 0))
            for i in row {
                rowHeight = max(rowHeight, s[i].height)
                rowWidth += s[i].width
            }
            height += rowHeight
            used = max(used, rowWidth)
        }
        return CGSize(width: proposal.width ?? used, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let s = sizes(subviews, width: bounds.width)
        var y = bounds.minY
        for row in rows(s, width: bounds.width) {
            var h: CGFloat = 0
            for i in row { h = max(h, s[i].height) }
            var x = bounds.minX
            for i in row {
                subviews[i].place(at: CGPoint(x: x, y: y + (h - s[i].height) / 2),
                                  proposal: ProposedViewSize(width: s[i].width, height: s[i].height))
                x += s[i].width + spacing
            }
            y += h + lineSpacing
        }
    }
}
