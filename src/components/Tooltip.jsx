import { useState } from 'react'
import '../styles/Tooltip.css'

function Tooltip({ text, children, tag: Tag = 'span' }) {
  const [visible, setVisible] = useState(false)

  return (
    <Tag
      className="tooltip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      {children}
      <span className="tooltip-icon">?</span>
      {visible && <span className="tooltip-popup">{text}</span>}
    </Tag>
  )
}

// Inline version — just underlines the text, no "?" icon
function InfoTip({ text, children, tag: Tag = 'span' }) {
  const [visible, setVisible] = useState(false)

  return (
    <Tag
      className="infotip-wrapper"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onClick={() => setVisible(v => !v)}
    >
      {children}
      {visible && <span className="tooltip-popup">{text}</span>}
    </Tag>
  )
}

export { Tooltip, InfoTip }
export default Tooltip
