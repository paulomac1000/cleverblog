import { getPayload } from 'payload'
import config from '../src/payload.config'

// Production seed: admin + agent-writer with API keys for Blog Steward integration.
// Keys are printed ONCE to stdout (captured by the operator to a secret file), never stored in the repo.
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@cleverblog.pl'
const agentEmail = 'agent-writer@cleverblog.pl'

const payload = await getPayload({ config: config as never })

async function upsertUser(email: string, data: Record<string, unknown>) {
  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true, limit: 1 })
  if (existing.docs.length > 0 && existing.docs[0]) {
    return payload.update({ collection: 'users', id: existing.docs[0].id, data, overrideAccess: true })
  }
  return payload.create({ collection: 'users', data: { ...data, email }, overrideAccess: true })
}

const adminKey = process.env.SEED_ADMIN_KEY ?? ('prod-admin-' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join(''))
const agentKey = process.env.SEED_AGENT_KEY ?? ('prod-agent-' + Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join(''))

await upsertUser(adminEmail, { name: 'CleverBlog Admin', role: 'admin', password: process.env.SEED_ADMIN_PASSWORD ?? 'change-me-immediately', enableAPIKey: true, apiKey: adminKey })
await upsertUser(agentEmail, { name: 'Blog Steward Agent Writer', role: 'agent-writer', password: process.env.SEED_AGENT_PASSWORD ?? 'e2e-password-123', enableAPIKey: true, apiKey: agentKey })

console.log('seeded production admin + agent-writer')
console.log('AGENT_WRITER_KEY=' + agentKey)
