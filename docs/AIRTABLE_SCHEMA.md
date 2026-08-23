# Airtable Schema — Yeng Constantino Platform

**Base:** `app3w0tiDzXchMzPB` (single base — this site is **not** in the cross-site credits economy, so there is no `CREDITS_BASE_ID`)

**Conventions**
- Record-id foreign keys are stored as **plain text** (`UserId`, `ClusterId`), not Airtable Link fields. Every function filters on them with `filterByFormula`.
- Dates: **full ISO 8601 datetime** for anything timestamped (`CreatedAt`, `RecordedAt`), **`YYYY-MM-DD` date-only** for calendar fields (`JoinDate`, `Day`, `ExpiryDate`). Do not mix within one field.
- Any field used with `IS_AFTER()`, `YEAR()` or `DATETIME_DIFF()` **must be a real Airtable Date field**, not Single line text — otherwise the formula silently matches nothing and the guard fails open.
- Field names are **PascalCase** throughout. (Legacy tables carry three inconsistencies — see *Known drift* at the bottom.)

---

## 0. Setup

```bash
node scripts/setup-airtable.js          # creates every missing table + field
node scripts/setup-airtable.js --dry    # show what it would do, change nothing
```

The script needs a PAT with `schema.bases:write`. The PAT currently in `.env` has data scopes only, so add the scope in Airtable → Developer hub → your token → Scopes before running it.

Every new function degrades gracefully if its table is absent (`safeRead` / `isMissingTable` in `lib/common.js`) — a missing table returns an honest empty state rather than a 500. That is deliberate: the previous release shipped four functions writing to `Leaderboard` and `ActivityEvents`, **neither of which existed in the base**, and every point ever "earned" went nowhere.

---

## 1. NEW TABLES (created by this build)

### `YengPoints` — the single currency ledger
Append-only. The ledger is the truth; `Users.PointsBalance` is a rebuildable cache.

| Field | Type | Notes |
|---|---|---|
| `UserId` | Single line text | Airtable record id |
| `UserName` | Single line text | denormalised |
| `Type` | Single select | `site_visit`, `question_asked`, `question_clustered`, `cluster_answered`, `ranking_session`, `game_played`, `lyric_round`, `trivia_daily`, `setlist_submitted`, `setlist_scored`, `tour_pledge`, `comment`, `vote`, `archive_search`, `event_attended`, `membership_grant`, `purchase`, `promote_question`, `mini_game_retry`, `refund` |
| `Amount` | Number (integer) | **positive = earned, negative = spent** |
| `Reason` | Single line text | human-readable |
| `RefTable` / `RefId` | Single line text | what it relates to |
| `RefundOf` | Single line text | ledger id being refunded — makes refunds idempotent |
| `Day` | Date (`YYYY-MM-DD`) | daily-cap key |
| `CreatedAt` | **Date with time** | |

### `Questions` — every fan's own wording
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `QuestionText` | Long text | max 500 chars enforced server-side |
| `ClusterId` | Single line text | empty when held/shadowbanned |
| `Language` | Single select | `en`, `tl`, `ceb`, `ilo` |
| `Status` | Single select | `Clustered`, `Held`, `Answered` |
| `Surfaced` | Checkbox | false = stored but never counted toward a cluster |
| `Day` | Date | tier-2 throttle key |
| `CreatedAt` | **Date with time** | |

### `QuestionClusters` — the merged questions
| Field | Type | Notes |
|---|---|---|
| `MergedQuestion` | Long text | what Yeng sees |
| `Signature` | Long text | token set, used for lexical matching |
| `Topic` | Single line text | for the dashboard theme ranking |
| `QuestionCount` | Number | the "847 people asked this" number |
| `Status` | Single select | `Open`, `Shortlisted`, `Answered`, `Passed`, `Merged` |
| `Promoted` | Checkbox | |
| `PromotionCount` | Number | |
| `Language` | Single select | `en`, `tl`, `ceb`, `ilo` |
| `TextRefreshed` | Checkbox | merged text has been regenerated from a real sample |
| `MergedInto` | Single line text | set when absorbed by the hourly recluster |
| `AnsweredAt` / `PassedAt` | Date with time | |
| `AnswerAudioUrl` | URL | |
| `AnswerTranscript` | Long text | |
| `ArchiveId` | Single line text | |
| `Signature` (answer) | Single line text | HMAC provenance stamp |
| `PassReason` | Single line text | |
| `CreatedAt` / `UpdatedAt` | **Date with time** | |

