import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import sanitizeHtml from 'sanitize-html'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

const sanitizeLegacyHTML = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  })

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    limit: 1,
    overrideAccess: true,
    where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
  })
  const post = result.docs[0]
  if (!post) notFound()

  const legacyHTML = post.legacy?.originalHTML
  const showLegacy = post.contentFormat === 'legacy-html' && typeof legacyHTML === 'string'

  return (
    <article className="article">
      <h1>{post.title}</h1>
      <div className="meta">
        {post.publishedAt ? <span>Opublikowano: {new Date(post.publishedAt).toLocaleDateString('pl-PL')}</span> : null}
        <span>Status: {post.verification?.status ?? 'needs-review'}</span>
        {post.verification?.verifiedAt ? <span>Zweryfikowano: {new Date(post.verification.verifiedAt).toLocaleDateString('pl-PL')}</span> : null}
      </div>
      {post.verification?.status === 'imported' ? (
        <div className="notice">Artykuł historyczny po migracji z WordPressa; nie został jeszcze ponownie zweryfikowany.</div>
      ) : null}
      {showLegacy ? (
        <div className="legacy-content" dangerouslySetInnerHTML={{ __html: sanitizeLegacyHTML(legacyHTML) }} />
      ) : post.content ? (
        <RichText data={post.content as SerializedEditorState} />
      ) : (
        <p>Treść nie została jeszcze zmigrowana.</p>
      )}
    </article>
  )
}
