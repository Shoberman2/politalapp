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
- **Display/Hero:** Instrument Serif — italic for editorial punch, roman for authority. A broadsheet masthead feel. No other civic tech tool uses a serif for headings — this is deliberate differentiation.
- **Body/UI:** General Sans — humanist, clean, distinctly not the geometric sans that every SaaS uses. Free via Fontshare.
- **UI/Labels:** General Sans (same as body, weight 500-600 for emphasis)
- **Data/Tables:** Geist Mono — tabular figures, clean at small sizes, modern. For vote counts, bill numbers, percentages, dates.
- **Code:** Geist Mono
- **Loading:** Google Fonts for Instrument Serif + Geist Mono, Fontshare CDN for General Sans
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
- **Border radius:** sm: 4px (buttons, tags, inputs), md: 8px (cards, panels), lg: 12px (hero sections, modals), full: 9999px (avatars)
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
