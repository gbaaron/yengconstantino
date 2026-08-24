# Redesign — the record layer

Applied to **Ask Yeng**, **the Archive** and **Tour Demand**. The other 24 pages
are untouched and keep the `.page-hero` component.

---

## The thesis

> **serif = what a person said · mono = what the system recorded**

Her words, fan questions and city names are set in the display serif. Every
count, timestamp, date, source line, language tag and signature is monospace
with letterspacing, like a catalogue card or a tape log.

That split is the provenance pitch made visual, and it is the reason these
pages read as a record rather than as a website about a singer. It is also the
part that cannot be lifted onto another artist without also lifting the product
thesis — which was the test the brief asked the design to pass.

---

## What replaced what

| Before | After |
|---|---|
| Dark ember hero, two blurred orbs, gold Kalam eyebrow, gradient-clipped title, stat row — on every page | `.page-intro`: warm paper, ink title, serif-italic kicker, rules |
| Zero-count stats as the hero (`0 fans waiting · 0 open · 0 answered`) | Meta line that renders only real numbers; otherwise just the language list |
| Submit → toast, textarea cleared | Submit → the page becomes a **question record** |
| Language `<select>`, English first | Four equal buttons, none visually default |
| Floating rounded cards | Ruled entries; cards only for genuinely discrete objects |
| Black map with neon-gold dots, always loaded | Paper map, red demand / gold your-city, opt-in below 900px |
| Map first, ranked list second | Ledger first and always; map is never the only representation |

## The transparency moment

Three layers, in this order:

1. **The question Yeng sees** — largest thing on the page
2. **How many people it carries** — stated in mono, not gamified
3. **Your words** — the fan's exact wording, under a gold rule, with
   *"Your wording stays here exactly as you sent it."*

The banner reads `YOUR QUESTION JOINED 846 OTHERS` when the cluster holds 847 —
others, not total. On a product whose pitch is honest arithmetic, the two
numbers have to reconcile.

---

## Deviations from the brief, and why

**1. No Leaflet.** The brief allows keeping an existing map. Ours is a
hand-rolled equirectangular SVG: zero dependencies, zero third-party requests,
and it reads as a printed map on paper rather than as somebody else's
cartography. Tile requests are exactly the mobile-data cost §12 asks us to
avoid. Restyled to the paper palette instead.

**2. Kept Fraunces, did not adopt Newsreader.** Swapping `--font-display`
site-wide would touch 27 pages; leaving Fraunces on 24 and Newsreader on 3
is worse than either. Fraunces is also the more distinctive face, and the
identity now lives in the evidence layer rather than in the serif. To reverse:
change `--font-display` in `css/styles.css` and the four font links.

**3. No trend arrows on the city record** (`↑ 428 people since July`). We keep
no historical snapshots. Inventing one is the single thing this product cannot
do. Rank within country is shown instead, because that is real.

**4. Did not alias legacy tokens.** `--purple` already holds `#A52C32` and
matches `--yeng-red` exactly, so `--purple: var(--yeng-red)` buys nothing and
adds cycle risk. New semantic tokens are declared as literals alongside.

**5. Left the nav pill alone.** §7 asks for a restrained underline. The nav is
shared by all 27 pages; restyling it is a repo-wide change, not a
three-page one.

---

## Bugs found and fixed on the way

- **Dates rendered a day early.** `new Date('2026-08-28')` parses as UTC
  midnight and renders as Aug 27 west of Greenwich. Added `Yeng.fmtDate()`,
  which treats a bare `YYYY-MM-DD` as a calendar date. On an archive whose
  whole pitch is provenance this is not cosmetic.
- **"Philippine Idol Era" filter on `music.html`.** She won **Pinoy Dream
  Academy** (2006, first Grand Star Dreamer). The label is corrected; the
  `data-era` value still has to match the Airtable `Era` field, so **the
  Airtable value needs renaming separately.**

### Tried and reverted

`body { overflow-x: clip }` — `overflow-x: hidden` does make `<body>` a scroll
container, but `clip` makes it a *clipping* context and drags the fixed nav out
of the viewport. Left as `hidden`, with a comment so nobody tries it again.

---

## Follow-up session — data, seeding and exposure

Once the Airtable base was created, three more real problems surfaced. None of
them were visible while every table was missing.

- **Seed script crashed on a temporal dead zone.** `seedQuestions` passed
  `cl.signature(tokens)` inside the initialiser of the very
  `const { match, tokens }` that declares `tokens`. Only ever hit at runtime,
  so `node --check` was clean. The production path (`submit-question.js`) does
  not have this shape. Now fetches the real cluster record for its signature.
- **Seeded tour data looked fabricated.** The writer capped rows at 40 per city
  and multiplied party size by `pledges/40` to preserve the headcount, so every
  city showed exactly "40 COMMITMENTS" and Quezon City showed an average party
  of 9. Now writes one row per commitment and draws party size from a shape
  real signups have. Commitment counts vary 12–148; averages sit 1.9–3.8.
