import Link from 'next/link'

export type PostCardData = {
  id: number
  title: string
  slug: string
  excerpt?: string | null
  publishedAt?: string | null
  heroAlt?: string | null
  heroUrl?: string | null
  categoryNames?: string[]
}

type Props = {
  post: PostCardData
  headingLevel?: 2 | 3
}

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function PostCard({ post, headingLevel = 2 }: Props) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt)
    : null
  const publishedLabel =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? dateFormatter.format(publishedDate)
      : null
  const categories = post.categoryNames?.join(' · ')

  return (
    <Link className="card" href={`/articles/${post.slug}`}>
      {post.heroUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={post.heroAlt ?? ''}
          className="card-image"
          src={post.heroUrl}
        />
      ) : null}
      <div className="card-body">
        {publishedLabel || categories ? (
          <div className="card-meta">
            {publishedLabel ? (
              <time dateTime={post.publishedAt ?? undefined}>
                {publishedLabel}
              </time>
            ) : null}
            {categories ? (
              <span className="card-category">{categories}</span>
            ) : null}
          </div>
        ) : null}
        <Heading>{post.title}</Heading>
        {post.excerpt ? <p>{post.excerpt}</p> : null}
      </div>
    </Link>
  )
}
