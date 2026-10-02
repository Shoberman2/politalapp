import { ImageResponse } from '@vercel/og'
import {
  fetchCardData,
  formatBillNumber,
  congressOrdinal,
  formatDate,
  clamp,
} from './_lib/billCard.js'
import { fetchRecordCardData } from './_lib/recordCard.js'
import { partyLetter, recordSeatTitle } from '../shared/memberRecord.js'

export const config = { runtime: 'edge' }

const FONT_URLS = {
  serifItalic:
    'https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf',
  sans: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuLyfMZg.ttf',
  sansBold:
    'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50ojIw2boKoduKmMEVuI6fMZg.ttf',
  mono: 'https://fonts.gstatic.com/s/jetbrainsmono/v24/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8-qxjPQ.ttf',
}

let fontCache = null

async function loadFonts() {
  if (fontCache) return fontCache
  const [serifItalic, sans, sansBold, mono] = await Promise.all([
    fetch(FONT_URLS.serifItalic).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.sans).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.sansBold).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.mono).then((r) => r.arrayBuffer()),
  ])
  fontCache = [
    { name: 'InstrumentSerif', data: serifItalic, style: 'italic', weight: 400 },
    { name: 'Inter', data: sans, style: 'normal', weight: 400 },
    { name: 'Inter', data: sansBold, style: 'normal', weight: 600 },
    { name: 'JetBrainsMono', data: mono, style: 'normal', weight: 500 },
  ]
  return fontCache
}

const COLORS = {
  bg: '#FAFAF7',
  text: '#1A1A18',
  secondary: '#6B6861',
  muted: '#9C9789',
  accent: '#1D4ED8',
  border: '#E8E6E1',
  yea: '#16A34A',
  nay: '#DC2626',
  // Party colors only ever appear as the small party tag.
  dem: '#2563EB',
  rep: '#DC2626',
  ind: '#7C3AED',
}

function renderFallback() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        padding: '64px 72px',
        fontFamily: 'Inter',
        color: COLORS.text,
      }}
    >
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 22, letterSpacing: 4 }}>
        BALLOTWATCH
      </div>
      <div style={{ height: 1, background: COLORS.border, marginTop: 16 }} />
      <div
        style={{
          marginTop: 'auto',
          fontFamily: 'InstrumentSerif',
          fontStyle: 'italic',
          fontSize: 56,
          lineHeight: 1.05,
          color: COLORS.text,
        }}
      >
        Track Congressional voting records, bills, and how your representatives vote.
      </div>
    </div>
  )
}

function renderCard(data) {
  const { bill, parsed, tally, question, aiOneLiner } = data
  const billNumber = formatBillNumber(parsed)
  const congress = congressOrdinal(parsed.congress)
  const cardDate = tally?.date || formatDate(bill.introduced_at)
  const oneLiner = clamp(aiOneLiner, 260)
  const title = clamp(bill.title, 140)

  const yea = tally?.yea || 0
  const nay = tally?.nay || 0
  const total = yea + nay
  const yeaPct = total > 0 ? (yea / total) * 100 : 0
  const tallyHeadline = tally
    ? [question ? clamp(question.toUpperCase(), 32) : 'VOTE', tally.chamber]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        padding: '64px 72px',
        fontFamily: 'Inter',
        color: COLORS.text,
      }}
    >
      {/* Masthead */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 22, letterSpacing: 4 }}>
          BALLOTWATCH
        </div>
        {cardDate ? (
          <div
            style={{
              fontFamily: 'JetBrainsMono',
              fontSize: 16,
              color: COLORS.muted,
              letterSpacing: 1,
            }}
          >
            {cardDate}
          </div>
        ) : null}
      </div>
      <div style={{ height: 1, background: COLORS.border, marginTop: 16 }} />

      {/* Bill number */}
      <div
        style={{
          marginTop: 36,
          display: 'flex',
          fontFamily: 'JetBrainsMono',
          fontSize: 18,
          color: COLORS.accent,
          letterSpacing: 2,
        }}
      >
        {billNumber} · {congress} CONGRESS
      </div>

      {/* Title */}
      <div
        style={{
          marginTop: 18,
          fontFamily: 'InstrumentSerif',
          fontStyle: 'italic',
          fontSize: 60,
          lineHeight: 1.05,
          color: COLORS.text,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </div>

      {/* AI one-liner */}
      {oneLiner ? (
        <div
          style={{
            marginTop: 24,
            fontSize: 22,
            lineHeight: 1.4,
            color: COLORS.secondary,
            maxWidth: 1000,
          }}
        >
          {oneLiner}
        </div>
      ) : null}

      {/* Tally section pinned to bottom */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 2, background: COLORS.text, marginBottom: 18 }} />
        {tally ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div
                style={{
                  fontFamily: 'Inter',
                  fontWeight: 600,
                  fontSize: 18,
                  letterSpacing: 2,
                  color: COLORS.text,
                }}
              >
                {tallyHeadline}
              </div>
              <div style={{ display: 'flex', gap: 18, fontFamily: 'JetBrainsMono', fontSize: 22 }}>
                <span style={{ color: COLORS.yea }}>{yea} YEA</span>
                <span style={{ color: COLORS.muted }}>·</span>
                <span style={{ color: COLORS.nay }}>{nay} NAY</span>
              </div>
            </div>
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                height: 10,
                width: '100%',
                background: COLORS.border,
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <div style={{ width: `${yeaPct}%`, background: COLORS.yea }} />
              <div style={{ width: `${100 - yeaPct}%`, background: COLORS.nay }} />
            </div>
          </>
        ) : (
          <div
            style={{
              fontFamily: 'Inter',
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: 2,
              color: COLORS.muted,
            }}
          >
            {bill.policy_area ? `${bill.policy_area.toUpperCase()} · ` : ''}
            {bill.introduced_at ? `INTRODUCED ${formatDate(bill.introduced_at)}` : 'NO VOTES YET'}
          </div>
        )}
      </div>
    </div>
  )
}

