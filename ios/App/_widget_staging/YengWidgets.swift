//
//  YengWidgets.swift
//  YengWidgets
//
//  Home-screen widgets for the Yeng app.
//  Four widgets, each supporting small / medium / large families:
//    1. Next Show Countdown   (public data)
//    2. Featured Song         (public data)
//    3. Fan Tier              (reads shared App Group storage; live refresh)
//    4. Past Merch Orders     (auth-gated via shared token)
//
//  Live data comes from the same Netlify functions the website uses.
//  Every provider ships a hardcoded fallback so a demo never shows blank.
//

import WidgetKit
import SwiftUI

// MARK: - Shared storage (App Group)

/// Reads values the app mirrors into the shared App Group via @capacitor/preferences.
/// Capacitor Preferences namespaces every key with "CapacitorStorage.".
enum YengShared {
    static let suiteName = "group.com.globalmedia.yeng"
    static let apiBase = "https://yengconstantino.netlify.app"

    private static func read(_ key: String) -> String? {
        let defaults = UserDefaults(suiteName: suiteName)
        let value = defaults?.string(forKey: "CapacitorStorage.\(key)")
        return (value?.isEmpty == false) ? value : nil
    }

    static var token: String? { read("yc_widget_token") }
    static var tier: String { read("yc_widget_tier") ?? "Free" }
    static var name: String { read("yc_widget_name") ?? "" }
    static var username: String { read("yc_widget_username") ?? "" }
    static var isLoggedIn: Bool { token != nil }
}

// MARK: - Brand

extension Color {
    static let yengPurple = Color(red: 0x6C / 255, green: 0x2B / 255, blue: 0xD9 / 255)
    static let yengPurpleDeep = Color(red: 0x4A / 255, green: 0x14 / 255, blue: 0x9E / 255)
    static let yengMagenta = Color(red: 0xBB / 255, green: 0x00 / 255, blue: 0xFF / 255)
    static let yengRed = Color(red: 0xE3 / 255, green: 0x19 / 255, blue: 0x37 / 255)
    static let yengInk = Color(red: 0x1A / 255, green: 0x12 / 255, blue: 0x2E / 255)
    static let yengMist = Color(red: 0xF2 / 255, green: 0xEC / 255, blue: 0xFB / 255)
}

/// Signature purple→magenta gradient used across the brand.
private let yengGradient = LinearGradient(
    colors: [.yengPurpleDeep, .yengPurple, .yengMagenta],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
)

// MARK: - Networking helper

enum YengAPI {
    /// Fetches JSON and decodes into `T`. Auth token attached when `authed` is true.
    static func fetch<T: Decodable>(
        _ path: String,
        authed: Bool = false,
        as type: T.Type,
        completion: @escaping (T?) -> Void
    ) {
        guard let url = URL(string: "\(YengShared.apiBase)\(path)") else {
            completion(nil); return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        if authed, let token = YengShared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        URLSession.shared.dataTask(with: request) { data, _, _ in
            guard let data = data,
                  let decoded = try? JSONDecoder().decode(T.self, from: data) else {
                completion(nil); return
            }
            completion(decoded)
        }.resume()
    }

    /// Next timeline refresh: 30 minutes out.
    static var nextRefresh: Date { Date().addingTimeInterval(30 * 60) }
}

// MARK: - API response models

private struct EventsResponse: Decodable { let events: [EventItem] }
private struct EventItem: Decodable {
    let title: String?
    let date: String?
    let venue: String?
    let city: String?
    let country: String?
}

private struct MusicResponse: Decodable { let content: [MusicItem] }
private struct MusicItem: Decodable {
    let title: String?
    let category: String?
    let era: String?
    let year: Int?
    let duration: String?
    let thumbnail: String?
}

private struct OrdersResponse: Decodable { let orders: [OrderItem] }
private struct OrderItem: Decodable {
    let orderNumber: String?
    let totalAmount: Double?
    let status: String?
    let orderDate: String?
}

// MARK: - Date parsing

private func parseISO(_ string: String?) -> Date? {
    guard let string = string else { return nil }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = iso.date(from: string) { return d }
    iso.formatOptions = [.withInternetDateTime]
    if let d = iso.date(from: string) { return d }
    let plain = DateFormatter()
    plain.dateFormat = "yyyy-MM-dd"
    return plain.date(from: string)
}

// =====================================================================
// MARK: - 1. NEXT SHOW COUNTDOWN
// =====================================================================

struct ShowEntry: TimelineEntry {
    let date: Date
    let title: String
    let venue: String
    let showDate: Date?
    let isFallback: Bool
}

struct ShowProvider: TimelineProvider {
    private let fallback = ShowEntry(
        date: Date(),
        title: "Yeng Live in Manila",
        venue: "Araneta Coliseum",
        showDate: Calendar.current.date(byAdding: .day, value: 28, to: Date()),
        isFallback: true
    )

