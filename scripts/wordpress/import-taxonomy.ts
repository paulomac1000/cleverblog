import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

type WpTerm = {
  term_id: number
  name: string
  slug: string
  description?: string
  parent?: number
}

type TermKind = 'categories' | 'tags'

const importKind = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  kind: TermKind,
  collection: 'categories' | 'tags',
  terms: WpTerm[],
): Promise<Map<number, string>> => {
  const mapping = new Map<number, string>()
  let created = 0
  let updated = 0

  for (const term of terms) {
    const existing = await payload.find({
      collection,
      limit: 1,
      overrideAccess: true,
      where: { legacyWordPressId: { equals: term.term_id } },
    })

    const data = {
      name: term.name,
      slug: term.slug,
      legacyWordPressId: term.term_id,
    }

    if (existing.docs[0]) {
      await payload.update({
        collection,
        id: existing.docs[0].id,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      mapping.set(term.term_id, String(existing.docs[0].id))
      updated += 1
    } else {
      const doc = await payload.create({
        collection,
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      mapping.set(term.term_id, String(doc.id))
      created += 1
    }
  }

  console.log(`${collection}: ${created} created, ${updated} updated (${terms.length} terms)`)
  return mapping
}

const main = async () => {
  const rawDir = path.join(process.cwd(), 'migration-data/raw')
  const mappingsDir = path.join(process.cwd(), 'migration-data/mappings')
  const payload = await getPayload({ config })

  const categories = JSON.parse(
    await readFile(path.join(rawDir, 'categories.json'), 'utf8'),
  ) as WpTerm[]
  const tags = JSON.parse(await readFile(path.join(rawDir, 'tags.json'), 'utf8')) as WpTerm[]

  const withParent = categories.filter((term) => (term.parent ?? 0) !== 0)
  if (withParent.length > 0) {
    throw new Error(
      `Category hierarchy detected (parent != 0) but hierarchy import is not implemented. ` +
        `Offending term_ids: ${withParent.map((t) => t.term_id).join(', ')}`,
    )
  }

  const categoryMap = await importKind(payload, 'categories', 'categories', categories)
  const tagMap = await importKind(payload, 'tags', 'tags', tags)

  const json = (map: Map<number, string>) =>
    JSON.stringify(Object.fromEntries(map), null, 2)

  await import('node:fs/promises').then(async (fs) => {
    await fs.mkdir(mappingsDir, { recursive: true })
    await fs.writeFile(path.join(mappingsDir, 'taxonomy.json'), JSON.stringify({
      categories: JSON.parse(json(categoryMap)),
      tags: JSON.parse(json(tagMap)),
    }, null, 2))
  })

  console.log('taxonomy mapping written to migration-data/mappings/taxonomy.json')
}

await main()
