import axios from 'axios'

const LEGISCAN_BASE_URL = 'https://api.legiscan.com'
const LEGISCAN_API_KEY = import.meta.env.VITE_LEGISCAN_API_KEY
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

console.log('[StateBills] LegiScan API Key present:', !!LEGISCAN_API_KEY)

// ---------------------------------------------------------------------------
// localStorage caching layer
// ---------------------------------------------------------------------------
const CACHE_TTLS = {
  masterList: 24 * 60 * 60 * 1000,   // 24 hours
  billDetails: 7 * 24 * 60 * 60 * 1000, // 7 days
  search: 6 * 60 * 60 * 1000,        // 6 hours
  aiSummary: 30 * 24 * 60 * 60 * 1000,  // 30 days
  aiRanking: 24 * 60 * 60 * 1000,    // 24 hours
  sessionList: 7 * 24 * 60 * 60 * 1000  // 7 days
}

const cacheGet = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { data, expiry } = JSON.parse(raw)
    if (Date.now() > expiry) {
      localStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

const cacheSet = (key, data, ttl) => {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }))
  } catch (e) {
    // localStorage full — evict oldest state-bill entries and retry
    if (e.name === 'QuotaExceededError') {
      clearOldCache()
      try {
        localStorage.setItem(key, JSON.stringify({ data, expiry: Date.now() + ttl }))
      } catch {
        // give up silently
      }
    }
  }
}

export const clearOldCache = () => {
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('sb_')) {
      try {
        const { expiry } = JSON.parse(localStorage.getItem(key))
        if (Date.now() > expiry) keysToRemove.push(key)
      } catch {
        keysToRemove.push(key)
      }
    }
  }
  // If nothing expired, remove oldest 20 sb_ entries
  if (keysToRemove.length === 0) {
    const allSb = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('sb_')) {
        try {
          const { expiry } = JSON.parse(localStorage.getItem(key))
          allSb.push({ key, expiry })
        } catch {
          keysToRemove.push(key)
        }
      }
    }
    allSb.sort((a, b) => a.expiry - b.expiry)
    allSb.slice(0, 20).forEach(e => keysToRemove.push(e.key))
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

// ---------------------------------------------------------------------------
// LegiScan API helpers
// ---------------------------------------------------------------------------
const legiscanRequest = async (params) => {
  if (!LEGISCAN_API_KEY) {
    throw new Error('LegiScan API key not configured. Add VITE_LEGISCAN_API_KEY to your .env file.')
  }
  const response = await axios.get(LEGISCAN_BASE_URL, {
    params: { key: LEGISCAN_API_KEY, ...params }
  })
  if (response.data?.status === 'ERROR') {
    throw new Error(response.data.alert?.message || 'LegiScan API error')
  }
  return response.data
}

// ---------------------------------------------------------------------------
// Core LegiScan functions
// ---------------------------------------------------------------------------

export const getSessionList = async (state) => {
  const cacheKey = `sb_sessions_${state}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  console.log(`[StateBills] Fetching session list for ${state}`)
  const data = await legiscanRequest({ op: 'getSessionList', state })
  const sessions = data.sessions || []
  cacheSet(cacheKey, sessions, CACHE_TTLS.sessionList)
  return sessions
}

export const fetchStateBills = async (state) => {
  const cacheKey = `sb_master_${state}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  console.log(`[StateBills] Fetching master bill list for ${state}`)
  const data = await legiscanRequest({ op: 'getMasterList', state })

  // getMasterList returns { masterlist: { session: {...}, 0: bill, 1: bill, ... } }
  const masterlist = data.masterlist || {}
  const bills = []
  for (const key of Object.keys(masterlist)) {
    if (key === 'session') continue
    const bill = masterlist[key]
    if (bill && bill.bill_id) {
      bills.push({
        bill_id: bill.bill_id,
        number: bill.number,
        title: bill.title,
        description: bill.description || bill.title,
        state: state,
        status: normalizeBillStatus(bill.status),
        statusRaw: bill.status,
        last_action: bill.last_action,
        last_action_date: bill.last_action_date,
        url: bill.url,
        session_id: masterlist.session?.session_id
      })
    }
  }

  console.log(`[StateBills] Found ${bills.length} bills for ${state}`)
  cacheSet(cacheKey, bills, CACHE_TTLS.masterList)
  return bills
}

