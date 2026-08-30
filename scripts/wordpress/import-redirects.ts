import config from '@payload-config'
import { getPayload } from 'payload'

import { buildRedirectSpecs } from './map-redirects'

import type { RedirectCollection, RedirectSource } from './map-redirects'

const SOURCE_LIMIT = 1000

const main = async () => {
  const payload = await getPayload({ config })

  const loadSources = async (collection: RedirectCollection): Promise<RedirectSource[]> => {
    const result = await payload.find({
      collection,
      depth: 0,
      limit: SOURCE_LIMIT,
      overrideAccess: true,
    })

    if (result.totalDocs > result.docs.length) {
      throw new Error(
        `Redirect source ${collection} exceeds import limit ${SOURCE_LIMIT}; refusing a partial redirect import`,
      )
    }

    return result.docs.flatMap((doc) => {
      if (doc._status !== 'published') return []

      const wordpressId = doc.legacy?.wordpressId
      const slug = doc.slug

      if (typeof wordpressId !== 'number') return []
      if (typeof slug !== 'string' || !slug.trim()) return []

      return [
        {
          wordpressId,
          slug,
          collection,
          payloadId: doc.id,
        },
      ]
    })
  }

  const sources = [
    ...(await loadSources('posts')),
    ...(await loadSources('pages')),
  ]

  const redirects = buildRedirectSpecs(sources)

  let created = 0
  let updated = 0

  for (const redirect of redirects) {
    const existing = await payload.find({
      collection: 'redirects',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        from: {
          equals: redirect.fromURL,
        },
      },
    })

    // @payloadcms/plugin-redirects@3.88.0 stores the semantic fromURL/toURL
    // contract as `from` plus `to.reference`.
    const data = {
      from: redirect.fromURL,
      to: {
        type: 'reference' as const,
        reference: {
          relationTo: redirect.toURL.relationTo,
          value: Number(redirect.toURL.value),
        },
      },
      type: redirect.type,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'redirects',
        id: existing.docs[0].id,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      updated += 1
      console.log(`updated redirect ${redirect.fromURL} -> ${redirect.toURL.relationTo}`)
    } else {
      const createdRedirect = await payload.create({
        collection: 'redirects',
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
      console.log(`created redirect ${redirect.fromURL} -> payload:${createdRedirect.id}`)
    }
  }

  console.log(
    `redirects import: ${created} created, ${updated} updated (${redirects.length} redirects)`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
