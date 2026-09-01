import config from '@payload-config'
import { getPayload } from 'payload'

import { readFileSync } from 'node:fs'

const html = readFileSync('/tmp/opencode/cleverblog/privacy-policy.html', 'utf8')

const main = async () => {
  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'pages',
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: 'polityka-prywatnosci' } },
  })
  const existing = found.docs[0]
  if (!existing) throw new Error('page not found')

  const data = {
    title: 'Polityka prywatności',
    slug: 'polityka-prywatnosci',
    contentFormat: 'legacy-html' as const,
    legacy: { renderHTML: html },
    _status: 'published' as const,
  }

  await payload.update({
    collection: 'pages',
    id: existing.id,
    data,
    overrideAccess: true,
    context: { wordpressMigration: true },
  })
  console.log('published page id', existing.id, 'status', 'published')
  process.exit(0)
}

void main()