export const searchStateBills = async (state, query) => {
  const cacheKey = `sb_search_${state}_${query}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  console.log(`[StateBills] Searching bills in ${state}: "${query}"`)
  const data = await legiscanRequest({ op: 'getSearch', state, query })

  const searchresult = data.searchresult || {}
  const bills = []
  for (const key of Object.keys(searchresult)) {
    if (key === 'summary') continue
    const bill = searchresult[key]
    if (bill && bill.bill_id) {
      bills.push({
        bill_id: bill.bill_id,
        number: bill.bill_number || bill.number,
        title: bill.title,
        description: bill.description || bill.title,
        state: bill.state || state,
        status: normalizeBillStatus(bill.status),
        statusRaw: bill.status,
        last_action: bill.last_action,
        last_action_date: bill.last_action_date,
        url: bill.url,
        relevance: bill.relevance
      })
    }
  }

  cacheSet(cacheKey, bills, CACHE_TTLS.search)
  return bills
}

export const getStateBillDetails = async (billId) => {
  const cacheKey = `sb_detail_${billId}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  console.log(`[StateBills] Fetching bill details for ${billId}`)
  const data = await legiscanRequest({ op: 'getBill', id: billId })
  const bill = data.bill || {}

  const details = {
    bill_id: bill.bill_id,
    number: bill.bill_number,
    title: bill.title,
    description: bill.description,
    state: bill.state,
    status: normalizeBillStatus(bill.status),
    statusRaw: bill.status,
    url: bill.url,
    state_link: bill.state_link,
    sponsors: (bill.sponsors || []).map(s => ({
      name: s.name,
      role: s.role,
      party: s.party,
      district: s.district
    })),
    history: (bill.history || []).map(h => ({
      date: h.date,
      action: h.action,
      chamber: h.chamber_id === 1 ? 'House' : h.chamber_id === 2 ? 'Senate' : 'Joint',
    })),
    subjects: (bill.subjects || []).map(s => s.subject_name),
    texts: (bill.texts || []).map(t => ({
      date: t.date,
      type: t.type,
      url: t.state_link || t.url
    })),
    votes: (bill.votes || []).map(v => ({
      date: v.date,
      description: v.desc,
      yea: v.yea,
      nay: v.nay,
      passed: v.passed
    }))
  }

  cacheSet(cacheKey, details, CACHE_TTLS.billDetails)
  return details
}

// ---------------------------------------------------------------------------
// Status normalization
// ---------------------------------------------------------------------------
// LegiScan status codes: 1=Introduced, 2=Engrossed, 3=Enrolled, 4=Passed, 5=Vetoed, 6=Failed
const STATUS_MAP = {
  1: 'Introduced',
  2: 'Active',
  3: 'Enrolled',
  4: 'Passed',
  5: 'Vetoed',
  6: 'Failed'
}

const normalizeBillStatus = (status) => {
  if (typeof status === 'number') return STATUS_MAP[status] || 'Unknown'
  if (typeof status === 'string') return status
  return 'Unknown'
}

// ---------------------------------------------------------------------------
// AI Features
// ---------------------------------------------------------------------------

const aiRequest = async (prompt, maxTokens = 1000) => {
  if (!OPENAI_API_KEY) return null

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4
    })
  })

  if (!response.ok) throw new Error('OpenAI API request failed')
  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

// AI Search: natural language → keywords → LegiScan search → AI ranks results
export const aiSearchStateBills = async (state, naturalQuery) => {
  if (!OPENAI_API_KEY) {
    // Fallback: direct LegiScan search with the raw query
    return {
      bills: await searchStateBills(state, naturalQuery),
      aiMessage: null,
      isAI: false
    }
  }

  try {
    // Step 1: Extract search keywords from natural language
    const keywordPrompt = `Extract 2-4 concise search keywords from this question about state legislation. Return ONLY the keywords separated by spaces, nothing else.

Question: "${naturalQuery}"`

    const keywords = await aiRequest(keywordPrompt, 60)
    console.log(`[StateBills AI] Extracted keywords: "${keywords}" from "${naturalQuery}"`)

    // Step 2: Search LegiScan with extracted keywords
    const bills = await searchStateBills(state, keywords?.trim() || naturalQuery)

    if (bills.length === 0) {
      return {
        bills: [],
        aiMessage: `No bills found matching "${naturalQuery}". Try different search terms.`,
        isAI: true
      }
    }

    // Step 3: AI ranks and annotates results by relevance
    const billSummaries = bills.slice(0, 20).map((b, i) =>
      `${i}: ${b.number} - ${b.title}`
    ).join('\n')

    const rankPrompt = `A user searched for state legislation with this question: "${naturalQuery}"

Here are the search results. For each bill, rate its relevance to the user's question (1-10) and write a one-sentence reason why it's relevant or not. Return valid JSON as an array of objects with keys: index (number), score (1-10), reason (string). Only include the top 10 most relevant bills sorted by score descending.

Bills:
${billSummaries}`

    const rankRaw = await aiRequest(rankPrompt, 1500)

    let ranked
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonStr = rankRaw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      ranked = JSON.parse(jsonStr)
    } catch {
      // If AI response isn't valid JSON, return bills without ranking
      return {
        bills,
        aiMessage: `Found ${bills.length} bills related to "${naturalQuery}".`,
        isAI: true
      }
    }

    // Map rankings back to bills
    const rankedBills = ranked
      .filter(r => r.index >= 0 && r.index < bills.length)
      .map(r => ({
        ...bills[r.index],
        aiScore: r.score,
        aiReason: r.reason
      }))
      .sort((a, b) => b.aiScore - a.aiScore)

    return {
      bills: rankedBills,
      aiMessage: `Found ${rankedBills.length} bills related to "${naturalQuery}", ranked by relevance.`,
      isAI: true
    }
  } catch (error) {
    console.error('[StateBills AI] Search error:', error)
    // Fallback to direct search
    return {
      bills: await searchStateBills(state, naturalQuery),
      aiMessage: 'AI ranking unavailable. Showing standard search results.',
      isAI: false
    }
  }
}

