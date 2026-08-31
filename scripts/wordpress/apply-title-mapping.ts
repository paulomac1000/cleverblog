import { readFileSync } from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'

type TitleEntry = {
  wp: number
  old: string
  new: string
}

async function main() {
  const mapping: TitleEntry[] = JSON.parse(
    readFileSync(
      `${process.cwd()}/migration-data/source/title-mapping.json`,
      'utf8',
    ),
  )

  const payload = await getPayload({ config })

  let updated = 0
  const mismatches: string[] = []

  for (const entry of mapping) {
    const result = await payload.find({
      collection: 'posts',
      where: {
        and: [
          {
            'legacy.wordpressId': {
              equals: entry.wp,
            },
          },
          {
            _status: { equals: 'published' },
          },
        ],
      },
      limit: 1,
    })

    const post = result.docs[0]

    if (!post) {
      mismatches.push(
        `wp:${entry.wp} not found among published posts`,
      )
      continue
    }

    if (post.title !== entry.old) {
      mismatches.push(
        `wp:${entry.wp} current title "${post.title}" != mapping old "${entry.old}"`,
      )
      continue
    }

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        title: entry.new,
        meta: {
          ...(post.meta ?? {}),
          title: entry.new,
        },
      },
    })

    updated += 1
    console.log(`wp:${entry.wp} -> "${entry.new}"`)
  }

  console.log(`titles updated: ${updated}/${mapping.length}`)

  if (mismatches.length > 0) {
    console.error('MISMATCHES:')
    for (const m of mismatches) console.error(`  - ${m}`)
    process.exit(1)
  }

  await payload.db.destroy?.()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
