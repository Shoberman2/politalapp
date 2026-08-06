import Foundation

/// A small PostgREST client — the subset of supabase-js this app actually uses.
///
/// Written directly against URLSession rather than pulling in the Supabase
/// Swift SDK: the query surface here is a dozen operators wide, and keeping it
/// dependency-free means the app builds with no package resolution at all.
enum PostgRESTError: LocalizedError {
    case http(status: Int, body: String)
    case transport(Error)
    case decoding(Error, raw: String)

    var errorDescription: String? {
        switch self {
        case .http(let status, let body):
            // PostgREST puts a human-readable reason in `message`.
            if let data = body.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = obj["message"] as? String {
                return message
            }
            return "Request failed (\(status))"
        case .transport(let error):
            let ns = error as NSError
            if ns.domain == NSURLErrorDomain {
                switch ns.code {
                case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost:
                    return "You're offline. Check your connection and try again."
                case NSURLErrorTimedOut:
                    return "The request timed out."
                default: break
                }
            }
            return error.localizedDescription
        case .decoding:
            return "The server sent data in an unexpected format."
        }
    }

    /// True when the failure is a missing column/table — the same graceful
    /// degradation the web app does when a migration hasn't shipped to an
    /// environment yet.
    var isMissingSchema: Bool {
        guard case .http(_, let body) = self else { return false }
        return body.contains("42703") || body.contains("PGRST204")
            || body.contains("does not exist")
    }
}

/// One filter on a column, mirroring PostgREST's `column=operator.value`.
struct Filter {
    let query: String

    static func eq(_ column: String, _ value: String) -> Filter { .init(query: "\(column)=eq.\(esc(value))") }
    static func neq(_ column: String, _ value: String) -> Filter { .init(query: "\(column)=neq.\(esc(value))") }
    static func gte(_ column: String, _ value: String) -> Filter { .init(query: "\(column)=gte.\(esc(value))") }
    static func lte(_ column: String, _ value: String) -> Filter { .init(query: "\(column)=lte.\(esc(value))") }
    static func like(_ column: String, _ pattern: String) -> Filter { .init(query: "\(column)=like.\(esc(pattern))") }
    static func ilike(_ column: String, _ pattern: String) -> Filter { .init(query: "\(column)=ilike.\(esc(pattern))") }
    static func isNull(_ column: String) -> Filter { .init(query: "\(column)=is.null") }
    static func notNull(_ column: String) -> Filter { .init(query: "\(column)=not.is.null") }

    static func inList(_ column: String, _ values: [String]) -> Filter {
        // PostgREST wants in.(a,b,c); quote each value so commas and dots
        // inside an id can't be read as separators.
        let joined = values.map { "\"\($0.replacingOccurrences(of: "\"", with: ""))\"" }.joined(separator: ",")
        return .init(query: "\(column)=in.(\(joined))")
    }

    /// `or=(a.ilike.*x*,b.eq.y)`. Callers must pass already-sanitized values —
    /// see `PostgREST.sanitizeForOr`.
    static func or(_ clauses: [String]) -> Filter {
        .init(query: "or=(\(clauses.joined(separator: ",")))")
    }

    private static func esc(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .postgrestValue) ?? value
    }
}

struct Order {
    let column: String
    let ascending: Bool
    let nullsFirst: Bool?

    init(_ column: String, ascending: Bool = true, nullsFirst: Bool? = nil) {
        self.column = column
        self.ascending = ascending
        self.nullsFirst = nullsFirst
    }

    var query: String {
        var s = "\(column).\(ascending ? "asc" : "desc")"
        if let nullsFirst { s += nullsFirst ? ".nullsfirst" : ".nullslast" }
        return s
    }
}

