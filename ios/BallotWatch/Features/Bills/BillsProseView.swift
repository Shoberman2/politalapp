import SwiftUI
import UIKit

/// `.bill-ai-prose`: 16px paragraphs on a 28px line, 18px apart, with the
/// first letter set as a 56px drop cap floated left in --info. SwiftUI text
/// can't wrap around a float, so this is TextKit with an exclusion path.
struct BillsProseView: UIViewRepresentable {
    let paragraphs: [String]
    var textColor: UIColor
    var capColor: UIColor
    var fontSize: CGFloat = 16
    var lineHeight: CGFloat = 28
    var paragraphSpacing: CGFloat = 18
    var capSize: CGFloat = 56

    private var bodyFont: UIFont {
        UIFont(name: FontFamily.sans, size: fontSize) ?? .systemFont(ofSize: fontSize)
    }
    private var capFont: UIFont {
        UIFont(name: FontFamily.sans, size: capSize) ?? .systemFont(ofSize: capSize)
    }

    private var capLetter: String {
        guard let first = paragraphs.first?.first else { return "" }
        return String(first)
    }

    /// CSS: float box = 8 top padding + 0.9 × size line box; 8 right padding.
    private var capBox: CGSize {
        let width = (capLetter as NSString).size(withAttributes: [.font: capFont]).width
        return CGSize(width: ceil(width) + 8, height: 8 + capSize * 0.9)
    }

    /// Baseline of the cap from the paragraph top: padding + half-leading of
    /// the 0.9 line box + ascent.
    private var capBaseline: CGFloat {
        let lineBox = capSize * 0.9
        let halfLeading = (lineBox - capFont.lineHeight) / 2
        return 8 + halfLeading + capFont.ascender
    }

    func makeUIView(context: Context) -> ProseTextView {
        let view = ProseTextView()
        view.isEditable = false
        view.isScrollEnabled = false
        view.isSelectable = true
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.setContentHuggingPriority(.defaultHigh, for: .vertical)
        view.adjustsFontForContentSizeCategory = false
        return view
    }

    func updateUIView(_ view: ProseTextView, context: Context) {
        view.attributedText = attributed()
        view.textContainer.exclusionPaths = capLetter.isEmpty ? [] : [UIBezierPath(rect: CGRect(origin: .zero, size: capBox))]
        view.capLabel.text = capLetter
        view.capLabel.font = capFont
        view.capLabel.textColor = capColor
        view.capLabel.sizeToFit()
        view.capLabel.frame.origin = CGPoint(x: 0, y: capBaseline - capFont.ascender)
        view.minimumHeight = capLetter.isEmpty ? 0 : capBox.height
        view.accessibilityLabel = paragraphs.joined(separator: "\n\n")
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: ProseTextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: max(ceil(fitted.height), uiView.minimumHeight))
    }

    private func attributed() -> NSAttributedString {
        let result = NSMutableAttributedString()
        for (index, paragraph) in paragraphs.enumerated() {
            let style = NSMutableParagraphStyle()
            style.minimumLineHeight = lineHeight
            style.maximumLineHeight = lineHeight
            style.paragraphSpacing = index == paragraphs.count - 1 ? 0 : paragraphSpacing
            let text = index == 0 ? String(paragraph.dropFirst()) : paragraph
            let suffix = index == paragraphs.count - 1 ? "" : "\n"
            result.append(NSAttributedString(string: text + suffix, attributes: [
                .font: bodyFont,
                .foregroundColor: textColor,
                .paragraphStyle: style,
                // TextKit sets glyphs at the bottom of a tall line; CSS centers
                // them (half-leading above and below).
                .baselineOffset: (lineHeight - bodyFont.lineHeight) / 4,
            ]))
        }
        return result
    }

    final class ProseTextView: UITextView {
        let capLabel = UILabel()
        var minimumHeight: CGFloat = 0

        override init(frame: CGRect, textContainer: NSTextContainer?) {
            super.init(frame: frame, textContainer: textContainer)
            capLabel.isAccessibilityElement = false
            addSubview(capLabel)
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    }
}
