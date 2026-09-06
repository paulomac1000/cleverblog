import { randomBytes } from 'node:crypto'

import { getPayload } from 'payload'
import config from '../src/payload.config'

// Production seed: admin + agent-writer with API keys for Blog Steward integration.
// Keys are printed ONCE to stdout (captured by the operator to a secret file), never stored in the repo.
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@cleverblog.pl'
const agentEmail = 'agent-writer@cleverblog.pl'
const adminPassword = process.env.SEED_ADMIN_PASSWORD
const agentPassword = process.env.SEED_AGENT_PASSWORD

if (
  !adminPassword ||
  adminPassword.length < 16 ||
  !agentPassword ||
  agentPassword.length < 16
) {
  console.error(
    'Production seed aborted: SEED_ADMIN_PASSWORD and SEED_AGENT_PASSWORD must both be set and at least 16 characters long.',
  )
  console.error(
    'Required seed env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_KEY, SEED_ADMIN_PASSWORD, SEED_AGENT_KEY, SEED_AGENT_PASSWORD',
  )
  process.exit(1)
}

const payload = await getPayload({ config: config as never })

async function upsertUser(email: string, data: Record<string, unknown>) {
  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true, limit: 1 })
  if (existing.docs.length > 0 && existing.docs[0]) {
    return payload.update({ collection: 'users', id: existing.docs[0].id, data, overrideAccess: true })
  }
  return payload.create({ collection: 'users', data: { ...data, email }, overrideAccess: true })
}

const adminKey = process.env.SEED_ADMIN_KEY ?? ('prod-admin-' + randomBytes(24).toString('hex'))
const agentKey = process.env.SEED_AGENT_KEY ?? ('prod-agent-' + randomBytes(24).toString('hex'))

await upsertUser(adminEmail, { name: 'CleverBlog Admin', role: 'admin', password: adminPassword, enableAPIKey: true, apiKey: adminKey })
await upsertUser(agentEmail, { name: 'Blog Steward Agent Writer', role: 'agent-writer', password: agentPassword, enableAPIKey: true, apiKey: agentKey })

console.log('seeded production admin + agent-writer')
console.log('AGENT_WRITER_KEY=' + agentKey)
