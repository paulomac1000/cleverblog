import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

const writerRoles = allowRoles('admin', 'editor', 'agent-writer')

export const Evidence: CollectionConfig = {
  slug: 'evidence',
  access: {
    read: writerRoles,
    create: writerRoles,
    update: writerRoles,
    delete: allowRoles('admin'),
  },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'url', type: 'text' },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: ['source', 'repository', 'commit', 'test', 'log', 'other'],
    },
    { name: 'notes', type: 'textarea' },
    {
      name: 'sourceVisibility',
      type: 'select',
      required: true,
      defaultValue: 'unknown',
      options: ['public', 'private', 'mixed', 'unknown'],
    },
    { name: 'post', type: 'relationship', relationTo: 'posts' },
    { name: 'topicCandidate', type: 'relationship', relationTo: 'topic-candidates' },
  ],
}