    func placeholder(in context: Context) -> ShowEntry { fallback }

    func getSnapshot(in context: Context, completion: @escaping (ShowEntry) -> Void) {
        completion(fallback)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ShowEntry>) -> Void) {
        YengAPI.fetch("/.netlify/functions/get-events?upcoming=true&limit=1", as: EventsResponse.self) { response in
            var entry = fallback
            if let event = response?.events.first {
                entry = ShowEntry(
                    date: Date(),
                    title: event.title ?? fallback.title,
                    venue: [event.venue, event.city].compactMap { $0 }.joined(separator: ", "),
                    showDate: parseISO(event.date),
                    isFallback: false
                )
            }
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

struct ShowWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: ShowEntry

    private var days: Int? {
        guard let showDate = entry.showDate else { return nil }
        let diff = Calendar.current.dateComponents([.day], from: Date(), to: showDate).day
        return diff.map { max(0, $0) }
    }

    var body: some View {
        ZStack {
            yengGradient
            switch family {
            case .systemSmall: small
            case .systemLarge: large
            default: medium
            }
        }
        .foregroundColor(.white)
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "music.mic")
            Text("NEXT SHOW").font(.system(size: 10, weight: .bold)).tracking(1.5)
        }
        .foregroundColor(.white.opacity(0.85))
    }