// AI Summary: on-demand plain English explanation of a state bill
export const explainStateBillWithAI = async (bill) => {
  const cacheKey = `sb_ai_explain_${bill.bill_id}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  if (!OPENAI_API_KEY) {
    return {
      paragraphs: [
        `This bill, ${bill.number} — "${bill.title}", is currently being considered in the state legislature.`,
        'AI explanation requires an OpenAI API key. Add VITE_OPENAI_API_KEY to your .env file to enable AI-powered explanations.'
      ],
      isPlaceholder: true
    }
  }

  try {
    const prompt = `You are a nonpartisan expert at explaining state legislation in plain language.

Explain this state bill clearly for an average citizen:

Bill Number: ${bill.number}
Title: ${bill.title}
${bill.description ? `Description: ${bill.description}` : ''}
State: ${bill.state}
Status: ${bill.status}
${bill.sponsors?.length ? `Sponsors: ${bill.sponsors.map(s => `${s.name} (${s.party})`).join(', ')}` : ''}

Write 2-3 paragraphs in plain English explaining what this bill does, why it matters, and who it affects.
Do NOT use numbered lists or bullet points. Write in flowing paragraph form only.
Do NOT include any source citations, references, footnotes, or URLs.
Keep your response factual and balanced. Avoid political bias.`

    const content = await aiRequest(prompt, 1500)

    const paragraphs = content
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\[\d+\]/g, '')
      .trim()
      .split(/\n\s*\n/)
      .map(p => p.replace(/\n/g, ' ').trim())
      .filter(p => p.length > 0)

    const result = { paragraphs, isPlaceholder: false }
    cacheSet(cacheKey, result, CACHE_TTLS.aiSummary)
    return result
  } catch (error) {
    console.error('[StateBills AI] Explanation error:', error)
    return {
      paragraphs: [
        `This bill, ${bill.number} — "${bill.title}", is currently being considered in the state legislature.`,
        'AI explanation temporarily unavailable. Please try again later.'
      ],
      isPlaceholder: true,
      error: error.message
    }
  }
}

// AI Relevance Ranking: batch rank bills by impact
export const rankBillsByRelevance = async (state, bills) => {
  const cacheKey = `sb_ai_rank_${state}_${bills.length}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  if (!OPENAI_API_KEY || bills.length === 0) return bills

  try {
    // Only rank the first 30 bills to keep costs low
    const toRank = bills.slice(0, 30)
    const billList = toRank.map((b, i) =>
      `${i}: ${b.number} - ${b.title}`
    ).join('\n')

    const prompt = `Rate each of these state bills on how impactful they are to everyday citizens (1-10 scale). Return valid JSON as an array of objects with keys: index (number), score (1-10), reason (one short sentence on why it matters or doesn't).

Bills:
${billList}`

    const raw = await aiRequest(prompt, 2000)
    const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const rankings = JSON.parse(jsonStr)

    const rankedBills = toRank.map((bill, i) => {
      const rank = rankings.find(r => r.index === i)
      return {
        ...bill,
        aiScore: rank?.score || null,
        aiReason: rank?.reason || null
      }
    })

    // Append any unranked bills at the end
    const result = [
      ...rankedBills.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0)),
      ...bills.slice(30)
    ]

    cacheSet(cacheKey, result, CACHE_TTLS.aiRanking)
    return result
  } catch (error) {
    console.error('[StateBills AI] Ranking error:', error)
    return bills
  }
}