### `Promotions` — points spent to guarantee review
| Field | Type | Notes |
|---|---|---|
| `ClusterId` / `UserId` / `UserName` | Single line text | |
| `PointsSpent` | Number | |
| `LedgerId` | Single line text | **the refund pointer** — points back at `YengPoints` |
| `Status` | Single select | `Active`, `Refunded` |
| `CycleStart` | Date with time | weekly cap window (Monday 00:00 Manila) |
| `CreatedAt` / `RefundedAt` | Date with time | |

### `ModerationFlags` — one row per flagged submission
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `Category` | Single select | `mean`, `sexual`, `intrusive` |
| `Excerpt` | Long text | first 500 chars, for appeal review |
| `CreatedAt` | **Date with time** | 45-day trailing window |

### `ModerationState` — one row per flagged user
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `Tier` | Number | 0–3. **1 is silent**, 2 notifies + throttles, 3 shadowbans |
| `Category` | Single line text | |
| `FlagCount` | Number | |
| `Shadowbanned` | Checkbox | |
| `NotifiedAtTier` | Number | stops us re-telling them a filter exists |
| `UpdatedAt` | Date with time | |

### `Archive` — the verified corpus
| Field | Type | Notes |
|---|---|---|
| `Title` | Single line text | |
| `Kind` | Single select | `Answer`, `Interview`, `Performance`, `Other` |
| `Source` | Single line text | |
| `SourceUrl` / `AudioUrl` | URL | |
| `DurationSeconds` | Number | |
| `Transcript` | Long text | **JSON array** of `{t, text}` cues |
| `TranscriptPlain` | Long text | flat text, for search fallback |
| `TranscriptStatus` | Single select | `Pending`, `Queued`, `Running`, `Done`, `Failed`, `Provided` |
| `TranscriptError` | Single line text | |
| `Language` | Single select | `en`, `tl`, `ceb`, `ilo` |
| `ClusterId` / `ClusterSize` | Text / Number | set when minted from an answer |
| `Verified` | Checkbox | |
| `Signature` | Single line text | HMAC over url + cluster + timestamp |
| `Status` | Single select | `Candidate`, `Approved`, `Skipped` — **skips are retained, never deleted** |
| `Excerpt` | Long text | shown in the keep/skip queue |
| `ApprovedBy` / `SkippedBy` | Single line text | |
| `RecordedAt` / `PublishedAt` / `ApprovedAt` / `SkippedAt` / `TranscribedAt` / `CreatedAt` | Date with time | |

### `TourDemand` — "I'd come if you played here"
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `City` / `Country` | Single line text | |
| `PartySize` | Number | 1–20. This is what makes it bookable |
| `Latitude` / `Longitude` | Number (precision 6) | resolved once at write time |
| `GeoSource` | Single select | `dict`, `nominatim`, `unresolved` |
| `IsDemo` | Checkbox | **seeded rows only.** Always reported separately |
| `Day` | Date | |
| `CreatedAt` / `UpdatedAt` | Date with time | |

### `Notifications` — pull-model delivery
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `Kind` | Single select | `cluster_answered`, `moderation`, `card_drop`, `info` |
| `Title` / `Body` | Text / Long text | |
| `LinkUrl` | Single line text | |
| `ClusterId` | Single line text | |
| `Read` | Checkbox | |
| `CreatedAt` / `ReadAt` | Date with time | |

