import Foundation
import Capacitor
import WidgetKit

/// Bridges the fan's auth session from the web layer into the shared App Group
/// so the home-screen widgets (a separate sandboxed process) can read it.
///
/// This exists because @capacitor/preferences CANNOT write to an App Group:
/// its `group` option is only a key-prefix inside the app's private
/// UserDefaults.standard, which the widget process can never see. Here we
/// write straight into `UserDefaults(suiteName: "group.com.globalmedia.yeng")`
/// using the same `CapacitorStorage.` prefix the widget reads, then nudge
/// WidgetKit to reload so the change shows up promptly.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "sync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    // Must match the App Group on both the app + widget targets, and the
    // prefix + keys the Swift widget (YengShared) reads.
    private static let suiteName = "group.com.globalmedia.yeng"
    private static let prefix = "CapacitorStorage."
    private static let keys = [
        "yc_widget_token",
        "yc_widget_tier",
        "yc_widget_name",
        "yc_widget_username",
        "yc_widget_role"
    ]

    @objc func sync(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: WidgetBridgePlugin.suiteName) else {
            call.reject("App Group \(WidgetBridgePlugin.suiteName) is unavailable")
            return
        }

        let values: [String: String] = [
            "yc_widget_token": call.getString("token") ?? "",
            "yc_widget_tier": call.getString("tier") ?? "Free",
            "yc_widget_name": call.getString("name") ?? "",
            "yc_widget_username": call.getString("username") ?? "",
            "yc_widget_role": call.getString("role") ?? "User"
        ]

        for (key, value) in values {
            defaults.set(value, forKey: WidgetBridgePlugin.prefix + key)
        }

        reloadWidgets()
        call.resolve(["success": true])
    }

    @objc func clear(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: WidgetBridgePlugin.suiteName) else {
            call.reject("App Group \(WidgetBridgePlugin.suiteName) is unavailable")
            return
        }

        for key in WidgetBridgePlugin.keys {
            defaults.removeObject(forKey: WidgetBridgePlugin.prefix + key)
        }

        reloadWidgets()
        call.resolve(["success": true])
    }

    private func reloadWidgets() {
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