- **`publish = "."` means the repo root is the web root.** Confirmed live:
  `/package.json` returned 200. `AUDIT.md`, `AIRTABLE_SCHEMA.md` and the
  design-review handover would all have been publicly fetchable on push. Docs
  moved to `docs/`, `design-refs/` gitignored, and `netlify.toml` now 404s
  `/docs/*`, `/scripts/*`, `/design-refs/*` and the root config files.
  `build-www.js` excludes both directories from the Capacitor bundle.
- **Topic labels read as debug output.** `topicLabel` took the first three
  meaningful tokens, giving "Going · Through · Head". In a question the subject
  lands at the end, so it now takes the last two: "Hawak Kamay", "Chinita
  Girl", "Acoustic Album".

## Second pass — putting the joy back

The first pass optimised hard for *evidence over decoration, restraint, calm,
boring enough to trust*. That is right for the Archive. Applied to the whole
fan experience it produced a court exhibit for a pop star. Client's words:
*"still far too rigid… lacks a ton of fun that a site and app for Yeng should
have."* He was right.

Four independent design directions were generated and scored by three lenses
each — a fan in Cebu, an AI-look sceptic, and the person pitching to
management. Three tied at 22/30. The diagnosis they converged on:

### The one rule, now written into the stylesheet

> **Monospace is a chain-of-custody typeface. If deleting the line would
> weaken a claim about who said something and when, it is mono. Otherwise it
> is the body face with tabular figures.**

`--font-evidence` was spent **15 times** in the stylesheet plus ~20 more
inline, so a party size, a character counter and a signature hash were
typeset identically. Mono that is on every number signals nothing. It is now
down to **8 uses**, all genuinely custody: cue timestamps, source lines,
signatures, the verified stamp, submission dates. Everything else moved to a
new `.fig` class — body face, tabular figures, larger, warmer.

That single change did most of the warming and touched no layout.

### The ember hero is gone

Six pages — games, cards and all four game screens — ran a near-black
gradient behind two 80–100px blurred orbs with a gradient-clipped title. So
the two most playful surfaces on the site were also the darkest and the
driest, and `games.html` read as a different product from `ask.html`.
`.page-hero` now sits on paper with an ink title. Same component, same
markup, six pages converted.

### Kalam is retired

A handwriting face used as the identical eyebrow on 23 pages was the most
template-shaped thing left in the build. Its job passes to the display serif
in italic — which is what the redesigned pages already did, so this also
unified the two aesthetics that were coexisting. **Note:** only three pages
were loading Fraunces' italic axis, so all 26 font links were normalised;
without that the other 23 would have rendered a fake browser-slanted oblique.

### Era pigments

Colour comes back through the catalogue, not through gradients. Four eras,
each with two tokens: `--era` is AA-safe on paper and is the only one allowed
to carry type; `--era-bright` is fill-only. That split stops the set
collapsing into one muted brown family on a mid-range LCD in daylight.

Era pigment is **not** allowed on Archive entries. Era is a catalogue
attribute of songs; tagging an interview clip with one is an editorial
assertion laid on top of testimony.

### Bugs this pass surfaced

- **The era filter was silently broken.** The tabs emitted `Early Career`
  while the fallback catalogue tagged its songs with *album* names —
  `Treal`, `Reserba`, `Bakit Ganito`, `Salamat` — and `filterFallback`
  compares with strict equality. Every era tap returned zero results whenever
  the API was empty, which is exactly when a fallback is supposed to save
  you. One vocabulary now drives both.
- **The music table demanded 428px of fixed columns.** On a 390px phone every
  title truncated to `Jeep…`. Restructured to three columns with the figures
  grouped so they collapse instead of the title.
- **YouTube `hqdefault` has letterbox bars baked into the pixels** — 45px top
  and bottom of 360, exactly 12.5%. A square crop keeps them; a 16:9
  cover-crop removes precisely that much. `maxresdefault` is the obvious
  upgrade but 404s across this 2006–2016 catalogue.
- **The seeded song list was guessed and one title was wrong** — "Chinita
  Girl" for what is actually *Chinito*. The seed now reads the real catalogue
  from `MusicContent` rather than from memory.
- **A `demo-` prefix on `SongId` broke the join** in `get-song-pairs`, which
  matches on the raw MusicContent record id — so the standings rendered empty
  with 180 votes in the table.

### What deliberately stayed sober

The Archive entries, the Ask arithmetic (`.qrecord__banner`, the grouping
labels, `.answer__math`), her recorded answer, the handler dashboard, and
Studio. Colour on those surfaces is a data channel; spending it on mood would
make the handler's charts lie.

## Bug sweep

Fixes found by auditing what the redesign had disturbed, plus what it exposed.

