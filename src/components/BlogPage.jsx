import { useState } from 'react'
import { Link } from 'react-router-dom'
import articles from '../data/articles'
import SEO from './SEO'
import '../styles/BlogPage.css'

function BlogPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredArticles = articles.filter(article => {
    if (!searchTerm) return true
    const query = searchTerm.toLowerCase()
    return (
      article.title.toLowerCase().includes(query) ||
      article.excerpt.toLowerCase().includes(query) ||
      article.tags.some(tag => tag.toLowerCase().includes(query))
    )
  })

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="blog-page">
      <SEO
        title="Blog"
        description="Civic education articles explaining how Congress works, legislation tracking, campaign finance, and public records."
        path="/blog"
      />
      <div className="blog-header">
        <h1>Blog</h1>
        <p className="blog-subtitle">Nonpartisan explainers on how Congress works and who represents you.</p>
      </div>

      <div className="blog-filters">
        <input
          type="search"
          placeholder="Search by title, topic or tag"
          aria-label="Search articles"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="field blog-search-input"
        />
      </div>

      <p className="blog-results-info">
        {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''}
      </p>

      {filteredArticles.length > 0 ? (
        <div className="blog-grid">
          {filteredArticles.map(article => (
            <Link
              key={article.slug}
              to={`/blog/${article.slug}`}
              className="blog-card"
            >
              <h2 className="blog-card-title">{article.title}</h2>
              <p className="blog-card-excerpt">{article.excerpt}</p>
              <p className="blog-card-meta">
                {[formatDate(article.date), article.author, article.tags.join(', ')].filter(Boolean).join(' · ')}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="no-articles">
          <p>No articles match that search.</p>
          <button className="reset-search-button btn-secondary" onClick={() => setSearchTerm('')}>
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}

export default BlogPage
