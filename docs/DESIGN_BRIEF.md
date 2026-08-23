# Design Brief — Yeng Constantino Fan Platform

*Prepared for an external design review. Attach this file plus `css/styles.css` and the screenshots in `design-refs/`.*

---

## 1. What this is

A **spec-built fan platform** for **Yeng Constantino** — a Filipino singer-songwriter who won *Pinoy Dream Academy* season 1 in 2006 and has been one of OPM's (Original Pilipino Music) defining voices for twenty years. She has roughly **10 million followers** across social platforms.

This is **not an official Yeng Constantino product.** It is a working concept built by **Global Media** (a sub-brand of Globally Ballin LLC) to pitch to her management. Nothing on it should read as though it is operated by or endorsed by her. Every page carries a "spec concept" disclaimer.

It is a **live, functional web app** — plain HTML/CSS/JS, no framework, Airtable backend via Netlify Functions — not a mockup. It also ships as an iOS app via Capacitor.

---

## 2. The idea the whole product serves

Every design decision should resolve toward this one sentence:

> **She owns her verified archive, and every fan-facing feature fills it as a byproduct.**

The pitch is not "engagement platform." **The pitch is provenance.**

There are cloned voices and fabricated quotes attributed to this artist circulating on Filipino social media right now, and that only gets worse. A database of her **actual words** — timestamped, signed, controlled by her — is the only defence, and it is an asset that appreciates.

She will never be asked to do data entry. She answers fan questions for fifteen minutes a week by voice memo, taps approve on a few interviews, and the archive accumulates underneath.

**Two rules that constrain the design absolutely:**

1. **Never generate content in her voice. Never simulate her.** The moment a fan suspects they are talking to an AI wearing her face, the entire trust proposition is dead. Search returns her real recordings, cued to the second. Nothing is paraphrased or synthesised. Her audio is subtitled, never dubbed.
2. **Asymmetric access, honestly labelled.** She has ~10M followers and cannot reply to them. The system makes one answer land for thousands — and it **shows the fan the maths** rather than pretending she answered them personally. The interface says *"847 people asked something like this. Here's the merged question that goes to Yeng. Here's your version."*

---

## 3. Who it is for — three distinct audiences

The product is delivered as a **six-view demo**: three audiences × two form factors (web / mobile app).

### A. The fan
Filipino, mostly 18–40, plus a large **diaspora** cohort (second-generation kids in Chicago, Toronto, the Gulf, Singapore, Dubai) who are the most monetisable slice and currently get maybe 60% of her.

They are on a phone, on mobile data, often on a mid-range Android. They speak **Taglish** — English and Tagalog mixed in the same sentence — and a large minority speak **Cebuano/Bisaya** or **Ilocano** as a first language. Bisaya speakers are routinely an afterthought in Manila-centric media; this product treats all four languages as first-class.

Their surfaces: Ask Yeng, the Archive, a Tour Demand map, four mini-games, collectible cards, music, store, membership.

### B. Yeng herself
Fifteen minutes a week, **in a car, on a phone**. Big targets, one decision per screen, nothing that needs a keyboard. She records voice answers, taps keep/skip on archive candidates, and records personalised videos.

Her surface is called **Studio**. If it takes more than ten seconds per item, she will not use it.

### C. The handler / management
The bottleneck, and the person who actually evaluates this pitch. They are **drowning in DMs across five platforms**. The value proposition is **shape, not more inbox**.

Their dashboard opens on *"What needs you today"* — one ranked list — and is organised **by job, not by database table**. It shows question themes ranked by how many people asked, tour demand by city with party sizes, sentiment trends, a moderation overview, a revenue and points-economy summary.

---

## 4. Current design direction — "Tahanan Songbook"

*Tahanan* means "home" in Tagalog. The intent is **editorial, printed, warm OPM soul** — like a well-made songbook or a concert programme, not a SaaS dashboard.

### Palette
```
--purple:    #A52C32   /* concert red — the primary accent, despite the var name */
--burgundy:  #741E27   /* deep red */
--gold:      #D49A24
--cream:     #FBF8F2   /* paper white */
--off-white: #F3EEE5   /* paper base */
--gray-800:  #191716   /* warm ink */
--teal:      #40584A   /* muted foliage green, used sparingly for "verified" */
```
Warm ink on warm paper. **No cool greys anywhere.** Note the CSS variable names are legacy (`--purple` holds a red) — values were remapped without renaming, for JS compatibility.

