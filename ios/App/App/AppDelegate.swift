import UIKit
import Capacitor
import WidgetKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.

        // Nudge the home-screen widgets to reload now that any fresh login /
        // tier data has been written into the shared App Group. This makes the
        // widgets update promptly when the fan switches back to the home screen.
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.

        // Control Center controls can't carry a widgetURL, so when the fan taps
        // one we stash the destination page in the shared App Group and open the
        // app. Consume that pending page here and fire the matching yengapp://
        // deep link so the web layer navigates to the right screen.
        consumePendingControlPage(application)
    }

    /// Reads (and clears) the pending control-widget page from the shared App
    /// Group, then routes it through the Capacitor URL pipeline as a deep link.
    private func consumePendingControlPage(_ application: UIApplication) {
        let suiteName = "group.com.globalmedia.yeng"
        let pendingKey = "CapacitorStorage.yc_widget_pending_page"
        guard let defaults = UserDefaults(suiteName: suiteName),
              let page = defaults.string(forKey: pendingKey),
              !page.isEmpty else {
            return
        }
        // Clear it first so we don't re-navigate on every activation.
        defaults.removeObject(forKey: pendingKey)

        guard let encoded = page.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "yengapp://open?page=\(encoded)") else {
            return
        }
        // Give the webview a moment to be ready before routing the deep link.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            _ = ApplicationDelegateProxy.shared.application(application, open: url, options: [:])
        }
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
