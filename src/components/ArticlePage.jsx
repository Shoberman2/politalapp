import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import articles from '../data/articles'
import SEO from './SEO'
import '../styles/ArticlePage.css'

function ArticlePage() {
  const { slug } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])

  const article = articles.find(a => a.slug === slug)

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (!article) {
    return (
      <div className="article-not-found">
        <h1>Article Not Found</h1>
        <p>The article you're looking for doesn't exist or may have been moved.</p>
        <button className="back-button" onClick={() => navigate('/blog')}>
          Back to Blog
        </button>
      </div>
    )
  }

  return (
    <div className="article-page">
      <SEO
        title={article.title}
        description={article.excerpt}
        path={`/blog/${article.slug}`}
        type="article"
        article={{
          headline: article.title,
          datePublished: article.date,
          author: article.author,
          description: article.excerpt
        }}
      />
      <button className="back-link" onClick={() => navigate('/blog')}>
        ← Back to Blog
      </button>

      <article className="article-content">
        <header className="article-header">
          <div className="article-tags">
            {article.tags.map(tag => (
              <span key={tag} className="article-tag">{tag}</span>
            ))}
          </div>
          <h1 className="article-title">{article.title}</h1>
          <div className="article-meta">
            <span className="article-date">{formatDate(article.date)}</span>
            <span className="article-meta-divider">·</span>
            <span className="article-author">{article.author}</span>
          </div>
        </header>

        <div className="article-body">
          {article.content.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>
    </div>
  )
}

export default ArticlePage
