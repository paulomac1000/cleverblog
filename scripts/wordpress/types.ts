export type RawWordPressPost = {
  ID: number | string
  post_title: string
  post_name: string
  post_status: string
  post_date: string
  post_date_gmt?: string
  post_modified?: string
  post_modified_gmt?: string
  post_excerpt?: string
  post_content: string
  guid?: string
  comment_status?: string
  post_parent?: number | string
}

export type NormalizedPost = {
  wordpressId: number
  title: string
  slug: string
  status: string
  publishedAt: string | null
  excerpt: string
  originalHTML: string
  wordpressGuid: string | null
  originalUrl: string
  sourceHash: string
  commentsEnabled: boolean
  redirects: string[]
}