    private var countdownBlock: some View {
        Group {
            if let days = days {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(days)").font(.system(size: 44, weight: .heavy, design: .rounded))
                    Text(days == 1 ? "day" : "days").font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.85))
                }
            } else {
                Text("Coming soon").font(.system(size: 20, weight: .bold, design: .serif))
            }
        }
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            Spacer()
            countdownBlock
            Text(entry.title)
                .font(.system(size: 13, weight: .semibold, design: .serif))
                .lineLimit(2).minimumScaleFactor(0.8)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(spacing: 16) {
            VStack(spacing: 2) {
                if let days = days {
                    Text("\(days)").font(.system(size: 52, weight: .heavy, design: .rounded))
                    Text(days == 1 ? "DAY" : "DAYS").font(.system(size: 11, weight: .bold)).tracking(1.5)
                        .foregroundColor(.white.opacity(0.85))
                } else {
                    Image(systemName: "sparkles").font(.system(size: 40))
                }
            }
            .frame(width: 96)
            Rectangle().fill(.white.opacity(0.25)).frame(width: 1)
            VStack(alignment: .leading, spacing: 6) {
                header
                Text(entry.title)
                    .font(.system(size: 18, weight: .bold, design: .serif))
                    .lineLimit(2).minimumScaleFactor(0.8)
                Label(entry.venue, systemImage: "mappin.and.ellipse")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(18)
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            Spacer()
            countdownBlock
            Text(entry.title)
                .font(.system(size: 26, weight: .bold, design: .serif))
                .lineLimit(2).minimumScaleFactor(0.7)
            Label(entry.venue, systemImage: "mappin.and.ellipse")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.9))
            if let showDate = entry.showDate {
                Label(showDate.formatted(date: .abbreviated, time: .shortened),
                      systemImage: "calendar")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
            }
            Spacer()
            HStack {
                Text("Tap to get tickets")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Image(systemName: "arrow.right.circle.fill")
            }
            .foregroundColor(.white.opacity(0.95))
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct NextShowWidget: Widget {
    let kind = "YengNextShow"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShowProvider()) { entry in
            widgetContainer { ShowWidgetView(entry: entry) }
        }
        .configurationDisplayName("Next Show Countdown")
        .description("Counts down to Yeng's next live show.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - 2. FEATURED SONG
// =====================================================================

struct SongEntry: TimelineEntry {
    let date: Date
    let title: String
    let subtitle: String
    let year: String
    let isFallback: Bool
}

struct SongProvider: TimelineProvider {
    private let fallback = SongEntry(
        date: Date(),
        title: "Ikaw",
        subtitle: "Original",
        year: "2015",
        isFallback: true
    )

    func placeholder(in context: Context) -> SongEntry { fallback }
    func getSnapshot(in context: Context, completion: @escaping (SongEntry) -> Void) { completion(fallback) }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SongEntry>) -> Void) {
        YengAPI.fetch("/.netlify/functions/get-music-content?featured=true&limit=1&sort=newest",
                      as: MusicResponse.self) { response in
            var entry = fallback
            if let song = response?.content.first {
                let subtitle = song.category ?? song.era ?? "Featured"
                entry = SongEntry(
                    date: Date(),
                    title: song.title ?? fallback.title,
                    subtitle: subtitle,
                    year: song.year.map(String.init) ?? "",
                    isFallback: false
                )
            }
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

struct SongWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: SongEntry

    var body: some View {
        ZStack {
            Color.yengMist
            switch family {
            case .systemSmall: small
            case .systemLarge: large
            default: medium
            }
        }
    }

    private var artwork: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(yengGradient)
            Image(systemName: "music.note")
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(.white)
        }
    }

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "star.fill").font(.system(size: 9))
            Text("FEATURED TRACK").font(.system(size: 10, weight: .bold)).tracking(1.3)
        }
        .foregroundColor(.yengPurple)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            artwork.frame(width: 52, height: 52)
            Spacer(minLength: 0)
            eyebrow
            Text(entry.title)
                .font(.system(size: 17, weight: .bold, design: .serif))
                .foregroundColor(.yengInk)
                .lineLimit(2).minimumScaleFactor(0.8)
            Text(entry.subtitle)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.yengInk.opacity(0.6))
                .lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            artwork.frame(width: 74, height: 74)
            VStack(alignment: .leading, spacing: 6) {
                eyebrow
                Text(entry.title)
                    .font(.system(size: 22, weight: .bold, design: .serif))
                    .foregroundColor(.yengInk)
                    .lineLimit(2).minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    Text(entry.subtitle)
                    if !entry.year.isEmpty {
                        Text("•"); Text(entry.year)
                    }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.yengInk.opacity(0.6))
            }
            Spacer(minLength: 0)
            Image(systemName: "play.circle.fill")
                .font(.system(size: 34))
                .foregroundColor(.yengMagenta)
        }
        .padding(18)
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 16) {
            eyebrow
            artwork.frame(maxWidth: .infinity).frame(height: 150)
            Text(entry.title)
                .font(.system(size: 30, weight: .bold, design: .serif))
                .foregroundColor(.yengInk)
                .lineLimit(2).minimumScaleFactor(0.7)
            HStack(spacing: 10) {
                Text(entry.subtitle)
                if !entry.year.isEmpty { Text("•"); Text(entry.year) }
                Spacer()
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 30))
                    .foregroundColor(.yengMagenta)
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.yengInk.opacity(0.65))
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct FeaturedSongWidget: Widget {
    let kind = "YengFeaturedSong"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SongProvider()) { entry in
            widgetContainer { SongWidgetView(entry: entry) }
        }
        .configurationDisplayName("Featured Song")
        .description("Shows Yeng's currently featured track.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - 3. FAN TIER
// =====================================================================

struct TierEntry: TimelineEntry {
    let date: Date
    let loggedIn: Bool
    let tier: String
    let name: String
}

struct TierProvider: TimelineProvider {
    private func current() -> TierEntry {
        TierEntry(date: Date(),
                  loggedIn: YengShared.isLoggedIn,
                  tier: YengShared.tier,
                  name: YengShared.name)
    }

    func placeholder(in context: Context) -> TierEntry {
        TierEntry(date: Date(), loggedIn: true, tier: "Laging Nandito", name: "Fan")
    }
    func getSnapshot(in context: Context, completion: @escaping (TierEntry) -> Void) {
        completion(current())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TierEntry>) -> Void) {
        completion(Timeline(entries: [current()], policy: .after(YengAPI.nextRefresh)))
    }
}

/// Maps a tier name to its member discount perk.
private func tierDiscount(_ tier: String) -> Int {
    switch tier {
    case "Sariwang Simula": return 5
    case "Laging Nandito": return 10
    case "Ikaw Lamang": return 15
    default: return 0
    }
}

