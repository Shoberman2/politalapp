import Foundation
import SwiftUI

/// Local-first user state: the saved district, watched bills, and followed members.
///
/// Everything works signed out and is persisted to UserDefaults. When a user
/// signs in, saved items reconcile with their RLS-protected Supabase rows. The
/// last successful snapshot makes removals propagate across devices instead of
/// being accidentally resurrected by a simple union.
@MainActor
final class UserData: ObservableObject {

    struct SavedPlace: Codable, Equatable {
        let state: String
        let district: String?
        let label: String?      // "San Francisco, CA" — what the user typed/matched
    }

    struct SyncPlan: Equatable {
        let merged: Set<String>
        let additions: Set<String>
        let removals: Set<String>
    }

    enum SyncStatus: Equatable {
        case localOnly
        case syncing
        case synced
        case failed(String)
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
        didSet { defaults.set(Array(watchedBills).sorted(), forKey: Keys.watchedBills) }
    }

    @Published private(set) var followedMembers: Set<String> = [] {
        didSet { defaults.set(Array(followedMembers).sorted(), forKey: Keys.followedMembers) }
    }

    /// Bill ids the user has opened, newest first — powers "Recently viewed".
    @Published private(set) var recentBills: [String] = [] {
        didSet { defaults.set(recentBills, forKey: Keys.recentBills) }
    }

    @Published private(set) var syncStatus: SyncStatus = .localOnly

    private let defaults = UserDefaults.standard
    private var activeUserID: String?
    private var billSyncTasks: [String: Task<Void, Never>] = [:]
    private var memberSyncTasks: [String: Task<Void, Never>] = [:]

    private enum Keys {
        static let watchedBills = "watchedBills"
        static let followedMembers = "followedMembers"
        static let recentBills = "recentBills"
        static let savedPlace = "savedPlace"

        static func baseline(_ kind: SyncKind, userID: String) -> String {
            "accountSync.\(userID).\(kind.rawValue)"
        }
    }

