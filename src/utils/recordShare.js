// Share targets for the "record in 60 seconds" card. Plain intent URLs only:
// no third-party SDKs or scripts load on the page, and nothing is sent anywhere
// until the reader follows a link.

export const SHARE_CHANNELS = ['native', 'copy', 'x', 'bluesky', 'facebook', 'email']

/**
 * @param {{ url: string, title: string, text?: string }} share
 *   url    canonical record URL
 *   title  "<Name>'s record in 60 seconds"
 *   text   one factual sentence for the email body (optional)
 * @returns {{ channel: string, label: string, href: string }[]}
 */
export function recordShareLinks({ url, title, text = '' }) {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  return [
    { channel: 'x', label: 'X', href: `https://x.com/intent/tweet?text=${t}&url=${u}` },
    // Bluesky's compose intent takes a single text field; the link goes in it.
    { channel: 'bluesky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}` },
    { channel: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    {
      channel: 'email',
      label: 'Email',
      href: `mailto:?subject=${t}&body=${encodeURIComponent(`${text ? `${text}\n\n` : ''}${url}`)}`,
    },
  ]
}

/** True when the browser offers the system share sheet. */
export function canNativeShare(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return !!nav && typeof nav.share === 'function'
}
