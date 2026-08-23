# Yeng Constantino Platform — Repository Audit

**Audited:** 2026-08-22 · branch `main` @ `0f84556` · 128 tracked files
**Scope:** 15 root HTML pages, 44 Netlify functions + 1 shared lib, 1 Airtable base, `css/styles.css`, `js/app.js`, `js/native-bridge.js`, `scripts/*`, `ios/*`, `deck.html` + `cards/*`
**Excluded from source analysis:** `node_modules/`, `ios/App/Pods/`, `.claude/worktrees/` (stale), `www/` and `ios/App/App/public/` (generated build output)
**Live verification:** Airtable base `app3w0tiDzXchMzPB` probed directly with two independent PATs; response headers checked against `https://yengconstantino.netlify.app`; `music.html`/`community.html` typography bug reproduced in a browser.

---

## 0. Executive summary — the six things that matter

1. **The newest feature is dead on arrival.** The last commit (`0f84556`, "Fan Score leaderboard, artist Activity Feed") ships four functions that write to Airtable tables **that do not exist in the live base**. Independently confirmed with two PATs: `Leaderboard` and `ActivityEvents` return the same error as a nonsense table name, while all 15 other tables return `200`. Every point ever "earned" has gone nowhere. `activity.html` is additionally an orphan — nothing links to it but itself.
2. **The site claims to be Yeng's official site.** Every page title ends "— Yeng Constantino Official", every footer reads "© 2026 Yeng Constantino Official. All rights reserved.", and `activity.html:379` renders a **verified checkmark labelled `title="Official"`** next to posts. Nothing anywhere marks this as a spec pitch. This is the single biggest relationship/legal risk in the repo and it is systemic, not cosmetic.
3. **The site fabricates Yeng's own words.** `membership.html:273` renders a first-person quote in quotation marks — *"Salamat sa lahat ng sumusuporta…"* — that is stored live in the Airtable `SiteConfig` table. `community.html:1078` contains a 300-word invented answer signed "— Yeng" rendered under the verified-checkmark "Yeng answered" header. `index.html:735-830` attributes personal 5-star ratings to her for four of her own songs. This is the exact thing the new pitch positions itself against.
4. **There is a factual error about her, live, in the config table.** `SiteConfig.about_text` opens *"From winning Philippine Idol…"*. She won **Pinoy Dream Academy** season 1 in 2006 (first "Grand Star Dreamer"). Philippine Idol was a different show. The same string says "over a decade" while the site's own Events record calls the 2026 show a **20th Anniversary** concert.
5. **Passwords are stored and compared in plaintext.** `signup.js:66` writes `Password: password`; `login.js:53` does `fields.Password !== password`. `bcryptjs` is in `package.json` and imported by zero functions. There are 7 real user rows in the live base right now.
6. **The demo shell is blocked by one line.** `netlify.toml:14` sets `X-Frame-Options: DENY` on `/*`, which blocks **same-origin** framing too — verified live. No page can be put inside a phone frame until this changes. This is a one-word fix and it gates build item #2.

---

# PART 1 — INVENTORY

## 1.1 HTML pages (15)

| Page | Lines | State | What it does |
|---|---|---|---|
| `index.html` | 1009 | **HALF-BUILT** | Homepage. Only ONE section is backend-driven ("My Yeng Story", L969-1001). Featured Music grid (L737-832) is 4 static divs. Instagram grid renders 9 fabricated gradient tiles. |
| `login.html` | 616 | **FINISHED** | Full-page login → `login`. No password reset (no function exists). Username login is supported server-side but unreachable through the `type="email"` field. |
| `signup.html` | 763 | **FINISHED** | 4-field signup → `signup` then auto-`login`. No ToS/privacy checkbox and no `/terms` page — an App Store problem given this also ships as an iOS app. |
| `profile.html` | 581 | **HALF-BUILT** | 6 tabs. 5 are real. "My Cards" (L479-513) is hardcoded — **every fan sees the same Legendary #1-of-25 card**. No "My Messages" or "My Tickets" tab despite both purchase flows existing. |
| `membership.html` | 466 | **HALF-BUILT** | 3 paid tiers. **Any fan can type any string as a "payment reference" and be granted `Ikaw Lamang` instantly.** Cards say "/month"; `create-membership.js:60-62` grants **one year**. |
| `music.html` | 2297 | **HALF-BUILT** | Archive with filters/search/pagination (real). Ratings POST to `rate-vlog` — **that function does not exist**. Renders in **Times** (see §1.5). |
| `merch.html` | 1739 | **HALF-BUILT** | Store + cart + checkout. **No payment processing of any kind.** Cart shows undiscounted price; server applies a different discount after commit. |
| `covers.html` | 1328 | **HALF-BUILT** | Fan cover submission (URL only, no upload). **The grid never renders** — page reads `data.submissions`, API returns `{covers}`. Permanently shows the empty state. |
| `community.html` | 1751 | **HALF-BUILT** | Social wall + "Ask Yeng" lane. Hero stats hardcoded "12.4K / 1.8K / 340". **16 fully-written fake fan posts** are the *default* render. Renders in **Times**. |
| `events.html` | 699 | **HALF-BUILT** | Events + geolocation "near me" + manual-payment ticketing. 6 fabricated events with real venue names are the default. None have coordinates, so "near me" demos as empty. |
| `mensahe.html` | 471 | **HALF-BUILT** | The Cameo product. Request → admin queue works. **The fan can never retrieve the delivered video** — `get-message-requests.js` has zero callers. |
| `leaderboard.html` | 621 | **FINISHED** | Fan Score page. Zero fake data — the cleanest page in the repo. **Backed by a table that does not exist.** Linked only from `activity.html`. |
| `activity.html` | 392 | **FINISHED** | Artist activity feed. Zero fake data. **True orphan** — nothing links to it but itself. Renders any Admin-role post as verified first-person Yeng speech. |
| `admin.html` | 1519 | **HALF-BUILT** | 10-tab CRUD panel. Crashes on every load (§1.4 Bug A). ~100 of its 920 JS lines exist purely to render invented numbers. |
| `deck.html` | 1244 | **STALE** | 16-slide pitch deck, 7 commits behind. 14 of its claims are now false. Orphaned, `noindex`-less, publicly served, and bundled into the iOS binary. |

**Navigation graph — four pages are effectively unreachable:**

| Page | Linked from |
|---|---|
| `events.html` | `mensahe.html`, `admin.html`, itself |
| `mensahe.html` | `admin.html`, `events.html`, itself |
| `leaderboard.html` | `activity.html`, itself |
| `activity.html` | **itself only** |
| `deck.html` | **nothing** |

