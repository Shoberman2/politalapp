# Design System — BallotWatch

## Product Context
- **What this is:** Congressional voting tracker with representative lookup, bill browsing, and AI-powered bill explanations
- **Who it's for:** Engaged citizens who want to understand what Congress is doing
- **Space/industry:** Civic tech, political transparency (peers: GovTrack, Congress.gov, Quorum, Open States)
- **Project type:** Web app (React SPA)

## Aesthetic Direction
- **Direction:** Editorial/Magazine — the feeling of a well-designed broadsheet newspaper covering Congress, not a government database or SaaS dashboard
- **Decoration level:** Intentional — thin rule lines as dividers (newspaper-style), generous whitespace. No gradients, no blobs, no decorative illustrations. One scoped exception: the landing hero's Capitol photograph under a dark gradient scrim (see the 2026-10-07 decision).
- **Mood:** Authoritative but approachable. Typography does the heavy lifting. Clean, confident, serious content presented with care. The user should feel: "This is unexpectedly well-designed for a civic tool, and therefore I trust it more."
- **Reference sites:** GovTrack (functional but dated), Quorum (enterprise SaaS), Open States/Plural (transitioning to B2B). BallotWatch deliberately departs from all of these by treating civic data as editorial content, not database output.

## Typography
- **Display and body:** Inter (variable, optical sizing), one family for everything readable. Headlines are plain Inter 600 with tight tracking. (Tokens `--serif` / `--display` for display and `--sans` for body; `--serif` is a historical name and is Inter.)
- **No italic accents.** No `<em>` inside h1–h3, no italic accent words, no serif. `--accent-serif` survives only as an alias of `--sans` so old rules resolve.
- **UI/Labels:** Inter 500 (nav 14px/500, labels 14px/500).
- **Data/Tables/Code:** Geist Mono — tabular figures, for vote counts, bill numbers, percentages, dates.
- **Mono kickers:** 11px, uppercase, tracking 0.12em. Sparingly: one per section at most, none above feature headlines.
- **Loading:** one Google Fonts request in `index.html` for Inter (`ital,opsz,wght@0,14..32,400..700;1,14..32,400..500`) and Geist Mono. Stylesheets use the tokens, never literal font names. `html` sets `font-optical-sizing: auto` and antialiasing.
- **Scale:**
  - Display XL (landing hero h1): clamp(40px, 5.6vw, 64px), 600, -0.035em, line-height 1.0
  - Section h2: clamp(28px, 3.4vw, 40px), 600, -0.025em, line-height 1.08
  - H3: 20px, 600, -0.01em
  - Body: 17px/1.55 on the landing, 16px/1.6 elsewhere
  - Small: 14px
  - Caption: 13px
  - Mono data: 11-12px
- **Buttons:** Inter 15px/500 (14px on `.btn-sm`).

## Color
- **Approach:** Restrained — one accent + neutrals, color is rare and meaningful
- **Background:** #FAFAF7 — warm paper white
- **Surface:** #FFFFFF — cards, elevated panels
- **Primary text:** #1A1A18 — near-black, warm
- **Secondary text:** #6B6861 — warm gray
- **Muted text:** #9C9789 — metadata, timestamps
- **Accent:** #1D4ED8 — deep civic blue. Not flag-blue, not corporate-blue. Confident institutional sapphire. Usage: links, active states, primary buttons, bill numbers.
- **Accent hover:** #1E40AF
- **Accent subtle:** rgba(29, 78, 216, 0.08) — backgrounds for selected/active states
- **Border:** #E8E6E1
- **Border light:** #F0EEEA
- **Semantic:**
  - Success: #16A34A (bills passed, yea votes)
  - Warning: #D97706 (upcoming votes, pending actions)
  - Error: #DC2626 (missed votes, nay votes, alerts)
  - Info: #0284C7 (AI explanations, informational)
- **Party colors (secondary, not dominant):**
  - Democrat: #2563EB (light mode) / #60A5FA (dark mode) — used as small text tags and thin indicator bars, NOT card backgrounds
  - Republican: #DC2626 (light mode) / #F87171 (dark mode)
  - Independent: #7C3AED (light mode) / #A78BFA (dark mode)
