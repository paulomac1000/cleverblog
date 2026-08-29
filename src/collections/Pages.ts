import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { allowRoles, publicOrRoles } from '@/access/roles'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    read: publicOrRoles('admin', 'editor'),
    create: allowRoles('admin', 'editor'),
    update: allowRoles('admin', 'editor'),
    delete: allowRoles('admin'),
  },
  admin: { useAsTitle: 'title' },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'excerpt', type: 'textarea' },
    { name: 'content', type: 'richText', editor: lexicalEditor({}) },
    {
      name: 'legacy',
      type: 'group',
      fields: [
        { name: 'wordpressId', type: 'number', unique: true, index: true },
        { name: 'originalUrl', type: 'text' },
        { name: 'originalHTML', type: 'textarea' },
        { name: 'renderHTML', type: 'textarea' },
      ],
    },
  ],
  versions: { drafts: { autosave: true, schedulePublish: true }, maxPerDoc: 30 },
}
