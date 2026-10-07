import { DEFAULT_SIGNED_IN_PATH } from '../config/access'

// Where to send someone after sign-in. Only same-origin paths are allowed, so
// a crafted ?next= cannot bounce a reader to another site (an open redirect).
// Rejected: anything not starting with a single '/', protocol-relative '//x'
// and '/\x' (browsers treat '\' like '/'), control characters or whitespace
// anywhere (a tab in '/\t/evil' is stripped by URL parsing), and values longer
// than 2048 characters. As a final check the value must resolve to the same
// origin it is resolved against. The scheme check and the "any backslash"
// check are belt-and-braces: the leading-'/' rule already covers today's
// callers, but they keep the helper safe for a future caller that loosens it.

const MAX_LENGTH = 2048
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i
// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE_RE = /[\u0000-\u001F\u007F-\u009F\s]/

export function safeNextPath(value, fallback = DEFAULT_SIGNED_IN_PATH) {
  if (typeof value !== 'string' || !value) return fallback
  if (value.length > MAX_LENGTH) return fallback
  if (value[0] !== '/') return fallback
  if (value[1] === '/' || value[1] === '\\') return fallback
  if (value.includes('\\')) return fallback
  if (CONTROL_OR_SPACE_RE.test(value)) return fallback
  if (SCHEME_RE.test(value)) return fallback
  try {
    if (new URL(value, 'https://x.invalid').origin !== 'https://x.invalid') return fallback
  } catch {
    return fallback
  }
  return value
}