| Bug | Effect | Fix |
|---|---|---|
| `prefers-reduced-motion` covered a single 6px dot | A user who asked the OS to stop animating still got three infinite blob animations and every card transition | Global stop for animation, transition and scroll-behaviour |
| Three `.hero__blob` circles, 340–520px under a 120px blur, animating forever on the first screen | Permanent compositing cost for an audience on mid-range Androids | Deleted, CSS and markup |
| `.track-head` emitted 7 children after `.track-row` was restructured to 3 | Every column label sat over the wrong column above 860px | Head mirrors the row; figures header carries its own sub-columns |
| Track head had no left border | 4px misalignment against the row's era stripe | Transparent 4px border to match |
| Three thumbnail sites rendered `hqdefault` into a square box | Baked-in letterbox bars showed on every music row | `.yt-crop` — image at 133.34% of the box, centred, cropping exactly the 12.5% bars |
| `Yeng.ytArt` called on `music.html`, which does not load `yeng.js` | Would have thrown a `ReferenceError` and broken the page — caught before commit | Canonical implementation moved to `js/app.js`, which every page loads; `yeng.js` delegates |
| Two-line nav wordmark measured 101px inside a 73px bar | "OPM Icon" hung below the nav and was clipped, on 14 pages | Explicit tight leading on both lines |
| `covers.html` fetched two placeholders from `placehold.co` | Third-party image host on a client-facing page, and generic-placeholder styling | Inline SVG data URIs, fully percent-encoded so neither quote character survives into the JS string or the HTML attribute |
| `#5B2D8E` — a purple from the scrapped palette — survived inside URL-encoded inline SVGs | Invisible to a plain colour sweep | Replaced with the concert red in `styles.css`, `covers.html`, `merch.html` |
| `music.html` kept its own hand-rolled ember hero | Once `.page-hero` moved to paper this was the only fan surface still near-black | Converted to match |

### Known, not fixed

`deck.html` still carries 15 Unsplash background images and three instances of
the scrapped purple. It is the stale pitch deck, already `noindex, nofollow`
in `netlify.toml`, and superseded by `demo.html`. Rewriting it is a separate
piece of work — flagging rather than half-doing it.

## The iOS app

The app did not match the site, for two separate reasons.

**The bundle was four months stale.** `ios/App/App/public` is generated by
`scripts/build-www.js` and is gitignored, so it only updates when someone runs
the build. It was dated 10–12 July and held **13 HTML files against the site's
27** — it predated Ask Yeng, the Archive, Tour Demand, all four games, Cards,
Studio, the handler dashboard and the demo shell. Those pages did not exist in
the app at all. Rebuilt; every page is now byte-identical to the site.

**The native shell was still wearing the scrapped palette.** This is the part
a rebuild could never fix:

| | Was | Now |
|---|---|---|
| App icon | dark purple, `#18002B` family | concert red, cream serif Y, gold rule |
| Splash image | white canvas, stock sky-blue Capacitor mark | paper, the wordmark in ink, gold rule, red OPM |
| `SplashScreen.backgroundColor` | **`#6C2BD9`** — the exact purple §7 bans by name | `#F3EEE5` paper |
| `StatusBar.backgroundColor` | `#FAFAFC` cool grey | `#FBF8F2`, matching what `.nav` actually paints |
| `manifest.json` `background_color` | **`#6C2BD9`** again | `#F3EEE5` |
| Launch storyboard ground | `systemBackgroundColor` → **black in dark mode** | explicit paper |
| `UIUserInterfaceStyle` | unset — followed system dark mode | `Light` |

Launching used to give you white, then blue, then purple, then warm paper —
four unrelated colour worlds before the product appeared.

Art is generated by `scripts/make-app-art.py` so it can be regenerated when
the palette moves. It renders in Georgia Bold, which is effectively the
fallback the site already ships to anyone without the Fraunces webfont.

### Two app-only bugs the simulator surfaced

- **The status bar clock was white on paper.** `native-bridge.js` hardcoded
  `StatusBar.setStyle({ style: 'DARK' })`. Capacitor's naming describes the
  *background*, not the glyphs — `Dark` means light text for a dark surface.
  Correct when the app was near-black; invisible against paper.
- **The home hero was clipped under the nav.** `styles.css` sets
  `padding-top: calc(72px + env(safe-area-inset-top))` on `.hero--home`, but a
  mobile media query in `index.html` used the shorthand
  `padding: 120px 0 60px`, which silently discarded the safe-area term. The nav
  is ~127px tall on a notched device, so the title sat underneath it.

Verified by building and running on an iPhone 17 simulator.

## Files changed

`css/styles.css` (appended) · `ask.html` · `archive.html` · `tour.html` ·
`js/yeng.js` · `netlify/functions/get-translations.js` · `music.html` ·
`deck.html`

No backend contracts, endpoints, record shapes or auth flows were changed.