### `SongRankings` — head-to-head Elo state
| Field | Type | Notes |
|---|---|---|
| `SongId` | Single line text | `MusicContent` record id |
| `SongTitle` | Single line text | |
| `Rating` | Number | Elo, starts at 1500 |
| `Appearances` / `Wins` | Number | under 10 appearances = provisional |
| `UpdatedAt` | Date with time | |

### `SongVotes` — one row per matchup (**the dataset**)
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `WinnerId` / `WinnerTitle` / `LoserId` / `LoserTitle` | Single line text | |
| `City` / `Country` | Single line text | which songs matter in Cebu vs Chicago |
| `Day` | Date | |
| `CreatedAt` | Date with time | |

### `GameSessions` — server-authoritative game state
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` | Single line text | |
| `Game` | Single select | `millionaire`, `lyric` |
| `State` | Single select | `active`, `banked`, `won`, `lost` |
| `Level` / `PointsWon` | Number | |
| `Questions` | Long text | JSON — **contains the answers, never sent to the client** |
| `LifelinesAvailable` / `LifelinesUsed` | Long text | JSON arrays |
| `ElapsedSeconds` | Number | |
| `Day` | Date | once-per-day key |
| `StartedAt` / `EndedAt` | Date with time | |

### `Lyrics` — Finish the Lyric source
Entered by hand from cleared material. **Nothing is scraped or generated.**

| Field | Type | Notes |
|---|---|---|
| `SongTitle` | Single line text | |
| `PromptLine` | Long text | the line shown |
| `AnswerLine` | Long text | the line they must type |
| `AudioUrl` | URL | optional clip |
| `AudioStart` / `AudioSeconds` | Number | clip window |
| `Status` | Single select | `Active`, `Draft` |

### `SetlistPicks`
| Field | Type | Notes |
|---|---|---|
| `EventId` / `EventTitle` / `City` | Single line text | |
| `UserId` / `UserName` | Single line text | |
| `SongIds` | Long text | comma-separated record ids, max 10 |
| `Correct` / `Accuracy` | Number | filled at scoring |
| `Scored` | Checkbox | |
| `Day` | Date | |
| `CreatedAt` / `UpdatedAt` / `ScoredAt` | Date with time | |

### `CardCatalog` — the card designs
| Field | Type | Notes |
|---|---|---|
| `Name` / `CardTitle` | Single line text | |
| `Rarity` | Single select | `Common`, `Uncommon`, `Rare`, `Legendary` |
| `CardTotal` | Number | numbered run size |
| `FrontUrl` / `BackUrl` | Single line text | paths under `/cards/` |
| `Perk` | Single select | `discount`, `multiplier`, `lifeline`, `lineskip` |
| `PerkValue` | Single line text | e.g. `10` for a 10% discount |
| `YengPoints` | Number | bonus points on acquisition |
| `PremiumExclusive` | Checkbox | members-only art |
| `Status` | Single select | `Active`, `Retired` |

### `CardOwnership`
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` / `CardId` / `CardName` | Single line text | |
| `Rarity` | Single select | |
| `Serial` | Number | position in the numbered run |
| `Source` | Single line text | which trigger dropped it |
| `AcquiredAt` | Date with time | |

### `CardDrops` — drop log
| Field | Type | Notes |
|---|---|---|
| `UserId` / `UserName` / `CardId` | Single line text | |
| `Reason` / `Tier` / `Rarity` | Single line text | |
| `Day` | Date | weekly-drop key |
| `CreatedAt` | Date with time | |

### `Translations` — authored content translations
| Field | Type | Notes |
|---|---|---|
| `RecordId` | Single line text | the record being translated |
| `Language` | Single select | `en`, `tl`, `ceb`, `ilo` |
| `Field` | Single line text | e.g. `title`, `transcript`, `subtitles` |
| `Value` | Long text | **authored and reviewed by a human, never machine output** |
| `ApprovedBy` | Single line text | |
| `UpdatedAt` | Date with time | |

