import SwiftUI

/// Every term the app marks with an ⓘ, in plain English, for a reader with no
/// background in politics or government. The app's copy of the website's
/// /glossary page: "Congress in one minute", then the terms by group.
struct GlossaryScreen: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                InfoHero(
                    kicker: "Glossary",
                    title: "Congress, explained in plain English.",
                    lede: "No background in politics needed. Here is what every term in the app means. Anywhere you see an \u{24D8}, tap it for the same explanation."
                )
                InfoSection {
                    VStack(alignment: .leading, spacing: 0) {
                        InfoHeading("Congress in one minute")
                        ForEach(Array(Glossary.primer.enumerated()), id: \.offset) { index, item in
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(String(format: "%02d", index + 1))
                                    .font(Typo.mono(12))
                                    .foregroundStyle(theme.textMuted)
                                    .frame(width: 28, alignment: .leading)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(item.title)
                                        .font(Typo.inter(18, 600, relativeTo: .title3))
                                        .foregroundStyle(theme.text)
                                        .fixedSize(horizontal: false, vertical: true)
                                    InfoParagraph(item.body)
                                }
                            }
                            .padding(.vertical, 16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .overlay(alignment: .top) {
                                Rectangle().fill(index == 0 ? theme.border : theme.borderSoft).frame(height: 1)
                            }
                        }
                    }
                }
                ForEach(Array(Glossary.groups.enumerated()), id: \.element.id) { index, group in
                    InfoSection(isLast: index == Glossary.groups.count - 1) {
                        VStack(alignment: .leading, spacing: 0) {
                            InfoHeading(group.title)
                            ForEach(Glossary.entries(in: group.id), id: \.id) { item in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.entry.term)
                                        .font(Typo.inter(16, 600))
                                        .foregroundStyle(theme.text)
                                    InfoParagraph(item.entry.def)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, 14)
                                .overlay(alignment: .top) { Rectangle().fill(theme.borderSoft).frame(height: 1) }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                }
            }
        }
        .paperBackground()
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
    }
}
