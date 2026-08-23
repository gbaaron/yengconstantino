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

## Files changed

`css/styles.css` (appended) · `ask.html` · `archive.html` · `tour.html` ·
`js/yeng.js` · `netlify/functions/get-translations.js` · `music.html` ·
`deck.html`

No backend contracts, endpoints, record shapes or auth flows were changed.