`index.html`'s nav and footer link only to `/`, `music`, `community`, `merch`, `covers`, `membership`, `profile`, `signup`, `login`, `admin`. The entire last commit is invisible from the homepage.

## 1.2 Netlify functions (44 + 1 lib)

**Architecture:** per-endpoint (not the handler pattern). No `/api/*` redirect — the frontend calls `/.netlify/functions/*` directly. `esbuild` bundler. One scheduled function (`compute-leaderboard`, `@hourly`).

**Duplication is the dominant structural fact.** There is exactly one shared module (`lib/geocode.js`) required by exactly one file. Otherwise:
- The identical 6-line CORS block is pasted into 43 of 44 files (~258 duplicated lines). `Access-Control-Allow-Origin: '*'` everywhere. `Allow-Methods` has drifted into 5 inconsistent variants.
- The identical `new Airtable({...}).base(...)` line appears 44 times, always *inside* the handler, so the client is rebuilt on every invocation.
- The identical 6-line `verifyToken()` helper is pasted into 31 files (~200 duplicated lines).

**Auth model:** JWT (HS256, 7-day, `{userId, email, username, role}`). Admin endpoints re-read `Users.Role` live from Airtable on every request — correct and consistent across 9 of 10. The exception is `update-site-config.js:26`, which trusts the token claim.

### Called by nothing — 10 orphaned functions

| Function | Consequence |
|---|---|
| `get-user-tickets.js` | A fan who buys a ticket **cannot see it anywhere** after checkout. |
| `get-message-requests.js` | A fan who orders a Mensahe video **cannot retrieve it**. FAQ promises they can. |
| `get-store-credit.js` | Checkout deducts store credit it can never display. |
| `rate-content.js` | Superseded by `rate-vlog`, which doesn't exist. **All ratings are dead.** |
| `get-content-reviews.js` | Reviews are collected and never shown. Also the worst injection hole in the repo. |
| `get-user-favorites.js` + `update-user-favorites.js` | The whole `UserFavorites` table is unreachable. |
| `get-instagram-feed.js` | `InstagramFeed` table maintained for nothing. |
| `feature-cover.js` | Fully superseded by `update-content-status.js`. Still ships an admin-privileged write endpoint. |
| `compute-leaderboard.js` | Cron only — but publicly invocable and destructive (see §3.5). |

### Called but does not exist — 3 phantom endpoints

| Called from | Endpoint | Effect |
|---|---|---|
| `music.html:2181` | `rate-vlog` | Every video rating 404s. |
| `community.html:1618` | `bump-question` | The **paid** tier perk sold at `membership.html:310/325` is localStorage-only and evaporates. Fire-and-forget `.catch(){}` hides the failure — the fan gets a success toast. |
| `admin.html:783` | `answer-question` | **Yeng cannot answer a question.** The core artist→fan loop is a dead end. |

Consequently `CommunityPosts.Answer`, `AnswerTime` and `Bumped` are phantom fields — read in three places, written by nothing.

## 1.3 Airtable — code-referenced vs. live reality

One base (`app3w0tiDzXchMzPB`). No `CREDITS_BASE_ID`; this site is **not** in the shared credits economy. `Users.StoreCredit` is a local number field, unrelated to the `appo7PS69rWmzEPnC` ledger.

**Live probe results (verified with two independent PATs):**

| Table | Live | Records | Notes |
|---|---|---|---|
| `Users` | ✅ | 7 | `Password` field holds **plaintext**. One row is `Name: "Yeng Constantino"`, `Role: SuperAdmin`. |
| `SiteConfig` | ✅ | 45 | Drives all `data-config` attributes. Contains the fabricated quote and the Philippine Idol error. |
| `CommunityPosts` | ✅ | 14 | Includes a `Test` post by user `Test`, plus Fan Art and Memory rows (both cut features). |
| `Covers` | ✅ | 9 | |
| `MusicContent` | ✅ | 8 | `AvgRating`/`RatingCount` hold values (9.2/45 etc.) **but `ContentRatings` is empty** — the numbers are fabricated, not derived. |
| `MerchProducts` | ✅ | 8 | |
| `ExclusiveContent` | ✅ | 6 | |
| `Orders` | ✅ | 4 | |
| `Memberships` | ✅ | 3 | **Write-only** — 7 fields written, 0 ever read. |
| `MessageRequests` | ✅ | 2 | |
| `EventTickets` | ✅ | 2 | |
| `Events` | ✅ | **1** | One record: *Biyaheng Bente: 20th Anniversary Concert*, Araneta, 2026-08-28. |
| `ContentRatings` | ✅ | **0** | Empty — write path is orphaned. |
| `UserFavorites` | ✅ | **0** | Empty — both endpoints orphaned. |
| `InstagramFeed` | ✅ | **0** | Empty — endpoint orphaned. |
| **`Leaderboard`** | ❌ **DOES NOT EXIST** | — | Written by `compute-leaderboard.js`, read by `get-leaderboard.js` + `get-fan-score.js`. |
| **`ActivityEvents`** | ❌ **DOES NOT EXIST** | — | Written by `track-activity.js` on every page load of every logged-in user. |

Both missing tables return byte-identical errors to a control request for `ZZZNotARealTable`. The PAT reads all 15 other tables fine, so this is absence, not permissions.

**Schema hygiene:**
- **No `AIRTABLE_SCHEMA.md` exists.** `scripts/build-www.js:42` lists it in its exclude set — it was expected and never written.
- Field-name casing is inconsistent across tables: `UserID` vs `UserId`, `ContentID` vs `ContentId`, `ContentURL` vs `ContentUrl`, `Status` vs `ReviewStatus`.
- `get-music-content.js:108-124` defensively tries **three spellings** of the YouTube column and two each of view count and Spotify URL — code papering over a schema nobody pinned down.
- **Two date formats coexist.** `Memberships` carries both in a single record. Two filters apply Airtable date *functions* (`YEAR()`, `IS_AFTER()`) to those columns; if either is configured as text, the free-ticket cap and the daily activity cap both **fail open silently**.
- 5 tables are read-only with no CMS: `MerchProducts`, `MusicContent`, `ExclusiveContent`, `InstagramFeed`, `Events`. Editing a song or a product means opening Airtable.

## 1.4 Auth system

**Signup** → `signup.js` writes plaintext password, hardcodes `Role: 'User'` and `MembershipTier: 'Free'` (correctly preventing self-elevation), returns a 7-day JWT. The page then makes a **second** round trip to `login`.

**Login** → `login.js` matches `OR({Email}=…, {Username}=…)`, compares the password with `!==`, signs a JWT carrying `role`.

**Session** → `localStorage` under the `yc_` prefix: `yc_token`, `yc_user`, `yc_lang`, `yc_cart`, `yc_admin_goals`, `yc_visit_<date>`; `sessionStorage`: `yc_view_mode`, `yc_loader_shown`. One violation: **`community.html` uses `yeng_bump_usage`**.

