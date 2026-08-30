import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

const serverURL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

type Props = {
  params: Promise<{ slug: string }>
}

const findCategory = async (slug: string) => {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })

  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const category = await findCategory(slug)

  if (!category) {
    notFound()
  }

  const description = category.description?.trim() || `Artykuły w kategorii ${category.name}.`

  return {
    title: category.name,
    description,
    alternates: {
      canonical: `${serverURL}/categories/${category.slug}`,
    },
  }
}

export default async function CategoryArchivePage({ params }: Props) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const categoryResult = await payload.find({
    collection: 'categories',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: slug } },
  })
  const category = categoryResult.docs[0]

  if (!category) {
    notFound()
  }

  const posts = await payload.find({
    collection: 'posts',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    sort: '-publishedAt',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { categories: { equals: category.id } },
      ],
    },
  })

  return (
    <section>
      <h1>{category.name}</h1>
      {category.description ? <p>{category.description}</p> : null}
      <ul>
        {posts.docs.map((post) => (
          <li key={post.id}>
            <Link href={`/articles/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
