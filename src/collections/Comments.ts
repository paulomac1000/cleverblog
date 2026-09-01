import type { CollectionConfig } from 'payload'

import { allowRoles, hasRole } from '@/access/roles'

export const Comments: CollectionConfig = {
  slug: 'comments',
  access: {
    read: ({ req }) => {
      if (hasRole(req.user, ['admin', 'editor', 'agent-moderator'])) return true
      return { status: { equals: 'approved' } }
    },
    create: () => false,
    update: allowRoles('admin', 'editor', 'agent-moderator'),
    delete: allowRoles('admin'),
  },
  admin: { defaultColumns: ['post', 'authorName', 'status', 'createdAt'] },
  defaultSort: '-createdAt',
  indexes: [{ fields: ['post', 'submissionHash'], unique: true }],
  fields: [
    { name: 'post', type: 'relationship', relationTo: 'posts', required: true, index: true },
    { name: 'parent', type: 'relationship', relationTo: 'comments' },
    { name: 'authorName', type: 'text', required: true },
    {
      name: 'authorEmail',
      type: 'email',
      access: { read: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
    { name: 'authorUrl', type: 'text' },
    { name: 'content', type: 'textarea', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      required: true,
      options: ['pending', 'approved', 'spam', 'hidden'],
      index: true,
    },
    {
      name: 'moderation',
      type: 'group',
      fields: [
        { name: 'spamScore', type: 'number' },
        { name: 'reason', type: 'textarea' },
        { name: 'moderatedAt', type: 'date' },
      ],
    },
    {
      name: 'submissionHash',
      type: 'text',
      access: {
        read: ({ req }) => hasRole(req.user, ['admin', 'editor', 'agent-moderator']),
      },
      admin: { hidden: true },
    },
    { name: 'legacyWordPressId', type: 'number', unique: true, index: true },
  ],
}
