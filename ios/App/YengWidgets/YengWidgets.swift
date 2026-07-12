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
import AppIntents
import ActivityKit

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
    static var role: String { read("yc_widget_role") ?? "User" }
    static var isLoggedIn: Bool { token != nil }
    static var isAdmin: Bool { role == "Admin" || role == "SuperAdmin" }
}

// MARK: - Brand
//
// "Tahanan Songbook" editorial palette — warm paper, ink, concert red + gold.
// The historic token names (yengPurple / yengMagenta / yengPurpleDeep / yengMist)
// are retained so every existing widget view keeps compiling, but they now point
// at the editorial hues:
//   yengPurple     → concert red  (primary accent)
//   yengPurpleDeep → deep burgundy
//   yengMagenta    → antique gold (secondary accent)
//   yengInk        → warm near-black ink
//   yengMist       → soft paper
// New semantic aliases (yengPaper / yengInkSoft / yengMuted / yengHairline /
// yengConcertRed / yengBurgundy) are added for the newer widgets.

extension Color {
    // Legacy names, re-pointed to editorial hues (keeps old views compiling)
    static let yengPurple = Color(red: 0xA5 / 255, green: 0x2C / 255, blue: 0x32 / 255)   // concert red
    static let yengPurpleDeep = Color(red: 0x74 / 255, green: 0x1E / 255, blue: 0x27 / 255) // burgundy
    static let yengMagenta = Color(red: 0xD4 / 255, green: 0x9A / 255, blue: 0x24 / 255)   // antique gold
    static let yengRed = Color(red: 0xA5 / 255, green: 0x2C / 255, blue: 0x32 / 255)       // concert red
    static let yengInk = Color(red: 0x19 / 255, green: 0x17 / 255, blue: 0x16 / 255)       // ink
    static let yengMist = Color(red: 0xFB / 255, green: 0xF8 / 255, blue: 0xF2 / 255)      // paper soft

    // New editorial-semantic tokens
    static let yengPaper = Color(red: 0xF3 / 255, green: 0xEE / 255, blue: 0xE5 / 255)
    static let yengPaperSoft = Color(red: 0xFB / 255, green: 0xF8 / 255, blue: 0xF2 / 255)
    static let yengInkSoft = Color(red: 0x2A / 255, green: 0x26 / 255, blue: 0x24 / 255)
    static let yengMuted = Color(red: 0x62 / 255, green: 0x5B / 255, blue: 0x55 / 255)
    static let yengHairline = Color(red: 0xCF / 255, green: 0xC3 / 255, blue: 0xB4 / 255)
    static let yengConcertRed = Color(red: 0xA5 / 255, green: 0x2C / 255, blue: 0x32 / 255)
    static let yengBurgundy = Color(red: 0x74 / 255, green: 0x1E / 255, blue: 0x27 / 255)
}

/// Signature warm editorial gradient — burgundy → concert red → gold. Reads like
/// a stage-lit concert poster while staying inside the Songbook palette.
private let yengGradient = LinearGradient(
    colors: [.yengBurgundy, .yengConcertRed, .yengMagenta],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
)

/// Full-bleed dark editorial backdrop: deep ink washed with burgundy + a warm
/// gold corner glow so it reads with depth instead of a flat wash. Used as the
/// widget container background so it fills edge-to-edge (no black system frame).
private struct YengBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [.yengInk, .yengBurgundy],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
            RadialGradient(
                colors: [Color.yengMagenta.opacity(0.42), Color.clear],
                center: .topTrailing, startRadius: 8, endRadius: 240
            )
            RadialGradient(
                colors: [Color.yengConcertRed.opacity(0.38), Color.clear],
                center: .init(x: 0.12, y: 0.85), startRadius: 6, endRadius: 210
            )
            RadialGradient(
                colors: [Color.white.opacity(0.10), Color.clear],
                center: .init(x: 0.15, y: 0.1), startRadius: 2, endRadius: 150
            )
            .blendMode(.softLight)
        }
    }
}

/// Light paper backdrop with subtle warm tints in the corners — keeps the airy
/// Songbook look while adding enough color to not feel plain. Fills edge-to-edge.
private struct YengLightBackdrop: View {
    var body: some View {
        ZStack {
            Color.yengPaper
            RadialGradient(
                colors: [Color.yengMagenta.opacity(0.16), Color.clear],
                center: .topTrailing, startRadius: 4, endRadius: 210
            )
            RadialGradient(
                colors: [Color.yengConcertRed.opacity(0.10), Color.clear],
                center: .bottomLeading, startRadius: 4, endRadius: 190
            )
        }
    }
}

