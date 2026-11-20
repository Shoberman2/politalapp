// Share images (edge): /api/og?kind=record&id=P000197 (also kind=member, and an
// id with its name slug, "P000197-nancy-pelosi") renders a 1200x630 member
// card with name, party, seat and vote tally; /api/og?bill=119-hr-1 renders a
// bill card. Written without JSX on purpose: Vercel builds only plain .js/.ts
// functions in this Vite (non-Next) project, so the old api/og.jsx returned
// NOT_FOUND in production. `h` below is the element shape @vercel/og (satori)
// reads; there is no React dependency here.

import { ImageResponse } from "@vercel/og";
import {
  fetchCardData,
  formatBillNumber,
  congressOrdinal,
  formatDate,
  clamp
} from "./_lib/billCard.js";
import { fetchRecordCardData } from "./_lib/recordCard.js";
import { partyLetter, recordSeatTitle } from "../shared/memberRecord.js";
import { parseMemberSegment } from "../shared/memberSlug.js";
// Element factory in the shape satori expects: { type, props: { ...props, children } }.
// A Fragment flattens into its children.
const Fragment = Symbol("Fragment");
function h(type, props, ...children) {
  if (type === Fragment) return children;
  return { type, key: null, props: { ...props, children: children.length <= 1 ? children[0] : children } };
}

