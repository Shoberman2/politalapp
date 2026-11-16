import { Link } from 'react-router-dom'

// A list of links for the info pages: a title and one line. The whole row is
// the link. Styled by `.ip-index` in InfoPage.css.
function InfoIndex({ items }) {
  return (
    <ul className="ip-index">
      {items.map((item) => (
        <li key={item.to}>
          <Link to={item.to}>
            <span className="ip-index-title">{item.title}</span>
            <span className="ip-index-dek">{item.dek}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default InfoIndex