/// Concentric-ring "vinyl record" artwork — far more characterful than a flat
/// music-note tile. A dark ink record with a warm gold label. Sized by the caller.
private struct VinylArtwork: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(LinearGradient(colors: [.yengInk, .yengBurgundy],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
            RadialGradient(
                colors: [Color.yengConcertRed.opacity(0.35), Color.clear],
                center: .topLeading, startRadius: 1, endRadius: 90
            )
            Circle().stroke(Color.white.opacity(0.16), lineWidth: 2).padding(9)
            Circle().stroke(Color.white.opacity(0.10), lineWidth: 1.5).padding(19)
            Circle().fill(Color.yengMagenta).frame(width: 15, height: 15)
            Circle().fill(Color.yengInk).frame(width: 5, height: 5)
        }
    }
}

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
        Group {
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
            widgetContainer(background: { YengBackdrop() }) { ShowWidgetView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=events.html"))
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
        Group {
            switch family {
            case .systemSmall: small
            case .systemLarge: large
            default: medium
            }
        }
    }

    private var artwork: some View { VinylArtwork() }

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
            widgetContainer(background: { YengLightBackdrop() }) { SongWidgetView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=music.html"))
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
        Group {
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
            widgetContainer(background: { YengBackdrop() }) { TierWidgetView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=membership.html"))
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
        Group {
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
                    Rectangle().fill(Color.yengInk.opacity(0.1)).frame(width: 1)
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
            widgetContainer(background: { YengLightBackdrop() }) { OrdersWidgetView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=profile.html%23orders"))
        }
        .configurationDisplayName("Merch Orders")
        .description("Track your past Yeng merch orders.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - 5. MY CARDS
// =====================================================================
//
// Shows the fan's collectible Yeng cards. A home-screen widget renders a
// static SwiftUI snapshot, so it can't embed the interactive HTML flip card
// from /cards/*.html — instead it paints a premium holographic mini-card that
// mirrors the real card's look (gold frame, holo sheen, rarity, number) and
// deep-links into the profile "My Cards" tab where the real flip card lives.
//
// There is no card-ownership backend yet, so the collection is defined here as
// a small static list. Add entries as more cards are designed; the layouts
// already handle 1-card and multi-card collections + an empty state.

struct CardData {
    let title: String
    let subject: String
    let rarity: String
    let number: String
    let total: String
}

/// The fan's current collection. One designed card today; extend as needed.
private let yengCollection: [CardData] = [
    CardData(title: "Live in Pasay", subject: "Yeng Constantino",
             rarity: "Legendary", number: "1", total: "25")
]

extension Color {
    static let yengGold = Color(red: 0xD4 / 255, green: 0x9A / 255, blue: 0x24 / 255)      // antique gold
    static let yengGoldLight = Color(red: 0xF0 / 255, green: 0xCD / 255, blue: 0x79 / 255) // soft gold
}

struct CardsEntry: TimelineEntry {
    let date: Date
    let cards: [CardData]
}

struct CardsProvider: TimelineProvider {
    private var sample: CardsEntry { CardsEntry(date: Date(), cards: yengCollection) }

    func placeholder(in context: Context) -> CardsEntry { sample }
    func getSnapshot(in context: Context, completion: @escaping (CardsEntry) -> Void) {
        completion(sample)
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CardsEntry>) -> Void) {
        // Static collection for now — refresh occasionally so it stays fresh
        // once a live ownership feed is wired in.
        completion(Timeline(entries: [sample], policy: .after(YengAPI.nextRefresh)))
    }
}

/// Premium holographic mini-card. Scales all detail off `width` so it reads
/// crisply at small / medium / large sizes.
private struct HoloCardTile: View {
    let card: CardData
    let width: CGFloat

    private var height: CGFloat { width * 1.49 }   // matches the 408×608 real card

    var body: some View {
        let radius = width * 0.09
        ZStack {
            // Base brand gradient (fallback behind the photo)
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(colors: [.yengPurpleDeep, .yengPurple, .yengMagenta],
                                     startPoint: .top, endPoint: .bottom))

            // Real card photo — full-bleed, top-aligned (matches the .card-photo crop)
            Image("YengCardPhoto")
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: width, height: height, alignment: .top)
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))

            // Bottom scrim so the name/rarity text stays legible over the photo
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(
                    colors: [.clear, .clear, Color.yengPurpleDeep.opacity(0.35),
                             Color.yengPurpleDeep.opacity(0.85)],
                    startPoint: .top, endPoint: .bottom))

            // Holographic diagonal sheen
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(LinearGradient(
                    colors: [.clear, Color.white.opacity(0.28), .clear,
                             Color.yengMagenta.opacity(0.22), .clear,
                             Color.white.opacity(0.18), .clear],
                    startPoint: .topLeading, endPoint: .bottomTrailing))
                .blendMode(.softLight)
            // Corner glow
            RadialGradient(colors: [Color.white.opacity(0.28), .clear],
                           center: .topLeading, startRadius: 1, endRadius: width * 0.8)
                .blendMode(.softLight)

            // Gold inner frame
            RoundedRectangle(cornerRadius: radius * 0.8, style: .continuous)
                .stroke(LinearGradient(colors: [.yengGoldLight, .yengGold, .yengGoldLight],
                                       startPoint: .topLeading, endPoint: .bottomTrailing),
                        lineWidth: max(1.2, width * 0.012))
                .padding(width * 0.05)

            // Content
            VStack(spacing: 0) {
                // Top row: rarity + number
                HStack {
                    Text(card.rarity.uppercased())
                        .font(.system(size: width * 0.058, weight: .heavy)).tracking(width * 0.004)
                        .padding(.horizontal, width * 0.05).padding(.vertical, width * 0.022)
                        .background(LinearGradient(colors: [.yengMagenta, .yengRed],
                                                   startPoint: .leading, endPoint: .trailing))
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                    Spacer(minLength: 0)
                    Text("#\(card.number)/\(card.total)")
                        .font(.system(size: width * 0.06, weight: .bold, design: .rounded))
                        .foregroundColor(.yengGoldLight)
                }
                Spacer(minLength: 0)

                // Name block (overlaid on the photo, over the bottom scrim)
                VStack(spacing: width * 0.012) {
                    Text(card.title)
                        .font(.system(size: width * 0.088, weight: .bold, design: .serif))
                        .foregroundColor(.white)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .shadow(color: .black.opacity(0.6), radius: width * 0.02)
                    Text(card.subject.uppercased())
                        .font(.system(size: width * 0.05, weight: .semibold)).tracking(width * 0.006)
                        .foregroundColor(.white.opacity(0.9))
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .shadow(color: .black.opacity(0.6), radius: width * 0.02)
                }
            }
            .padding(width * 0.11)
        }
        .frame(width: width, height: height)
        .shadow(color: .yengPurpleDeep.opacity(0.5), radius: width * 0.06, x: 0, y: width * 0.03)
    }
}

