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
        <p>This article doesn’t exist or has moved.</p>
        <button className="back-button btn-outline" onClick={() => navigate('/blog')}>
          Back to blog
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
      <article className="article-content">
        <header className="article-header">
          <h1 className="article-title">{article.title}</h1>
          <p className="article-meta">
            {[formatDate(article.date), article.author, article.tags.join(', ')].filter(Boolean).join(' · ')}
          </p>
        </header>

        <div className="article-body">
          {article.content.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </article>

      <button className="article-back btn-text" onClick={() => navigate('/blog')}>
        Back to blog
      </button>
    </div>
  )
}

export default ArticlePage