**Gating** is three-layered:
- *Page-level:* `Auth.requireAuth()` (hard redirect) on `profile.html` and `leaderboard.html` only.
- *Action-level:* everywhere else — browse freely, get bounced at purchase/submit. `merch.html` lets a guest fill in their full shipping address and phone before bouncing them and losing the form.
- *Nav-level:* `data-guest` / `data-auth` / `data-admin` attributes toggled by `updateNavAuth()` in `js/app.js:212-236`. This is centralised, not duplicated per page — better than the TCG pattern.

**Admin** is a `Role` string (`Admin` / `SuperAdmin`). Client check reads the `yc_user` localStorage blob and is trivially forgeable, but the server gate is sound.

**No `authStateChanged` event, no password reset, no email verification, no rate limiting, no lockout, no light/dark theme.**

## 1.5 CSS architecture

`css/styles.css` — 1313 lines, warm-paper editorial palette from commit `f9e06e6` ("kill AI look"): `--purple: #A52C32` (concert red), `--burgundy: #741E27`, `--gold: #D49A24`, `--cream: #FBF8F2`. Fonts Fraunces / Instrument Sans / Kalam.

**The shared stylesheet is a minority partner: 7,465 lines of per-page inline CSS vs 1,313 shared — a 5.7 : 1 ratio.** Nominally CLAUDE.md §9 strategy #1; in practice strategy #3.

**Seven pages redefine `:root`** in three incompatible naming schemes (`--yeng-*`, `--yc-*`, and unprefixed collisions with the shared file).

### 🔴 Confirmed bug — two pages render entirely in Times

`music.html:31-33` and `community.html:31-33` both contain:
```css
:root { --font-display: var(--font-display); --font-body: var(--font-body); --font-accent: var(--font-accent); }
```
These are self-referential. Per the CSS Variables spec a cycle makes the property invalid at computed-value time, and the inline block wins the cascade over `styles.css`. **Verified in a browser:** `getComputedStyle` returns empty for all three on both pages, and `body` computes to `Times`. The two largest content pages on the site — 2297 and 1751 lines — have no typography at all. Fix is deleting three lines from each.

**Also:** no atmospheric background layer, no gradient signature strip on cards, no light/dark theme (light-only, undocumented), `--pink` used at `styles.css:1126` but never defined, and stale pre-redesign purple (`#5B2D8E`, `#52526B`) surviving in two inline SVG data-URIs.

### 🔴 Confirmed bug — `window.Auth` is undefined

`Auth`, `APP` and `SiteConfig` are declared with `const` in a classic script, which creates lexical bindings, **not** `window` properties. Verified in-browser: `typeof Auth === "object"` but `typeof window.Auth === "undefined"`. Two callers depend on the wrong one — most visibly `merch.html:1360`, where the guard always fails, so the "10% off" promo is shown to `Ikaw Lamang` members, the exact case the check exists to suppress.

## 1.6 `deck.html` + `cards/*`

**The deck is 7 commits stale and 14 of its claims are now false.** Highlights:

| Deck claim | Reality |
|---|---|
| "3 Membership Tiers" | 4 (Free + 3 paid) |
| Tier "Sariwang Himig" @ ₱99 | It is **"Sariwang Simula" @ ₱149** |
| "Ikaw Lamang" @ ₱249 | It is **₱799** — off by 3.2× |
| Omits "Laging Nandito" entirely | The tier the site badges "Most Popular" |
| "5-15% merch discount" | A single flat 10%, top tier only |
| "9 Pages" | 15 |
| **"4 Languages… Cebuano, Ilocano"** | No i18n system exists (see §2.7) |
| "Numbered runs (1/100, 1/500)" | One card exists: 1 of 25 |
| "Tradable & Ownable… trade with other collectors" | No ownership table, no trading, no card backend |
| "Yeng Credits spendable on the platform" | Not connected to anything on this site |

It is also **stale by omission** — it predates Mensahe, Events, ticketing, the leaderboard, the activity feed, Ask Yeng, the entire iOS app, and the visual redesign. It lists "Events" and "Mobile App" as *future* features. Both shipped.

**Its visual identity is the one the site deliberately deleted.** The deck is `#6C2BD9` purple → pink → gold on `#0F0E1A` dark with Playfair + Inter. The site is concert red / burgundy / gold on warm paper with Fraunces + Instrument Sans. Zero overlap. A prospect who sees the deck then the site sees two different products.

**It is orphaned, has no `noindex`, is publicly served (`HTTP 200` confirmed), and is copied into the iOS App Store binary** by `build-www.js`.

**`cards/`** — one card, three files. `metadata.json` matches the CLAUDE.md §6B canonical shape exactly (`rarity: Legendary`, `1/25`, `holographic: true`, `yeng_credits: "500"`, `bonus_perk`, `redeem_url` → `pvlcardgame.netlify.app`). Both HTML files are self-contained except for a Google Fonts link. The `/cards/*` `SAMEORIGIN` header override **works in production** — verified live. The iframe-flip embed recipe (`deck.html:449-486`) is genuinely reusable for the phone frame.

**`yeng-constantino_yengcard (1)/`** — the raw unrenamed Card Creator ZIP export. Three of its four files are **byte-identical duplicates** of `cards/` (md5-confirmed). Only `yeng-constantino_physical.html` is unique (it carries the QR + redeem-URL meta). The directory is tracked in git, **publicly served** (`HTTP 200`, 949KB), and **shipped in the iOS binary** — ~1.9 MB of pure duplicate, of which ~1.85 MB is one photo stored three times.

## 1.7 OpenAI integration

**One usage in the whole repo:** `netlify/functions/get-ai-insights.js`.

- Model **`gpt-4o-mini`** (not the `gpt-3.5-turbo` the playbook specifies), `temperature: 0.7`, `max_tokens: 1000`.
- SDK shape is v4-correct; installed version is 4.104.0. **Verified it constructs and resolves at runtime.**
- Good prompt, proper admin gate, defensive fence-stripping JSON parse with a fallback. The backend is the best-written file in the repo.
- **Two problems.** The `stats` object that builds the prompt comes entirely from the client (`:37`) — a prompt-injection and billing surface. And the model is explicitly told to emit `<strong>` tags, which `admin.html:1379` injects via `innerHTML` — model-controlled HTML in an admin page.
- `OPENAI_API_KEY` is **not** in `.env`; it must be set in the Netlify dashboard.

**There is no site-wide helper chat bot** (CLAUDE.md §28). Confirmed by exhaustive grep — no widget, no function, no `BotKnowledge` reference, no call to Global Storefront's `/api/helper-bot`.

