import { useEffect, useId, useRef, useState } from 'react'
import { track } from '@vercel/analytics'
import { copyTextToClipboard } from '../utils/clipboard'
import { resolveContact } from '../utils/contactUrl'
import {
  buildScaffold,
  displayName,
  lastName,
  memberTitle,
  normalizeChamber,
  seatLabel,
  voteFor,
} from '../utils/tellYourRepDraft'
import { getUserAddress, saveUserAddress } from '../services/userService'
import { findMembersForAddress, getMemberContact } from '../services/myMembers'
import { BRAND } from '../config/brand'
import { SENT_EVENT, findSend, forgetSend, recordSend } from '../utils/sentMessages'
import '../styles/TellYourRep.css'

// "Tell your rep": a hand-off, not a sender. We prefill a factual
// outline, the person writes the message, copies it, and opens the office's
// own contact page. Nothing here submits a form, sends mail, or stores the
// text. The only thing counted is an anonymous event with the record
// reference and the member's bioguide id.

const CHAMBER_NAME = { house: 'House', senate: 'Senate' }

function countEvent(name, ref, bioguideId) {
  try {
    track(name, { ref: String(ref || ''), member: String(bioguideId || '') })
  } catch {
    // Analytics must never break the page.
  }
}

function sortForContext(list, context) {
  const voteChamber = context?.kind === 'vote' ? normalizeChamber(context.chamber) : null
  const rank = (m) => {
    const c = normalizeChamber(m.chamber)
    if (voteChamber) return c === voteChamber ? 0 : 1
    return c === 'house' ? 0 : 1
  }
  return [...list].sort((a, b) => rank(a) - rank(b))
}

function nonEmpty(obj) {
  return Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v != null && v !== ''))
}

