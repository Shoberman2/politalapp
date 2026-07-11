const HTML_ENTITIES = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
}

function plainText(value) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|quot|#39|lt|gt|nbsp);/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] || entity)
    .replace(/\s+/g, ' ')
    .trim()
}

export function parsePhotoAttribution(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  const anchor = raw.match(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/i)
  const text = plainText(anchor ? anchor[3] : raw)
  if (!text) return null

  let href = null
  const candidate = anchor?.[2]?.trim()
  if (/^https?:\/\//i.test(candidate || '')) {
    try {
      const parsed = new URL(candidate)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') href = parsed.href
    } catch {
      href = null
    }
  }

  return { text, href }
}
