import SwiftUI

@main
struct BallotWatchApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthStore()
    @StateObject private var userData = UserData()
    @StateObject private var router = AppRouter()
    @StateObject private var settings = AppSettings()
    @StateObject private var pro = ProStore()
    @StateObject private var alerts = AlertsStore()
    @StateObject private var banners = BannerCenter()

    var body: some Scene {
        WindowGroup {
            AppGate()
                .environmentObject(auth)
                .environmentObject(userData)
                .environmentObject(router)
                .environmentObject(settings)
                .environmentObject(pro)
                .environmentObject(alerts)
                .environmentObject(banners)
                .themed()
                .preferredColorScheme(settings.appearance.colorScheme)
                .tint(Palette.accentLight)
        }
    }
}

/// First launch opens on the chat with Dome; after that, straight into the
/// product. There is no marketing page in the app.
struct AppGate: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var auth: AuthStore
    @EnvironmentObject private var pro: ProStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            if settings.hasOnboarded {
                RootView()
                    .transition(.opacity)
            } else {
                OnboardingChat()
                    .transition(.opacity)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.3), value: settings.hasOnboarded)
        .bannerHost()
        // Pro belongs to the account: RevenueCat's appUserID is the Supabase
        // user ID.
        .task(id: auth.user?.id) { await pro.identify(userID: auth.user?.id) }
    }
}

/// Which tab is showing, so screens can switch tabs.
@MainActor
final class AppRouter: ObservableObject {
    enum Tab: Hashable { case home, feed, bills, members, more }

    @Published var tab: Tab = .home
    /// The account and settings sheet, reachable from any tab.
    @Published var showSettings = false
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
        .sheet(isPresented: $router.showSettings) {
            SettingsSheet()
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .sheetChrome()
        }
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
        let paper = Palette.uiPaper

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
        let title = Palette.uiInk
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
