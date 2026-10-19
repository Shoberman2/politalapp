---
name: product-images
description: Preset for generating BallotWatch product/marketing images (Product Hunt, social, launch assets). Small, descriptive, single-feature cards in the DESIGN.md editorial style — never full-platform screenshots.
---

# Product Images Preset — BallotWatch

**Read `~/.claude/skills/product-hunt-images/SKILL.md` first — it supersedes the generation approach below for launch galleries.** (2026-07-17: the user rejected both AI-illustrated cards and abstract detail crops; launch images must be REAL app screenshots in browser frames on brand backgrounds with one big outcome headline, rendered from HTML via the browse skill.) The Higgsfield generation settings below remain useful only for non-gallery brand assets (social textures, style keys, b-roll stills).

Use this preset whenever generating marketing/product images (Product Hunt gallery, social cards, launch assets).

## Rules

1. **One feature per image, shown as an emphasized detail.** Extreme close-up macro crops of ONE distinctive UI detail (a YEA/NAY chip on a roll-call row, the AI marginalia meeting legalese, a giant district code, a magnified donation row) — magnified to fill the frame, edges cropped to feel zoomed-in, with only a small serif caption. Never a full-platform screenshot, never a generic "basic item" (a plain search bar, a plain bar chart), never a multi-feature collage. User feedback 2026-07-17: the first round of headline-plus-small-fragment cards was too basic; the detail-macro treatment is the approved direction.
2. **Follow DESIGN.md.** Read it first. Editorial broadsheet aesthetic: warm paper white, serif headline, thin hairline rules, generous whitespace, deep civic blue used sparingly. No gradients, no blobs, no decorative illustration, no photographs.
3. **Keep rendered text short.** A 3–5 word serif headline plus at most 2–3 tiny labels inside the UI fragment. Long text renders badly.

## Generation settings (Higgsfield MCP)

- **Tool:** `generate_image`
- **Model:** `recraft_v4_1`
- **model_type:** `utility_vector` (crisp typography + clean flat mockups)
- **resolution:** `2k`
- **aspect_ratio:** `16:9` for Product Hunt gallery (PH displays at 1270×760), `1:1` for social avatars, `3:2` for blog/OG
- **background_color:** `#FAFAF7`
- **colors:** `["#FAFAF7", "#FFFFFF", "#1A1A18", "#6B6861", "#1D4ED8", "#E8E6E1"]` — add `#16A34A`/`#DC2626` only for vote tallies, `#0284C7` only for AI-explanation imagery

## Prompt template

> Editorial product feature card for a congressional voting tracker web app, elegant broadsheet newspaper aesthetic. Warm paper-white background, generous whitespace, one thin hairline rule line near the top. Large elegant serif headline in warm near-black reading "**{HEADLINE}**." Below it, a single enlarged floating UI fragment on a white card with a very soft shadow: **{FRAGMENT — one UI element, described concretely, with monospaced data figures}**. Deep civic blue used sparingly for **{one accent element}**. Flat, clean, minimal, confident graphic design. No gradients, no blobs, no decorative illustration, no photographs.

## Workflow

1. Read DESIGN.md.
2. Pick features to show; write one headline + one fragment per image.
3. Generate with the settings above, poll `job_status`, download finals to `marketing/product-hunt/` (or `marketing/<campaign>/`).
4. Zoom-QA every image for rendered-text errors before accepting it.
5. Show results to the user before any external upload.

## Lessons (2026-07-17 launch set)

- **Download the `_min.webp`, not the raw URL.** utility_vector's raw output is SVG; the "min" webp is actually full-res (2688×1536). macOS can't rasterize the SVG locally (`qlmanage` distorts it — the SVGs carry `preserveAspectRatio="none"`). Convert webp → PNG with `sips`, resize to 1270×726, then `sips --padToHeightWidth 760 1270 --padColor FAFAF7` for PH's exact 1270×760.
- **Typos are the top failure mode.** "actuallly", "Penisylvania" both happened. Prefer short generic strings ("123 Main St" over "1600 Pennsylvania Ave"); re-render on any error.
- **Fictional data only.** Never pair real organizations or people with invented numbers (e.g. made-up donation amounts next to "AFL-CIO"). Use fictional names like "Energy PAC", "Rep. Jane Doe".

## Existing assets

Product Hunt launch set (2026-07-17) lives in `marketing/product-hunt/`:
`01-find-your-reps`, `02-every-vote`, `03-plain-english`, `04-follow-the-money`.
