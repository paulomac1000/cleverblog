import type { MCPPluginConfig } from '@payloadcms/plugin-mcp'

export type McpCollectionCapabilities = {
  description?: string
  enabled: {
    find: boolean
    create: boolean
    update: boolean
    delete: boolean
  }
}

/**
 * Payload MCP 3.88 `enabled` is an ALLOWLIST: an operation exists only when its
 * value is explicitly `true` (upstream compares `operationEnabled === true`).
 * The `required()` helper forces every key to spell out all four booleans, so an
 * omitted capability can never silently vanish from the allowlist.
 *
 * delete stays false everywhere: deletion is never exposed through MCP.
 */
const required = <T extends Record<string, McpCollectionCapabilities>>(x: T) => x

export const mcpCollectionCapabilities = required({
  posts: {
    description: 'Blog posts. Agents may draft; publication is backend-gated.',
    enabled: { find: true, create: true, update: true, delete: false },
  },
  pages: {
    description: 'Static pages. Agents may read and update drafts; no delete.',
    enabled: { find: true, create: false, update: true, delete: false },
  },
  media: {
    enabled: { find: true, create: true, update: false, delete: false },
  },
  categories: {
    enabled: { find: true, create: false, update: false, delete: false },
  },
  tags: {
    enabled: { find: true, create: true, update: false, delete: false },
  },
  comments: {
    description: 'Reader comments. Creation remains disabled until abuse protection exists.',
    enabled: { find: true, create: false, update: true, delete: false },
  },
  'topic-candidates': {
    description: 'Potential article topics discovered during engineering work.',
    enabled: { find: true, create: true, update: true, delete: false },
  },
  evidence: {
    description: 'Evidence and sources attached to article work.',
    enabled: { find: true, create: true, update: true, delete: false },
  },
})

export const mcpCollectionsConfig: NonNullable<MCPPluginConfig['collections']> =
  mcpCollectionCapabilities

export const mcpDisabledCollections = ['users'] as const
