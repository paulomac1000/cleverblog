import type { CollectionConfig } from 'payload'

import { allowRoles } from '@/access/roles'

export const CommentTranslations: CollectionConfig = {  slug: 'comment-translations',
  labels: { singular: 'Tłumaczenie komentarza', plural: 'Tłumaczenia komentarzy' },
  admin: {
    group: 'Społeczność',
    hidden: true,
  },
  access: {
    read: () => false,
    create: () => false,
    update: allowRoles('admin'),
    delete: allowRoles('admin'),
  },
  indexes: [{ fields: ['comment', 'locale'], unique: true }],
  fields: [
    {
      name: 'comment',
      type: 'relationship',
      relationTo: 'comments',
      required: true,
      index: true,
    },
    {
      name: 'locale',
      type: 'select',
      required: true,
      options: ['en'],
      index: true,
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'ready',
      options: ['ready', 'failed'],
      index: true,
    },
    { name: 'provider', type: 'text', defaultValue: 'openrouter' },
    { name: 'model', type: 'text' },
    { name: 'sourceHash', type: 'text', index: true },
    { name: 'translationVersion', type: 'number', defaultValue: 1 },
    { name: 'nextRetryAt', type: 'date' },
  ],
}
