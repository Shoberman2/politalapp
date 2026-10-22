import { InfoDot } from './Term'
import '../styles/Tooltip.css'

// Legacy names for a label with a one-off definition. Both now render the
// shared ⓘ button from Term.jsx (tap, click, keyboard and hover all work);
// prefer <Term id="..."> from the glossary for new code.

function Tooltip({ text, children, tag: Tag = 'span' }) {
  return (
    <Tag className="tooltip-wrapper">
      {children}
      <InfoDot def={text} label={typeof children === 'string' ? children : undefined} />
    </Tag>
  )
}

function InfoTip({ text, children, tag: Tag = 'span', className }) {
  return (
    <Tag className={['tooltip-wrapper', className].filter(Boolean).join(' ')}>
      {children}
      <InfoDot def={text} label={typeof children === 'string' ? children : undefined} />
    </Tag>
  )
}

export { Tooltip, InfoTip }
export default Tooltip
