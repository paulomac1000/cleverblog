import { describe, expect, it } from 'vitest'

import {
  mcpCollectionCapabilities,
  mcpDisabledCollections,
  type McpCollectionCapabilities,
} from '@/mcp/collectionCapabilities'

const entries = Object.entries(mcpCollectionCapabilities) as [
  string,
  McpCollectionCapabilities,
][]

describe('MCP collection capabilities', () => {
  it('never exposes delete through MCP', () => {
    for (const [slug, caps] of entries) {
      expect(caps.enabled.delete, `${slug}.delete must be false`).toBe(false)
    }
  })

  it('keeps users collection fully disabled', () => {
    expect(mcpDisabledCollections).toContain('users')
    for (const disabled of mcpDisabledCollections) {
      expect((mcpCollectionCapabilities as Record<string, unknown>)[disabled]).toBeUndefined()
    }
  })

  it('is an explicit allowlist: every capability key is spelled out', () => {
    for (const [slug, caps] of entries) {
      for (const op of ['find', 'create', 'update', 'delete'] as const) {
        expect(typeof caps.enabled[op], `${slug}.${op} must be an explicit boolean`).toBe('boolean')
      }
    }
  })

  it('keeps anonymous comment creation disabled', () => {
    expect(mcpCollectionCapabilities.comments?.enabled.create).toBe(false)
  })

  it('gives agents the drafting surface they need', () => {
    expect(mcpCollectionCapabilities.posts?.enabled).toEqual({
      find: true,
      create: true,
      update: true,
      delete: false,
    })
    expect(mcpCollectionCapabilities['topic-candidates']?.enabled.create).toBe(true)
    expect(mcpCollectionCapabilities.evidence?.enabled.create).toBe(true)
  })
})