struct CardsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: CardsEntry

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "sparkles").font(.system(size: 9))
            Text("MY CARDS").font(.system(size: 10, weight: .bold)).tracking(1.3)
        }
        .foregroundColor(.white.opacity(0.9))
    }

    var body: some View {
        if entry.cards.isEmpty { empty }
        else {
            switch family {
            case .systemSmall: small
            case .systemLarge: large
            default: medium
            }
        }
    }

    // Small: a single card sized to fill the widget as large as it can while
    // keeping the full 408×608 aspect (never overflow / clip the small tile).
    private var small: some View {
        GeometryReader { geo in
            let w = min(geo.size.width, geo.size.height / 1.49)
            HoloCardTile(card: entry.cards[0], width: w)
                .frame(width: geo.size.width, height: geo.size.height)
        }
    }

    // Medium: card on the left, collection info on the right.
    private var medium: some View {
        HStack(spacing: 16) {
            HoloCardTile(card: entry.cards[0], width: 96)
            VStack(alignment: .leading, spacing: 7) {
                eyebrow
                Text(entry.cards[0].title)
                    .font(.system(size: 20, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                    .lineLimit(2).minimumScaleFactor(0.8)
                Text(entry.cards[0].subject)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.8))
                HStack(spacing: 6) {
                    Text(entry.cards[0].rarity.uppercased())
                        .font(.system(size: 9, weight: .bold)).tracking(0.5)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color.white.opacity(0.18))
                        .foregroundColor(.yengGoldLight)
                        .clipShape(Capsule())
                    Text("#\(entry.cards[0].number)/\(entry.cards[0].total)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(.white.opacity(0.85))
                }
                Spacer(minLength: 0)
                Text(collectionLine).font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white.opacity(0.75))
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // Large: hero card + header + tap hint.
    private var large: some View {
        VStack(spacing: 14) {
            HStack {
                eyebrow
                Spacer()
                Text(collectionLine)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white.opacity(0.85))
            }
            HoloCardTile(card: entry.cards[0], width: 180)
            VStack(spacing: 2) {
                Text(entry.cards[0].title)
                    .font(.system(size: 22, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                Text("Tap to flip your card")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.yengGoldLight)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var collectionLine: String {
        let n = entry.cards.count
        return n == 1 ? "1 card" : "\(n) cards"
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "sparkles.rectangle.stack")
                .font(.system(size: 30)).foregroundColor(.yengGoldLight)
            Text("No cards yet")
                .font(.system(size: 15, weight: .bold, design: .serif))
                .foregroundColor(.white)
            Text("Your Yeng cards appear here")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.75))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct MyCardsWidget: Widget {
    let kind = "YengMyCards"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CardsProvider()) { entry in
            widgetContainer(background: { YengBackdrop() }) { CardsWidgetView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=profile.html%23cards"))
        }
        .configurationDisplayName("My Cards")
        .description("Show off your collectible Yeng cards.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - Container (handles iOS 17 contentMarginsDisabled / older)
// =====================================================================

@ViewBuilder
func widgetContainer<Background: View, Content: View>(
    @ViewBuilder background: () -> Background,
    @ViewBuilder content: () -> Content
) -> some View {
    if #available(iOS 17.0, *) {
        // Register the brand background as the widget's container background so
        // it paints the FULL widget (including the content margins) — this is
        // what removes the black system frame around the widget.
        content().containerBackground(for: .widget) { background() }
    } else {
        ZStack {
            background()
            content()
        }
    }
}

// =====================================================================
// MARK: - 6. ADMIN DASHBOARD (admin-only)
// =====================================================================
//
// A substantial control-room widget for staff. It mirrors the key numbers
// from the web /admin dashboard so an admin can glance at the health of the
// whole operation from the home screen: members, revenue, orders, the
// moderation queue, and the tier mix. For everyone else (the vast majority
// of fans) it shows a tasteful "Admin only" locked state and never fetches
// or reveals any figures — the client gate here matches the server, which
// also returns 403 for non-admins.

// MARK: Admin API models

private struct AdminStatsResponse: Decodable {
    let stats: AdminStats
    let recentSignups: [AdminSignup]?
}

private struct AdminStats: Decodable {
    let totalUsers: Int
    let newUsersThisMonth: Int
    let membershipBreakdown: MembershipBreakdown
    let totalOrders: Int
    let totalRevenue: Double
    let pendingOrders: Int
    let pendingPosts: Int
    let pendingCovers: Int
    let activeEvents: Int
    let pendingTickets: Int
    let pendingMessages: Int
    let storeCreditOutstanding: Double
}

/// The tier keys carry spaces on the server ("Sariwang Simula" etc.) so we
/// map them explicitly.
private struct MembershipBreakdown: Decodable {
    let free: Int
    let sariwangSimula: Int
    let lagingNandito: Int
    let ikawLamang: Int

    enum CodingKeys: String, CodingKey {
        case free = "Free"
        case sariwangSimula = "Sariwang Simula"
        case lagingNandito = "Laging Nandito"
        case ikawLamang = "Ikaw Lamang"
    }
}

private struct AdminSignup: Decodable {
    let name: String?
    let membershipTier: String?
}

// MARK: Admin timeline

struct AdminEntry: TimelineEntry {
    let date: Date
    let isAdmin: Bool
    let hasData: Bool
    let stats: AdminStatsFlat
    let recentSignups: [AdminSignupFlat]
}

/// Flat, non-optional value type the views render from (keeps the SwiftUI
/// bodies clean and lets the sample/fallback share one shape).
struct AdminStatsFlat {
    var totalUsers = 0
    var newUsersThisMonth = 0
    var tierFree = 0
    var tierSariwang = 0
    var tierLaging = 0
    var tierIkaw = 0
    var totalOrders = 0
    var totalRevenue: Double = 0
    var pendingOrders = 0
    var pendingPosts = 0
    var pendingCovers = 0
    var activeEvents = 0
    var pendingTickets = 0
    var pendingMessages = 0
    var storeCreditOutstanding: Double = 0

    /// Everything waiting on a human — the moderation/attention queue.
    var attentionTotal: Int {
        pendingOrders + pendingPosts + pendingCovers + pendingTickets + pendingMessages
    }
}

struct AdminSignupFlat: Identifiable {
    let id = UUID()
    let name: String
    let tier: String
}

struct AdminProvider: TimelineProvider {
    private var sample: AdminEntry {
        var s = AdminStatsFlat()
        s.totalUsers = 1284; s.newUsersThisMonth = 96
        s.tierFree = 910; s.tierSariwang = 214; s.tierLaging = 118; s.tierIkaw = 42
        s.totalOrders = 372; s.totalRevenue = 486_500; s.pendingOrders = 7
        s.pendingPosts = 4; s.pendingCovers = 3; s.activeEvents = 2
        s.pendingTickets = 5; s.pendingMessages = 6; s.storeCreditOutstanding = 12_400
        return AdminEntry(
            date: Date(), isAdmin: true, hasData: true, stats: s,
            recentSignups: [
                AdminSignupFlat(name: "Maria Santos", tier: "Ikaw Lamang"),
                AdminSignupFlat(name: "Josh Reyes", tier: "Laging Nandito"),
                AdminSignupFlat(name: "Ана Cruz", tier: "Sariwang Simula")
            ]
        )
    }

    private var locked: AdminEntry {
        AdminEntry(date: Date(), isAdmin: false, hasData: false,
                   stats: AdminStatsFlat(), recentSignups: [])
    }

    private var emptyAdmin: AdminEntry {
        AdminEntry(date: Date(), isAdmin: true, hasData: false,
                   stats: AdminStatsFlat(), recentSignups: [])
    }

    func placeholder(in context: Context) -> AdminEntry { sample }

    func getSnapshot(in context: Context, completion: @escaping (AdminEntry) -> Void) {
        // The gallery/preview should look populated; live snapshot respects the gate.
        if context.isPreview { completion(sample); return }
        completion(YengShared.isAdmin ? sample : locked)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AdminEntry>) -> Void) {
        guard YengShared.isAdmin else {
            completion(Timeline(entries: [locked], policy: .after(YengAPI.nextRefresh)))
            return
        }
        YengAPI.fetch("/.netlify/functions/get-admin-stats", authed: true, as: AdminStatsResponse.self) { response in
            guard let r = response else {
                completion(Timeline(entries: [emptyAdmin], policy: .after(YengAPI.nextRefresh)))
                return
            }
            var s = AdminStatsFlat()
            let a = r.stats
            s.totalUsers = a.totalUsers
            s.newUsersThisMonth = a.newUsersThisMonth
            s.tierFree = a.membershipBreakdown.free
            s.tierSariwang = a.membershipBreakdown.sariwangSimula
            s.tierLaging = a.membershipBreakdown.lagingNandito
            s.tierIkaw = a.membershipBreakdown.ikawLamang
            s.totalOrders = a.totalOrders
            s.totalRevenue = a.totalRevenue
            s.pendingOrders = a.pendingOrders
            s.pendingPosts = a.pendingPosts
            s.pendingCovers = a.pendingCovers
            s.activeEvents = a.activeEvents
            s.pendingTickets = a.pendingTickets
            s.pendingMessages = a.pendingMessages
            s.storeCreditOutstanding = a.storeCreditOutstanding

            let signups = (r.recentSignups ?? []).prefix(4).map {
                AdminSignupFlat(name: $0.name ?? "New fan", tier: $0.membershipTier ?? "Free")
            }
            let entry = AdminEntry(date: Date(), isAdmin: true, hasData: true,
                                   stats: s, recentSignups: Array(signups))
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

// MARK: Admin views

/// Compact "big number" stat cell used across the medium/large layouts.
private struct AdminStat: View {
    let value: String
    let label: String
    var accent: Color = .white
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .serif))
                .foregroundColor(accent)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold)).tracking(0.8)
                .foregroundColor(.white.opacity(0.7))
                .lineLimit(1).minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A small pill showing a pending count for one queue — dimmed to zero when clear.
private struct AdminChip: View {
    let icon: String
    let count: Int
    let label: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon).font(.system(size: 9, weight: .bold))
            Text("\(count)").font(.system(size: 11, weight: .bold))
            Text(label).font(.system(size: 9, weight: .medium)).opacity(0.85)
        }
        .foregroundColor(count > 0 ? .white : .white.opacity(0.5))
        .padding(.horizontal, 7).padding(.vertical, 4)
        .background(
            Capsule().fill(count > 0 ? Color.yengMagenta.opacity(0.32) : Color.white.opacity(0.08))
        )
        .overlay(
            Capsule().stroke(count > 0 ? Color.yengGoldLight.opacity(0.6) : Color.white.opacity(0.12), lineWidth: 1)
        )
    }
}

