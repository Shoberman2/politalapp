import { Link } from 'react-router-dom'

// A list of links for the info pages: title, one line, arrow. The whole row is
// the link. Styled by `.ip-index` in InfoPage.css.
function InfoIndex({ items }) {
  return (
    <ul className="ip-index">
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to}>
            <span className="ip-index-title">{item.title}</span>
            <span className="ip-index-dek">{item.dek}</span>
            <span className="ip-index-go" aria-hidden="true">&rarr;</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default InfoIndex
