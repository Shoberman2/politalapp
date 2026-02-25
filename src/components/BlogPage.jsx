import { useState } from 'react'
import { Link } from 'react-router-dom'
import articles from '../data/articles'
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
      <div className="blog-header">
        <h1>Blog</h1>
        <p className="blog-subtitle">Nonpartisan explainers on how Congress works, who represents you, and why it matters</p>
      </div>

      <div className="blog-filters">
        <input
          type="text"
          placeholder="Search articles by title, topic, or tag..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="blog-search-input"
        />
      </div>

      <div className="blog-results-info">
        <span className="results-count">
          {filteredArticles.length} article{filteredArticles.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filteredArticles.length > 0 ? (
        <div className="blog-grid">
          {filteredArticles.map(article => (
            <Link
              key={article.slug}
              to={`/blog/${article.slug}`}
              className="blog-card"
            >
              <div className="blog-card-tags">
                {article.tags.map(tag => (
                  <span key={tag} className="blog-card-tag">{tag}</span>
                ))}
              </div>
              <h2 className="blog-card-title">{article.title}</h2>
              <p className="blog-card-excerpt">{article.excerpt}</p>
              <div className="blog-card-meta">
                <span className="blog-card-date">{formatDate(article.date)}</span>
                <span className="blog-card-author">{article.author}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="no-articles">
          <p>No articles found matching your search</p>
          <button className="reset-search-button" onClick={() => setSearchTerm('')}>
            Clear Search
          </button>
        </div>
      )}
    </div>
  )
}

export default BlogPage