/// One horizontal tier bar for the membership mix breakdown.
private struct AdminTierBar: View {
    let label: String
    let count: Int
    let total: Int
    let color: Color
    private var fraction: CGFloat {
        total > 0 ? CGFloat(count) / CGFloat(total) : 0
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label).font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.85))
                Spacer()
                Text("\(count)").font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.12))
                    Capsule().fill(color)
                        .frame(width: max(3, geo.size.width * fraction))
                }
            }
            .frame(height: 5)
        }
    }
}

struct AdminDashboardView: View {
    @Environment(\.widgetFamily) var family
    let entry: AdminEntry

    var body: some View {
        Group {
            if !entry.isAdmin {
                locked
            } else if !entry.hasData {
                unavailable
            } else {
                switch family {
                case .systemSmall: small
                case .systemLarge: large
                default: medium
                }
            }
        }
    }

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "chart.bar.xaxis")
            Text("ADMIN DESK").font(.system(size: 10, weight: .bold)).tracking(1.6)
            Spacer(minLength: 0)
        }
        .foregroundColor(.yengGoldLight)
    }

    private var s: AdminStatsFlat { entry.stats }

    // Small: the two numbers a manager checks most — members + what needs attention.
    private var small: some View {
        VStack(alignment: .leading, spacing: 8) {
            eyebrow
            Spacer(minLength: 0)
            Text("\(s.totalUsers)")
                .font(.system(size: 34, weight: .bold, design: .serif))
                .foregroundColor(.white)
                .lineLimit(1).minimumScaleFactor(0.6)
            Text("members · +\(s.newUsersThisMonth) this mo")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.white.opacity(0.8))
                .lineLimit(1).minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            HStack(spacing: 5) {
                Image(systemName: s.attentionTotal > 0 ? "bell.badge.fill" : "checkmark.circle.fill")
                Text(s.attentionTotal > 0 ? "\(s.attentionTotal) need action" : "All clear")
                    .font(.system(size: 11, weight: .bold))
            }
            .foregroundColor(s.attentionTotal > 0 ? .yengGoldLight : .white.opacity(0.85))
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // Medium: three headline stats + the moderation queue chips.
    private var medium: some View {
        VStack(alignment: .leading, spacing: 10) {
            eyebrow
            HStack(spacing: 12) {
                AdminStat(value: peso(s.totalRevenue), label: "Revenue", accent: .yengGoldLight)
                AdminStat(value: "\(s.totalUsers)", label: "Members")
                AdminStat(value: "\(s.totalOrders)", label: "Orders")
            }
            Spacer(minLength: 0)
            queueChips
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    // Large: the full control room.
    private var large: some View {
        VStack(alignment: .leading, spacing: 12) {
            eyebrow
            HStack(spacing: 12) {
                AdminStat(value: peso(s.totalRevenue), label: "Revenue", accent: .yengGoldLight)
                AdminStat(value: "\(s.totalUsers)", label: "Members")
                AdminStat(value: "\(s.totalOrders)", label: "Orders")
            }

            Divider().overlay(Color.white.opacity(0.18))

            // Membership mix
            VStack(alignment: .leading, spacing: 6) {
                sectionLabel("MEMBERSHIP MIX")
                AdminTierBar(label: "Free", count: s.tierFree, total: s.totalUsers, color: .white.opacity(0.55))
                AdminTierBar(label: "Sariwang Simula", count: s.tierSariwang, total: s.totalUsers, color: .yengConcertRed)
                AdminTierBar(label: "Laging Nandito", count: s.tierLaging, total: s.totalUsers, color: .yengMagenta)
                AdminTierBar(label: "Ikaw Lamang", count: s.tierIkaw, total: s.totalUsers, color: .yengGoldLight)
            }

            Divider().overlay(Color.white.opacity(0.18))

            // Moderation queue
            VStack(alignment: .leading, spacing: 6) {
                sectionLabel("NEEDS ATTENTION")
                queueChips
            }

            Spacer(minLength: 0)

            HStack(spacing: 12) {
                Label("\(s.activeEvents) live events", systemImage: "music.mic")
                Label("\(peso(s.storeCreditOutstanding)) credit out", systemImage: "creditcard")
            }
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white.opacity(0.75))
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text).font(.system(size: 9, weight: .bold)).tracking(1.2)
            .foregroundColor(.white.opacity(0.55))
    }

    private var queueChips: some View {
        // Wrap chips onto two rows so they never clip on the medium family.
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                AdminChip(icon: "shippingbox.fill", count: s.pendingOrders, label: "orders")
                AdminChip(icon: "ticket.fill", count: s.pendingTickets, label: "tickets")
                AdminChip(icon: "envelope.fill", count: s.pendingMessages, label: "msgs")
            }
            HStack(spacing: 6) {
                AdminChip(icon: "text.bubble.fill", count: s.pendingPosts, label: "posts")
                AdminChip(icon: "music.note", count: s.pendingCovers, label: "covers")
                Spacer(minLength: 0)
            }
        }
    }

    // Non-admins: never fetches, never shows numbers.
    private var locked: some View {
        VStack(spacing: 10) {
            Image(systemName: "lock.shield.fill").font(.system(size: 30))
                .foregroundColor(.yengGoldLight)
            Text("Admin only")
                .font(.system(size: 15, weight: .bold, design: .serif))
                .foregroundColor(.white)
            Text("Staff dashboard")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // Admin, but the fetch failed / nothing to show yet.
    private var unavailable: some View {
        VStack(spacing: 8) {
            eyebrow
            Spacer(minLength: 0)
            Image(systemName: "wifi.exclamationmark").font(.system(size: 26))
                .foregroundColor(.white.opacity(0.8))
            Text("Stats unavailable")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
            Text("Pull to refresh soon")
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.65))
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct AdminDashboardWidget: Widget {
    let kind = "YengAdminDashboard"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AdminProvider()) { entry in
            widgetContainer(background: { YengBackdrop() }) { AdminDashboardView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=admin.html"))
        }
        .configurationDisplayName("Admin Dashboard")
        .description("Staff-only: members, revenue, orders and the moderation queue at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// =====================================================================
// MARK: - 7. LOCK SCREEN ACCESSORY WIDGETS
//
// Glanceable next-show info for the iOS Lock Screen (and Apple Watch
// complication surfaces). These render in a monochrome / tinted mode,
// so we avoid brand colors and lean on shapes, SF Symbols, and text.
// Reuses ShowProvider / ShowEntry (the same next-show data as the home
// screen NextShow widget).
// =====================================================================

/// Whole days from now until the show (clamped at 0). Nil when unknown.
private func daysUntil(_ date: Date?) -> Int? {
    guard let date = date else { return nil }
    let start = Calendar.current.startOfDay(for: Date())
    let end = Calendar.current.startOfDay(for: date)
    let comps = Calendar.current.dateComponents([.day], from: start, to: end)
    guard let d = comps.day else { return nil }
    return max(0, d)
}

/// Short human phrase for the countdown, e.g. "in 12 days", "Tonight".
private func countdownPhrase(_ date: Date?) -> String {
    guard let days = daysUntil(date) else { return "Soon" }
    switch days {
    case 0: return "Tonight"
    case 1: return "Tomorrow"
    default: return "in \(days) days"
    }
}

struct AccessoryShowView: View {
    @Environment(\.widgetFamily) var family
    let entry: ShowEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            circular
        case .accessoryRectangular:
            rectangular
        case .accessoryInline:
            inline
        default:
            rectangular
        }
    }

    // Circular: big day count in a gauge-style ring, "days" beneath.
    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let days = daysUntil(entry.showDate) {
                Gauge(value: gaugeFraction(days), in: 0...1) {
                    Image(systemName: "music.mic")
                } currentValueLabel: {
                    Text("\(days)")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                }
                .gaugeStyle(.accessoryCircularCapacity)
            } else {
                VStack(spacing: 1) {
                    Image(systemName: "music.mic")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Show")
                        .font(.system(size: 9, weight: .semibold))
                }
            }
        }
        .widgetAccentable()
        .widgetURL(URL(string: "yengapp://open?page=events.html"))
    }

    // Rectangular: title + venue + relative countdown, three tight lines.
    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "music.mic")
                    .font(.system(size: 11, weight: .bold))
                Text("NEXT SHOW")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.5)
            }
            .widgetAccentable()
            Text(entry.title)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
            Text("\(entry.venue) • \(countdownPhrase(entry.showDate))")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "yengapp://open?page=events.html"))
    }

    // Inline: single line above the clock, e.g. "Yeng Live in Manila in 12 days".
    private var inline: some View {
        Label {
            Text("\(entry.title) \(countdownPhrase(entry.showDate))")
        } icon: {
            Image(systemName: "music.mic")
        }
        .widgetURL(URL(string: "yengapp://open?page=events.html"))
    }

    // Fill the ring more as the show approaches (30-day horizon).
    private func gaugeFraction(_ days: Int) -> Double {
        let horizon = 30.0
        let remaining = Double(days)
        return max(0.02, min(1.0, (horizon - remaining) / horizon))
    }
}

