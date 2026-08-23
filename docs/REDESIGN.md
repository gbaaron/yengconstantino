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

## Files changed

`css/styles.css` (appended) · `ask.html` · `archive.html` · `tour.html` ·
`js/yeng.js` · `netlify/functions/get-translations.js` · `music.html` ·
`deck.html`

No backend contracts, endpoints, record shapes or auth flows were changed.
