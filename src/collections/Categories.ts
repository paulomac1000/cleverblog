import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    read: () => true,
    create: allowRoles('admin', 'editor', 'agent-writer'),
    update: allowRoles('admin', 'editor'),
    delete: allowRoles('admin'),
  },
  admin: { useAsTitle: 'name' },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'description', type: 'textarea' },
    { name: 'legacyWordPressId', type: 'number', unique: true, index: true },
  ],
}
