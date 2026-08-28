import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: allowRoles('admin', 'editor', 'agent-writer'),
    update: allowRoles('admin', 'editor', 'agent-writer'),
    delete: allowRoles('admin'),
  },
  upload: {
    mimeTypes: ['image/*'],
    staticDir: 'media',
  },
  fields: [
    { name: 'alt', type: 'text', required: true },
    { name: 'caption', type: 'textarea' },
    {
      name: 'legacy',
      type: 'group',
      fields: [
        { name: 'wordpressId', type: 'number', unique: true, index: true },
        { name: 'originalUrl', type: 'text' },
        { name: 'sha256', type: 'text', index: true },
      ],
    },
  ],
}
