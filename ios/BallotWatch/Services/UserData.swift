import Foundation
import SwiftUI

/// Local user state: the saved district, watched bills, followed members.
///
/// Everything works signed out — this is the source of truth, persisted to
/// UserDefaults. Signing in additionally mirrors watches to Supabase so they
/// follow the user to another device, but the app never blocks on that.
@MainActor
final class UserData: ObservableObject {

    struct SavedPlace: Codable, Equatable {
        let state: String
        let district: String?
        let label: String?      // "San Francisco, CA" — what the user typed/matched
    }

    @Published var place: SavedPlace? {
        didSet {
            if let place {
                defaults.set(try? JSONEncoder().encode(place), forKey: Keys.savedPlace)
            } else {
                defaults.removeObject(forKey: Keys.savedPlace)
            }
        }
    }

    @Published private(set) var watchedBills: Set<String> = [] {
        didSet { defaults.set(Array(watchedBills), forKey: Keys.watchedBills) }
    }

    @Published private(set) var followedMembers: Set<String> = [] {
        didSet { defaults.set(Array(followedMembers), forKey: Keys.followedMembers) }
    }

    /// Bill ids the user has opened, newest first — powers "Recently viewed".
    @Published private(set) var recentBills: [String] = [] {
        didSet { defaults.set(recentBills, forKey: Keys.recentBills) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let watchedBills = "watchedBills"
        static let followedMembers = "followedMembers"
        static let recentBills = "recentBills"
        static let savedPlace = "savedPlace"
    }

    init() {
        // UI tests need a known starting state; without this the saved place
        // from a previous run leaks into the next and the lookup screen never
        // appears. Only ever triggered by an explicit launch argument.
        if ProcessInfo.processInfo.arguments.contains("--reset-state") {
            for key in [Keys.savedPlace, Keys.watchedBills, Keys.followedMembers, Keys.recentBills] {
                defaults.removeObject(forKey: key)
            }
        }
        if let data = defaults.data(forKey: Keys.savedPlace),
           let decoded = try? JSONDecoder().decode(SavedPlace.self, from: data) {
            place = decoded
        }
        watchedBills = Set(defaults.stringArray(forKey: Keys.watchedBills) ?? [])
        followedMembers = Set(defaults.stringArray(forKey: Keys.followedMembers) ?? [])
        recentBills = defaults.stringArray(forKey: Keys.recentBills) ?? []
    }

    // MARK: - Place

    func save(place: SavedPlace) { self.place = place }

    func clearPlace() { place = nil }

    // MARK: - Watching

    func isWatching(billID: String) -> Bool { watchedBills.contains(billID) }

    func toggleWatch(billID: String) {
        if watchedBills.contains(billID) {
            watchedBills.remove(billID)
        } else {
            watchedBills.insert(billID)
        }
    }

    func isFollowing(memberID: String) -> Bool { followedMembers.contains(memberID) }

    func toggleFollow(memberID: String) {
        if followedMembers.contains(memberID) {
            followedMembers.remove(memberID)
        } else {
            followedMembers.insert(memberID)
        }
    }

    // MARK: - Recents

    func noteViewed(billID: String) {
        var updated = recentBills.filter { $0 != billID }
        updated.insert(billID, at: 0)
        recentBills = Array(updated.prefix(20))
    }
}