- **Dark mode:**
  - Background: #111110
  - Surface: #1C1C1A
  - Surface raised: #242422
  - Primary text: #E8E6E1
  - Secondary text: #9C9789
  - Muted text: #6B6861
  - Accent: #5B8DEF
  - Accent hover: #7BA3F3
  - Border: #2A2A27
  - Strategy: warm near-blacks, reduced saturation on semantic colors, accent shifts to lighter blue for contrast

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:** 2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Hybrid — editorial reading-order for politician profiles and bill pages (top to bottom, like an article), grid-disciplined for browsing/listing pages (cards, filters)
- **Grid:** Single column for content pages, 2-3 columns for listing/browse pages
- **Max content width:** 1180px (`--maxw`)
- **Border radius:** btn: 12px (primary and small buttons, button-joined inputs — `--r-btn`), toggle: 8px (filters, segmented controls, text-button focus ring — `--r-toggle`), icon: 10px (40px icon-only buttons — `--r-icon`), sm: 4px (tags, chips, inputs), md: 8px (cards, panels), lg: 12px (hero sections, modals), full: 9999px (avatars)
  - Never use a pill radius (999px) for a button or toggle. 12px on a 44px button is clearly soft and clearly not a pill (~22px) or a square.
  - A button nested inside a bordered container (e.g. the landing ZIP field) sets the container to `calc(var(--r-btn) + <padding>)` so the two curves stay concentric.
- **Buttons:** one shared system, unscoped in `src/styles/App.css` (`.btn-primary`, `.btn-secondary`, `.btn-text`, `.btn-go`, `.btn-sm`, `.btn-toggle`, `.btn-icon`). Each variant class works on its own; page stylesheets only add layout (width, margin, flex), never button visuals.
  - **Primary** (`.btn-primary`, one per view): solid `--accent`, white label, Inter 15px/500, sentence case, padding 11px 18px, min-height 44px, `--r-btn`, no border, no shadow; hover `--accent-hover`.
  - **Secondary** (`.btn-secondary`): a quiet text action, not a box — accent label at 600, no border, no fill, underline on hover. Add `.btn-go` for a trailing arrow when it navigates. `.btn-text` is the same action inline (no padding or min-height). `.btn-ghost` and `.btn-tertiary` are legacy aliases of secondary.
  - **Small** (`.btn-sm`): 14px, min-height 36px, padding 8px 14px on primary.
  - **Toggles / filters / segmented** (`.btn-toggle`): 13.5px, `--r-toggle`, borderless; the selected item (`.is-active`, `.active`, `aria-pressed`/`aria-selected="true"`) gets a soft fill (`--fill-soft`), not a heavy border.
  - **Icon-only** (`.btn-icon`, theme toggle, burger, close): 40px square, `--r-icon`, no border unless it floats over imagery (map controls keep a hairline).
  - Provider sign-in button (`.auth-google`): the one bordered button, 1px rule, 44px, Inter 500; a documented exception so a third-party sign-in reads as a distinct control.
  - No uppercase, letter-spacing or mono type on any button. Focus-visible is a 2px accent ring offset 2px.
- **Key layout principles:**
  - Politician pages read like articles, not dashboards — top to bottom with editorial summary
  - AI bill explanations styled as marginalia (left-bordered annotation blocks), not chatbot bubbles
  - Party colors are text labels and thin bars, not full card background washes
  - Thin rule lines as section dividers (newspaper-style)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150ms) medium(250ms) long(400ms)