struct NextShowLockWidget: Widget {
    let kind = "YengNextShowLock"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShowProvider()) { entry in
            AccessoryShowView(entry: entry)
        }
        .configurationDisplayName("Next Show")
        .description("Countdown to Yeng's next concert on your Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// ---------------------------------------------------------------------
// Lock Screen: Fan Tier badge (rectangular + inline). Reuses TierProvider.
// ---------------------------------------------------------------------

struct AccessoryTierView: View {
    @Environment(\.widgetFamily) var family
    let entry: TierEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Label {
                Text(entry.loggedIn ? entry.tier : "Join the fam")
            } icon: {
                Image(systemName: "heart.fill")
            }
            .widgetURL(URL(string: "yengapp://open?page=membership.html"))
        default:
            rectangular
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 11, weight: .bold))
                Text("FAN TIER")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.5)
            }
            .widgetAccentable()
            Text(entry.loggedIn ? entry.tier : "Not a member yet")
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
            Text(entry.loggedIn ? "Tap to view perks" : "Tap to join")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "yengapp://open?page=membership.html"))
    }
}

struct FanTierLockWidget: Widget {
    let kind = "YengFanTierLock"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TierProvider()) { entry in
            AccessoryTierView(entry: entry)
        }
        .configurationDisplayName("Fan Tier")
        .description("Your Yeng membership tier on the Lock Screen.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline])
    }
}

// =====================================================================
// MARK: - 8. INTERACTIVE WIDGETS (AppIntents, iOS 17+)
//
// Tap a button directly on the widget — no app launch required. The
// button runs an AppIntent whose perform() flips a boolean flag in the
// shared App Group, then WidgetKit reloads just that widget's timeline
// so the UI updates in place. The web layer picks up the flag on next
// launch (a "pending" marker tells native-bridge to sync it to the
// backend), so a tap here becomes a real RSVP / favorite once the fan
// opens the app.
//
// Because AppIntents + Button(intent:) are iOS 17+, every symbol here is
// gated with @available and the widgets are registered in the bundle
// behind `if #available(iOS 17.0, *)`.
// =====================================================================

/// Read/write the interactive flags in the shared App Group. Mirrors the
/// `CapacitorStorage.` key convention the web layer + WidgetBridge use, so
/// the same UserDefaults suite is the single source of truth.
enum YengWidgetState {
    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: YengShared.suiteName)
    }
    private static let prefix = "CapacitorStorage."

    // Flag keys (booleans stored as "true"/"false" strings to match the
    // string-based CapacitorStorage values the web layer reads).
    private static let showRSVPKey = "yc_widget_show_rsvp"
    private static let songLikedKey = "yc_widget_song_liked"
    // Pending markers: set when the fan toggled from the widget so the app
    // knows to push the change to the backend on next launch.
    private static let showRSVPPendingKey = "yc_widget_show_rsvp_pending"
    private static let songLikedPendingKey = "yc_widget_song_liked_pending"

    private static func readBool(_ key: String) -> Bool {
        defaults?.string(forKey: prefix + key) == "true"
    }
    private static func writeBool(_ key: String, _ value: Bool) {
        defaults?.set(value ? "true" : "false", forKey: prefix + key)
    }

    static var showRSVP: Bool { readBool(showRSVPKey) }
    static var songLiked: Bool { readBool(songLikedKey) }

    /// Toggle the show-RSVP flag, mark it pending, return the new value.
    @discardableResult
    static func toggleShowRSVP() -> Bool {
        let next = !showRSVP
        writeBool(showRSVPKey, next)
        writeBool(showRSVPPendingKey, true)
        return next
    }

    /// Toggle the song-like flag, mark it pending, return the new value.
    @discardableResult
    static func toggleSongLike() -> Bool {
        let next = !songLiked
        writeBool(songLikedKey, next)
        writeBool(songLikedPendingKey, true)
        return next
    }

    /// Set the show-RSVP flag directly (used by the Control Center toggle, which
    /// hands us the desired on/off value rather than a plain toggle). Marks it
    /// pending so the app reconciles with the backend on next launch.
    static func setShowRSVP(_ value: Bool) {
        writeBool(showRSVPKey, value)
        writeBool(showRSVPPendingKey, true)
    }

    /// Set the song-like flag directly (Control Center toggle counterpart).
    static func setSongLiked(_ value: Bool) {
        writeBool(songLikedKey, value)
        writeBool(songLikedPendingKey, true)
    }

    // Control Center buttons can't carry a widgetURL, so when the fan taps one
    // we stash the destination page here and open the app; AppDelegate reads
    // this on activation and fires the matching yengapp:// deep link.
    private static let pendingControlPageKey = "yc_widget_pending_page"
    static func setPendingControlPage(_ page: String) {
        defaults?.set(page, forKey: prefix + pendingControlPageKey)
    }
}

