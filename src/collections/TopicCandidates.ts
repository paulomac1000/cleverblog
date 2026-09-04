import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

const topicRoles = allowRoles('admin', 'editor', 'agent-topic-scout', 'agent-writer')

export const TopicCandidates: CollectionConfig = {
  slug: 'topic-candidates',
  access: {
    read: topicRoles,
    create: topicRoles,
    update: topicRoles,
    delete: allowRoles('admin'),
  },
  labels: { singular: 'Kandydat tematu', plural: 'Kandydaci tematów' },
  admin: { group: 'System', defaultColumns: ['title', 'status', 'sourceVisibility', 'updatedAt'], useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'summary', type: 'textarea', required: true },
    { name: 'whyInteresting', type: 'textarea' },
    { name: 'sourceRepo', type: 'text' },
    { name: 'sourceRef', type: 'text' },
    {
      name: 'sourceVisibility',
      type: 'select',
      required: true,
      defaultValue: 'unknown',
      options: ['public', 'private', 'mixed', 'unknown'],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'proposed',
      options: ['proposed', 'accepted', 'rejected', 'merged-into-existing', 'drafting'],
      index: true,
    },
    { name: 'relatedPost', type: 'relationship', relationTo: 'posts' },
  ],
}
