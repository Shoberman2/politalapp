import SwiftUI

/// The ⓘ after a word a reader may not know. Tapping it opens the word's
/// plain-English definition in a small bubble (a popover, kept a popover on
/// iPhone). Definitions come from `Glossary` (the website's glossary), or a
/// one-off `definition` when the word is not in it.
///
/// Never put one inside a NavigationLink or Button label: the tap would go to
/// the link. Put it beside the link instead.
struct InfoTerm: View {
    let id: String?
    var definition: String? = nil
    var name: String? = nil

    @Environment(\.theme) private var theme
    @State private var open = false

    init(_ id: String, name: String? = nil) {
        self.id = id
        self.name = name
    }

    init(definition: String, name: String) {
        self.id = nil
        self.definition = definition
        self.name = name
    }

    private var entry: Glossary.Entry? { id.flatMap(Glossary.entry) }
    private var title: String { name ?? entry?.term ?? "This term" }
    private var text: String? { definition ?? entry?.def }

    var body: some View {
        if let text {
            Button { open.toggle() } label: {
                Image(systemName: "info.circle")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(open ? theme.accent : theme.textMuted)
                    // 44pt hit target around a 13pt glyph, without moving the line.
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle().inset(by: -11))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("What does \u{201C}\(title)\u{201D} mean?")
            .accessibilityIdentifier("info-\(id ?? title)")
            .popover(isPresented: $open, arrowEdge: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(title)
                        .font(Typo.bodySMMedium)
                        .foregroundStyle(theme.text)
                    Text(text)
                        .font(Typo.bodySM)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(Space.md)
                .frame(width: 280, alignment: .leading)
                .presentationCompactAdaptation(.popover)
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// A label followed by its ⓘ: `TermLabel(id: "cloture", text: "Cloture")`.
/// Style the text from outside with `.font` / `.foregroundStyle`.
struct TermLabel: View {
    let id: String
    var text: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(text ?? Glossary.entry(id)?.term ?? id)
            InfoTerm(id, name: Glossary.entry(id)?.term)
                .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] + 4 }
        }
    }
}
