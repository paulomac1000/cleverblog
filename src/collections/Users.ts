import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

const adminOnly = allowRoles('admin')

export const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    useAPIKey: true,
  },
  access: {
    admin: allowRoles('admin', 'editor'),
    create: adminOnly,
    delete: adminOnly,
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    defaultColumns: ['name', 'email', 'role'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'editor',
      required: true,
      saveToJWT: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Agent: topic scout', value: 'agent-topic-scout' },
        { label: 'Agent: writer', value: 'agent-writer' },
        { label: 'Agent: moderator', value: 'agent-moderator' },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data
        const existing = await req.payload.count({ collection: 'users', overrideAccess: true })
        if (existing.totalDocs === 0) return { ...data, role: 'admin' }
        return data
      },
    ],
  },
}