### `Leaderboard` and `ActivityEvents`
⚠️ **These two were referenced by shipped code but never existed in the base.** `setup-airtable.js` creates them so `compute-leaderboard.js`, `get-fan-score.js`, `get-leaderboard.js` and `track-activity.js` stop writing into the void. Field lists are in the setup script.

---

## 2. EXISTING TABLES — changes made by this build

| Table | Change |
|---|---|
| `Users` | **`Password` now holds a bcrypt hash.** `login.js` transparently migrates a plaintext row on next login; run `node scripts/hash-existing-passwords.js` to migrate everyone at once. New fields: `PointsBalance` (Number), `AcceptedTermsAt` (Date with time). |
| `Memberships` | `Status` gains `AwaitingPayment` and `PaymentFailed`. `ExpiryDate` is now **+1 month**, not +1 year — the tiers are sold monthly and one month's payment previously bought twelve. New: `PaidAt`. |
| `MessageRequests` | `Status` gains `AwaitingPayment`, `PaymentFailed`. New: `PaidAt`, `AmountPaid`, `RefundedAt`. Payment is now confirmed by the Stripe webhook only. |
| `Events` | New: `SetlistScored` (Checkbox), `ActualSetlist` (Long text, comma-separated song ids), `SetlistScoredAt`. |
| `SiteConfig` | New keys: `cameo_price_video`, `cameo_price_voice`, `cameo_price_written` — Cameo pricing is now configurable instead of hardcoded in four places. |

---

## 3. Environment variables

| Variable | Required? | Used by |
|---|---|---|
| `AIRTABLE_API_KEY` | **yes** | everything |
| `AIRTABLE_BASE_ID` | **yes** | everything |
| `JWT_SECRET` | **yes** | auth + archive provenance signatures |
| `OPENAI_API_KEY` | for clustering + Whisper | `lib/clustering.js`, `transcribe-archive.js`, `get-ai-insights.js`. Missing = merged text falls back to the fan's own wording and transcription is disabled; nothing breaks. |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | for voice memos + video delivery | `sign-upload.js` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_ACCOUNT_ID` | for Cameo payments | `create-cameo-checkout.js`, `stripe-webhook.js`. **`STRIPE_CONNECT_ACCOUNT_ID` is Yeng's connected account** — she is merchant of record. |
| `PLATFORM_FEE_PERCENT` | optional (default 15) | the platform's cut |
| `SITE_URL` | optional | Stripe redirects |
| `CRON_SECRET` | recommended | guards `recluster-questions` and `transcribe-archive` against anonymous invocation |
| `YENG_ADMIN_USER_ID` | optional | pins specific accounts as "Yeng" in the activity feed |

---

## 4. Known drift in legacy tables

Left as-is because changing a field name breaks the shipped functions that read it. Fix during a maintenance window, not mid-pitch.

| Drift | Where |
|---|---|
| `UserID` vs `UserId` | `ContentRatings` alone uses `UserID`; all eight other child tables use `UserId` |
| `ContentID` vs `ContentId` | `ContentRatings.ContentID` vs `UserFavorites.ContentId` |
| `ContentURL` vs `ContentUrl` | `Covers.ContentURL` vs `ExclusiveContent.ContentUrl` / `MediaUrl` |
| `Status` vs `ReviewStatus` | every table uses `Status` except `ContentRatings.ReviewStatus` |
| Three YouTube spellings | `get-music-content.js:108` tries `YouTubeURL \|\| YoutubeUrl \|\| YoutubeURL` |

---

## 5. Hard limits

- **5 requests/second per base** — `createAll()` in `lib/common.js` sleeps 250ms between batches.
- **10 records per batch write** — `chunk()` handles it.
- **100,000 characters per long-text field** — `clampLongText()` truncates at 99,000.
- **Pagination is server-side** — `fetchAll()` caps at 5,000 records by default.
