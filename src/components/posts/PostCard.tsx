import Link from 'next/link'

import type { Locale } from '@/i18n/config'
import { localePath } from '@/i18n/urls'

export type PostCardData = {
  id: number
  title: string
  slug: string
  excerpt?: string | null
  publishedAt?: string | null
  heroAlt?: string | null
  heroUrl?: string | null
  categoryNames?: string[]
  tagNames?: string[]
}

type Props = {
  post: PostCardData
  headingLevel?: 2 | 3
  locale?: Locale
}

const dateFormatters: Record<Locale, Intl.DateTimeFormat> = {
  pl: new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  en: new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
}

export function PostCard({ post, headingLevel = 2, locale = 'pl' }: Props) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const publishedDate = post.publishedAt
    ? new Date(post.publishedAt)
    : null
  const publishedLabel =
    publishedDate && !Number.isNaN(publishedDate.getTime())
      ? dateFormatters[locale].format(publishedDate)
      : null
  const categories = post.categoryNames?.join(' · ')
  const articleHref = localePath(locale, `/articles/${post.slug}`)

  return (
    <Link
      className="card"
      data-category-names={(post.categoryNames ?? []).join(' ')}
      data-excerpt={post.excerpt ?? ''}
      data-tag-names={(post.tagNames ?? []).join(' ')}
      data-title={post.title}
      href={articleHref}
    >
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
