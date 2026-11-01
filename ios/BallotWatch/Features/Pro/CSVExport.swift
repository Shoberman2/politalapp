import SwiftUI
import UIKit

/// Pro: a member's recorded votes as a CSV file, shared through the system
/// share sheet. Every row carries the official source URL for that vote.
enum VoteCSV {
    static let header = ["date", "roll_call_id", "bill_id", "bill_title", "position", "source_url"]

    static func make(_ votes: [BallotWatchAPI.VoteWithBill]) -> String {
        var lines = [header.joined(separator: ",")]
        for vote in votes {
            let row = [
                String(vote.votedAt.prefix(10)),
                vote.rollCallID ?? "",
                vote.billID ?? "",
                vote.bill?.title ?? "",
                vote.position.label,
                vote.sourceURL ?? vote.bill?.sourceURL ?? "",
            ]
            lines.append(row.map(escape).joined(separator: ","))
        }
        return lines.joined(separator: "\r\n") + "\r\n"
    }

    /// RFC 4180: quote fields holding a comma, quote or line break, and
    /// double any quote inside. A leading = + - @ is prefixed with ' so a
    /// spreadsheet never runs a bill title as a formula.
    static func escape(_ field: String) -> String {
        var value = field
        if let first = value.first, "=+-@".contains(first) { value = "'" + value }
        if value.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) {
            return "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return value
    }

    static func fileName(for member: Politician) -> String {
        let slug = member.name.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return "ballotwatch-\(slug)-votes.csv"
    }

    /// Fetches the full record we hold and writes it to a temporary file.
    static func export(member: Politician) async throws -> URL {
        let votes = try await BallotWatchAPI.memberVotes(politicianID: member.id, limit: 5000)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(fileName(for: member))
        try make(votes).write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}

/// The system share sheet for a file made on demand.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// Identifiable wrapper so a URL can drive `.sheet(item:)`.
struct SharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}
