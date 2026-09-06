import Foundation
import Capacitor
import UIKit

/// Swaps the home-screen icon so the record a fan is wearing inside the app
/// is the one they see on the home screen too.
///
/// The alternate icons are NOT in the asset catalog: UIKit resolves them by
/// filename from the app bundle's root, which is why they are staged as
/// `<key>@2x.png` / `<key>@3x.png` by scripts/stage-alt-icons.js and declared
/// under CFBundleIcons > CFBundleAlternateIcons in Info.plist. The name
/// passed here is the bare key ("babala"), and nil restores the primary icon.
///
/// iOS shows its own "You have changed the icon" alert on every successful
/// change, and there is no supported way to suppress it — so the web layer
/// only calls this when the fan actually picks a record, never on load.
@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "AppIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["supported": UIApplication.shared.supportsAlternateIcons])
        }
    }

    @objc func current(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // nil means the primary icon is in use.
            call.resolve(["name": UIApplication.shared.alternateIconName ?? ""])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let raw = call.getString("name") ?? ""
        // "" / "scrapbook" both mean: go back to the default artwork.
        let name: String? = (raw.isEmpty || raw == "scrapbook") ? nil : raw

        DispatchQueue.main.async {
            guard UIApplication.shared.supportsAlternateIcons else {
                call.reject("Alternate icons are not supported on this device")
                return
            }
            // Setting the icon it already has makes iOS show its alert for
            // no reason, so this is a no-op when nothing would change.
            if UIApplication.shared.alternateIconName == name {
                call.resolve(["changed": false, "name": raw])
                return
            }
            UIApplication.shared.setAlternateIconName(name) { error in
                if let error = error {
                    call.reject("Could not change the app icon: \(error.localizedDescription)")
                } else {
                    call.resolve(["changed": true, "name": raw])
                }
            }
        }
    }
}
