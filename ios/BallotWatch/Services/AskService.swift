import Foundation

/// Ask Dome: questions about Congress answered by `POST /api/ask` on the
/// site, which reads the same record the app shows (bills, roll calls,
/// members) and returns its sources. The model key lives on the server.
enum AskService {
    struct Source: Codable, Hashable, Sendable {
        let title: String
        let url: String
    }

    struct Answer: Codable, Sendable {
        let answer: String
        let sources: [Source]
    }

    struct Turn: Codable, Sendable {
        let role: String   // "user" or "assistant"
        let content: String
    }

    enum AskError: LocalizedError {
        case signIn, pro, rateLimited, unavailable(String)
        var errorDescription: String? {
            switch self {
            case .signIn: return "Sign in to ask Dome."
            case .pro: return "Asking Dome is part of BallotWatch Pro."
            case .rateLimited: return "That's a lot of questions. Try again in a minute."
            case .unavailable(let message): return message
            }
        }
    }

    static var endpoint: URL { Config.siteURL.appendingPathComponent("api/ask") }

    static func ask(_ question: String, history: [Turn], token: String?) async throws -> Answer {
        guard let token else { throw AskError.signIn }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 90
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(Body(question: question, history: Array(history.suffix(6))))

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch status {
        case 200: break
        case 401: throw AskError.signIn
        case 402, 403: throw AskError.pro
        case 429: throw AskError.rateLimited
        default:
            throw AskError.unavailable("Dome can't answer right now. Try again soon.")
        }
        return try JSONDecoder().decode(Answer.self, from: data)
    }

    private struct Body: Encodable {
        let question: String
        let history: [Turn]
    }
}