### Type
- **Display:** Fraunces (a soft, high-contrast serif)
- **Body:** Instrument Sans
- **Accent:** Kalam (a handwriting face) — used for Taglish eyebrow lines above titles: *"Pakinggan Mo"*, *"Saan ka namin gustong makita"*, *"Maglaro tayo"*

### Signature treatments
- **Hero:** a warm ember gradient ground (`#161010 → #2A1512 → #2E1B18`), two heavily-blurred orbs (red at 9%, gold at 7%), a gold Kalam eyebrow at 1.4rem, and the page title with a **red → burgundy → gold gradient clipped to the glyphs**.
- **Letterpress shadows:** hard-edged offsets like `4px 4px 0 rgba(25,23,22,0.10)` — no soft blur.
- **Tight radii:** 2–6px. Nothing is pill-shaped except deliberate chips.
- **Paper grain:** a subtle SVG turbulence filter on the body at 3.5% opacity.
- Light theme only, by design.

### Tier names are in Tagalog
Free · **Sariwang Simula** ("fresh start") · **Laging Nandito** ("always here") · **Ikaw Lamang** ("only you")

---

## 5. What we want from you

**A redesign proposal for the fan-facing surfaces** — specifically Ask Yeng, the Archive, and the Tour Demand map, plus whatever system-level thinking follows from those.

We want to see a different intelligent take, not a polish pass. Feel free to challenge the Tahanan Songbook direction entirely if you have a stronger idea — but argue for it.

Please give us:

1. **A stated point of view** — what is this product's visual thesis in one sentence, and why does it beat the current one?
2. **A colour and type system** with actual hex values and font names, and the reasoning.
3. **Concrete treatments** for the three named screens — layout, hierarchy, the hero language, how the "847 people asked this" transparency moment should feel.
4. **How the three audiences differentiate.** The fan surface, Yeng's Studio, and the handler dashboard should feel related but not identical. The handler view in particular must stay calm.
5. **Mobile-first thinking.** Most fans are on a phone; Yeng is always on a phone.

---

## 6. Hard constraints — please do not break these

| Constraint | Why |
|---|---|
| **It must not look AI-generated.** | This is the single most important requirement. See §7. |
| **No emoji as UI elements or image placeholders.** | Instantly signals template output. Inline SVG or real photography only. |
| **Never put words in the artist's mouth.** | No generated quotes, no simulated voice, no "Yeng says…" copy. Retrieval only. |
| **Plain HTML/CSS/JS.** | No React, no Tailwind, no build step. Hand-rolled CSS with CSS custom properties. |
| **Filipino, not generic-Asian or generic-Western.** | Taglish copy, OPM context, diaspora awareness. Avoid pan-Asian visual clichés. |
| **Light theme.** | Warm paper is core to the concept. Dark surfaces are used as accents (heroes, tool chrome), not as the base. |
| **Accessible contrast.** | Fans read this on cheap phones in daylight. |
| **It must be buildable.** | Real CSS, not a rendering. If a treatment needs a library, say so. |

---

## 7. The failure mode we are trying to avoid

The previous version of this site was scrapped for looking machine-made. A commit in the repo is literally titled *"Redesign to editorial Tahanan Songbook aesthetic to kill AI look."*

**What it looked like before, and must not look like again:**

- Purple → pink → gold rainbow gradients (`#6C2BD9`, `#BE185D`) on near-black
- Glassmorphism cards, heavy blur, neon glow shadows
- Inter for everything
- Big rounded corners everywhere, pill buttons on every surface
- Emoji standing in for icons and product photos
- Generic Unsplash concert stock imagery
- Symmetrical three-column feature grids with an icon, a bold noun, and two lines of filler

If your proposal drifts toward any of that, we will not use it — no matter how polished it is. **Restraint, specificity and warmth beat polish here.**

A useful test: *would this look like it was made for this particular Filipino artist, or could you swap in any other name and it would work just as well?* If it's the latter, it's wrong.

---

## 8. What is already built, for context

27 pages, 72 serverless functions, one Airtable base.

**Features:** clustered asynchronous Q&A with tiered silent moderation; a verified archive with Whisper transcription and second-cued retrieval search; a tour-demand heat map; four mini-games (head-to-head song ranking, a Millionaire-format quiz, Finish the Lyric, setlist prediction); earned-only collectible cards; Cameo-style personalised video with Stripe Connect (the artist is merchant of record); a unified points currency; and four-language support.

The design work is the open question. The engineering is done.
