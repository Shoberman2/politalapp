import SwiftUI

@main
struct BallotWatchApp: App {
    @StateObject private var auth = AuthStore()
    @StateObject private var userData = UserData()
    @StateObject private var router = AppRouter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(userData)
                .environmentObject(router)
                .themed()
                .tint(Palette.accentLight)
        }
    }
}

/// Which tab is showing, so screens can switch tabs.
@MainActor
final class AppRouter: ObservableObject {
    enum Tab: Hashable { case home, feed, bills, members, more }

    @Published var tab: Tab = .home
}

struct RootView: View {
    @Environment(\.theme) private var theme
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var userData: UserData
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        TabView(selection: $router.tab) {
            HomeScreen()
                .tabItem { Label("My Reps", systemImage: "building.columns") }
                .tag(AppRouter.Tab.home)

            FeedScreen()
                .tabItem { Label("Floor", systemImage: "list.bullet.rectangle") }
                .tag(AppRouter.Tab.feed)

            BillsScreen()
                .tabItem { Label("Bills", systemImage: "doc.text") }
                .tag(AppRouter.Tab.bills)

            MembersScreen()
                .tabItem { Label("Members", systemImage: "person.2") }
                .tag(AppRouter.Tab.members)

            MoreScreen()
                .tabItem { Label("More", systemImage: "ellipsis") }
                .tag(AppRouter.Tab.more)
        }
        .tint(theme.accent)
        .onAppear(perform: styleUIKitChrome)
        .task(id: auth.user?.id) {
            guard let user = await auth.prepareDataAccess() else {
                userData.disconnectAccount()
                return
            }
            await userData.syncAccount(userID: user.id)
        }
    }

    /// SwiftUI's TabView and NavigationStack still render through UIKit
    /// appearance proxies, so the paper background and Inter have to be
    /// set there too or the chrome reverts to system defaults.
    private func styleUIKitChrome() {
        let paper = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x11/255, green: 0x11/255, blue: 0x10/255, alpha: 1)
                : UIColor(red: 0xFA/255, green: 0xFA/255, blue: 0xF7/255, alpha: 1)
        }

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithDefaultBackground()
        tabAppearance.backgroundColor = paper.withAlphaComponent(0.94)
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        // Native bar behavior: transparent over the page at rest, frosted
        // once content scrolls under it.
        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithDefaultBackground()
        navAppearance.backgroundColor = paper.withAlphaComponent(0.8)
        let edgeAppearance = UINavigationBarAppearance()
        edgeAppearance.configureWithTransparentBackground()
        let title = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0xE8/255, green: 0xE6/255, blue: 0xE1/255, alpha: 1)
                : UIColor(red: 0x1A/255, green: 0x1A/255, blue: 0x18/255, alpha: 1)
        }
        navAppearance.titleTextAttributes = [
            .foregroundColor: title,
            .font: UIFont(name: FontFamily.sansSemibold, size: 17) ?? .systemFont(ofSize: 17, weight: .semibold),
        ]
        // The large title is the page's own voice, so it takes Inter Display.
        navAppearance.largeTitleTextAttributes = [
            .foregroundColor: title,
            .font: UIFont(name: FontFamily.display, size: 34) ?? .systemFont(ofSize: 34, weight: .semibold),
        ]
        edgeAppearance.titleTextAttributes = navAppearance.titleTextAttributes
        edgeAppearance.largeTitleTextAttributes = navAppearance.largeTitleTextAttributes
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = edgeAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance
    }
}
