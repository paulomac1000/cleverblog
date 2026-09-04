import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const serverURL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const cdata = (value: string): string => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

const rssDate = (value: string | null | undefined, postId: string | number): string => {
  if (!value) {
    throw new Error(`Published post payload:${String(postId)} has no publishedAt for RSS`)
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Published post payload:${String(postId)} has invalid publishedAt: ${value}`)
  }

  return date.toUTCString()
}

/**
 * English feed. Queries with fallbackLocale:false and keeps only posts that
 * have real EN content (non-empty slug + title), so the feed never contains
 * Polish fallback items.
 */
export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    locale: 'en',
    fallbackLocale: false,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: '-publishedAt',
    where: { _status: { equals: 'published' } },
  })

  const items = posts.docs
    .filter((post) => Boolean(post.slug) && Boolean(post.title))
    .map((post) => {
      const link = `${serverURL}/en/articles/${post.slug}`
      // legacy.renderHTML is NOT localized — serializing it here would leak
      // the Polish body into the EN feed, violating the no-fallback
      // invariant. EN items carry title/link/excerpt only until EN bodies
      // are authored in Lexical (post.content can be serialized then).
      return `    <item>
      <title>${cdata(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(rssDate(post.publishedAt, post.id))}</pubDate>
      <description>${cdata(post.excerpt ?? '')}</description>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CleverBlog</title>
    <link>${escapeXml(`${serverURL}/en`)}</link>
    <atom:link href="${escapeXml(`${serverURL}/en/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Practical engineering notes, verified on real systems.</description>
    <language>en</language>
    <lastBuildDate>${escapeXml(new Date().toUTCString())}</lastBuildDate>
${items}
  </channel>
</rss>
`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
