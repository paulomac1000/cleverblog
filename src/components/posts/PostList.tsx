import { PostCard, type PostCardData } from './PostCard'

import type { Locale } from '@/i18n/config'

type RelatedTaxonomy = {
  name?: string | null
}

type RelatedMedia = {
  alt?: string | null
  url?: string | null
}

export type PostListSource = {
  id: number
  title: string
  slug: string
  excerpt?: string | null
  publishedAt?: string | null
  heroImage?: number | RelatedMedia | null
  categories?: (number | RelatedTaxonomy)[] | null
  tags?: (number | RelatedTaxonomy)[] | null
  categoryNames?: string[]
  tagNames?: string[]
}

type Props = {
  posts: PostCardData[]
  headingLevel?: 2 | 3
  locale?: Locale
}

const relationNames = (
  relations: (number | RelatedTaxonomy)[] | null | undefined,
): string[] =>
  (relations ?? [])
    .map((relation) =>
      typeof relation === 'object' && relation !== null ? relation.name : null,
    )
    .filter((name): name is string => Boolean(name))

export const toPostListItems = (
  posts: PostListSource[],
  locale?: Locale,
): PostCardData[] =>
  posts.map((post) => {
    const hero =
      post.heroImage && typeof post.heroImage !== 'number'
        ? post.heroImage
        : null
    const categoryNames = post.categoryNames ?? relationNames(post.categories)
    const tagNames = post.tagNames ?? relationNames(post.tags)

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      publishedAt: post.publishedAt,
      heroAlt: hero?.alt ?? null,
      heroUrl: hero?.url ?? null,
      categoryNames,
      tagNames,
    }
  })

export function PostList({ posts, headingLevel = 2, locale = 'pl' }: Props) {
  return (
    <div className="posts">
      {posts.map((post) => (
        <PostCard
          headingLevel={headingLevel}
          key={post.id}
          locale={locale}
          post={post}
        />
      ))}
    </div>
  )
}
