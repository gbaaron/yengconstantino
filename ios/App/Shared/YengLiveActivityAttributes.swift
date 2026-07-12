//
//  YengLiveActivityAttributes.swift
//  Yeng Constantino
//
//  Shared Live Activity attribute definitions.
//
//  IMPORTANT — Xcode target membership:
//  This ONE file must belong to BOTH the "App" target AND the
//  "YengWidgetsExtension" target. Select it in the Project Navigator,
//  open the File Inspector (right panel), and tick BOTH targets under
//  "Target Membership". The main app starts/updates/ends the activities
//  (LiveActivityPlugin.swift, App target); the widget extension renders
//  their Lock Screen + Dynamic Island UI (YengWidgets.swift, widget target).
//

import Foundation
import ActivityKit

// MARK: - Concert Live Activity
//
// A countdown that lives on the Lock Screen / Dynamic Island as a concert
// approaches: "in 3 days" → "Tonight" → "Doors open" → "Live now" → wrap-up.

@available(iOS 16.1, *)
struct ConcertActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Short human phrase for the current moment, e.g. "Doors open • 6:00 PM".
        var statusLine: String
        /// The showtime we count toward. Drives the built-in relative timer.
        var showDate: Date
        /// Coarse phase for styling: "countdown" | "soon" | "live" | "ended".
        var phase: String
    }

    /// The concert name, e.g. "Yeng Live in Manila".
    var title: String
    /// The venue, e.g. "Araneta Coliseum".
    var venue: String
}

// MARK: - Ticket Drop Live Activity
//
// A live countdown to a ticket on-sale moment, then a running "X left" as
// inventory moves, ending in either "On sale now" or "Sold out".

@available(iOS 16.1, *)
struct TicketDropActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// The moment tickets go live. Drives the relative timer before drop.
        var dropDate: Date
        /// Tickets remaining once the drop is live. Negative = unknown.
        var remaining: Int
        /// Short phrase, e.g. "Drops at 12 NN" or "Selling fast".
        var statusLine: String
        /// Coarse phase for styling: "waiting" | "live" | "soldout".
        var phase: String
    }

    /// The event the tickets are for, e.g. "Tahanan Tour — Cebu".
    var eventTitle: String
}