struct TierWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: TierEntry

    var body: some View {
        ZStack {
            yengGradient
            if entry.loggedIn { content } else { signIn }
        }
        .foregroundColor(.white)
    }

    private var discount: Int { tierDiscount(entry.tier) }

    private var badge: some View {
        ZStack {
            Circle().fill(.white.opacity(0.15))
            Circle().stroke(.white.opacity(0.5), lineWidth: 1.5)
            Image(systemName: "heart.fill").font(.system(size: 22)).foregroundColor(.white)
        }
    }

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "person.crop.circle.badge.checkmark")
            Text("FAN CLUB").font(.system(size: 10, weight: .bold)).tracking(1.4)
        }
        .foregroundColor(.white.opacity(0.85))
    }

    private var content: some View {
        Group {
            switch family {
            case .systemSmall:
                VStack(alignment: .leading, spacing: 8) {
                    eyebrow
                    Spacer()
                    badge.frame(width: 40, height: 40)
                    Text(entry.tier)
                        .font(.system(size: 16, weight: .bold, design: .serif))
                        .lineLimit(2).minimumScaleFactor(0.8)
                    if discount > 0 {
                        Text("\(discount)% member perk")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white.opacity(0.85))
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            case .systemLarge:
                VStack(alignment: .leading, spacing: 16) {
                    eyebrow
                    Spacer()
                    badge.frame(width: 64, height: 64)
                    if !entry.name.isEmpty {
                        Text(entry.name)
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white.opacity(0.85))
                    }
                    Text(entry.tier)
                        .font(.system(size: 30, weight: .bold, design: .serif))
                        .lineLimit(2).minimumScaleFactor(0.7)
                    if discount > 0 {
                        Label("\(discount)% off merch & tickets", systemImage: "tag.fill")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    Spacer()
                    Text("Tap to view your membership")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                }
                .padding(22)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            default:
                HStack(spacing: 16) {
                    badge.frame(width: 60, height: 60)
                    VStack(alignment: .leading, spacing: 6) {
                        eyebrow
                        Text(entry.tier)
                            .font(.system(size: 22, weight: .bold, design: .serif))
                            .lineLimit(2).minimumScaleFactor(0.75)
                        if discount > 0 {
                            Label("\(discount)% member perk", systemImage: "tag.fill")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white.opacity(0.9))
                        } else {
                            Text("Upgrade for member perks")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(.white.opacity(0.85))
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(18)
            }
        }
    }

    private var signIn: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.crop.circle.badge.plus").font(.system(size: 30))
            Text("Sign in to see\nyour fan tier")
                .font(.system(size: 14, weight: .semibold, design: .serif))
                .multilineTextAlignment(.center)
        }
        .foregroundColor(.white)
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct FanTierWidget: Widget {
    let kind = "YengFanTier"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TierProvider()) { entry in
            widgetContainer { TierWidgetView(entry: entry) }
        }
        .configurationDisplayName("Fan Tier")
        .description("Your Yeng fan club membership at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - 4. PAST MERCH ORDERS
// =====================================================================

struct OrdersEntry: TimelineEntry {
    let date: Date
    let loggedIn: Bool
    let count: Int
    let latestNumber: String
    let latestStatus: String
    let latestTotal: Double
}

struct OrdersProvider: TimelineProvider {
    private var sample: OrdersEntry {
        OrdersEntry(date: Date(), loggedIn: true, count: 3,
                    latestNumber: "YC-10428", latestStatus: "Shipped", latestTotal: 1450)
    }

    func placeholder(in context: Context) -> OrdersEntry { sample }
    func getSnapshot(in context: Context, completion: @escaping (OrdersEntry) -> Void) {
        completion(YengShared.isLoggedIn ? sample : signedOut)
    }

    private var signedOut: OrdersEntry {
        OrdersEntry(date: Date(), loggedIn: false, count: 0,
                    latestNumber: "", latestStatus: "", latestTotal: 0)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<OrdersEntry>) -> Void) {
        guard YengShared.isLoggedIn else {
            completion(Timeline(entries: [signedOut], policy: .after(YengAPI.nextRefresh)))
            return
        }
        YengAPI.fetch("/.netlify/functions/get-orders", authed: true, as: OrdersResponse.self) { response in
            var entry = OrdersEntry(date: Date(), loggedIn: true, count: 0,
                                    latestNumber: "", latestStatus: "", latestTotal: 0)
            if let orders = response?.orders {
                if let latest = orders.first {
                    entry = OrdersEntry(
                        date: Date(), loggedIn: true, count: orders.count,
                        latestNumber: latest.orderNumber ?? "—",
                        latestStatus: latest.status ?? "Pending",
                        latestTotal: latest.totalAmount ?? 0
                    )
                } else {
                    entry = OrdersEntry(date: Date(), loggedIn: true, count: 0,
                                        latestNumber: "", latestStatus: "", latestTotal: 0)
                }
            }
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

private func statusColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "delivered": return Color(red: 0.15, green: 0.6, blue: 0.35)
    case "shipped": return .yengPurple
    case "cancelled": return .yengRed
    default: return Color(red: 0.85, green: 0.6, blue: 0.1)
    }
}

private func peso(_ amount: Double) -> String {
    "₱" + (amount.truncatingRemainder(dividingBy: 1) == 0
           ? String(format: "%.0f", amount)
           : String(format: "%.2f", amount))
}

struct OrdersWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: OrdersEntry

    var body: some View {
        ZStack {
            Color.yengMist
            if !entry.loggedIn { signIn }
            else if entry.count == 0 { empty }
            else { content }
        }
    }

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "bag.fill").font(.system(size: 9))
            Text("MY MERCH").font(.system(size: 10, weight: .bold)).tracking(1.3)
        }
        .foregroundColor(.yengPurple)
    }

    private var statusPill: some View {
        Text(entry.latestStatus.uppercased())
            .font(.system(size: 9, weight: .bold)).tracking(0.5)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(statusColor(entry.latestStatus).opacity(0.15))
            .foregroundColor(statusColor(entry.latestStatus))
            .clipShape(Capsule())
    }

    private var content: some View {
        Group {
            switch family {
            case .systemSmall:
                VStack(alignment: .leading, spacing: 6) {
                    eyebrow
                    Spacer()
                    Text("\(entry.count)")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundColor(.yengInk)
                    Text(entry.count == 1 ? "order" : "orders")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.yengInk.opacity(0.6))
                    statusPill
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            case .systemLarge:
                VStack(alignment: .leading, spacing: 14) {
                    eyebrow
                    Text("\(entry.count) \(entry.count == 1 ? "order" : "orders")")
                        .font(.system(size: 28, weight: .bold, design: .serif))
                        .foregroundColor(.yengInk)
                    Divider()
                    Text("LATEST ORDER")
                        .font(.system(size: 10, weight: .bold)).tracking(1.2)
                        .foregroundColor(.yengInk.opacity(0.5))
                    HStack {
                        Text(entry.latestNumber)
                            .font(.system(size: 18, weight: .semibold, design: .monospaced))
                            .foregroundColor(.yengInk)
                        Spacer()
                        statusPill
                    }
                    Text(peso(entry.latestTotal))
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(.yengPurple)
                    Spacer()
                    Text("Tap to view order history")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.yengPurple)
                }
                .padding(22)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            default:
                HStack(spacing: 16) {
                    VStack(spacing: 2) {
                        Text("\(entry.count)")
                            .font(.system(size: 44, weight: .heavy, design: .rounded))
                            .foregroundColor(.yengPurple)
                        Text(entry.count == 1 ? "ORDER" : "ORDERS")
                            .font(.system(size: 9, weight: .bold)).tracking(1)
                            .foregroundColor(.yengInk.opacity(0.6))
                    }
                    .frame(width: 88)
                    Rectangle().fill(.yengInk.opacity(0.1)).frame(width: 1)
                    VStack(alignment: .leading, spacing: 6) {
                        eyebrow
                        Text(entry.latestNumber)
                            .font(.system(size: 16, weight: .semibold, design: .monospaced))
                            .foregroundColor(.yengInk)
                        HStack(spacing: 8) {
                            statusPill
                            Text(peso(entry.latestTotal))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.yengInk.opacity(0.75))
                        }
                    }
                    Spacer(minLength: 0)
                }
                .padding(18)
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "bag.badge.questionmark").font(.system(size: 28))
                .foregroundColor(.yengPurple)
            Text("No orders yet")
                .font(.system(size: 15, weight: .bold, design: .serif))
                .foregroundColor(.yengInk)
            Text("Tap to shop the merch drop")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.yengInk.opacity(0.6))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var signIn: some View {
        VStack(spacing: 10) {
            Image(systemName: "bag.circle").font(.system(size: 30)).foregroundColor(.yengPurple)
            Text("Sign in to see\nyour orders")
                .font(.system(size: 14, weight: .semibold, design: .serif))
                .foregroundColor(.yengInk)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct PastOrdersWidget: Widget {
    let kind = "YengPastOrders"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: OrdersProvider()) { entry in
            widgetContainer { OrdersWidgetView(entry: entry) }
        }
        .configurationDisplayName("Merch Orders")
        .description("Track your past Yeng merch orders.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - Container (handles iOS 17 contentMarginsDisabled / older)
// =====================================================================

@ViewBuilder
func widgetContainer<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    if #available(iOS 17.0, *) {
        content().containerBackground(for: .widget) { Color.clear }
    } else {
        content()
    }
}
