import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import config from '@payload-config'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { CodeJSXConverter } from '@/components/richtext/codeConverter'

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

const findPage = async (
  slug: string,
) => {
  const payload = await getPayload({
    config,
  })

  const result = await payload.find({
    collection: 'pages',
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
  const page = await findPage(slug)

  if (!page) {
    notFound()
  }

  return {
    title: page.title,
    description:
      page.excerpt || undefined,
    alternates: {
      canonical:
        `${serverURL}/${page.slug}`,
    },
  }
}

export default async function StaticPage({
  params,
}: Props) {
  const { slug } = await params
  const page = await findPage(slug)

  if (!page) {
    notFound()
  }

  // renderHTML is the sanitized migration working copy. originalHTML remains
  // immutable migration provenance and is never rendered.
  const renderHTML =
    page.legacy?.renderHTML

  const showLegacy =
    page.contentFormat ===
      'legacy-html' &&
    typeof renderHTML === 'string' &&
    renderHTML.length > 0

  return (
    <article className="article">
      <h1>{page.title}</h1>

      {page.publishedAt ? (
        <div className="meta">
          <span>
            Opublikowano:{' '}
            {new Date(
              page.publishedAt,
            ).toLocaleDateString(
              'pl-PL',
            )}
          </span>
        </div>
      ) : null}

      {showLegacy ? (
        <div
          className="legacy-content"
          dangerouslySetInnerHTML={{
            __html: renderHTML,
          }}
        />
      ) : page.content ? (
        <RichText
          converters={({
            defaultConverters,
          }) => ({
            ...defaultConverters,
            ...CodeJSXConverter,
          })}
          data={
            page.content as SerializedEditorState
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
