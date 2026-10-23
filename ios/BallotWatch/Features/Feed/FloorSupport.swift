import SwiftUI
import UIKit

// Helpers for the Floor tab, ported from the website so the app says exactly
// what ballotwatch.io says:
//   - the official record URL (api/_lib/rollCallResult.js officialRollCallUrl)
//   - the House floor schedule (GET /api/v1/floor/schedule, public, no key)
//   - CSS line-height on SwiftUI text

// MARK: - Web rules

enum FloorWeb {

    enum ResultKind { case pass, fail, neutral }

    /// `resultKind` in ThisWeekOnFloor.jsx (the feed's coloring).
    static func feedResultKind(_ result: String?) -> ResultKind {
        guard let r = result?.lowercased(), !r.isEmpty else { return .neutral }
        if r.contains("reject") || r.contains("fail") || r.contains("sustained") || r.hasPrefix("not ") { return .fail }
        if ["pass", "invoked", "confirmed", "agreed", "overridden", "ratified"].contains(where: r.contains) { return .pass }
        return .neutral
    }

    /// `resultKind` in RollCallPage.jsx (the roll-call page's coloring).
    static func pageResultPassed(_ result: String) -> Bool {
        let r = result.lowercased()
        return r.hasPrefix("passed") || r.contains("invoked") || r.contains("confirmed")
            || r.contains("agreed") || r.contains("overridden") || r == "ratified"
    }

    /// The House Clerk or Senate LIS page for a roll call.
    static func officialRollCallURL(_ id: String) -> URL? {
        guard let m = RollCallMeta(id: id) else { return nil }
        switch m.chamber {
        case .house:
            guard m.session == 1 || m.session == 2 else { return nil }
            let year = 1789 + 2 * (m.congress - 1) + (m.session - 1)
            return URL(string: "https://clerk.house.gov/Votes/\(year)\(m.number)")
        case .senate:
            guard m.session == 1 || m.session == 2 else { return nil }
            let roll = String(format: "%05d", m.number)
            return URL(string: "https://www.senate.gov/legislative/LIS/roll_call_votes/vote\(m.congress)\(m.session)/vote_\(m.congress)_\(m.session)_\(roll).htm")
        }
    }

    static func ordinal(_ n: Int) -> String {
        let v = n % 100
        let suffixes = ["th", "st", "nd", "rd"]
        let idx = (v - 20) % 10
        if idx >= 1 && idx <= 3 && v > 20 { return "\(n)\(suffixes[idx])" }
        if v >= 1 && v <= 3 { return "\(n)\(suffixes[v])" }
        return "\(n)th"
    }

    /// The Congress in session today (a new one convenes January 3 of odd years).
    static func currentCongress(_ date: Date = Date()) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.year, .month, .day], from: date)
        var year = c.year ?? 2026
        if c.month == 1 && (c.day ?? 1) < 3 { year -= 1 }
        return (year - 1789) / 2 + 1
    }

    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// "2026-09-14" -> "Sep 14", no timezone shift.
    static func weekLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        guard parts.count == 3, let m = Int(parts[1]), let d = Int(parts[2]), (1...12).contains(m) else { return iso }
        return "\(months[m - 1]) \(d)"
    }

    /// "September 30, 2026" in UTC, like the web's fmtDate.
    static func longDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "MMMM d, yyyy"
        return f.string(from: date)
    }

    /// "/bill/119/hr/7401" -> "119-hr-7401"
    static func billID(fromPath path: String?) -> String? {
        guard let path else { return nil }
        let parts = path.split(separator: "/")
        guard parts.count == 4, parts[0] == "bill" else { return nil }
        return "\(parts[1])-\(parts[2])-\(parts[3])"
    }
}

// MARK: - House floor schedule

struct FloorSchedule: Sendable {
    struct Item: Identifiable, Sendable {
        let id: String
        let label: String?
        let title: String?
        let category: String?
        let billID: String?
        let sourceURL: URL?
    }
    struct Week: Identifiable, Sendable {
        var id: String { week }
        let week: String
        let status: String
        let sourceURL: URL?
        let items: [Item]
    }
    let weeks: [Week]

    /// Same wording as SENATE_NOTE in src/services/floorSchedule.js.
    static let senateNote = "House schedule; the Senate does not publish one in this format."
    static let houseFloorHome = URL(string: "https://docs.house.gov/floor/")!

    private struct Body: Decodable {
        struct DataBody: Decodable { let weeks: [RawWeek]? }
        struct RawWeek: Decodable {
            let week: String
            let status: String?
            let source_url: String?
            let items: [RawItem]?
        }
        struct RawItem: Decodable {
            let item_id: LossyString?
            let label: String?
            let title: String?
            let category: String?
            let bill_id: String?
            let bill_path: String?
        }
        let data: DataBody?
    }

    /// Accepts a JSON string or number.
    private struct LossyString: Decodable {
        let value: String
        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let s = try? c.decode(String.self) { value = s }
            else if let i = try? c.decode(Int.self) { value = String(i) }
            else { value = "" }
        }
    }

    /// nil when the schedule couldn't be loaded.
    static func load() async -> FloorSchedule? {
        let url = Config.siteURL.appendingPathComponent("api/v1/floor/schedule")
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
            let body = try JSONDecoder().decode(Body.self, from: data)
            guard let weeks = body.data?.weeks else { return nil }
            return FloorSchedule(weeks: weeks.map { w in
                let source = w.source_url.flatMap(URL.init(string:))
                return Week(
                    week: w.week,
                    status: w.status ?? "unavailable",
                    sourceURL: source,
                    items: (w.items ?? []).enumerated().map { index, raw in
                        Item(
                            id: "\(w.week):\(raw.item_id?.value ?? raw.label ?? raw.title ?? String(index)):\(index)",
                            label: raw.label,
                            title: raw.title,
                            category: raw.category,
                            billID: raw.bill_id ?? FloorWeb.billID(fromPath: raw.bill_path),
                            sourceURL: source
                        )
                    }
                )
            })
        } catch {
            return nil
        }
    }
}

// MARK: - CSS line height

extension View {
    /// CSS `line-height` for text set in Inter (or Geist Mono with `mono`):
    /// the extra leading goes between lines and, split in half, above and
    /// below, the way a browser centers text in its line box.
    func cssLineHeight(_ multiple: CGFloat, size: CGFloat, mono: Bool = false) -> some View {
        let name = mono ? FontFamily.mono : FontFamily.sans
        let natural = UIFont(name: name, size: size)?.lineHeight ?? size * 1.21
        let gap = size * multiple - natural
        return self
            .lineSpacing(max(gap, 0))
            .padding(.vertical, gap / 2)
    }
}

/// Lets a pushed Floor screen's "This week" breadcrumb return to the tab root.
private struct FloorShowThisWeekKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    var floorShowThisWeek: (() -> Void)? {
        get { self[FloorShowThisWeekKey.self] }
        set { self[FloorShowThisWeekKey.self] = newValue }
    }
}

/// Web `.btn-secondary.btn-sm`: accent text, 14px/500, 2px side padding.
struct FloorSmallTextButtonStyle: ButtonStyle {
    @Environment(\.theme) private var theme

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typo.inter(14, 500))
            .foregroundStyle(theme.accent)
            .underline(configuration.isPressed, color: theme.accent)
            .padding(.horizontal, 2)
            .frame(minHeight: 36)
            .contentShape(Rectangle())
    }
}
