import Foundation

/// A plain-language reading of Voteview's first NOMINATE dimension.
///
/// The first dimension is a roll-call-derived liberal/conservative scale. It
/// does not establish a member's self-identified ideology and it cannot support
/// narrower labels such as populist or neoconservative. Those limits are part
/// of the UI, not fine print hidden in code.
enum VoteviewIdeology {
    static let congress = 119
    static let sourceURL = URL(
        string: "https://voteview.com/static/data/out/members/HS119_members.csv"
    )!
    static let methodologyURL = URL(
        string: "https://voteview.com/articles/data_help_members"
    )!
    static let correctionURL = URL(
        string: "https://github.com/Shoberman2/politalapp/issues/new?template=data_correction.yml"
    )!

    enum ServiceError: LocalizedError {
        case requestFailed
        case malformedData
        case memberNotFound

        var errorDescription: String? {
            switch self {
            case .requestFailed: return "Voteview is unavailable right now."
            case .malformedData: return "Voteview returned an unexpected data format."
            case .memberNotFound: return "No current Voteview record was found for this member."
            }
        }
    }

    struct Estimate: Hashable, Sendable {
        let available: Bool
        let label: String
        let confidence: String
        let placement: Double?
        let score: Double?
        let votes: Int
        let congress: Int
    }

    static func estimate(for bioguideID: String) async throws -> Estimate {
        var request = URLRequest(url: sourceURL)
        request.cachePolicy = .returnCacheDataElseLoad
        request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode,
              let csv = String(data: data, encoding: .utf8)
        else { throw ServiceError.requestFailed }
        return try parseRecord(csv: csv, bioguideID: bioguideID)
    }

    static func classify(score: Double?, votes: Int) -> Estimate {
        guard let score, score.isFinite, votes >= 25 else {
            return Estimate(
                available: false,
                label: "Insufficient voting evidence",
                confidence: "Insufficient",
                placement: nil,
                score: score,
                votes: votes,
                congress: congress
            )
        }

        let label: String
        if score <= -0.5 {
            label = "Progressive-aligned voting record"
        } else if score <= -0.1 {
            label = "Liberal-aligned voting record"
        } else if score < 0.1 {
            label = "Cross-partisan voting record"
        } else if score < 0.5 {
            label = "Conservative-aligned voting record"
        } else {
            label = "Very conservative-aligned voting record"
        }

        let confidence = votes >= 200 ? "High" : votes >= 75 ? "Medium" : "Limited"
        return Estimate(
            available: true,
            label: label,
            confidence: confidence,
            placement: max(0, min(100, ((score + 1) / 2) * 100)),
            score: score,
            votes: votes,
            congress: congress
        )
    }

    static func parseRecord(csv: String, bioguideID: String) throws -> Estimate {
        var lines = csv.split(whereSeparator: \.isNewline).map(String.init)
        guard !lines.isEmpty else { throw ServiceError.malformedData }
        let headers = parseCSVLine(lines.removeFirst())
        let index = Dictionary(uniqueKeysWithValues: headers.enumerated().map { ($0.element, $0.offset) })
        guard let bioguideIndex = index["bioguide_id"],
              let scoreIndex = index["nominate_dim1"],
              let votesIndex = index["nominate_number_of_votes"]
        else { throw ServiceError.malformedData }

        for line in lines {
            let row = parseCSVLine(line)
            guard bioguideIndex < row.count, row[bioguideIndex] == bioguideID else { continue }
            guard scoreIndex < row.count, votesIndex < row.count,
                  let score = Double(row[scoreIndex]),
                  let votes = Int(row[votesIndex])
            else { throw ServiceError.malformedData }
            return classify(score: score, votes: votes)
        }
        throw ServiceError.memberNotFound
    }

    private static func parseCSVLine(_ line: String) -> [String] {
        var values: [String] = []
        var value = ""
        var quoted = false
        var index = line.startIndex

        while index < line.endIndex {
            let character = line[index]
            if character == "\"" {
                let next = line.index(after: index)
                if quoted, next < line.endIndex, line[next] == "\"" {
                    value.append("\"")
                    index = next
                } else {
                    quoted.toggle()
                }
            } else if character == ",", !quoted {
                values.append(value)
                value = ""
            } else {
                value.append(character)
            }
            index = line.index(after: index)
        }
        values.append(value)
        return values
    }
}