actor PostgREST {
    static let shared = PostgREST()

    private let session: URLSession
    private let decoder: JSONDecoder

    /// Set after sign-in so RLS policies that key off `auth.uid()` (watched
    /// bills, profiles) resolve to the signed-in user rather than anon.
    private var accessToken: String?

    init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 20
        config.requestCachePolicy = .reloadRevalidatingCacheData
        config.urlCache = URLCache(memoryCapacity: 8 << 20, diskCapacity: 64 << 20)
        self.session = URLSession(configuration: config)
        self.decoder = JSONDecoder()
    }

    func setAccessToken(_ token: String?) { accessToken = token }

    // MARK: - Select

    func select<T: Decodable>(
        _ table: String,
        columns: String = "*",
        filters: [Filter] = [],
        order: [Order] = [],
        limit: Int? = nil,
        offset: Int? = nil,
        as type: T.Type = T.self
    ) async throws -> [T] {
        var items = [URLQueryItem(name: "select", value: columns)]
        for f in filters {
            // Filters arrive pre-encoded as "name=value"; split on the first =.
            guard let eq = f.query.firstIndex(of: "=") else { continue }
            let name = String(f.query[f.query.startIndex..<eq])
            let value = String(f.query[f.query.index(after: eq)...])
            items.append(URLQueryItem(name: name, value: value.removingPercentEncoding ?? value))
        }
        if !order.isEmpty {
            items.append(URLQueryItem(name: "order", value: order.map(\.query).joined(separator: ",")))
        }
        if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
        if let offset, offset > 0 { items.append(URLQueryItem(name: "offset", value: String(offset))) }

        let data = try await perform(table: table, queryItems: items, method: "GET", headers: [:])
        do {
            return try decoder.decode([T].self, from: data)
        } catch {
            throw PostgRESTError.decoding(error, raw: String(data: data, encoding: .utf8) ?? "")
        }
    }

    /// First row or nil — the equivalent of supabase-js `.maybeSingle()`.
    func selectOne<T: Decodable>(
        _ table: String,
        columns: String = "*",
        filters: [Filter] = [],
        order: [Order] = [],
        as type: T.Type = T.self
    ) async throws -> T? {
        try await select(table, columns: columns, filters: filters, order: order, limit: 1, as: type).first
    }

    /// Row count without transferring rows — `HEAD` + `Prefer: count=exact`,
    /// read back out of the Content-Range header.
    func count(_ table: String, filters: [Filter] = []) async throws -> Int {
        var items = [URLQueryItem(name: "select", value: "id")]
        for f in filters {
            guard let eq = f.query.firstIndex(of: "=") else { continue }
            let name = String(f.query[f.query.startIndex..<eq])
            let value = String(f.query[f.query.index(after: eq)...])
            items.append(URLQueryItem(name: name, value: value.removingPercentEncoding ?? value))
        }
        let (_, response) = try await performRaw(
            table: table,
            queryItems: items,
            method: "HEAD",
            headers: ["Prefer": "count=exact", "Range": "0-0"],
            body: nil
        )
        guard let range = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "content-range"),
              let total = range.split(separator: "/").last, let n = Int(total) else { return 0 }
        return n
    }

    // MARK: - Write

    @discardableResult
    func insert<T: Encodable>(_ table: String, values: T, upsert: Bool = false) async throws -> Data {
        var headers = ["Prefer": upsert ? "resolution=merge-duplicates,return=representation" : "return=representation"]
        headers["Content-Type"] = "application/json"
        let body = try JSONEncoder().encode(values)
        return try await perform(table: table, queryItems: [], method: "POST", headers: headers, body: body)
    }

    @discardableResult
    func update<T: Encodable>(_ table: String, values: T, filters: [Filter]) async throws -> Data {
        var items: [URLQueryItem] = []
        for f in filters {
            guard let eq = f.query.firstIndex(of: "=") else { continue }
            let name = String(f.query[f.query.startIndex..<eq])
            let value = String(f.query[f.query.index(after: eq)...])
            items.append(URLQueryItem(name: name, value: value.removingPercentEncoding ?? value))
        }
        let body = try JSONEncoder().encode(values)
        return try await perform(
            table: table, queryItems: items, method: "PATCH",
            headers: ["Content-Type": "application/json", "Prefer": "return=representation"],
            body: body
        )
    }

    func delete(_ table: String, filters: [Filter]) async throws {
        var items: [URLQueryItem] = []
        for f in filters {
            guard let eq = f.query.firstIndex(of: "=") else { continue }
            let name = String(f.query[f.query.startIndex..<eq])
            let value = String(f.query[f.query.index(after: eq)...])
            items.append(URLQueryItem(name: name, value: value.removingPercentEncoding ?? value))
        }
        _ = try await perform(table: table, queryItems: items, method: "DELETE", headers: [:])
    }

    // MARK: - Transport

    private func perform(
        table: String,
        queryItems: [URLQueryItem],
        method: String,
        headers: [String: String],
        body: Data? = nil
    ) async throws -> Data {
        let (data, _) = try await performRaw(
            table: table, queryItems: queryItems, method: method, headers: headers, body: body
        )
        return data
    }

    private func performRaw(
        table: String,
        queryItems: [URLQueryItem],
        method: String,
        headers: [String: String],
        body: Data?
    ) async throws -> (Data, URLResponse) {
        var components = URLComponents(
            url: Config.restURL.appendingPathComponent(table),
            resolvingAgainstBaseURL: false
        )!
        if !queryItems.isEmpty { components.queryItems = queryItems }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.httpBody = body
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken ?? Config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw PostgRESTError.transport(error)
        }

        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw PostgRESTError.http(
                status: http.statusCode,
                body: String(data: data, encoding: .utf8) ?? ""
            )
        }
        return (data, response)
    }

    /// PostgREST reads `or=(...)` as a comma-separated filter list, so commas,
    /// parens and wildcards in user input would break parsing. Same sanitizer
    /// the web app applies before building a search filter.
    nonisolated static func sanitizeForOr(_ input: String) -> String {
        input.trimmed.replacingOccurrences(
            of: "[,()*%]", with: " ", options: .regularExpression
        ).trimmed
    }
}

extension CharacterSet {
    /// PostgREST values need `,`, `.`, `(`, `)`, `:` and `/` escaped, since all
    /// carry meaning in the filter grammar.
    static let postgrestValue: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_~ *%")
        return set
    }()
}
