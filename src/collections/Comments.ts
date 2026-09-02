import type { CollectionConfig } from 'payload'

import { allowRoles, hasRole } from '@/access/roles'
import { enforceCommentApprovalGate } from '@/hooks/enforceCommentApprovalGate'

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
  hooks: { beforeChange: [enforceCommentApprovalGate] },
  indexes: [{ fields: ['post', 'submissionHash'], unique: true }],
  fields: [
    {
      name: 'post',
      type: 'relationship',
      relationTo: 'posts',
      required: true,
      index: true,
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'comments',
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
    {
      name: 'authorName',
      type: 'text',
      required: true,
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
    {
      name: 'authorEmail',
      type: 'email',
      access: {
        read: ({ req }) => hasRole(req.user, ['admin', 'editor']),
        update: ({ req }) => hasRole(req.user, ['admin', 'editor']),
      },
    },
    {
      name: 'authorUrl',
      type: 'text',
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
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
        update: ({ req }) => hasRole(req.user, ['admin', 'editor']),
      },
      admin: { hidden: true },
    },
    {
      name: 'legacyWordPressId',
      type: 'number',
      unique: true,
      index: true,
      access: { update: ({ req }) => hasRole(req.user, ['admin', 'editor']) },
    },
  ],
}
