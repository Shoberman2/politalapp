import SwiftUI

/// Dome: BallotWatch's character, drawn as the brand's own Capitol mark with
/// two eyes in the dome. Plain-spoken and strictly neutral, like a good
/// congressional page: it knows the rules and the record, never the "right"
/// answer. See DESIGN.md, "iOS app".
///
/// One personality moment: Dome blinks now and then, and glances side to
/// side while it is reading the record for you. Reduce Motion keeps it still.
enum DomeCharacter {
    static let name = "Dome"
}

struct DomeView: View {
    var width: CGFloat = 64
    var isThinking = false

    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var blink = false
    @State private var glance: CGFloat = 0

    // Geometry of the mark's 200 x 110 viewBox (capitol-logo.svg): the dome
    // spans x 80...120 and y 12...36. The eyes sit in its lower half.
    private var scale: CGFloat { width / 200 }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Image("CapitolMark")
                .renderingMode(.template)
                .resizable()
                .aspectRatio(200 / 110, contentMode: .fit)
                .foregroundStyle(theme.text)
            eye(x: 93.5)
            eye(x: 106.5)
        }
        .frame(width: width, height: width * 110 / 200)
        .accessibilityElement()
        .accessibilityLabel(DomeCharacter.name)
        .task(id: isThinking) { await animate() }
    }

    private func eye(x: CGFloat) -> some View {
        Capsule()
            .fill(theme.bg)
            .frame(width: 4.2 * scale, height: 7 * scale)
            .scaleEffect(x: 1, y: blink ? 0.12 : 1, anchor: .center)
            .offset(x: (x + glance) * scale - 2.1 * scale, y: 22 * scale)
    }

    private func animate() async {
        guard !reduceMotion else { glance = 0; return }
        while !Task.isCancelled {
            if isThinking {
                withAnimation(.easeInOut(duration: 0.35)) { glance = -3 }
                try? await Task.sleep(nanoseconds: 600_000_000)
                withAnimation(.easeInOut(duration: 0.35)) { glance = 3 }
                try? await Task.sleep(nanoseconds: 600_000_000)
            } else {
                withAnimation(.easeInOut(duration: 0.2)) { glance = 0 }
                try? await Task.sleep(nanoseconds: UInt64.random(in: 2_800_000_000...5_000_000_000))
                guard !Task.isCancelled else { return }
                withAnimation(.easeIn(duration: 0.07)) { blink = true }
                try? await Task.sleep(nanoseconds: 110_000_000)
                withAnimation(.easeOut(duration: 0.09)) { blink = false }
            }
        }
    }
}
