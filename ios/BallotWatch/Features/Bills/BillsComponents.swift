import SwiftUI

// Small pieces shared by the Bills desk (/bills) and the bill page, ported
// from BillsPage.css and BillDetail.css. Sizes are the CSS px values.

enum BillsCSS {
    /// Inter's natural line height is ~1.21em; CSS `line-height` adds the rest
    /// as leading. SwiftUI can only add, so tighter values clamp to 0.
    static func leading(_ size: CGFloat, _ lineHeight: CGFloat, natural: CGFloat = 1.21) -> CGFloat {
        max(0, size * lineHeight - size * natural)
    }
}

extension Theme {
    /// `--success-subtle` etc.: the color at 8% (12% in dark mode).
    func subtle(_ color: Color) -> Color { color.opacity(scheme == .dark ? 0.12 : 0.08) }
}

// MARK: - Loading / error (`.bills-page-loading`, `.bill-detail-loading`)

/// The web spinner: a 34px ring in --rule with an accent top arc.
struct BillsSpinner: View {
    var size: CGFloat = 34
    var lineWidth: CGFloat = 3
    @State private var spinning = false
    @Environment(\.theme) private var theme

    var body: some View {
        ZStack {
            Circle().stroke(theme.border, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(theme.accent, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
                .rotationEffect(.degrees(spinning ? 360 : 0))
                .animation(.linear(duration: 0.8).repeatForever(autoreverses: false), value: spinning)
        }
        .frame(width: size, height: size)
        .onAppear { spinning = true }
        .accessibilityHidden(true)
    }
}

/// Inline spinner of `.loading-spinner-small`: 13px, current color.
struct BillsSmallSpinner: View {
    var color: Color
    @State private var spinning = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.75)
            .stroke(color, lineWidth: 2)
            .frame(width: 13, height: 13)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(.linear(duration: 0.7).repeatForever(autoreverses: false), value: spinning)
            .onAppear { spinning = true }
            .accessibilityHidden(true)
    }
}

struct BillsPageLoading: View {
    let label: String
    var mono = true
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 16) {
            BillsSpinner()
            Group {
                if mono {
                    Text(label.uppercased())
                        .font(Typo.mono(12))
                        .webTracking(0.08, size: 12)
                        .foregroundStyle(theme.textMuted)
                } else {
                    Text(label)
                        .font(Typo.inter(16))
                        .foregroundStyle(theme.textSecondary)
                }
            }
            .accessibilityLabel(label)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 96)
    }
}

/// `.error-message` box plus the page's primary retry button.
struct BillsPageError: View {
    let message: String
    let buttonTitle: String
    let action: () -> Void
    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 16) {
            Text(message)
                .font(Typo.inter(15))
                .foregroundStyle(theme.error)
                .multilineTextAlignment(.center)
                .padding(20)
                .frame(maxWidth: .infinity)
                .background(RoundedRectangle(cornerRadius: 4).fill(theme.subtle(theme.error)))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(theme.error, lineWidth: 1))
            Button(buttonTitle, action: action)
                .buttonStyle(PrimaryButtonStyle(fullWidth: false))
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 80)
    }
}

// MARK: - Select pill (`.filter-pill`)

/// A native `<select>` styled as the web's filter pill: 46pt tall, hairline
/// box, mono 12px, chevron at the right. Sized to its widest option, as a
/// select is.
struct BillsSelectPill<Value: Hashable>: View {
    let accessibilityLabel: String
    let options: [(value: Value, label: String)]
    @Binding var selection: Value
    @Environment(\.theme) private var theme

    private var currentLabel: String {
        options.first { $0.value == selection }?.label ?? ""
    }

    var body: some View {
        Menu {
            Picker(accessibilityLabel, selection: $selection) {
                ForEach(options, id: \.value) { option in
                    Text(option.label).tag(option.value)
                }
            }
        } label: {
            ZStack(alignment: .leading) {
                // Every option, hidden, so the pill takes the widest width.
                ForEach(options, id: \.value) { option in
                    Text(option.label).hidden()
                }
                Text(currentLabel).foregroundStyle(theme.text)
            }
            .font(Typo.inter(14, 500))
            .lineLimit(1)
            .padding(.leading, 14)
            .padding(.trailing, 30)
            .frame(height: 36)
            .background(Capsule().fill(theme.surface))
            .overlay(Capsule().stroke(theme.border, lineWidth: 0.5))
            .overlay(alignment: .trailing) {
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
                    .padding(.trailing, 12)
            }
            .contentShape(Rectangle())
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(currentLabel)
    }
}

// MARK: - InfoTip (dotted underline, tap for the explanation)

// MARK: - Party helpers

enum BillsParty {
    /// "D", "R", "I" from Congress.gov / database party strings.
    static func letter(_ raw: String?) -> String? {
        guard let raw, let first = raw.lowercased().first else { return nil }
        if first == "d" { return "D" }
        if first == "r" { return "R" }
        return "I"
    }

    static func party(_ raw: String?) -> Party {
        switch letter(raw) {
        case "D": return .democrat
        case "R": return .republican
        case "I": return .independent
        default: return .unknown
        }
    }
}
