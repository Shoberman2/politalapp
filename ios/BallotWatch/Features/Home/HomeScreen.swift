import SwiftUI

/// The first tab: your representatives, the website's /my-representative
/// page under a native large title. The website's landing page stays on the web;
/// the app opens straight on the lookup and the members it finds.
struct HomeScreen: View {
    enum Route: Hashable {
        case member(Politician)
    }

    @State private var path: [Route] = []

    var body: some View {
        NavigationStack(path: $path) {
            MyRepScreen()
                // No bar on this tab: the page draws its own title near the
                // top, so the content starts higher than under an empty bar.
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .member(let politician):
                        PoliticianDetailScreen(politician: politician)
                    }
                }
        }
    }
}
