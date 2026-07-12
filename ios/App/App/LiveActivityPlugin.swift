import Foundation
import Capacitor
import ActivityKit

/// Bridges the web layer to ActivityKit so pages can start / update / end the
/// Concert and Ticket Drop Live Activities that show on the Lock Screen and in
/// the Dynamic Island.
///
/// The activity attribute types (ConcertActivityAttributes,
/// TicketDropActivityAttributes) are defined in the SHARED file
/// YengLiveActivityAttributes.swift, which must have target membership in BOTH
/// the "App" target (this plugin) AND the "YengWidgetsExtension" target (the
/// views that render them). This plugin only starts/updates/ends; the widget
/// extension draws the UI.
///
/// JS surface (see native-bridge.js → window.NativeBridge.LiveActivity):
///   startConcert({ id, title, venue, showDate, statusLine, phase })
///   updateConcert({ id, statusLine, showDate, phase })
///   startTicketDrop({ id, eventTitle, dropDate, remaining, statusLine, phase })
///   updateTicketDrop({ id, remaining, statusLine, dropDate, phase })
///   end({ id })            // ends one activity by its stored key
///   endAll()               // ends every Yeng activity
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startConcert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateConcert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startTicketDrop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateTicketDrop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endAll", returnType: CAPPluginReturnPromise)
    ]

    // Keeps the JS-supplied id → the running Activity so update/end can find it.
    private var concertActivities: [String: Any] = [:]
    private var ticketActivities: [String: Any] = [:]

    // MARK: Support check

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["supported": false])
        }
    }

    // MARK: Concert

    @objc func startConcert(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled in Settings")
            return
        }
        let id = call.getString("id") ?? UUID().uuidString
        let attributes = ConcertActivityAttributes(
            title: call.getString("title") ?? "Yeng Live",
            venue: call.getString("venue") ?? ""
        )
        let state = ConcertActivityAttributes.ContentState(
            statusLine: call.getString("statusLine") ?? "",
            showDate: parseDate(call.getString("showDate")),
            phase: call.getString("phase") ?? "countdown"
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
            concertActivities[id] = activity
            call.resolve(["success": true, "id": id, "activityId": activity.id])
        } catch {
            call.reject("Failed to start concert activity: \(error.localizedDescription)")
        }
    }

    @objc func updateConcert(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }
        let id = call.getString("id") ?? ""
        guard let activity = concertActivities[id] as? Activity<ConcertActivityAttributes> else {
            call.reject("No concert activity for id \(id)")
            return
        }
        let state = ConcertActivityAttributes.ContentState(
            statusLine: call.getString("statusLine") ?? activity.contentState.statusLine,
            showDate: parseDate(call.getString("showDate")) ,
            phase: call.getString("phase") ?? activity.contentState.phase
        )
        Task {
            await activity.update(using: state)
            call.resolve(["success": true])
        }
    }

    // MARK: Ticket Drop

    @objc func startTicketDrop(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.reject("Live Activities are disabled in Settings")
            return
        }
        let id = call.getString("id") ?? UUID().uuidString
        let attributes = TicketDropActivityAttributes(
            eventTitle: call.getString("eventTitle") ?? "Ticket Drop"
        )
        let state = TicketDropActivityAttributes.ContentState(
            dropDate: parseDate(call.getString("dropDate")),
            remaining: call.getInt("remaining") ?? -1,
            statusLine: call.getString("statusLine") ?? "",
            phase: call.getString("phase") ?? "waiting"
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                contentState: state,
                pushType: nil
            )
            ticketActivities[id] = activity
            call.resolve(["success": true, "id": id, "activityId": activity.id])
        } catch {
            call.reject("Failed to start ticket drop activity: \(error.localizedDescription)")
        }
    }

    @objc func updateTicketDrop(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.reject("Live Activities require iOS 16.1+")
            return
        }
        let id = call.getString("id") ?? ""
        guard let activity = ticketActivities[id] as? Activity<TicketDropActivityAttributes> else {
            call.reject("No ticket drop activity for id \(id)")
            return
        }
        let state = TicketDropActivityAttributes.ContentState(
            dropDate: parseDate(call.getString("dropDate")),
            remaining: call.getInt("remaining") ?? activity.contentState.remaining,
            statusLine: call.getString("statusLine") ?? activity.contentState.statusLine,
            phase: call.getString("phase") ?? activity.contentState.phase
        )
        Task {
            await activity.update(using: state)
            call.resolve(["success": true])
        }
    }

    // MARK: End

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["success": true])
            return
        }
        let id = call.getString("id") ?? ""
        Task {
            if let concert = concertActivities[id] as? Activity<ConcertActivityAttributes> {
                await concert.end(dismissalPolicy: .immediate)
                concertActivities.removeValue(forKey: id)
            }
            if let ticket = ticketActivities[id] as? Activity<TicketDropActivityAttributes> {
                await ticket.end(dismissalPolicy: .immediate)
                ticketActivities.removeValue(forKey: id)
            }
            call.resolve(["success": true])
        }
    }

    @objc func endAll(_ call: CAPPluginCall) {
        guard #available(iOS 16.1, *) else {
            call.resolve(["success": true])
            return
        }
        Task {
            for activity in Activity<ConcertActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            for activity in Activity<TicketDropActivityAttributes>.activities {
                await activity.end(dismissalPolicy: .immediate)
            }
            concertActivities.removeAll()
            ticketActivities.removeAll()
            call.resolve(["success": true])
        }
    }

    // MARK: Helpers

    /// Accepts an ISO-8601 / millis string; falls back to "now" so a bad value
    /// never crashes the timer view.
    private func parseDate(_ raw: String?) -> Date {
        guard let raw = raw, !raw.isEmpty else { return Date() }
        // Numeric epoch (seconds or millis)
        if let num = Double(raw) {
            return Date(timeIntervalSince1970: num > 9_999_999_999 ? num / 1000 : num)
        }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: raw) { return d }
        return Date()
    }
}
