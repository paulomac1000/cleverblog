import { readFile } from 'node:fs/promises'
import path from 'node:path'

import config from '@payload-config'
import { getPayload } from 'payload'

import { sanitizePrivacyHtml } from './sanitize-privacy-html'

const sourcePath = path.join(
  process.cwd(),
  'migration-data/source/privacy-policy.html',
)

const main = async () => {
  const raw = await readFile(sourcePath, 'utf8')
  const sanitized = sanitizePrivacyHtml(raw)

  const payload = await getPayload({ config })
  const found = await payload.find({
    collection: 'pages',
    limit: 1,
    overrideAccess: true,
    where: { slug: { equals: 'polityka-prywatnosci' } },
  })
  const existing = found.docs[0]
  if (!existing) throw new Error('page not found')

  await payload.update({
    collection: 'pages',
    id: existing.id,
    data: {
      title: 'Polityka prywatności',
      slug: 'polityka-prywatnosci',
      contentFormat: 'legacy-html' as const,
      legacy: { renderHTML: sanitized },
      _status: 'published' as const,
    },
    overrideAccess: true,
  })
  console.log('published page id', existing.id, 'status', 'published')
  process.exit(0)
}

void main()