export default function TellYourRep({ context, members }) {
  const uid = useId()
  const panelId = `${uid}-panel`
  const headingId = `${uid}-heading`
  const textareaId = `${uid}-message`
  const hintId = `${uid}-hint`
  const zipId = `${uid}-zip`
  const streetId = `${uid}-street`

  const pageMembers = Array.isArray(members) && members.length ? members : null
  const constituent = !pageMembers

  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.location?.hash === '#tell-your-rep')
  const [lookup, setLookup] = useState({ status: 'idle' })
  const [found, setFound] = useState([])
  const [showLocationForm, setShowLocationForm] = useState(false)
  const [zip, setZip] = useState('')
  const [street, setStreet] = useState('')
  const [contacts, setContacts] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [text, setText] = useState('')
  const [scaffold, setScaffold] = useState('')
  const [copyState, setCopyState] = useState('idle')
  const [status, setStatus] = useState('')
  const [openedFor, setOpenedFor] = useState(() => new Set())
  const [, setSentTick] = useState(0)

  const toggleRef = useRef(null)
  const headingRef = useRef(null)
  const textareaRef = useRef(null)
  const zipRef = useRef(null)
  const mounted = useRef(true)
  const wasOpen = useRef(open)
  const tracked = useRef(new Set())
  const requested = useRef(new Set())

  useEffect(() => () => { mounted.current = false }, [])

  // Re-read the device-only "I sent it" record when it changes elsewhere
  // (another tab, or "Forget this" in the notes on this page).
  useEffect(() => {
    const bump = () => setSentTick((n) => n + 1)
    window.addEventListener(SENT_EVENT, bump)
    window.addEventListener('storage', bump)
    return () => {
      window.removeEventListener(SENT_EVENT, bump)
      window.removeEventListener('storage', bump)
    }
  }, [])

  const list = pageMembers ? pageMembers : found
  const selected = list.find((m) => m.bioguideId === selectedId) || null
  const contactInfo = selected ? contacts[selected.bioguideId] : null
  const merged = selected ? { ...selected, ...nonEmpty(contactInfo?.data) } : null
  const name = merged ? displayName(merged.name) : ''

  // Focus: into the panel when it opens, back to the button when it closes.
  useEffect(() => {
    if (open && !wasOpen.current) headingRef.current?.focus()
    if (!open && wasOpen.current) toggleRef.current?.focus()
    wasOpen.current = open
  }, [open])

  // Page-provided members: select the first (or the one in the voting chamber).
  useEffect(() => {
    if (!pageMembers) return
    if (!pageMembers.some((m) => m.bioguideId === selectedId)) {
      setSelectedId(sortForContext(pageMembers, context)[0]?.bioguideId || null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMembers?.map((m) => m.bioguideId).join(',')])

  const resolve = async (address, { save }) => {
    setLookup({ status: 'loading' })
    setStatus('Finding your members of Congress…')
    try {
      const result = await findMembersForAddress(address)
      if (!mounted.current) return
      if (!result || !result.members.length) {
        setLookup({ status: 'error', message: "We couldn't match that location to members of Congress. Check the ZIP code and try again." })
        setShowLocationForm(true)
        setStatus('No members found for that location.')
        return
      }
      const sorted = sortForContext(result.members, context)
      setFound(sorted)
      setSelectedId(sorted[0].bioguideId)
      setLookup({ status: 'ready', state: result.state, district: result.district })
      setShowLocationForm(false)
      setStatus(`Found ${sorted.length} member${sorted.length === 1 ? '' : 's'} of Congress for your location.`)
      if (save) {
        saveUserAddress({ street: address.street || '', city: address.city || '', state: result.state, zip: address.zip || '' })
      }
    } catch {
      if (!mounted.current) return
      setLookup({ status: 'error', message: "We couldn't look up your members right now. Try again in a moment." })
      setShowLocationForm(true)
      setStatus('Lookup failed.')
    }
  }

  // Resolve the person's own members from the saved address the first time
  // the panel opens; ask for a ZIP when nothing is saved.
  useEffect(() => {
    if (!open || pageMembers || lookup.status !== 'idle') return
    const saved = getUserAddress()
    if (saved && (saved.state || saved.zip)) {
      setZip(saved.zip || '')
      setStreet(saved.street || '')
      resolve(saved, { save: false })
    } else {
      setLookup({ status: 'needs-location' })
      setShowLocationForm(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageMembers, lookup.status])

  // Fetch the office's website and phone for the selected member if the
  // caller didn't supply them. A read from Congress.gov; nothing is sent.
  useEffect(() => {
    if (!open || !selected) return
    if (selected.officialWebsiteUrl || selected.phone) return
    const id = selected.bioguideId
    if (!id || requested.current.has(id)) return
    requested.current.add(id)
    setContacts((c) => ({ ...c, [id]: { status: 'loading' } }))
    getMemberContact(id)
      .then((data) => { if (mounted.current) setContacts((c) => ({ ...c, [id]: { status: 'ready', data } })) })
      .catch(() => { if (mounted.current) setContacts((c) => ({ ...c, [id]: { status: 'error' } })) })
  }, [open, selected])

  // Rebuild the outline when the member changes. Keep the person's edits:
  // only replace text that is still the untouched outline.
  useEffect(() => {
    if (!selected) return
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const next = buildScaffold({ context, member: selected, constituent, origin })
    setScaffold(next)
    setText((current) => (!current || current === scaffold ? next : current))
    setCopyState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, context?.ref, context?.result, context?.sourceUrl, context?.title, constituent])

  // Count "draft opened" once per member per page view. Reference and
  // bioguide id only: no text, no address, no user id.
  useEffect(() => {
    if (!open || !selectedId || tracked.current.has(selectedId)) return
    tracked.current.add(selectedId)
    countEvent('draft_opened', context?.ref, selectedId)
  }, [open, selectedId, context?.ref])

  useEffect(() => {
    if (showLocationForm && open && lookup.status !== 'loading') zipRef.current?.focus()
  }, [showLocationForm, open, lookup.status])

  const handleLocationSubmit = (e) => {
    e.preventDefault()
    const z = zip.trim()
    if (!/^\d{5}$/.test(z)) {
      setLookup({ status: 'error', message: 'Enter a 5-digit ZIP code.' })
      setStatus('Enter a 5-digit ZIP code.')
      zipRef.current?.focus()
      return
    }
    resolve({ zip: z, street: street.trim(), city: '', state: '' }, { save: true })
  }

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(text)
    if (!mounted.current) return
    if (ok) {
      setCopyState('copied')
      setStatus('Message copied. Paste it into the office’s contact form.')
    } else {
      const el = textareaRef.current
      if (el) { el.focus(); el.select() }
      setCopyState('failed')
      setStatus('Could not copy automatically. The message is selected; press Control C, or Command C on a Mac.')
    }
  }

  const handleReset = () => {
    setText(scaffold)
    setCopyState('idle')
    setStatus('Message reset to the factual outline.')
    textareaRef.current?.focus()
  }

  const toggleLabel = context?.kind === 'member' && pageMembers?.length === 1
    ? `Write to ${memberTitle(pageMembers[0])} ${lastName(pageMembers[0])}`
    : 'Write to your representative about this'

  const contact = merged ? resolveContact(merged) : null
  const contactLoading = contactInfo?.status === 'loading'
  const voteChamber = context?.kind === 'vote' ? normalizeChamber(context.chamber) : null

  const describeVote = (m) => {
    if (context?.kind !== 'vote') return null
    const position = voteFor(context, m)
    if (position) return `Voted ${position}`
    const c = normalizeChamber(m.chamber)
    if (voteChamber && c && c !== voteChamber) return `${CHAMBER_NAME[c]}: not part of this vote`
    return 'No recorded vote'
  }

  const renderMember = (m) => (
    <>
      <span className="tyr-member-name">{memberTitle(m) === 'Senator' ? 'Sen.' : 'Rep.'} {displayName(m.name)}</span>
      <span className="tyr-member-seat">{seatLabel(m)}</span>
      {describeVote(m) && (
        <span className={`tyr-member-vote tyr-vote-${String(voteFor(context, m) || 'none').toLowerCase().replace(/\s+/g, '-')}`}>
          {describeVote(m)}
        </span>
      )}
    </>
  )

  const renderWho = () => {
    if (pageMembers && pageMembers.length === 1) {
      return <div className="tyr-member tyr-member-single">{renderMember(pageMembers[0])}</div>
    }
    return (
      <>
        {lookup.status === 'loading' && <p className="tyr-muted">Finding your members of Congress…</p>}
        {lookup.status === 'error' && <p className="tyr-error" role="alert">{lookup.message}</p>}
        {list.length > 0 && (
          <fieldset className="tyr-members">
            <legend className="tyr-sr-only">Choose a member of Congress</legend>
            {list.map((m) => (
              <label key={m.bioguideId} className={`tyr-member ${m.bioguideId === selectedId ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name={`${uid}-member`}
                  value={m.bioguideId}
                  checked={m.bioguideId === selectedId}
                  onChange={() => setSelectedId(m.bioguideId)}
                />
                {renderMember(m)}
              </label>
            ))}
          </fieldset>
        )}
        {!pageMembers && lookup.status === 'ready' && lookup.district == null && (
          <p className="tyr-muted">We matched your state but not your House district. Add your street address to include your House member.</p>
        )}
        {!pageMembers && showLocationForm && (
          <form className="tyr-location" onSubmit={handleLocationSubmit} noValidate>
            <div className="tyr-field">
              <label htmlFor={zipId}>ZIP code</label>
              <input
                id={zipId}
                ref={zipRef}
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                required
              />
            </div>
            <div className="tyr-field tyr-field-wide">
              <label htmlFor={streetId}>Street address <span className="tyr-optional">(optional, finds your House member)</span></label>
              <input
                id={streetId}
                type="text"
                autoComplete="address-line1"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <button type="submit" className="tyr-btn btn-primary btn-sm" disabled={lookup.status === 'loading'}>Find my members</button>
            <p className="tyr-fineprint">Used to look up your members. Saved on this device only.</p>
          </form>
        )}
        {!pageMembers && !showLocationForm && lookup.status === 'ready' && (
          <button type="button" className="tyr-link-btn" onClick={() => setShowLocationForm(true)}>Change location</button>
        )}
      </>
    )
  }

  const possessive = name ? `${name}’s` : 'the'

  const renderSend = () => {
    if (!merged) return null
    const onOpen = () => {
      countEvent('contact_page_opened', context?.ref, merged.bioguideId)
      setOpenedFor((prev) => new Set(prev).add(merged.bioguideId))
    }
    let primary
    if (contactLoading && !contact?.url) {
      primary = <p className="tyr-muted">Looking up {possessive} office…</p>
    } else if (contact.kind === 'contact') {
      primary = (
        <a className="tyr-btn tyr-btn-primary btn-primary btn-sm" href={contact.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
          Open {possessive} official contact page ↗
        </a>
      )
    } else if (contact.kind === 'website') {
      primary = (
        <a className="tyr-btn tyr-btn-primary btn-primary btn-sm" href={contact.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
          Open {possessive} official website ↗
        </a>
      )
    } else if (contact.kind === 'phone') {
      primary = (
        <a className="tyr-btn tyr-btn-primary btn-primary btn-sm" href={contact.url} onClick={onOpen}>
          Call {possessive} office: <span className="tyr-mono">{contact.phone}</span>
        </a>
      )
    } else {
      primary = (
        <a className="tyr-btn tyr-btn-primary btn-primary btn-sm" href={`https://www.congress.gov/member/${merged.bioguideId}`} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
          Find {possessive} office on Congress.gov ↗
        </a>
      )
    }
    return (
      <>
        <div className="tyr-actions">
          <button type="button" className="tyr-btn btn-secondary btn-sm" onClick={handleCopy}>
            {copyState === 'copied' ? 'Copied' : 'Copy message'}
          </button>
          {primary}
        </div>
        {copyState === 'failed' && (
          <p className="tyr-muted">Couldn’t copy automatically. The message is selected: press Ctrl+C (⌘C on a Mac).</p>
        )}
        {contact?.kind === 'website' && <p className="tyr-fineprint">Look for the “Contact” link on the office’s site.</p>}
        {contact?.kind === 'contact' && contact.phone && (
          <p className="tyr-fineprint">Or call the office: <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="tyr-mono">{contact.phone}</a></p>
        )}
        {!constituent && (
          <p className="tyr-fineprint">Offices usually reply only to people who live in their state or district.</p>
        )}
        {renderSent()}
      </>
    )
  }

  // "I sent it": the person's own say-so, recorded on this device only so we
  // can show what this member did on the bill afterwards. Counted as an
  // anonymous event with the record reference and bioguide id only.
  const renderSent = () => {
    if (!merged || !context?.ref) return null
    const saved = findSend(context.ref, merged.bioguideId)
    if (saved) {
      return (
        <div className="tyr-sent">
          <p className="tyr-sent-done">
            Marked as sent to {name}. Saved on this device only.
          </p>
          <button
            type="button"
            className="tyr-link-btn"
            onClick={() => {
              forgetSend(context.ref, merged.bioguideId)
              setSentTick((n) => n + 1)
              setStatus('Forgotten. Nothing about this message is saved on this device.')
            }}
          >
            Forget this
          </button>
        </div>
      )
    }
    if (!openedFor.has(merged.bioguideId)) return null
    const confirm = () => {
      const entry = recordSend({
        ref: context.ref,
        kind: context.kind,
        member: merged.bioguideId,
        memberName: name,
        billId: context.billId || undefined,
      })
      countEvent('message_sent_confirmed', context.ref, merged.bioguideId)
      setSentTick((n) => n + 1)
      setStatus(entry
        ? `Marked as sent to ${name}. Saved on this device only.`
        : 'Couldn’t save on this device. Your browser may be blocking site storage.')
    }
    return (
      <div className="tyr-sent">
        <button type="button" className="tyr-btn" onClick={confirm}>
          I sent my message to {name}
        </button>
        <p className="tyr-fineprint">
          Optional. We’ll note the date so we can show how {name} votes on this later. Saved on this device only, never your message.
        </p>
      </div>
    )
  }

  return (
    <section className="tyr" id="tell-your-rep" aria-label="Tell your representative">
      <div className="tyr-kicker">Tell your rep</div>
      <button
        ref={toggleRef}
        type="button"
        className="tyr-toggle btn-secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {toggleLabel}
      </button>

      <div id={panelId} className="tyr-panel" role="region" aria-labelledby={headingId} hidden={!open}>
        <div className="tyr-panel-head">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="tyr-title">
            Write it <em>yourself</em>, send it <em>yourself</em>
          </h2>
          <button type="button" className="tyr-link-btn" onClick={() => setOpen(false)}>Close</button>
        </div>
        <p className="tyr-disclaimer">
          <strong>{BRAND.name} doesn't send this for you. Copy your message and send it through your representative's official contact page.</strong>{' '}
          Not affiliated with Congress. We don't save what you write.
        </p>

        <ol className="tyr-steps">
          <li className="tyr-step">
            <div className="tyr-step-label">1 · Who you're writing to</div>
            {renderWho()}
          </li>

          {selected && (
            <li className="tyr-step">
              <label className="tyr-step-label" htmlFor={textareaId}>2 · Your message</label>
              <p id={hintId} className="tyr-fineprint">
                We filled in only the facts from the public record. Replace the bracketed lines with your own words.
              </p>
              <textarea
                id={textareaId}
                ref={textareaRef}
                className="tyr-textarea"
                value={text}
                onChange={(e) => { setText(e.target.value); setCopyState('idle') }}
                aria-describedby={hintId}
                rows={14}
                spellCheck
              />
              {text !== scaffold && (
                <button type="button" className="tyr-link-btn" onClick={handleReset}>Reset to the factual outline</button>
              )}
            </li>
          )}

          {selected && (
            <li className="tyr-step">
              <div className="tyr-step-label">3 · Send it yourself</div>
              {renderSend()}
            </li>
          )}
        </ol>

        <div className="tyr-sr-only" role="status" aria-live="polite">{status}</div>
      </div>
    </section>
  )
}