// MARK: Intents

@available(iOS 17.0, *)
struct ToggleShowRSVPIntent: AppIntent {
    static var title: LocalizedStringResource = "RSVP to Yeng's next show"
    static var description = IntentDescription("Mark that you're going to the next show.")

    func perform() async throws -> some IntentResult {
        YengWidgetState.toggleShowRSVP()
        return .result()
    }
}

@available(iOS 17.0, *)
struct ToggleSongLikeIntent: AppIntent {
    static var title: LocalizedStringResource = "Like Yeng's featured song"
    static var description = IntentDescription("Add the featured track to your favorites.")

    func perform() async throws -> some IntentResult {
        YengWidgetState.toggleSongLike()
        return .result()
    }
}

// MARK: Interactive Next-Show (tap to RSVP)

struct RSVPShowEntry: TimelineEntry {
    let date: Date
    let title: String
    let venue: String
    let showDate: Date?
    let rsvped: Bool
    let isFallback: Bool
}

struct InteractiveShowProvider: TimelineProvider {
    private func fallback(rsvped: Bool) -> RSVPShowEntry {
        RSVPShowEntry(
            date: Date(),
            title: "Yeng Live in Manila",
            venue: "Araneta Coliseum",
            showDate: Calendar.current.date(byAdding: .day, value: 28, to: Date()),
            rsvped: rsvped,
            isFallback: true
        )
    }

    func placeholder(in context: Context) -> RSVPShowEntry { fallback(rsvped: false) }