- **Principles:** The content is serious; motion should be calm. Subtle entrance fades, smooth hover transitions. No bouncy animations, no scroll-driven effects, no playful motion. One scoped exception: the landing hero's floor ticker, the only continuously scrolling content on the site (loading indicators aside; see the 2026-10-06 decision).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-24 | Initial design system created | Created by /design-consultation based on competitive research (GovTrack, Quorum, Open States) and Claude subagent input. Editorial direction chosen to differentiate from utilitarian civic tech tools. |
| 2026-03-24 | Instrument Serif for display | No civic tech tool uses a serif — positions BallotWatch as editorially credible, not just another data tool |
| 2026-03-24 | Party colors secondary, not dominant | Neutral card treatment for all politicians. Party is metadata, not identity. Interface feels trustworthy, not tribal. |
| 2026-03-24 | Editorial layout over dashboard widgets | Politician pages read top-to-bottom like articles. AI explanations as marginalia. More engaging than widget grids. |
| 2026-07-02 | Cinematic landing hero (scoped exception to minimal-motion rule) | Landing page (`Landing.jsx`/`Landing.css`) opens with an auto-playing, silent film into the Capitol: two very fast elevated runs through the halls (one banking into a sharp turn), then a top-down looking straight down over the chamber seats, posing "Do you know who actually sits here?". A matching closing section over a bill (`.voting`) asks "what are they actually voting on?" and surfaces a real current bill. Clips advance themselves (not scroll) and show progress dots; a Play button appears if the browser blocks autoplay. Interior/dynamic shots use Higgsfield Cinema Studio Video (best-fit cinematic model, speed-ramp); exterior and bill use Kling 3.0. Step-1 and step-3 walkthrough illustrations render from real member and bill data. All politician photos site-wide use the high-res unitedstates congressional image collection (`utils/memberImage.js`), with a congress.gov thumbnail as onError fallback. Explicit user sign-off to depart from Motion rules for the hero only; degrades to a static poster under `prefers-reduced-motion`. Assets: `public/hero-{run,run2,topdown,bill}.{mp4,jpg}`. |
| 2026-07-04 | Hero film → real footage of the actual U.S. Capitol (no AI) | Replaced the three AI-generated hero clips (`hero-run`, `hero-run2`, `hero-topdown`) — which read as generic European-palace interiors, not the real building — with real, freely-licensed footage/photography of the genuine U.S. Capitol, animated with calm cinematic push-ins (ffmpeg zoompan): (1) an exterior montage of several real Capitol stock clips cross-dissolved together — golden dawn wide → 3/4 angle → dome (Pexels, free license); (2) down the actual Brumidi Corridors (Architect of the Capitol, public domain); (3) up into the Rotunda dome, the Apotheosis of Washington fresco (Carol Highsmith / Library of Congress, public domain). Real interior *walkthrough video* of the Capitol isn't available under a free license (interior filming is restricted; it exists only as paid iStock — Rotunda tilt-up, Senate corridor), so the halls are conveyed via animated real stills. Closing overlay line retuned "who actually sits here?" → "what happens under this dome?" to match the new Rotunda shot. `hero-bill` (the `.voting` closer) is unchanged. Rationale: prior clips looked "very AI" and weren't the actual Capitol; authenticity matters for a civic reference. |
| 2026-07-25 | Hero film cut to ~4s and made to start on arrival | The three-clip, 9s film (4.16 MB) was too long to sit through and slow to start — the first shot alone was 1.88 MB at 1920px/5 Mbps, so arrivals saw a frozen poster. Cut the middle shot (Brumidi Corridors) and kept the two that carry the copy: exterior dome ("See how Congress votes.") → Rotunda ("what happens under this dome?"). Both re-encoded at 1.5× speed so the full camera move survives in ~2s each, 1440px/CRF28 → 4.13s and 1.03 MB total. Playback is kicked from the `ref` callback (before paint) and again on `canPlay`, not only from an effect; `index.html` preloads the first poster on `/` only. The below-the-fold `.voting` clip now starts on an IntersectionObserver instead of autoplaying at mount, so it isn't mid-loop by the time it's seen and doesn't compete with the hero for bandwidth. Assets: `public/hero-run2.{mp4,jpg}` removed. |
| 2026-07-25 | Finale CTA replaced with the real ZIP lookup | The closing section was a large saturated blue slab button that only scrolled back to the top — a second, louder primary action that contradicted "one accent, color is rare and meaningful," and a dead end after a long scroll. It now repeats the same paper-styled ZIP field as `.turn` and runs the lookup in place, with the result rendering beside whichever field was used (`lookupPlace`). Headline dropped from clamp(32-64px) to clamp(30-48px) with a mono kicker, so it reads as a closing note rather than a second hero. |
| 2026-07-25 | Buttons moved to their own radius token (`--r-btn: 10px`) | Buttons shared `--r-sm`/`--radius-sm` (3-4px) with tags, chips and inputs, so they read as flat rectangles rather than controls. Gave buttons a dedicated token at 10px — clearly rounded on a ~45px control, well short of the ~22px that would make it a pill — and left tags/panels square-ish, so roundness now signals "pressable". Applied to 31 button rules across 21 stylesheets (previously a mix of `--radius-sm`, `--r-sm`, `--r-md`, `--radius-md`, 8px and 6px). Containers that wrap a button set `calc(var(--r-btn) + padding)` to stay concentric. |
| 2026-10-02 | Cinematic landing hero retired; record-first landing | Founder decision to merge BallotWatch and CivicRelay under the mission "We use AI to make Congress easier to read and easier to reach. A person writes every message. A person answers it." and to remove most of the landing videos. The `.film` opener (`hero-run`, `hero-topdown`) and the `.voting` closer (`hero-bill`, AI-generated with Kling 3.0, which contradicts an honest-AI page) are deleted along with their assets, the poster preload in `index.html`, and the masthead's transparent over-hero mode. The 2026-07-02 scoped exception to the minimal-motion rule no longer applies anywhere. The first screen is now paper: a mono "Recorded through" kicker, the H1 "How did your representative vote this week?", the mission line, the ZIP lookup, and the latest real recorded vote as a card (skeleton while loading, never invented). New sections: "How we use AI" as two lists with left-rule marginalia (info blue for uses, neutral rule for never), "Tell your rep" as four mono-numbered steps, one `Surface` band for congressional offices linking to `/offices` (with a warning-amber status note: in development, not authorized, not for sale or trial), and a developers band with a mono code block. The company name renders from `src/config/brand.js` pending a rename. |
| 2026-10-04 | One button system; `--r-btn` 10px → 12px; secondary buttons become text actions | Founder feedback: buttons felt "boxy/pilly" and inconsistent; the platform should flow, minimal and easy. The 2026-07-25 10px rule only unified radius — 31 rules across 21 stylesheets still each drew their own button (bordered boxes, uppercase tracked labels, ink-filled CTAs, 999px tabs and chips). Replaced them with one unscoped system in `App.css`: solid civic-blue primary at 12px, borderless accent text for secondary actions (with an arrow when they navigate), 8px soft-fill toggles for filters and segmented controls, and 40px/10px icon buttons. Page stylesheets now carry layout only. Masthead CTA is sentence case, "Find my reps". Retires the 10px rule. The politician dashboard keeps its layout; only its buttons changed. Landing (`Landing.css`) adopts the system in its own rewrite. |
| 2026-10-04 | Fonts: Bricolage Grotesque + Hanken Grotesk, Instrument Serif italic accent | The founder found Instrument Serif headings with General Sans body didn't flow, and chose the UTern pairing (Bricolage Grotesque display, Hanken Grotesk body, Instrument Serif italic accents). Tokens `--serif` (display), `--sans` (body) and `--accent-serif` (italic accent) in App.css; every literal font-family in page stylesheets was replaced with tokens; italic display text uses the accent serif so no browser-faked italics remain. Landing also changed: no small labels above feature headlines, the record image shows the real member profile, "How we use AI" became a dark Now / Next / Never concept band ("what we're building toward"), the offices band is a bold full-width band with one primary action, the FAQ is a two-column section with larger questions, and the data-sources band moved off the landing to its own page. |
| 2026-10-04 | One info-page system | Founder feedback: Methodology looked like a different site and How it works was a wall of text. Every explanatory page (How it works, Data sources, Methodology index + topics, About, Contact, Privacy, Terms, For offices) now uses `InfoPage.css` only: a 720px reading column, a hero with an optional mono kicker, one serif `h1.ip-title` and a one-sentence lede, thin-rule sections, and `.btn-text .btn-go` arrow links. Shared patterns live there (`.ip-steps`, `.ip-index`, `.ip-sources`, `.ip-facts`, `.ip-pair`, `.ip-checks`, `.ip-quote`, `.ip-note`, `.ip-band`); the per-page stylesheets (About, Contact, Legal, Offices, How it works, and the methodology rules in OpenSourcePage.css) are gone. How it works is now four steps plus "What's live today" and the AI pair; source detail moved to the new `/data-sources`. Fonts come only from the `--serif`/`--sans`/`--mono` tokens. |
| 2026-10-06 | Inter for display and body; no italic accents; account gate | Founder found Bricolage Grotesque and the Instrument Serif italic accent words ugly and generic, and wanted a Linear/Apple-grade feel. Inter (variable, optical sizing) now sets every headline and all body text at 600/400 with tight display tracking; Geist Mono stays for data. Token names are unchanged (`--serif`, `--sans`, `--accent-serif` all resolve to Inter) so no page broke; `<em>` accents were removed from headlines site-wide. Parts of the app now need a free account: the list is `shared/access.js`, enforced by `src/components/AccessGate.jsx` around every route, and the sitemap leaves those pages out. |
| 2026-10-06 | Landing as a classic landing page; For offices as its own dossier page; full-width masthead | Founder feedback (2026-10-06): the nav exposed the app's features, the dark "Our concept / Now / Next / Never" band and the blue offices band looked bad, the logo sat too far from the left edge and the CTA too far from the right. The masthead is now full-width (logo at the left edge, `Sign in` + `Find my reps` at the right edge) with four public links: How it works, This week, Members, For offices; the theme toggle shows only when signed in. The landing keeps the parts the founder liked (hero question, ZIP call to action, latest-vote card, alternating feature sections with real-data cards, FAQ, finale) and extends the same feature format to `Ask your AI assistant` (MCP transcript card), `Built for agents and developers` (real `/api/v1/votes/<id>` JSON card) and a brief `For congressional offices` card low on the page. Both bands are gone. The ZIP hint says what a privacy audit could defend: "No sign-up to look up. Your ZIP code never reaches our servers." (the ZIP goes from the browser to Zippopotam.us; the member list request carries no ZIP; the address is saved only in localStorage; console logging of user input was removed). `/offices` left the info-page system for its own `Offices.css` dossier layout: two-column hero with a stacked inbox visual built from the real latest vote, numbered 01/02/03 columns, a two-column never-list, the CAO pull quote, one tinted closing band. All copy and legal constraints on that page are unchanged. The server-rendered masthead in `api/_lib/renderPage.js` mirrors the React nav. Gated routes (free account): the personal my-representative page, the Bills index, map, shutdown tracker, compare, AI Congress and committee pages; full member profiles, bill pages, record cards and roll calls stay public because the MCP server, llms.txt and search results link to them. |
| 2026-10-06 | Hero floor ticker (scoped exception to the minimal-motion rule) | The founder asked for the latest recorded votes to read as a news ticker rolling to the left instead of the single latest-vote card under the ZIP field. `.floor-ticker` is a full-bleed 56px strip (48px on mobile) on `--surface` between two `--rule` lines that closes the hero: a pinned mono label ("Latest recorded votes", "Latest votes" on mobile) and up to 12 real recorded votes, newest first, each a link to its roll call with chamber and roll number, bill number in accent, the bill's own words, the tally and the result chip. The list renders as many times as it takes to cover the strip plus one (at least twice; measured, so a one-vote list still loops without a gap), and the track shifts by one copy; every copy after the first is `aria-hidden` and out of the tab order. Each copy takes 7s per item to pass, never less than 40s. It pauses on hover and focus, and a mono Pause / Play text control in the label (`aria-pressed`, WCAG 2.2.2) stops it outright; a documented exception to the no-mono-on-buttons rule so the control reads as part of the label. When a ticker link has keyboard focus the strip stops and scrolls so the link is in view. Each link carries a spoken label (chamber and roll call, bill, subject, tally, result). It is static and scrollable under `prefers-reduced-motion`. Skeleton items while loading, the one-line unavailable note when there are no votes, never invented. It is the only continuously scrolling content on the site (loading indicators aside). The old `.hv-*` card is gone. |
| 2026-10-07 | Landing hero over a still of the real Capitol | Founder found the plain paper hero flat and asked for the Capitol behind it. The hero (`.landing .hero`) now sits on `public/hero-capitol.jpg`, a still frame of the real U.S. Capitol from the Pexels footage the retired 2026-07-04 film used (free license, not AI), under a dark top-to-bottom scrim (at least 0.62 over the dome and sky, 0.8 at the ticker) with a soft shadow under the lines, so the white headline, mission line and hint stay above 4.5:1 in both themes; phones load an 810x810 center crop (`hero-capitol-square.jpg`, same height so same sharpness). The ZIP field stays a white surface with a soft shadow in both themes (its tokens and `color-scheme` are pinned light, the placeholder at the darker `--ink-2` for contrast on white), and the server-rendered home's `.home-about` line is white too; the floor ticker still closes the hero. A still image, so the minimal-motion rule is unchanged. A scoped exception to "no dark bands" for the hero photograph only. |