export const config = { runtime: "edge" };
const FONT_URLS = {
  serifItalic: "https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf",
  sans: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuLyfMZg.ttf",
  sansBold: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuI6fMZg.ttf",
  mono: "https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf"
};
// Link-preview crawlers give up on an image after a few seconds, so every slow
// step has a budget: a slow database answer renders the generic card, and slow
// fonts or any other failure redirect to the static Capitol image. Neither
// fallback is cached for long, so the next crawl gets the real card.
export const DATA_TIMEOUT_MS = 2500;
export const FONT_TIMEOUT_MS = 3e3;
export const CACHE_OK = "public, s-maxage=86400, stale-while-revalidate=604800";
export const CACHE_FALLBACK = "public, s-maxage=300";
const STATIC_IMAGE = "/congress.jpg";
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  const font = (u) => fetch(u).then((r) => {
    if (!r.ok) throw new Error(`font ${r.status}`);
    return r.arrayBuffer();
  });
  const [serifItalic, sans, sansBold, mono] = await Promise.all([
    font(FONT_URLS.serifItalic),
    font(FONT_URLS.sans),
    font(FONT_URLS.sansBold),
    font(FONT_URLS.mono)
  ]);
  fontCache = [
    { name: "InstrumentSerif", data: serifItalic, style: "italic", weight: 400 },
    { name: "Inter", data: sans, style: "normal", weight: 400 },
    { name: "Inter", data: sansBold, style: "normal", weight: 600 },
    { name: "JetBrainsMono", data: mono, style: "normal", weight: 500 }
  ];
  return fontCache;
}
const COLORS = {
  bg: "#FAFAF7",
  text: "#1A1A18",
  secondary: "#6B6861",
  muted: "#9C9789",
  accent: "#1D4ED8",
  border: "#E8E6E1",
  yea: "#16A34A",
  nay: "#DC2626",
  // Party colors only ever appear as the small party tag.
  dem: "#2563EB",
  rep: "#DC2626",
  ind: "#7C3AED"
};
function renderFallback() {
  return /* @__PURE__ */ h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COLORS.bg,
        padding: "64px 72px",
        fontFamily: "Inter",
        color: COLORS.text
      }
    },
    /* @__PURE__ */ h("div", { style: { fontFamily: "Inter", fontWeight: 600, fontSize: 22, letterSpacing: 4 } }, "BALLOTWATCH"),
    /* @__PURE__ */ h("div", { style: { height: 1, background: COLORS.border, marginTop: 16 } }),
    /* @__PURE__ */ h(
      "div",
      {
        style: {
          marginTop: "auto",
          fontFamily: "InstrumentSerif",
          fontStyle: "italic",
          fontSize: 56,
          lineHeight: 1.05,
          color: COLORS.text
        }
      },
      "Track Congressional voting records, bills, and how your representatives vote."
    )
  );
}
function renderCard(data) {
  const { bill, parsed, tally, question, aiOneLiner } = data;
  const billNumber = formatBillNumber(parsed);
  const congress = congressOrdinal(parsed.congress);
  const cardDate = tally?.date || formatDate(bill.introduced_at);
  const oneLiner = clamp(aiOneLiner, 260);
  const title = clamp(bill.title, 140);
  const yea = tally?.yea || 0;
  const nay = tally?.nay || 0;
  const total = yea + nay;
  const yeaPct = total > 0 ? yea / total * 100 : 0;
  const tallyHeadline = tally ? [question ? clamp(question.toUpperCase(), 32) : "VOTE", tally.chamber].filter(Boolean).join(" \xB7 ") : null;
  return /* @__PURE__ */ h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: COLORS.bg,
        padding: "64px 72px",
        fontFamily: "Inter",
        color: COLORS.text
      }
    },
    /* @__PURE__ */ h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ h("div", { style: { fontFamily: "Inter", fontWeight: 600, fontSize: 22, letterSpacing: 4 } }, "BALLOTWATCH"), cardDate ? /* @__PURE__ */ h(
      "div",
      {
        style: {
          fontFamily: "JetBrainsMono",
          fontSize: 16,
          color: COLORS.muted,
          letterSpacing: 1
        }
      },
      cardDate
    ) : null),
    /* @__PURE__ */ h("div", { style: { height: 1, background: COLORS.border, marginTop: 16 } }),
    /* @__PURE__ */ h(
      "div",
      {
        style: {
          marginTop: 36,
          display: "flex",
          fontFamily: "JetBrainsMono",
          fontSize: 18,
          color: COLORS.accent,
          letterSpacing: 2
        }
      },
      billNumber,
      " \xB7 ",
      congress,
      " CONGRESS"
    ),
    /* @__PURE__ */ h(
      "div",
      {
        style: {
          marginTop: 18,
          fontFamily: "InstrumentSerif",
          fontStyle: "italic",
          fontSize: 60,
          lineHeight: 1.05,
          color: COLORS.text,
          letterSpacing: -0.5
        }
      },
      title
    ),
    oneLiner ? /* @__PURE__ */ h(
      "div",
      {
        style: {
          marginTop: 24,
          fontSize: 22,
          lineHeight: 1.4,
          color: COLORS.secondary,
          maxWidth: 1e3
        }
      },
      oneLiner
    ) : null,
    /* @__PURE__ */ h("div", { style: { marginTop: "auto", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ h("div", { style: { height: 2, background: COLORS.text, marginBottom: 18 } }), tally ? /* @__PURE__ */ h(Fragment, null, /* @__PURE__ */ h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" } }, /* @__PURE__ */ h(
      "div",
      {
        style: {
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: 2,
          color: COLORS.text
        }
      },
      tallyHeadline
    ), /* @__PURE__ */ h("div", { style: { display: "flex", gap: 18, fontFamily: "JetBrainsMono", fontSize: 22 } }, /* @__PURE__ */ h("span", { style: { color: COLORS.yea } }, yea, " YEA"), /* @__PURE__ */ h("span", { style: { color: COLORS.muted } }, "\xB7"), /* @__PURE__ */ h("span", { style: { color: COLORS.nay } }, nay, " NAY"))), /* @__PURE__ */ h(
      "div",
      {
        style: {
          marginTop: 14,
          display: "flex",
          height: 10,
          width: "100%",
          background: COLORS.border,
          borderRadius: 2,
          overflow: "hidden"
        }
      },
      /* @__PURE__ */ h("div", { style: { width: `${yeaPct}%`, background: COLORS.yea } }),
      /* @__PURE__ */ h("div", { style: { width: `${100 - yeaPct}%`, background: COLORS.nay } })
    )) : /* @__PURE__ */ h(
      "div",
      {
        style: {
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: 2,
          color: COLORS.muted
        }
      },
      bill.policy_area ? `${bill.policy_area.toUpperCase()} \xB7 ` : "",
      bill.introduced_at ? `INTRODUCED ${formatDate(bill.introduced_at)}` : "NO VOTES YET"
    ))
  );
}
// "Record in 60 seconds" share image. Same template for every member: name,
// party, seat and this Congress's vote counts. No adjectives, no scores, and
// nothing from campaign-finance data.
function renderRecordCard(r) {
  const s = r.stats;
  const party = partyLetter(r.party);
  const partyColor = party === "D" ? COLORS.dem : party === "R" ? COLORS.rep : party === "I" ? COLORS.ind : COLORS.secondary;
  const seat = `${recordSeatTitle(r)} \xB7 ${r.state}${r.chamber === "house" && r.district ? `-${r.district}` : ""} \xB7 ${r.chamber === "senate" ? "Senate" : "House"}`;
  const updated = r.updatedAt ? formatDate(r.updatedAt) : "";
  const figure = (label, value) => /* @__PURE__ */ h("div", { style: { display: "flex", flexDirection: "column", marginRight: 72 } }, /* @__PURE__ */ h("div", { style: { fontFamily: "JetBrainsMono", fontSize: 64, color: COLORS.text } }, value), /* @__PURE__ */ h("div", { style: { fontFamily: "Inter", fontWeight: 600, fontSize: 16, letterSpacing: 2, color: COLORS.muted, marginTop: 4 } }, label));
  return /* @__PURE__ */ h("div", { style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", background: COLORS.bg, padding: "64px 72px", fontFamily: "Inter", color: COLORS.text } }, /* @__PURE__ */ h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ h("div", { style: { fontFamily: "Inter", fontWeight: 600, fontSize: 22, letterSpacing: 4 } }, "BALLOTWATCH"), updated ? /* @__PURE__ */ h("div", { style: { fontFamily: "JetBrainsMono", fontSize: 16, color: COLORS.muted, letterSpacing: 1 } }, `DATA THROUGH ${updated}`) : null), /* @__PURE__ */ h("div", { style: { height: 1, background: COLORS.border, marginTop: 16 } }), /* @__PURE__ */ h("div", { style: { marginTop: 40, display: "flex", fontFamily: "JetBrainsMono", fontSize: 18, color: COLORS.accent, letterSpacing: 2 } }, `RECORD IN 60 SECONDS${s?.congress ? ` \xB7 ${congressOrdinal(s.congress)} CONGRESS` : ""}`), /* @__PURE__ */ h("div", { style: { marginTop: 14, fontFamily: "InstrumentSerif", fontStyle: "italic", fontSize: 76, lineHeight: 1.05, letterSpacing: -0.5 } }, clamp(r.name, 40)), /* @__PURE__ */ h("div", { style: { marginTop: 16, display: "flex", alignItems: "center", fontSize: 24, color: COLORS.secondary } }, /* @__PURE__ */ h("span", { style: { fontFamily: "JetBrainsMono", fontSize: 20, color: partyColor, border: `1px solid ${partyColor}`, borderRadius: 4, padding: "2px 8px", marginRight: 14 } }, party), seat), s ? /* @__PURE__ */ h("div", { style: { marginTop: 12, display: "flex", fontSize: 24, color: COLORS.secondary } }, `${s.yea} yea, ${s.nay} nay, ${s.notVoting} not voting in the ${congressOrdinal(s.congress)} Congress`) : null, /* @__PURE__ */ h("div", { style: { marginTop: "auto", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ h("div", { style: { height: 2, background: COLORS.text, marginBottom: 22 } }), s ? /* @__PURE__ */ h("div", { style: { display: "flex" } }, figure("ROLL CALLS", String(s.total)), figure("VOTES CAST", String(s.cast)), figure("NOT VOTING", String(s.notVoting))) : /* @__PURE__ */ h("div", { style: { fontFamily: "Inter", fontWeight: 600, fontSize: 18, letterSpacing: 2, color: COLORS.muted } }, "NO VOTE TOTALS RECORDED YET THIS CONGRESS")));
}
export default async function handler(request) {
  let url;
  try {
    url = new URL(request.url);
    const fonts = await withTimeout(loadFonts(), FONT_TIMEOUT_MS, "fonts");
    let element;
    let cache = CACHE_OK;
    const kind = url.searchParams.get("kind");
    if (kind === "record" || kind === "member") {
      const memberId = parseMemberSegment(url.searchParams.get("id"))?.id || null;
      const record = await withTimeout(fetchRecordCardData(memberId), DATA_TIMEOUT_MS, "record").catch((err) => {
        console.error("[og] record data:", err.message);
        return void 0;
      });
      element = record ? renderRecordCard(record) : renderFallback();
      if (!record) cache = CACHE_FALLBACK;
    } else {
      const billId = url.searchParams.get("bill");
      const data = billId ? await fetchCardData(billId) : null;
      element = data ? renderCard(data) : renderFallback();
    }
    return new ImageResponse(element, {
      width: 1200,
      height: 630,
      fonts,
      // Lowercase on purpose: @vercel/og sets its own lowercase cache-control (one year,
      // immutable), and a differently cased key would be merged with it instead of replacing it.
      headers: { "cache-control": cache }
    });
  } catch (err) {
    console.error("[og] render failed:", err.message);
    const location = url ? new URL(STATIC_IMAGE, url.origin).toString() : STATIC_IMAGE;
    return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
  }
}