    func getSnapshot(in context: Context, completion: @escaping (RSVPShowEntry) -> Void) {
        completion(fallback(rsvped: YengWidgetState.showRSVP))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RSVPShowEntry>) -> Void) {
        let rsvped = YengWidgetState.showRSVP
        YengAPI.fetch("/.netlify/functions/get-events?upcoming=true&limit=1", as: EventsResponse.self) { response in
            var entry = fallback(rsvped: rsvped)
            if let event = response?.events.first {
                entry = RSVPShowEntry(
                    date: Date(),
                    title: event.title ?? entry.title,
                    venue: [event.venue, event.city].compactMap { $0 }.joined(separator: ", "),
                    showDate: parseISO(event.date),
                    rsvped: rsvped,
                    isFallback: false
                )
            }
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

@available(iOS 17.0, *)
struct InteractiveShowView: View {
    @Environment(\.widgetFamily) var family
    let entry: RSVPShowEntry

    private var days: Int? { daysUntil(entry.showDate) }

    private var countdown: String {
        guard let days = days else { return "Soon" }
        switch days {
        case 0: return "Tonight"
        case 1: return "Tomorrow"
        default: return "in \(days) days"
        }
    }

    private var header: some View {
        HStack(spacing: 5) {
            Image(systemName: "music.mic")
            Text("NEXT SHOW").font(.system(size: 10, weight: .bold)).tracking(1.5)
        }
        .foregroundColor(.white.opacity(0.85))
    }

    private var rsvpButton: some View {
        Button(intent: ToggleShowRSVPIntent()) {
            HStack(spacing: 6) {
                Image(systemName: entry.rsvped ? "checkmark.circle.fill" : "star.circle")
                    .font(.system(size: 15, weight: .semibold))
                Text(entry.rsvped ? "Going" : "RSVP")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(entry.rsvped ? .yengInk : .white)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(entry.rsvped ? Color.yengMagenta : Color.white.opacity(0.18))
            )
            .overlay(
                Capsule().stroke(Color.white.opacity(entry.rsvped ? 0 : 0.35), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    var body: some View {
        Group {
            switch family {
            case .systemLarge: large
            default: medium
            }
        }
        .foregroundColor(.white)
    }

    private var medium: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                header
                Text(entry.title)
                    .font(.system(size: 20, weight: .bold, design: .serif))
                    .lineLimit(2).minimumScaleFactor(0.8)
                Text(entry.venue)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.75))
                    .lineLimit(1)
                Text(countdown)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.yengMagenta)
                Spacer(minLength: 0)
                rsvpButton
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            Spacer(minLength: 0)
            Text(entry.title)
                .font(.system(size: 28, weight: .bold, design: .serif))
                .lineLimit(3).minimumScaleFactor(0.7)
            Text(entry.venue)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white.opacity(0.75))
                .lineLimit(2)
            HStack(spacing: 6) {
                Image(systemName: "calendar")
                Text(countdown)
            }
            .font(.system(size: 14, weight: .bold))
            .foregroundColor(.yengMagenta)
            Spacer(minLength: 0)
            rsvpButton
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

@available(iOS 17.0, *)
struct NextShowRSVPWidget: Widget {
    let kind = "YengNextShowRSVP"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: InteractiveShowProvider()) { entry in
            widgetContainer(background: { YengBackdrop() }) { InteractiveShowView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=events.html"))
        }
        .configurationDisplayName("Next Show — RSVP")
        .description("Tap to RSVP to Yeng's next concert right from the widget.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: Interactive Featured Song (tap to like)

struct LikeSongEntry: TimelineEntry {
    let date: Date
    let title: String
    let subtitle: String
    let year: String
    let liked: Bool
    let isFallback: Bool
}

struct InteractiveSongProvider: TimelineProvider {
    private func fallback(liked: Bool) -> LikeSongEntry {
        LikeSongEntry(date: Date(), title: "Ikaw", subtitle: "Original", year: "2015",
                      liked: liked, isFallback: true)
    }

    func placeholder(in context: Context) -> LikeSongEntry { fallback(liked: false) }

    func getSnapshot(in context: Context, completion: @escaping (LikeSongEntry) -> Void) {
        completion(fallback(liked: YengWidgetState.songLiked))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LikeSongEntry>) -> Void) {
        let liked = YengWidgetState.songLiked
        YengAPI.fetch("/.netlify/functions/get-music-content?featured=true&limit=1&sort=newest",
                      as: MusicResponse.self) { response in
            var entry = fallback(liked: liked)
            if let song = response?.content.first {
                let subtitle = song.category ?? song.era ?? "Featured"
                entry = LikeSongEntry(
                    date: Date(),
                    title: song.title ?? entry.title,
                    subtitle: subtitle,
                    year: song.year.map(String.init) ?? "",
                    liked: liked,
                    isFallback: false
                )
            }
            completion(Timeline(entries: [entry], policy: .after(YengAPI.nextRefresh)))
        }
    }
}

@available(iOS 17.0, *)
struct InteractiveSongView: View {
    @Environment(\.widgetFamily) var family
    let entry: LikeSongEntry

    private var eyebrow: some View {
        HStack(spacing: 5) {
            Image(systemName: "star.fill").font(.system(size: 9))
            Text("FEATURED TRACK").font(.system(size: 10, weight: .bold)).tracking(1.3)
        }
        .foregroundColor(.yengPurple)
    }

    private var likeButton: some View {
        Button(intent: ToggleSongLikeIntent()) {
            HStack(spacing: 6) {
                Image(systemName: entry.liked ? "heart.fill" : "heart")
                    .font(.system(size: 15, weight: .semibold))
                Text(entry.liked ? "Liked" : "Like")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundColor(entry.liked ? .white : .yengInk)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(entry.liked ? Color.yengConcertRed : Color.yengInk.opacity(0.06))
            )
            .overlay(
                Capsule().stroke(Color.yengHairline.opacity(entry.liked ? 0 : 1), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    var body: some View {
        switch family {
        case .systemLarge: large
        default: medium
        }
    }

    private var medium: some View {
        HStack(spacing: 14) {
            VinylArtwork().frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 6) {
                eyebrow
                Text(entry.title)
                    .font(.system(size: 21, weight: .bold, design: .serif))
                    .foregroundColor(.yengInk)
                    .lineLimit(2).minimumScaleFactor(0.8)
                HStack(spacing: 8) {
                    Text(entry.subtitle)
                    if !entry.year.isEmpty { Text("•"); Text(entry.year) }
                }
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.yengInk.opacity(0.6))
                Spacer(minLength: 0)
                likeButton
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 14) {
            eyebrow
            VinylArtwork().frame(maxWidth: .infinity).frame(height: 140)
            Text(entry.title)
                .font(.system(size: 28, weight: .bold, design: .serif))
                .foregroundColor(.yengInk)
                .lineLimit(2).minimumScaleFactor(0.7)
            HStack(spacing: 10) {
                Text(entry.subtitle)
                if !entry.year.isEmpty { Text("•"); Text(entry.year) }
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(.yengInk.opacity(0.65))
            Spacer(minLength: 0)
            likeButton
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

@available(iOS 17.0, *)
struct FeaturedSongLikeWidget: Widget {
    let kind = "YengFeaturedSongLike"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: InteractiveSongProvider()) { entry in
            widgetContainer(background: { YengLightBackdrop() }) { InteractiveSongView(entry: entry) }
                .widgetURL(URL(string: "yengapp://open?page=music.html"))
        }
        .configurationDisplayName("Featured Song — Like")
        .description("Tap to add Yeng's featured track to your favorites.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - 9. LIVE ACTIVITIES (ActivityKit, iOS 16.1+)
//
// Two live, countdown-style experiences that ride on the Lock Screen and
// Dynamic Island: a Concert countdown and a Ticket Drop. The attribute types
// live in the shared file (YengLiveActivityAttributes.swift). The main app
// starts/updates/ends them via LiveActivityPlugin; here we only render.

@available(iOS 16.1, *)
private struct LiveActivityBackdrop: View {
    var body: some View {
        LinearGradient(
            colors: [Color.yengInk, Color.yengBurgundy],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: Concert Live Activity

@available(iOS 16.1, *)
private func concertAccent(_ phase: String) -> Color {
    switch phase {
    case "live":  return .yengConcertRed
    case "soon":  return .yengMagenta
    case "ended": return .yengMuted
    default:      return .yengMagenta
    }
}

@available(iOS 16.1, *)
struct ConcertLiveActivityView: View {
    let context: ActivityViewContext<ConcertActivityAttributes>

    private var phase: String { context.state.phase }
    private var accent: Color { concertAccent(phase) }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(accent.opacity(0.18))
                Image(systemName: phase == "live" ? "music.mic" : "music.note")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(accent)
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 3) {
                Text(context.attributes.title)
                    .font(.system(size: 17, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(context.attributes.venue)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                Text(context.state.statusLine)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(accent)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                if phase == "live" {
                    Text("LIVE")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(Color.yengConcertRed))
                } else if phase == "ended" {
                    Text("Salamat!")
                        .font(.system(size: 15, weight: .bold, design: .serif))
                        .foregroundColor(.white)
                } else {
                    Text(context.state.showDate, style: .timer)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 96)
                    Text("to showtime")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(LiveActivityBackdrop())
        .widgetURL(URL(string: "yengapp://open?page=events.html"))
    }
}

@available(iOS 16.1, *)
struct ConcertLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ConcertActivityAttributes.self) { context in
            ConcertLiveActivityView(context: context)
                .activityBackgroundTint(Color.yengInk)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let phase = context.state.phase
            let accent = concertAccent(phase)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: phase == "live" ? "music.mic" : "music.note")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if phase == "live" {
                        Text("LIVE")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.yengConcertRed)
                    } else if phase == "ended" {
                        Text("Salamat!")
                            .font(.system(size: 13, weight: .bold, design: .serif))
                            .foregroundColor(.white)
                    } else {
                        Text(context.state.showDate, style: .timer)
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .monospacedDigit()
                            .frame(maxWidth: 70)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 1) {
                        Text(context.attributes.title)
                            .font(.system(size: 14, weight: .bold, design: .serif))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Text(context.attributes.venue)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.65))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.statusLine)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(accent)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: phase == "live" ? "music.mic" : "music.note")
                    .foregroundColor(accent)
            } compactTrailing: {
                if phase == "live" {
                    Image(systemName: "waveform")
                        .foregroundColor(.yengConcertRed)
                } else if phase == "ended" {
                    Image(systemName: "checkmark")
                        .foregroundColor(accent)
                } else {
                    Text(context.state.showDate, style: .timer)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .frame(maxWidth: 44)
                }
            } minimal: {
                Image(systemName: phase == "live" ? "music.mic" : "music.note")
                    .foregroundColor(accent)
            }
            .keylineTint(accent)
            .widgetURL(URL(string: "yengapp://open?page=events.html"))
        }
    }
}

// MARK: Ticket Drop Live Activity

@available(iOS 16.1, *)
private func dropAccent(_ phase: String) -> Color {
    switch phase {
    case "live":    return .yengConcertRed
    case "soldout": return .yengMuted
    default:        return .yengMagenta
    }
}

@available(iOS 16.1, *)
struct TicketDropLiveActivityView: View {
    let context: ActivityViewContext<TicketDropActivityAttributes>

    private var phase: String { context.state.phase }
    private var accent: Color { dropAccent(phase) }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(accent.opacity(0.18))
                Image(systemName: phase == "soldout" ? "ticket" : "ticket.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(accent)
            }
            .frame(width: 46, height: 46)

            VStack(alignment: .leading, spacing: 3) {
                Text("TICKET DROP")
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1.5)
                    .foregroundColor(accent)
                Text(context.attributes.eventTitle)
                    .font(.system(size: 16, weight: .bold, design: .serif))
                    .foregroundColor(.white)
                    .lineLimit(1).minimumScaleFactor(0.7)
                Text(context.state.statusLine)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white.opacity(0.75))
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 2) {
                if phase == "soldout" {
                    Text("SOLD OUT")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundColor(.white)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Capsule().fill(Color.yengMuted))
                } else if phase == "live" && context.state.remaining >= 0 {
                    Text("\(context.state.remaining)")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                    Text("left")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                } else if phase == "live" {
                    Text("ON SALE")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundColor(.yengConcertRed)
                } else {
                    Text(context.state.dropDate, style: .timer)
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 96)
                    Text("to drop")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.6))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(LiveActivityBackdrop())
        .widgetURL(URL(string: "yengapp://open?page=events.html"))
    }
}

@available(iOS 16.1, *)
struct TicketDropLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TicketDropActivityAttributes.self) { context in
            TicketDropLiveActivityView(context: context)
                .activityBackgroundTint(Color.yengInk)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let phase = context.state.phase
            let accent = dropAccent(phase)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: phase == "soldout" ? "ticket" : "ticket.fill")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if phase == "soldout" {
                        Text("SOLD OUT")
                            .font(.system(size: 12, weight: .heavy))
                            .foregroundColor(.yengMuted)
                    } else if phase == "live" && context.state.remaining >= 0 {
                        Text("\(context.state.remaining) left")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .monospacedDigit()
                    } else if phase == "live" {
                        Text("ON SALE")
                            .font(.system(size: 13, weight: .heavy))
                            .foregroundColor(.yengConcertRed)
                    } else {
                        Text(context.state.dropDate, style: .timer)
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .monospacedDigit()
                            .frame(maxWidth: 70)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.eventTitle)
                        .font(.system(size: 14, weight: .bold, design: .serif))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.statusLine)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(accent)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: phase == "soldout" ? "ticket" : "ticket.fill")
                    .foregroundColor(accent)
            } compactTrailing: {
                if phase == "soldout" {
                    Image(systemName: "xmark")
                        .foregroundColor(.yengMuted)
                } else if phase == "live" && context.state.remaining >= 0 {
                    Text("\(context.state.remaining)")
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                } else if phase == "live" {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(.yengConcertRed)
                } else {
                    Text(context.state.dropDate, style: .timer)
                        .font(.system(size: 12, weight: .bold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .frame(maxWidth: 44)
                }
            } minimal: {
                Image(systemName: phase == "soldout" ? "ticket" : "ticket.fill")
                    .foregroundColor(accent)
            }
            .keylineTint(accent)
            .widgetURL(URL(string: "yengapp://open?page=events.html"))
        }
    }
}

