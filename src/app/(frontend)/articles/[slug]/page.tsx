import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { CodeHighlight } from '@/components/CodeHighlight'

export const dynamic = 'force-dynamic'

const serverURL = (
  process.env.NEXT_PUBLIC_SERVER_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '')

type Props = {
  params: Promise<{
    slug: string
  }>
}

const findPost = async (
  slug: string,
) => {
  const payload = await getPayload({
    config,
  })

  const result = await payload.find({
    collection: 'posts',
    limit: 1,
    overrideAccess: true,
    where: {
      and: [
        {
          slug: {
            equals: slug,
          },
        },
        {
          _status: {
            equals: 'published',
          },
        },
      ],
    },
  })

  return result.docs[0] ?? null
}

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params
  const post = await findPost(slug)

  if (!post) {
    notFound()
  }

  return {
    title: post.title,
    description:
      post.excerpt || undefined,
    alternates: {
      canonical:
        `${serverURL}/articles/${post.slug}`,
    },
  }
}

export default async function ArticlePage({
  params,
}: Props) {
  const { slug } = await params
  const post = await findPost(slug)

  if (!post) {
    notFound()
  }

  // Render working copy only: media URLs rewritten to Payload, sanitized at
  // import time. originalHTML is the immutable provenance snapshot and is
  // never rendered.
  const renderHTML =
    post.legacy?.renderHTML

  const showLegacy =
    post.contentFormat ===
      'legacy-html' &&
    typeof renderHTML === 'string' &&
    renderHTML.length > 0

  return (
    <article className="article">
      <h1>{post.title}</h1>

      {post.publishedAt ? (
        <div className="meta">
          Opublikowano:{' '}
          {new Date(
            post.publishedAt,
          ).toLocaleDateString(
            'pl-PL',
          )}
        </div>
      ) : null}

      {showLegacy ? (
        <>
          <div
            className="legacy-content"
            dangerouslySetInnerHTML={{
              __html: renderHTML,
            }}
          />
          <CodeHighlight />
        </>
      ) : post.content ? (
        <RichText
          data={
            post.content as SerializedEditorState
          }
        />
      ) : (
        <p>
          Treść nie została jeszcze
          zmigrowana.
        </p>
      )}
    </article>
  )
}
