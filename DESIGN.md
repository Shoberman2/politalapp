# Design System — BallotWatch

## Product Context
- **What this is:** Congressional voting tracker with representative lookup, bill browsing, and AI-powered bill explanations
- **Who it's for:** Engaged citizens who want to understand what Congress is doing
- **Space/industry:** Civic tech, political transparency (peers: GovTrack, Congress.gov, Quorum, Open States)
- **Project type:** Web app (React SPA)

## Aesthetic Direction
- **Direction:** Editorial/Magazine — the feeling of a well-designed broadsheet newspaper covering Congress, not a government database or SaaS dashboard
- **Decoration level:** Intentional — subtle warm grain texture on hero sections, thin rule lines as dividers (newspaper-style), generous whitespace. No gradients, no blobs, no decorative illustrations.
- **Mood:** Authoritative but approachable. Typography does the heavy lifting. Clean, confident, serious content presented with care. The user should feel: "This is unexpectedly well-designed for a civic tool, and therefore I trust it more."
- **Reference sites:** GovTrack (functional but dated), Quorum (enterprise SaaS), Open States/Plural (transitioning to B2B). BallotWatch deliberately departs from all of these by treating civic data as editorial content, not database output.

## Typography
- **Display/Hero:** Bricolage Grotesque, weight 600, slight negative tracking. Flowing, modern, readable at every size. (Token `--serif`; the name is historical.)
- **Accent:** Instrument Serif *italic only*, for the emphasized words inside headlines (`<em>` in h1–h3, first names, taglines). Never set Bricolage in italic; it has no italic and browsers fake one. (Token `--accent-serif`.)
- **Body/UI:** Hanken Grotesk, with a real italic for body emphasis. (Token `--sans`.)
- **UI/Labels:** Hanken Grotesk (weight 500-600 for emphasis)
- **Data/Tables:** Geist Mono — tabular figures, clean at small sizes, modern. For vote counts, bill numbers, percentages, dates.
- **Code:** Geist Mono
- **Loading:** Google Fonts for Bricolage Grotesque, Hanken Grotesk, Instrument Serif (italic) and Geist Mono, in one request in `index.html`. Stylesheets use the tokens, never literal font names.
- **Scale:**
  - Display XL: 52px / 3.25rem (landing hero)
  - Display: 36px / 2.25rem (page titles)
  - H1: 28px / 1.75rem
  - H2: 22px / 1.375rem
  - H3: 18px / 1.125rem
  - Body: 16px / 1rem
  - Body SM: 14px / 0.875rem
  - Caption: 13px / 0.8125rem
  - Micro: 12px / 0.75rem
  - Mono Data: 11-12px / 0.6875-0.75rem

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
- **Max content width:** 1120px
- **Border radius:** btn: 12px (primary and small buttons, button-joined inputs — `--r-btn`), toggle: 8px (filters, segmented controls, text-button focus ring — `--r-toggle`), icon: 10px (40px icon-only buttons — `--r-icon`), sm: 4px (tags, chips, inputs), md: 8px (cards, panels), lg: 12px (hero sections, modals), full: 9999px (avatars)
  - Never use a pill radius (999px) for a button or toggle. 12px on a 44px button is clearly soft and clearly not a pill (~22px) or a square.
  - A button nested inside a bordered container (e.g. the landing ZIP field) sets the container to `calc(var(--r-btn) + <padding>)` so the two curves stay concentric.
- **Buttons:** one shared system, unscoped in `src/styles/App.css` (`.btn-primary`, `.btn-secondary`, `.btn-text`, `.btn-go`, `.btn-sm`, `.btn-toggle`, `.btn-icon`). Each variant class works on its own; page stylesheets only add layout (width, margin, flex), never button visuals.
  - **Primary** (`.btn-primary`, one per view): solid `--accent`, white label, General Sans 15px/600, sentence case, padding 11px 18px, min-height 44px, `--r-btn`, no border, no shadow; hover `--accent-hover`.
  - **Secondary** (`.btn-secondary`): a quiet text action, not a box — accent label at 600, no border, no fill, underline on hover. Add `.btn-go` for a trailing arrow when it navigates. `.btn-text` is the same action inline (no padding or min-height). `.btn-ghost` and `.btn-tertiary` are legacy aliases of secondary.
  - **Small** (`.btn-sm`): 14px, min-height 36px, padding 8px 14px on primary.
  - **Toggles / filters / segmented** (`.btn-toggle`): 13.5px, `--r-toggle`, borderless; the selected item (`.is-active`, `.active`, `aria-pressed`/`aria-selected="true"`) gets a soft fill (`--fill-soft`), not a heavy border.
  - **Icon-only** (`.btn-icon`, theme toggle, burger, close): 40px square, `--r-icon`, no border unless it floats over imagery (map controls keep a hairline).
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
- **Principles:** The content is serious; motion should be calm. Subtle entrance fades, smooth hover transitions. No bouncy animations, no scroll-driven effects, no playful motion.

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
