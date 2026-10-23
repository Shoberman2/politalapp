import Foundation

/// Plain-English definitions for the words Congress uses, for a reader with no
/// political background. The bundled `glossary.json` is generated from the
/// website's `shared/glossary.js` by `node scripts/sync-glossary.mjs`, so the
/// app's ⓘ explanations match the site's word for word.
enum Glossary {

    struct Entry: Decodable, Hashable {
        let term: String
        let group: String
        let def: String
    }

    struct Group: Decodable, Hashable, Identifiable {
        let id: String
        let title: String
    }

    private struct File: Decodable {
        let groups: [Group]
        let order: [String]
        let terms: [String: Entry]
    }

    private static let file: File = {
        guard let url = Bundle.main.url(forResource: "glossary", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data)
        else { return File(groups: [], order: [], terms: [:]) }
        return file
    }()

    static var groups: [Group] { file.groups }

    static func entry(_ id: String) -> Entry? { file.terms[id] }

    /// The entries in one group, in the glossary's own order.
    static func entries(in group: String) -> [(id: String, entry: Entry)] {
        file.order.compactMap { id in
            guard let e = file.terms[id], e.group == group else { return nil }
            return (id, e)
        }
    }

    /// The glossary entry a vote question points at, so "On Cloture on the
    /// Motion to Proceed" gets the ⓘ for cloture. Same order and patterns as
    /// `termForQuestion` in shared/glossary.js; the first match wins.
    private static let questionTerms: [(String, String)] = [
        ("cloture", "cloture"),
        ("suspend the rules", "suspension"),
        ("recommit", "motionToRecommit"),
        ("motion to table", "motionToTable"),
        ("motion to proceed", "motionToProceed"),
        ("nomination|confirmation", "nomination"),
        ("quorum", "quorum"),
        ("veto", "veto"),
        ("amendment", "amendment"),
        ("providing for consideration|\\brule\\b", "rule"),
    ]

    static func termForQuestion(_ question: String?) -> String? {
        guard let q = question, !q.isEmpty else { return nil }
        for (pattern, id) in questionTerms
        where q.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil {
            return id
        }
        return nil
    }

    /// "Congress in one minute": the same five facts as the website's
    /// src/data/civicsPrimer.js.
    static let primer: [(title: String, body: String, term: String)] = [
        ("Congress writes the laws.",
         "It has two halves. The House has 435 members, each elected by one district. The Senate has 100, two from every state.",
         "congress"),
        ("You have three people there.",
         "One representative for your district, and two senators for your whole state. Your address is enough to find all three.",
         "district"),
        ("A bill is a proposed law.",
         "A member writes it, a small committee studies it, and then the whole House or Senate may vote. Most bills never get that far.",
         "bill"),
        ("Every recorded vote is public.",
         "In a roll call vote each member\u{2019}s yes (yea) or no (nay) is written down by name. That record is what you see here.",
         "rollCall"),
        ("It becomes law in three steps.",
         "The House passes it, the Senate passes the same text, and the President signs it. A veto can be overridden by two-thirds of both.",
         "enacted"),
    ]
}