// "Record in 60 seconds" share image. Same template for every member: name,
// seat, and this Congress's vote counts. No adjectives, no scores, and nothing
// from campaign-finance data.
function renderRecordCard(r) {
  const s = r.stats
  const party = partyLetter(r.party)
  const partyColor = party === 'D' ? COLORS.dem : party === 'R' ? COLORS.rep : party === 'I' ? COLORS.ind : COLORS.secondary
  const seat = `${recordSeatTitle(r)} · ${r.state}${r.chamber === 'house' && r.district ? `-${r.district}` : ''} · ${r.chamber === 'senate' ? 'Senate' : 'House'}`
  const updated = r.updatedAt ? formatDate(r.updatedAt) : ''
  const figure = (label, value) => (
    <div style={{ display: 'flex', flexDirection: 'column', marginRight: 72 }}>
      <div style={{ fontFamily: 'JetBrainsMono', fontSize: 64, color: COLORS.text }}>{value}</div>
      <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 16, letterSpacing: 2, color: COLORS.muted, marginTop: 4 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: COLORS.bg, padding: '64px 72px', fontFamily: 'Inter', color: COLORS.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 22, letterSpacing: 4 }}>BALLOTWATCH</div>
        {updated ? (
          <div style={{ fontFamily: 'JetBrainsMono', fontSize: 16, color: COLORS.muted, letterSpacing: 1 }}>{`DATA THROUGH ${updated}`}</div>
        ) : null}
      </div>
      <div style={{ height: 1, background: COLORS.border, marginTop: 16 }} />

      <div style={{ marginTop: 40, display: 'flex', fontFamily: 'JetBrainsMono', fontSize: 18, color: COLORS.accent, letterSpacing: 2 }}>
        {`RECORD IN 60 SECONDS${s?.congress ? ` · ${congressOrdinal(s.congress)} CONGRESS` : ''}`}
      </div>
      <div style={{ marginTop: 14, fontFamily: 'InstrumentSerif', fontStyle: 'italic', fontSize: 76, lineHeight: 1.05, letterSpacing: -0.5 }}>
        {clamp(r.name, 40)}
      </div>
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', fontSize: 24, color: COLORS.secondary }}>
        <span style={{ fontFamily: 'JetBrainsMono', fontSize: 20, color: partyColor, border: `1px solid ${partyColor}`, borderRadius: 4, padding: '2px 8px', marginRight: 14 }}>{party}</span>
        {seat}
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 2, background: COLORS.text, marginBottom: 22 }} />
        {s ? (
          <div style={{ display: 'flex' }}>
            {figure('ROLL CALLS', String(s.total))}
            {figure('VOTES CAST', String(s.cast))}
            {figure('NOT VOTING', String(s.notVoting))}
          </div>
        ) : (
          <div style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: 18, letterSpacing: 2, color: COLORS.muted }}>
            NO VOTE TOTALS RECORDED YET THIS CONGRESS
          </div>
        )}
      </div>
    </div>
  )
}

export default async function handler(request) {
  try {
    const url = new URL(request.url)
    const fonts = await loadFonts()
    let element
    if (url.searchParams.get('kind') === 'record') {
      const record = await fetchRecordCardData(url.searchParams.get('id'))
      element = record ? renderRecordCard(record) : renderFallback()
    } else {
      const billId = url.searchParams.get('bill')
      const data = billId ? await fetchCardData(billId) : null
      element = data ? renderCard(data) : renderFallback()
    }

    return new ImageResponse(element, {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (err) {
    return new Response(`OG render error: ${err.message}`, { status: 500 })
  }
}
