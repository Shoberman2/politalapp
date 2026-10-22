import SwiftUI

// Shared page chrome: the brand mark, the tab-root title, and the dateline.
// Tab roots use native large titles rather than the website's masthead.

// MARK: - Brand

/// Web `.brand-mark`: the Capitol drawn in --ink, no tile.
struct BrandMark: View {
    var width: CGFloat = 36
    @Environment(\.theme) private var theme

    var body: some View {
        Image("CapitolMark")
            .renderingMode(.template)
            .resizable()
            .aspectRatio(200 / 110, contentMode: .fit)
            .frame(width: width)
            .foregroundStyle(theme.text)
            .accessibilityHidden(true)
    }
}

/// Mark plus wordmark, as at the left edge of the web masthead.
struct BrandLockup: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 10) {
            BrandMark()
            Text(Brand.name)
                .font(Typo.inter(18, 600, relativeTo: .headline))
                .webTracking(-0.02, size: 18)
                .foregroundStyle(theme.text)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Brand.name)
        .accessibilityAddTraits(.isHeader)
    }
}

enum Brand {
    /// Mirrors `BRAND.name` in src/config/brand.js.
    static let name = "BallotWatch"
}

// MARK: - Tab roots

extension View {
    /// A tab's root screen: a native large title that shrinks into the bar
    /// on scroll, the way iOS apps open, instead of the website's masthead.
    func tabRoot(_ title: String) -> some View {
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
    }
}

// MARK: - Flow layout

/// Lays children out left to right and wraps to a new line when the row is
/// full, the way inline content flows on the web.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(rows.count - 1, 0))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let extra = rows[rows.count - 1].indices.isEmpty ? 0 : spacing
            if rows[rows.count - 1].width + extra + size.width > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            let gap = rows[rows.count - 1].indices.isEmpty ? 0 : spacing
            rows[rows.count - 1].indices.append(index)
            rows[rows.count - 1].width += gap + size.width
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}

// MARK: - Dateline

/// Web `.dateline`: 11px mono uppercase in --ink-3. Pieces join with " · ".
struct Dateline: View {
    let parts: [String]
    @Environment(\.theme) private var theme

    init(_ parts: String...) { self.parts = parts }
    init(parts: [String]) { self.parts = parts }

    var body: some View {
        Text(parts.filter { !$0.isEmpty }.joined(separator: " · ").uppercased())
            .font(Typo.mono(11, 400))
            .tracking(11 * 0.14)
            .foregroundStyle(theme.textMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}
