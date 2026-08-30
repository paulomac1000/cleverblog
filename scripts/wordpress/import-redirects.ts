import config from '@payload-config'
import { getPayload } from 'payload'

import { buildRedirectSpecs } from './map-redirects'
import { loadLiveRedirectSources } from './redirect-sources'

const main = async () => {
  const payload = await getPayload({ config })
  const redirects = buildRedirectSpecs(await loadLiveRedirectSources(payload))

  let created = 0
  let updated = 0

  for (const redirect of redirects) {
    const existing = await payload.find({
      collection: 'redirects',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { from: { equals: redirect.fromURL } },
    })

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
      const doc = await payload.create({
        collection: 'redirects',
        data,
        context: { wordpressMigration: true },
        overrideAccess: true,
      })
      created += 1
      console.log(`created redirect ${redirect.fromURL} -> payload:${doc.id}`)
    }
  }

  console.log(
    `redirects import: ${created} created, ${updated} updated (${redirects.length} redirects)`,
  )
}

await main()
process.exit(process.exitCode ?? 0)