## 1.8 Build + native layer

`scripts/build-www.js` works but **`www/` and `ios/App/App/public/` are one commit stale** — they are missing `activity.html` and `leaderboard.html` entirely, while the in-app nav links to both. In a bundled-www Capacitor app those links 404.

The iOS app is **substantially built but dormant and not shippable from this state**: 7 of the last 12 commits are iOS/widget work, 130KB of hand-written SwiftUI, Control Center widgets + Live Activities. But the bundled `packageClassList` is missing `WidgetBridgePlugin`, `LiveActivityPlugin` is registered nowhere, the widget target's deployment floor is iOS 26.5 vs the app's 15.0, `NSLocationWhenInUseUsageDescription` is absent while `events.html` calls `getCurrentPosition`, and **zero web pages call any of the 24 `NativeBridge` methods** — haptics, Face ID, notifications and Live Activities are all unreachable from the app's own UI.

Useful find: **`scripts/promo/assets/iphone-frame.png` already exists** (generated by `gen-assets.py` for the promo-video pipeline). It is a ready-made bezel asset for the App view.

---

# PART 2 — GAP ANALYSIS

Legend: 🟢 EXISTS · 🟡 PARTIAL · 🔴 MISSING

## Cross-cutting blockers (read first — these gate five of the seven features)