// MARK: - 10. CONTROL CENTER WIDGETS (iOS 18+)
//
// Control Center / Lock Screen controls + StandBy. Unlike home-screen widgets,
// a control can't carry a `.widgetURL`; to open the app we run an AppIntent
// with `openAppWhenRun = true` that stashes the destination page in the App
// Group (YengWidgetState.setPendingControlPage). AppDelegate reads that on
// activation and fires the matching yengapp:// deep link. Toggles use a
// SetValueIntent that hands us the desired on/off value.

// MARK: Control intents

/// Opens the app straight into the music library.
@available(iOS 18.0, *)
struct OpenYengMusicControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Yeng Music"
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        YengWidgetState.setPendingControlPage("music.html")
        return .result()
    }
}

/// Opens the app straight into the events / tickets page.
@available(iOS 18.0, *)
struct OpenYengEventsControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Yeng Events"
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        YengWidgetState.setPendingControlPage("events.html")
        return .result()
    }
}

/// Opens the app straight into the membership card / fan tier page.
@available(iOS 18.0, *)
struct OpenYengCardControlIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Yeng Card"
    static var openAppWhenRun: Bool = true
    func perform() async throws -> some IntentResult {
        YengWidgetState.setPendingControlPage("membership.html")
        return .result()
    }
}

/// Control Center toggle counterpart for the next-show RSVP flag. A
/// SetValueIntent hands us the desired state rather than a plain flip.
@available(iOS 18.0, *)
struct SetShowRSVPControlIntent: SetValueIntent {
    static var title: LocalizedStringResource = "RSVP to Next Show"
    @Parameter(title: "Going") var value: Bool
    func perform() async throws -> some IntentResult {
        YengWidgetState.setShowRSVP(value)
        return .result()
    }
}

// MARK: Controls

/// Quick jump into Yeng's music library.
@available(iOS 18.0, *)
struct YengMusicControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.globalmedia.yeng.control.music") {
            ControlWidgetButton(action: OpenYengMusicControlIntent()) {
                Label("Yeng Music", systemImage: "music.note")
            }
            .tint(.yengConcertRed)
        }
        .displayName("Yeng: Music")
        .description("Jump into Yeng's music library.")
    }
}

/// Quick jump into the events / tickets page.
@available(iOS 18.0, *)
struct YengEventsControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.globalmedia.yeng.control.events") {
            ControlWidgetButton(action: OpenYengEventsControlIntent()) {
                Label("Yeng Shows", systemImage: "calendar")
            }
            .tint(.yengMagenta)
        }
        .displayName("Yeng: Shows")
        .description("See Yeng's upcoming shows and tickets.")
    }
}

/// Quick jump into the membership / fan card.
@available(iOS 18.0, *)
struct YengCardControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.globalmedia.yeng.control.card") {
            ControlWidgetButton(action: OpenYengCardControlIntent()) {
                Label("Yeng Card", systemImage: "creditcard")
            }
            .tint(.yengBurgundy)
        }
        .displayName("Yeng: Fan Card")
        .description("Open your Yeng membership card.")
    }
}

/// RSVP toggle for the next show, right from Control Center.
@available(iOS 18.0, *)
struct YengRSVPControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.globalmedia.yeng.control.rsvp") {
            ControlWidgetToggle(
                "Next Show RSVP",
                isOn: YengWidgetState.showRSVP,
                action: SetShowRSVPControlIntent()
            ) { isOn in
                Label(isOn ? "Going" : "RSVP",
                      systemImage: isOn ? "checkmark.circle.fill" : "calendar.badge.plus")
            }
            .tint(.yengConcertRed)
        }
        .displayName("Yeng: RSVP Next Show")
        .description("Mark yourself going to Yeng's next show.")
    }
}
