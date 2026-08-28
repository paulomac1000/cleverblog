import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import type { NormalizedPost } from './types'

const inputPath = path.join(process.cwd(), 'migration-data/normalized/posts.json')
const MIGRATION_VERSION = process.env.WORDPRESS_MIGRATION_VERSION ?? 'wp-foundation-v1'

async function main() {
  const posts = JSON.parse(await readFile(inputPath, 'utf8')) as NormalizedPost[]
  const payload = await getPayload({ config })

  for (const post of posts) {
    const existing = await payload.find({
      collection: 'posts',
      limit: 1,
      overrideAccess: true,
      where: { 'legacy.wordpressId': { equals: post.wordpressId } },
    })

    const data = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      contentFormat: 'legacy-html' as const,
      commentsEnabled: post.commentsEnabled,
      publishedAt: post.publishedAt ?? undefined,
      verification: { status: 'imported' as const },
      review: { status: 'approved' as const },
      provenance: { origin: 'wordpress' as const, sourceVisibility: 'public' as const },
      legacy: {
        wordpressId: post.wordpressId,
        wordpressGuid: post.wordpressGuid ?? undefined,
        originalUrl: post.originalUrl,
        originalSlug: post.slug,
        originalHTML: post.originalHTML,
        sourceHash: post.sourceHash,
        importedAt: new Date().toISOString(),
        migrationVersion: MIGRATION_VERSION,
      },
      _status: post.status === 'publish' ? ('published' as const) : ('draft' as const),
    }

    if (existing.docs[0]) {
      await payload.update({
        collection: 'posts',
        id: existing.docs[0].id,
        data,
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      console.log(`updated wp:${post.wordpressId} -> payload:${existing.docs[0].id}`)
    } else {
      const created = await payload.create({
        collection: 'posts',
        data,
        draft: post.status !== 'publish',
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      console.log(`created wp:${post.wordpressId} -> payload:${created.id}`)
    }
  }
}

await main()