    private enum SyncKind: String { case bills, members }

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
        scheduleBillSync(billID)
    }

    func isFollowing(memberID: String) -> Bool { followedMembers.contains(memberID) }

    func toggleFollow(memberID: String) {
        if followedMembers.contains(memberID) {
            followedMembers.remove(memberID)
        } else {
            followedMembers.insert(memberID)
        }
        scheduleMemberSync(memberID)
    }

    // MARK: - Account sync

    /// Reconcile local and remote state. On the first sync both sides are
    /// preserved; later syncs compare with the last successful snapshot so
    /// removals made on either device carry through.
    func syncAccount(userID: String) async {
        activeUserID = userID
        syncStatus = .syncing

        do {
            async let remoteBillsRequest: [RemoteBillFollow] = PostgREST.shared.select(
                "bill_follows",
                columns: "bill_id",
                filters: [.isNull("stopped_at")]
            )
            async let remoteMembersRequest: [RemoteFavorite] = PostgREST.shared.select(
                "user_favorites",
                columns: "politician_id"
            )

            let (remoteBillRows, remoteMemberRows) = try await (
                remoteBillsRequest, remoteMembersRequest
            )
            guard activeUserID == userID else { return }

            let remoteBills = Set(remoteBillRows.map(\.billID))
            let remoteMembers = Set(remoteMemberRows.map(\.politicianID))
            let billPlan = Self.syncPlan(
                local: watchedBills,
                remote: remoteBills,
                baseline: baseline(.bills, userID: userID)
            )
            let memberPlan = Self.syncPlan(
                local: followedMembers,
                remote: remoteMembers,
                baseline: baseline(.members, userID: userID)
            )

            watchedBills = billPlan.merged
            followedMembers = memberPlan.merged

            for billID in billPlan.additions.sorted() { try await startBillFollow(billID) }
            for billID in billPlan.removals.sorted() { try await stopBillFollow(billID) }
            for memberID in memberPlan.additions.sorted() {
                try await addMemberFollow(memberID, userID: userID)
            }
            for memberID in memberPlan.removals.sorted() {
                try await removeMemberFollow(memberID, userID: userID)
            }
            guard activeUserID == userID else { return }

            setBaseline(billPlan.merged, kind: .bills, userID: userID)
            setBaseline(memberPlan.merged, kind: .members, userID: userID)
            syncStatus = .synced

            // A tap can land while the network reconciliation is in flight.
            // Re-run once against the just-saved baseline so that late local
            // edits are not left waiting until the next launch.
            if watchedBills != billPlan.merged || followedMembers != memberPlan.merged {
                await syncAccount(userID: userID)
            }
        } catch {
            guard activeUserID == userID else { return }
            syncStatus = .failed(Self.syncMessage(for: error))
        }
    }

    func disconnectAccount() {
        activeUserID = nil
        billSyncTasks.values.forEach { $0.cancel() }
        memberSyncTasks.values.forEach { $0.cancel() }
        billSyncTasks.removeAll()
        memberSyncTasks.removeAll()
        syncStatus = .localOnly
    }

    nonisolated static func syncPlan(
        local: Set<String>,
        remote: Set<String>,
        baseline: Set<String>?
    ) -> SyncPlan {
        let merged: Set<String>
        if let baseline {
            let localAdditions = local.subtracting(baseline)
            let localRemovals = baseline.subtracting(local)
            merged = remote.union(localAdditions).subtracting(localRemovals)
        } else {
            merged = local.union(remote)
        }
        return SyncPlan(
            merged: merged,
            additions: merged.subtracting(remote),
            removals: remote.subtracting(merged)
        )
    }

    private func scheduleBillSync(_ billID: String) {
        guard activeUserID != nil,
              syncStatus != .syncing,
              billSyncTasks[billID] == nil else { return }
        billSyncTasks[billID] = Task { [weak self] in
            await self?.reconcileBill(billID)
        }
    }

    private func reconcileBill(_ billID: String) async {
        defer { billSyncTasks[billID] = nil }
        guard let userID = activeUserID else { return }

        while activeUserID == userID, !Task.isCancelled {
            let desired = watchedBills.contains(billID)
            do {
                if desired { try await startBillFollow(billID) }
                else { try await stopBillFollow(billID) }
                updateBaselineItem(
                    billID, present: desired, kind: .bills, userID: userID
                )
                if watchedBills.contains(billID) == desired { return }
            } catch {
                syncStatus = .failed(Self.syncMessage(for: error))
                return
            }
        }
    }

    private func scheduleMemberSync(_ memberID: String) {
        guard activeUserID != nil,
              syncStatus != .syncing,
              memberSyncTasks[memberID] == nil else { return }
        memberSyncTasks[memberID] = Task { [weak self] in
            await self?.reconcileMember(memberID)
        }
    }

    private func reconcileMember(_ memberID: String) async {
        defer { memberSyncTasks[memberID] = nil }
        guard let userID = activeUserID else { return }

        while activeUserID == userID, !Task.isCancelled {
            let desired = followedMembers.contains(memberID)
            do {
                if desired { try await addMemberFollow(memberID, userID: userID) }
                else { try await removeMemberFollow(memberID, userID: userID) }
                updateBaselineItem(
                    memberID, present: desired, kind: .members, userID: userID
                )
                if followedMembers.contains(memberID) == desired { return }
            } catch {
                syncStatus = .failed(Self.syncMessage(for: error))
                return
            }
        }
    }

    private func startBillFollow(_ billID: String) async throws {
        try await PostgREST.shared.rpc(
            "start_or_resume_bill_follow",
            parameters: BillFollowRequest(billID: billID)
        )
    }

    private func stopBillFollow(_ billID: String) async throws {
        try await PostgREST.shared.rpc(
            "stop_bill_follow",
            parameters: StopBillFollowRequest(billID: billID)
        )
    }

    private func addMemberFollow(_ memberID: String, userID: String) async throws {
        do {
            try await PostgREST.shared.insert(
                "user_favorites",
                values: FavoriteInsert(userID: userID, politicianID: memberID)
            )
        } catch let error as PostgRESTError where error.isDuplicate {
            // The desired state is already present. This can happen when two
            // devices add the same member between the select and insert.
        }
    }

    private func removeMemberFollow(_ memberID: String, userID: String) async throws {
        try await PostgREST.shared.delete(
            "user_favorites",
            filters: [.eq("user_id", userID), .eq("politician_id", memberID)]
        )
    }

    private func baseline(_ kind: SyncKind, userID: String) -> Set<String>? {
        let key = Keys.baseline(kind, userID: userID)
        guard defaults.object(forKey: key) != nil else { return nil }
        return Set(defaults.stringArray(forKey: key) ?? [])
    }

    private func setBaseline(_ value: Set<String>, kind: SyncKind, userID: String) {
        defaults.set(Array(value).sorted(), forKey: Keys.baseline(kind, userID: userID))
    }

    private func updateBaselineItem(
        _ item: String,
        present: Bool,
        kind: SyncKind,
        userID: String
    ) {
        var value = baseline(kind, userID: userID) ?? []
        if present { value.insert(item) }
        else { value.remove(item) }
        setBaseline(value, kind: kind, userID: userID)
    }

    private static func syncMessage(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }

    // MARK: - Recents

    func noteViewed(billID: String) {
        var updated = recentBills.filter { $0 != billID }
        updated.insert(billID, at: 0)
        recentBills = Array(updated.prefix(20))
    }
}

private struct RemoteBillFollow: Decodable {
    let billID: String
    private enum CodingKeys: String, CodingKey { case billID = "bill_id" }
}

private struct RemoteFavorite: Decodable {
    let politicianID: String
    private enum CodingKeys: String, CodingKey { case politicianID = "politician_id" }
}

private struct BillFollowRequest: Encodable {
    let billID: String
    let committeeAlerts = true
    let floorAlerts = true
    let voteAlerts = true

    private enum CodingKeys: String, CodingKey {
        case billID = "p_bill_id"
        case committeeAlerts = "p_committee_alerts"
        case floorAlerts = "p_floor_alerts"
        case voteAlerts = "p_vote_alerts"
    }
}

private struct StopBillFollowRequest: Encodable {
    let billID: String
    private enum CodingKeys: String, CodingKey { case billID = "p_bill_id" }
}

private struct FavoriteInsert: Encodable {
    let userID: String
    let politicianID: String

    private enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case politicianID = "politician_id"
    }
}