| Blocker | Verified | Blocks |
|---|---|---|
| **No file/media upload infrastructure of any kind.** Every media field in the codebase is a URL string pasted by hand. No Cloudinary, no S3, no FormData, no multipart. | grep across all HTML/JS returns zero real hits | Voice memos (#1), archive audio (#2), video delivery (#4) |
| **No remote push.** `native-bridge.js:263` — "Local-only (no remote push)". A server-side event cannot reach a fan. | code comment + zero APNs/FCM config | "your question was answered" (#1), delivery notify (#4) |
| **No single currency.** Two disjoint half-currencies: Fan Score points (earn-only, no spend side, in a table that doesn't exist) and `Users.StoreCredit` (spend-only, its read endpoint orphaned). Neither can be both earned *and* bought *and* spent. | `track-activity.js:17-24`, `create-order.js:85-92` | Promotion/refund (#1), multipliers (#3), economy panel (#6) |
| **No payment processor.** Zero `stripe` hits repo-wide. Every "payment" is an unverified free-text reference number. | `package.json` read in full | Point purchase (#1), premium subs (#3), Stripe Connect (#4) |
| **Moderation is binary.** `['Approved','Rejected','Pending']` only. No user-level state, no strike counter, no throttle, no shadowban, **no pre-submission filter** — posts are created `Pending` for post-hoc human review. | `update-content-status.js:38-51` | Tiering (#1), moderation panel (#6) |

## The seven features

### 1. Ask Yeng — 🟡 PARTIAL (thin, and both write paths are 404s)

**Exists:** a question *type* in the community composer, an 8-point award for asking, an admin "Ask Yeng" tab, and a bumped-then-liked sort heuristic.

**Missing:** everything that defines the feature. **Zero `cluster` hits repo-wide** — no merged question, no cluster size, no "your version", no live count. No voice recording (zero `MediaRecorder`/`getUserMedia` hits; the admin answer UI is `window.prompt()`). No shortlist, no pass, no reorder. No refund concept. No moderation tiers.

**Worse than missing:** the two write paths that *look* built are 404s. `answer-question` doesn't exist, so **Yeng cannot answer**. `bump-question` doesn't exist, so the paid bump perk is localStorage-only — and because the call is `.catch(){}`, the fan sees a success toast for an action that never persisted.

**Reusable:** `create-message-request.js` + `update-message-status.js` are the best template in the repo for the answer queue — server-authoritative pricing, denormalised user fields, and a 4-state pipeline with a conditional required artefact on delivery. Rename the states and that is ~70% of the queue backend. `track-activity.js`'s server-side points table and `DAILY_CAPPED` set are the right shape for a per-cycle promotion cap.

**Effort: XL.**

### 2. Verified Archive — 🔴 MISSING

Exhaustive grep for `whisper|transcri|sentiment|cluster` across all HTML/JS/JSON/TOML returns **exactly one hit repo-wide**: `music.html:1325` `data-mood="Sentimental"`, a filter pill.

Nothing exists: no audio capture, no storage, no Whisper pipeline, no transcript store, no timestamp index, no `?t=` deep links, no keep/skip queue, no skip pile, no signing, no corpus.

**Reusable (thin but real):** the `openai` dep is installed and `get-ai-insights.js` demonstrates the working client-init + defensive-parse pattern — Whisper is the same SDK. `netlify.toml:8-10` proves the scheduled-function pattern works; a Whisper batch job needs that shape, because a synchronous pass will exceed the Netlify function timeout.

**Effort: XL.** The largest net-new build of the seven — a media pipeline, an AI pipeline, a search index and two review UIs, on a codebase with no file storage at all.

### 3. Digital Trading Cards — 🟡 PARTIAL (the artwork exists; the system does not)

**Exists:** exactly one card, rendered beautifully. The metadata→HTML contract is proven and matches the house Card Creator, so *new cards are a data problem, not a design problem*. The iframe-flip embed works in production.

**Missing:** ownership (no `UserCards` table), the drop engine, pack tiers, streak tracking, archive-feeding triggers, premium `+1 drop/week`, exclusive art. **Perks are decorative text wired to nothing** — store discount, points multiplier, mini-game lifeline and line-skip all have zero enforcement code. The card's 500 "Yeng Credits" point at `pvlcardgame.netlify.app`, a different property.

**Action:** promote `yeng-constantino_physical.html` → `cards/yeng-physical.html`, delete the duplicate directory.

**Effort: L.** The art/render pipeline being solved removes the usual bulk.

### 4. Cameo-style personalised video — 🟡 PARTIAL (strongest starting position of the seven)

**Exists:** the whole request→queue→status→artefact spine. `create-message-request.js` is server-authoritative on price (the client cannot forge it — unlike `create-order.js`). `update-message-status.js` has a correct admin gate, validated states, and requires a delivery URL on `Delivered`.

**Missing:**
- **Stripe Connect: entirely absent.** Merchant-of-record, onboarding, `application_fee_amount` / `transfer_data`, webhooks — no analogue anywhere in the repo.
- **Fan context: zero.** The admin card renders only name / recipient / occasion / price / instructions. No tenure, no past questions, no shows registered, no leaderboard standing — **even though `get-fan-score.js`, `get-user-tickets.js` and `CommunityPosts` could supply all four today.** This is the feature's whole differentiator and it needs one joined admin read.
- **Configurable pricing: no.** Price is duplicated in four places, none of them `SiteConfig`.
- **The delivery loop is broken** (§1.2).

**Effort: L.** Stripe Connect dominates the cost.

### 5. Tour Demand Map — 🔴 MISSING (but the geo half is already solved)

Grep for `demand|pledge|party.?size|i'd come` returns one hit — unrelated marketing copy in `deck.html`.

**Missing:** the pledge control, party-size input, a `TourDemand` table, aggregation, the heat map, the dashboard feed, the demo-data flag.

**Reusable — this is the good news:** `netlify/functions/lib/geocode.js` is the repo's only shared module and contains a **94-entry city dictionary** covering PH cities *plus overseas OFW hubs* (Dubai, Doha, Singapore, HK, Toronto, LA, London, Sydney, Riyadh) with a Nominatim fallback. A fan-submitted city resolves to lat/lng today with zero new work. `haversine()` is already written at `events.html:443-452`, and the geolocation permission flow is proven.

**Fix first:** `geocode.js:11-13` documents a write-back of resolved coords so each city geocodes once — **no such write-back exists.** `get-events.js` re-geocodes every dictionary miss on every request, in parallel, against Nominatim's 1 req/s policy. Building demand aggregation on that as-is will get the site blocked.

**Effort: M.** The smallest of the seven and the best effort-to-visible-impact ratio.

### 6. Handler Dashboard — 🟡 PARTIAL (a competent CRUD panel exists; a calm dashboard does not)

| Required panel | Status |
|---|---|
| Question themes + cluster sizes | 🔴 none |
| Tour demand by city + party totals | 🔴 none |
| Sentiment before/after releases | 🔴 none |
| Fake-content watch list + skip pile | 🔴 none |
| Answer queue: shortlist / pass / reorder | 🔴 UI exists, `answer-question` is a 404 |
| Moderation overview: T2/T3, appeals | 🔴 binary statuses only |
| Cameo queue with fan context | 🟡 queue yes, context no |
| Revenue + points economy | 🔴 **fabricated** |

**The "calm, not CRUD" problem is structural.** Ten tabs named after Airtable tables — Posts / Covers / Orders / Tickets / Messages / Users / Reviews / Site Config — is an Airtable sidebar, not a handler's morning. There is no unified "what needs me today" queue, no age, no priority, no bulk action, no export, no pagination UI. It cannot manage events, merch, music or memberships at all.

**And part of it is fiction under an "AI-Powered" badge.** `renderSampleCharts()` (L1410-1512) hardcodes 5 of 6 revenue bars, 5 of 6 signup bars, the entire Top Rated Content list and the entire Revenue-by-Source split. `renderInsights()` (L1305-1358) is six hand-written strings. `getMetricValue()` at L1180 adds a literal `+ 12` to the Mensahe metric.

**Worth keeping:** the live-role admin gate (correct — keep as-is), `get-admin-content.js`'s `TABLE_MAP`, `get-ai-insights.js` pointed at real data, and — importantly — **the Site Config tab (L1057-1152) is the one genuinely handler-shaped surface in the repo.** 40 plain-English labelled, grouped, described fields with one Save button. Use it as the tone template for the rebuild.

**Effort: L**, but it is a *dependent* build — six of its eight panels display data that features #1, #2 and #5 must first produce. Sequence it last.

### 7. Multi-language — 🟡 PARTIAL (and the existing implementation is the wrong kind)

**Exists:** `js/app.js:520-525` defines exactly the four required languages — `en / tl / ceb / ilo` — with a custom selector, `yc_lang` persistence, and a working cookie/reload flow.

**But it drives Google Translate.** It is runtime machine translation of the DOM, not stored translations. Nothing in Airtable holds a per-language variant of anything. The requirement is *"every archive item, answer, and UI string in all four"* — authored, reviewable content — which this cannot produce. And the quality risk is concentrated exactly where it matters: unreviewed machine Ilocano and Cebuano applied to an artist's own answers is the failure mode the verified-archive concept exists to prevent.

**Subtitles: nothing.** No VTT/SRT handling, no caption track, no player.

**On the hard constraint — "her audio is never synthesised or dubbed":** currently satisfied by default. Zero TTS, voice-cloning or dubbing code exists anywhere. This is a constraint to *preserve*, not a gap to close.

**Reusable:** keep the selector shell and swap the engine for a catalogue lookup. `SiteConfig`'s `[data-config]` attribute-walking is the natural place to hang UI strings — the substitution mechanism already exists and works.

**Effort: L**, sequenced after #2 since transcripts are the input.

## The four mini-games — all 🔴 MISSING

Exhaustive grep for `minigame|quiz|trivia|lyric|setlist|millionaire|lifeline|head-to-head|elo` across all HTML/JS returns **three hits, all false positives** — two "Lyric Art" product names and one fan-post string. **There is no game code in this repo.**

| Game | Status | Notes |
|---|---|---|
| **Song Ranking (head-to-head)** | 🔴 MISSING | Build first per your order. Needs no audio, no masters, no new infrastructure — one table, two endpoints, one screen. Genuinely the cheapest of the four and the most valuable output. |
| **Yeng Millionaire** | 🔴 MISSING | **The basketball build is in reach.** `../aeob/trivia.html` (225 lines) + `../aeob/js/trivia.js` (663 lines) is a complete "PBA Trivia Millionaire": 15 questions, doubling credits, 3 safe levels, 15-second timer, walk-away/bank decision, tab-switch = game over. That is the exact format, already written, in the sibling repo. |
| **Finish the Lyric** | 🔴 MISSING | Audio-first. Blocked on the same missing media infrastructure as #1/#2 — and on rights to the recordings. |
| **Setlist Prediction** | 🔴 MISSING | Depends on announced shows. `Events` currently holds **one** record. |

**Points economy:** the existing Fan Score is server-authoritative on amount (good) but the client freely chooses the *type*, and only `site_visit` is daily-capped. Any authenticated fan can `curl {type:'event_attended'}` — the 50-point top value — in an unbounded loop. It is also backed by a table that doesn't exist. It can become Yeng Points, but not before it gets a spend side, a purchase path, and server-derived signals.

**Trivia content source:** none. There is no archive-approved material to generate questions from, which is precisely the dependency you identified.

## The six-view demo shell — 🔴 MISSING

Nothing exists. No phone frame, no tab shell, no `?demo=true` bypass anywhere. The only iframe usage in the repo is the card flip.

### The blocker, precisely

`netlify.toml:14` sets `X-Frame-Options: DENY` on `/*`. **`DENY` is absolute — it blocks same-origin framing too.** Confirmed live:

```
curl -I https://yengconstantino.netlify.app/index.html          → x-frame-options: DENY
curl -I https://yengconstantino.netlify.app/cards/yeng-front.html → x-frame-options: SAMEORIGIN
```

That second line also proves the mechanism you need: **a more specific Netlify rule replaces the global value for the same header key — it does not merge.** There is no CSP anywhere and no JS framebusting, so this header is the single and only blocker.

**Recommendation: change `netlify.toml:14` to `SAMEORIGIN` and host the shell on the same Netlify site.** It still blocks third-party framing (the actual clickjacking threat) and needs no other change. Cross-origin hosting costs much more than a header: `localStorage` is partitioned in a cross-origin iframe under Safari ITP and Chrome storage partitioning, so a logged-in fan appears **logged out** inside the frame — which kills four of the six views.

### Three more things to resolve before building it

1. **Auth-gating.** Fan (profile, membership, my-cards) and Management (`admin.html`) views are behind JWT. You need a `?demo=true` bypass with seeded data or a pre-authenticated demo account, or four of six panels show a login wall.
2. **"Fan / Yeng / Management" does not map 1:1 onto existing pages.** There is no artist-facing surface in the repo. `admin.html` mixes both jobs — `questions`/`covers`/`posts` are Yeng-ish, `orders`/`tickets`/`users`/`reviews`/`config` are management-ish. Decide whether to split it or serve one URL with a view parameter **before** writing the shell, because it determines what the shell frames.
3. **Two of the six views render in Times right now** (§1.5). Fix that first — it is highly visible in a phone mockup.

### Build it fresh, not on `deck.html`

The deck is 16 full-viewport `scroll-snap: y mandatory` panes with hardcoded `N / 16` footers — a 1-D narrative. The shell is a 2-D state matrix with persistent chrome and one bounded scrolling stage. Nesting a scrollable phone frame inside `scroll-snap: y mandatory` produces scroll-chaining fights. Deleting the snap system deletes the deck's structure; the palette is the one the redesign killed; and the `@media print` / Save-PDF path is incompatible with a live frame. **Genuinely reusable from the deck: about 40 lines** — the iframe-in-a-frame recipe at L462-486 (native-size the iframe, `transform: scale()` with `transform-origin: top left`, so the page renders at true mobile breakpoints instead of a squashed desktop layout) and the per-path header override template.

The strategic argument: the deck is a *hand-written description* of the product, so it decays every time you ship — seven commits made 14 claims false. A shell that iframes the live pages is a *projection* of the product and cannot decay. Put state in the URL hash (`#fan/app`) so all six views are directly linkable.

---

# PART 3 — ROT REPORT

## 3.1 Official-vs-pitch framing — systemic, and the highest relationship risk

The site presents itself as Yeng Constantino's official property. Nothing anywhere marks it as a spec pitch.

| Location | String |
|---|---|
| Every page `<title>` (15 pages) | `… — Yeng Constantino Official` |
| Every page footer | `© 2026 Yeng Constantino Official. All rights reserved.` |
| Live Airtable `SiteConfig.footer_copyright` | `Yeng Constantino Official` — it is in the database, not just the HTML |
| `index.html:15` meta description | "The official fan hub of Yeng Constantino." |
| `index.html:667` | "welcome to the official fan hub" |
| `manifest.json:2` | `"name": "Yeng Constantino Official"` |
| `activity.html:379` | **`<span class="af-post__verified" title="Official">✔</span>`** — a verified checkmark on artist posts |
| `activity.html:259` | "Straight from Yeng — her posts and the questions she's answered" |
| `mensahe.html:356`, `membership.html:356` | "Pay via GCash or Maya to the **official Yeng Constantino account**" |
| `profile.html:526` | "get **official** Yeng merch!" |
| `deck.html:699` | "Yeng Constantino / **Official** Fan Platform" |

Compounding this, the live `Users` table contains a row with `Name: "Yeng Constantino"`, `Role: SuperAdmin` — an account in her name, in a base she does not control, whose posts render with a verified checkmark.

There is also **no `Powered by Global Media / Globally Ballin` attribution anywhere**, no terms page, and no privacy policy — while the site collects names and emails and ships as an iOS app.

## 3.2 Fabricated content — ranked by how bad it is if the handler spots it

**Tier 1 — fabricated speech and facts attributed to Yeng.** These directly contradict the pitch.

1. **`membership.html:273`** — a first-person quote in quotation marks: *"Salamat sa lahat ng sumusuporta. Kayo ang dahilan kung bakit patuloy akong kumakanta."* Stored live in `SiteConfig.membership_quote`. Unsourced.
2. **`community.html:1078`** — a ~60-word invented answer signed **"— Yeng"**, rendered under a verified-checkmark "Yeng answered" header. Includes an emoji.
3. **`index.html:735-830`** — a legend stating *"**Yeng's Pick** is how Yeng herself rates it"*, then four hardcoded scores (4.9 / 4.8 / 4.6 / 4.7) attributing personal ratings to her that she never gave, alongside ~10,200 nonexistent fan votes.
4. **`music.html:1465-1503`** — the same pattern: `yengRating: 10` chips labelled "Yeng" with `title="Yeng's own rating"`.
5. **`index.html:843, 889`** — two further unsourced quotes attributed to her.
6. **`SiteConfig.about_text` (live)** — *"From winning **Philippine Idol**…"*. **She won Pinoy Dream Academy** (2006, first Grand Star Dreamer). Also says "over a decade" while the site's own Events record says 20th Anniversary.

**Tier 2 — invented numbers a handler can disprove instantly.**

7. `index.html:711-724` — "10+ Studio Albums / 50+ Hit Singles / 500+ Live Concerts / **2M+ Yeng Nation Fans**". The Users table has **7 rows**.
8. Live `SiteConfig` — `stats_followers = "5M+"`. Your own brief puts her near 10M. Wrong in the other direction, and it is the first number on the homepage.
9. `community.html:819-827` — "**12.4K** Members / **1.8K** Posts Today / **340** Online Now". Nothing ever writes to these elements. There are 14 posts total.
10. `admin.html:1414-1503` — the entire Revenue chart (5/6 bars), Signups chart (5/6 bars), Top Rated Content list and Revenue-by-Source split are literals. Month labels are frozen at "Nov…Apr" — wrong year-round; today is August.
11. `admin.html:1180` — `case 'mensahe': return (stats.pendingMessages || 0) + 12;` A literal `+12` padding a live goal metric.
12. `MusicContent` `AvgRating` values (9.2 / 8.7 / 9.5…) with `RatingCount` (45 / 38 / 52) while **`ContentRatings` is empty**. The ratings are typed in, not computed.

**Tier 3 — fabricated people and events.**

13. `community.html:1013-1225` — **16 fully-written fake fan posts** with named personas and locations (Maria from Manila, Grace OFW in Dubai, Sarah Fil-Am in LA…) and like counts up to 1,204. **This is the default render**, not a rare fallback.
14. **A fake cancer testimonial is live in the Airtable base right now**: *"Yeng's music got me through my cancer treatment. Every chemo session I…"* attributed to "Grace Dela Cruz", 312 likes. Invented, emotionally loaded, and an example of the "memory wall" you cut.
15. `events.html:405-412` — 6 fabricated events with **real venue names** (Araneta Coliseum, SM Megamall, Manila Hotel, Waterfront Cebu, Circuit Makati, MOA Arena), specific dates and ticket prices, on a page titled "Yeng Constantino Official". A live demo reads as announcing real shows.
16. `merch.html:1324-1334` — a nine-SKU invented catalogue including a "**BESTSELLER**" badge on something never sold and a "Salamat 15th Anniversary Vinyl" release that does not exist. Every product photo is a generated SVG with "YENG" stamped across it.
17. Live `CommunityPosts` — a post by user "**Test**" with content "**Test post**", `Status: Approved`, sitting in the feed.

**Tier 4 — broken links masquerading as content.** Every "play the song" button on `index.html` and `music.html` links to a **search results page** (`open.spotify.com/search/Yeng%20Constantino%20Ikaw`), not a track. Live `SiteConfig.social_spotify` is literally `https://open.spotify.com/artist/placeholder`.

**Also flag for verification:** `index.html`'s ticker mixes her titles with "Nosi Balasi" (Sampaguita) and "Your Love" (Alamid) without distinction; `covers.html:864-874` hardcodes a 10-song datalist including "Sana Maulit Muli" (Regine Velasquez/Gary Valenciano) and a malformed "Paasa T.A.N.G.A."; and `covers.html:866` says "Chinito" while `music.html:1484` says "Chinita Girl" — the same site disagreeing with itself about a title.

## 3.3 Cut-feature references

| Cut feature | Present? | Where |
|---|---|---|
| **Fan art gallery** | ✅ **live in code and data** | `community.html` filter tab L840, composer option L876, badge CSS L474, label map L1002, 3 seeded posts (L1028, L1123, L1137). Plus **live Airtable rows** with `Type: "Fan Art"`. Deck slides L761, L824, L835. |
| **Memory wall** | ✅ **live in code and data** | `community.html` — CSS L197-221, the "♥ My Yeng Story / Featured Memories" block L853-859, `renderMemoryHighlight()` L1398-1436, filter tab L842, composer option L878, 4 seeded posts. **`index.html`'s only working backend section fetches `type=Memory`.** Plus live Airtable rows. Deck L823, L837. **Removal touches ~14 places.** |
| **Live streaming** | ✅ **shipped as a feature** | `admin.html:364` a **"Go Live" button** opening StreamYard, hint text at L368 ("broadcasts to YouTube, Facebook, Twitter"), SiteConfig key `streamyard_url` L1023, `openStreamYard()` L1396-1408. Deck L1011, L1016. |
| **"Name That Intro"** | ❌ absent | zero hits |
| **Personal-life predictions** | ❌ absent | zero hits |
| **Daily Wordle-style quiz** | ❌ absent | zero hits |
| **Fan cover uploads** (UNDECIDED → leave dormant) | ✅ fully built | see below |

### Dormanting the Covers feature — assessment

**There is no file upload.** Submission is URL-only (YouTube/TikTok regex). `deck.html:884` already says so explicitly. If "uploads" is the concern, that part was never built.

**It is already de-facto dormant because of a one-word bug.** `covers.html:1045` and `:1059` read `data.submissions`; `get-covers.js:96` returns `{covers, pagination}`. Both resolve to `[]`, so the page **always** shows "No covers yet" regardless of the 9 rows in Airtable. `profile.html:568` has the identical bug.

**To make it deliberately dormant:** gut `initAuthState()` (L1017-1026) so neither the guest nor the auth submit panel ever shows, and hide the `<section class="submit-section">` (L840-902) plus the pipeline legend (L904-928). Browse + Hall of Fame can keep working. Then neutralise the copy that *sells* it — `membership.html:291`, `:334`, `:369` and deck slide 7 (L875-903) — and hide `profile.html`'s "My Covers" tab and `admin.html`'s Covers tab so they don't render permanently-empty panels. Drop `cover_submit: 15` from `track-activity.js:22` or the leaderboard keeps advertising a 15-point action nobody can perform. Leave the four backend functions deployed but unreferenced. **Blast radius is small; this is a half-day.**

## 3.4 Dead code, orphans, duplication

**Orphaned functions:** 10 of 44 (23%) — listed in §1.2.
**Phantom endpoints:** 3 called, none exist — listed in §1.2.
**Orphaned pages:** `activity.html` (self-only), `deck.html` (nothing).
**Dead UI:** `admin.html`'s `#badge-reviews` (never populated), `community.html`'s empty `<template id="fallback-posts">`, `community.html`'s Comment and Share buttons (rendered with no handler — pure decoration), `Covers` status `'Under Review'` (valid in code, never written), `css/styles.css`'s `.toast` / `.grid--3` / `.badge--gold` (used by zero pages), `ios/App/_widget_staging/` (unreferenced by Xcode, 4× stale, still tracked).

**Duplicate directories:**

| Path | Size | Verdict |
|---|---|---|
| `www/` | 12 MB | Generated, gitignored, **one commit stale** (missing `activity.html`, `leaderboard.html`). Regenerate with `npm run cap:sync`. |
| `ios/App/App/public/` | 12 MB | Capacitor copy of the above, same staleness. |
| `.claude/worktrees/` | 24 MB | Two abandoned worktrees (`claude/charming-heyrovsky` @ `775b55e`, `claude/jovial-einstein` @ `867f0c3`), both merged or superseded. Safe to `git worktree remove`. |
| `yeng-constantino_yengcard (1)/` | 1.8 MB | 3 of 4 files byte-identical to `cards/`. **Tracked in git, publicly served, shipped in the App Store binary.** Promote the unique `_physical.html` into `cards/`, delete the rest. |

**Unused deps:** `bcryptjs` (declared, imported by zero functions — and its absence is the #1 security issue). `capacitor-native-biometric` and most `@capacitor/*` plugins are wired in `native-bridge.js` but **called by zero web pages**.

## 3.5 Security — ranked

1. **Plaintext passwords.** `signup.js:66`, `login.js:53`. `bcryptjs` installed, never used. Non-constant-time compare, no rate limit, no lockout. 7 live accounts affected.
2. **Unverified payment grants a paid membership.** `create-membership.js:49-79` — any authenticated fan can POST `{tier:'Ikaw Lamang', paymentReference:'x'}` and instantly unlock 15% off merch, 15% off tickets + 2 free tickets/yr, 15% off Mensahe, and every tier-3 exclusive.
3. **Client-controlled prices in checkout.** `create-order.js:67-76` sums prices supplied by the browser; `MerchProducts` is never consulted. A fan can buy anything for ₱1. Compounding: store credit is deducted *before* the order row is created with no rollback, and cancellation never restores it.
4. **Unauthenticated, completely unescaped formula injection.** `get-content-reviews.js:26` interpolates `contentId` raw into `filterByFormula` on a public endpoint. `rate-content.js:61,90` same, behind a JWT — and `:108` updates a **client-supplied `MusicContent` record ID**, letting any user overwrite arbitrary rating aggregates.
5. **Inadequate escaping at 13 more sites.** The project-wide escape is `.replace(/'/g, "\\'")`, which escapes the quote but **not the backslash** — so a payload starting with a literal backslash escapes the escape. Highest-value target is `login.js:35`.
6. **Stored XSS in every admin moderation queue.** `admin.html` renders unescaped fan-submitted content via `innerHTML` at 7 sites. A fan submitting `<img src=x onerror=…>` executes script **in the admin's session, with the admin JWT in localStorage.** The entire purpose of that page is displaying hostile-by-default input.
7. **Committed fallback JWT secret.** `update-site-config.js:25` — `process.env.JWT_SECRET || 'yeng-nation-secret-2026'`. Inert today, but it is signing material in a public repo. Line 26 also trusts the token's role claim rather than re-reading Airtable — the only admin endpoint of ten that skips the live lookup.
8. **Trivially farmable leaderboard.** The client picks the point *type* and only `site_visit` is capped. `curl {type:'event_attended'}` in a loop = 50 points each, unbounded, with no cross-check against `EventTickets`.
9. **Publicly invocable destructive cron.** `compute-leaderboard.js` has no method check and no shared-secret guard; an anonymous GET runs its destroy loop. It is also non-atomic — a failure mid-run leaves the table empty.
10. **Data exposure.** `get-community-posts.js:66` returns the full `likedBy` array of internal user record IDs to **anonymous** callers — the same values used as `decoded.userId` everywhere. `get-covers.js` has the same leak and no default status filter, so `?status=Rejected` publicly lists rejected submissions. `get-merch.js` exposes `stock` and `sales` publicly. `get-admin-content.js:81` spreads raw `r.fields`, auto-exposing any new Airtable column including shipping addresses and phone numbers.

## 3.6 Correctness bugs worth fixing before anything is demoed

| Bug | Location | Effect |
|---|---|---|
| Self-referential font vars | `music.html:31-33`, `community.html:31-33` | **Both pages render in Times.** Browser-verified. |
| `#tier-bar` element doesn't exist | `admin.html:649` | **The Overview panel throws on every load.** Real stats are discarded, every chart falls back to demo data, both real tables never render, a red error toast fires despite the request succeeding, and Refresh Insights sends an empty stats object to GPT. |
| `data.submissions` vs `{covers}` | `covers.html:1045/1059`, `profile.html:568` | Covers grid never renders. |
| `data.id` vs `{post:{id}}` | `community.html:1676` | Post creation always falls to the local path and toasts success — while the server saved it as `Pending`, invisible until an admin approves it. |
| `pagination.total` vs `totalRecords` | `music.html:1859` | "of N results" never renders; Load More permanently hidden. |
| `?type=Memory` vs stored `memory` | `index.html:975` | Airtable `=` is case-sensitive — the homepage's **only** working backend section always falls through to its empty state. |
| Sort value mismatches | `covers.html:953`, `music.html:1337`, `merch.html:1342` | Three sort controls silently do nothing. |
| Monthly price → yearly grant | `create-membership.js:60-62` | One month's payment buys twelve months. |
| Free-tier video still billed | `create-message-request.js` | UI promises `Ikaw Lamang` a FREE video; server writes `Price: 1275`. |
| Negative quantity accepted | `create-event-ticket.js:36-40` | Passes the capacity check, produces a negative price, and **decrements** `TicketsSold`. |
| Manila-midnight miscalculation | `get-events.js:57-58` | 8-hour skew; mis-drops events on the boundary day. |
| `MerchProducts.Stock` never decremented | `create-order.js` | Sold-out items keep selling. |

---

# PART 4 — RECOMMENDED ORDER OF OPERATIONS

Your build order stands. Three amendments, all about sequencing:

**Before item 2 (demo shell), do a short hygiene pass — roughly a day:**
- Flip `netlify.toml:14` to `SAMEORIGIN`. Nothing else can proceed without it.
- Delete the 6 self-referential lines that break typography on the two biggest pages.
- Fix `admin.html`'s `#tier-bar` crash and delete `renderSampleCharts()` (L1410-1512) + `renderInsights()` (L1305-1358). Empty states beat invented numbers.
- Strip the "Official" framing: 15 titles, 15 footers, the manifest, the meta descriptions, the `title="Official"` checkmark, and the two live `SiteConfig` rows. Add a pitch-preview marker.
- Purge the Tier-1 fabrications: the quote, the fake "— Yeng" answer, the "Yeng's Pick" ratings, and the Philippine Idol error.
- `noindex` `deck.html` and add it to `build-www.js`'s exclude set so the stale pitch stops shipping in the App Store binary.

**Create the two missing Airtable tables** (`Leaderboard`, `ActivityEvents`) or delete the four functions and two pages that depend on them. Right now the site's newest feature is neither working nor honestly absent.

**Two items move earlier than their build-order position for cheap wins:**
- The **Cameo fan-context panel** (#4) needs one joined admin read over data that already exists in four endpoints. It is the feature's entire differentiator and it is small. Worth pulling forward.
- **Song Ranking** (mini-game #1) needs no audio, no rights, and no new infrastructure. It is the only one of the four that is unblocked today, and its aggregate is the dataset you called the most valuable in the app.

**One dependency to respect:** the handler dashboard (#4 in your order) is listed before tour demand and the archive, but six of its eight panels display data those features must first produce. Build its *shell and tone* early — model it on the Site Config tab, which is the one genuinely handler-shaped surface already in the repo — and fill the panels as their data sources land.

**Five-week note.** Items 1-5 in your order (shell, Ask Yeng, dashboard, tour map) are achievable if the hygiene pass happens first and Ask Yeng's clustering is scoped to an LLM pass over a small corpus rather than a full embedding pipeline. Items 6-10 (archive, mini-games, cards, multi-language, Cameo) each depend on media-upload infrastructure that does not exist in any form today — that is the one foundational build with no shortcut, and it should be started in parallel with the demo shell rather than after it.

---

*Audit complete. No feature code was written. Nothing in the repo was modified.*
