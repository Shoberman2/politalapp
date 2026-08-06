import SwiftUI

@main
struct BallotWatchApp: App {
    @StateObject private var auth = AuthStore()
    @StateObject private var userData = UserData()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(userData)
                .themed()
                .tint(Palette.accentLight)
        }
    }
}

struct RootView: View {
    @Environment(\.theme) private var theme
    @EnvironmentObject private var userData: UserData
    @State private var selection: Tab = .myRep

    enum Tab: Hashable { case myRep, feed, bills, members, more }

    var body: some View {
        TabView(selection: $selection) {
            MyRepScreen()
                .tabItem { Label("My Rep", systemImage: "person.text.rectangle") }
                .tag(Tab.myRep)

            FeedScreen()
                .tabItem { Label("Floor", systemImage: "list.bullet.rectangle") }
                .tag(Tab.feed)

            BillsScreen()
                .tabItem { Label("Bills", systemImage: "doc.text") }
                .tag(Tab.bills)

            MembersScreen()
                .tabItem { Label("Members", systemImage: "building.columns") }
                .tag(Tab.members)

            MoreScreen()
                .tabItem { Label("More", systemImage: "ellipsis") }
                .tag(Tab.more)
        }
        .tint(theme.accent)
        .onAppear(perform: styleUIKitChrome)
    }

    /// SwiftUI's TabView and NavigationStack still render through UIKit
    /// appearance proxies, so the paper background and General Sans have to be
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

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = paper
        navAppearance.shadowColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x2A/255, green: 0x2A/255, blue: 0x27/255, alpha: 1)
                : UIColor(red: 0xE8/255, green: 0xE6/255, blue: 0xE1/255, alpha: 1)
        }
        let title = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0xE8/255, green: 0xE6/255, blue: 0xE1/255, alpha: 1)
                : UIColor(red: 0x1A/255, green: 0x1A/255, blue: 0x18/255, alpha: 1)
        }
        navAppearance.titleTextAttributes = [
            .foregroundColor: title,
            .font: UIFont(name: FontFamily.sansSemibold, size: 17) ?? .systemFont(ofSize: 17, weight: .semibold),
        ]
        // The large title is the page's own voice, so it takes the serif.
        navAppearance.largeTitleTextAttributes = [
            .foregroundColor: title,
            .font: UIFont(name: FontFamily.serif, size: 34) ?? .systemFont(ofSize: 34, weight: .regular),
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        UINavigationBar.appearance().compactAppearance = navAppearance
    }
}
