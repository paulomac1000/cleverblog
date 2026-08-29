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
    {
      name: 'contentFormat',
      type: 'select',
      required: true,
      defaultValue: 'lexical',
      options: [
        { label: 'Native Lexical', value: 'lexical' },
        { label: 'Legacy sanitized HTML', value: 'legacy-html' },
      ],
    },
    { name: 'content', type: 'richText', editor: lexicalEditor({}) },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'provenance',
      type: 'group',
      fields: [
        {
          name: 'origin',
          type: 'select',
          required: true,
          defaultValue: 'manual',
          options: ['wordpress', 'manual', 'agent'],
        },
        {
          name: 'sourceVisibility',
          type: 'select',
          required: true,
          defaultValue: 'unknown',
          options: ['public', 'private', 'mixed', 'unknown'],
        },
        { name: 'generatedBy', type: 'text' },
      ],
    },
    {
      name: 'legacy',
      type: 'group',
      fields: [
        { name: 'wordpressId', type: 'number', unique: true, index: true },
        { name: 'wordpressGuid', type: 'text' },
        { name: 'originalUrl', type: 'text' },
        { name: 'originalHTML', type: 'textarea' },
        { name: 'renderHTML', type: 'textarea' },
        { name: 'sourceHash', type: 'text', index: true },
        { name: 'importedAt', type: 'date' },
        { name: 'migrationVersion', type: 'text' },
      ],
    },
  ],
  versions: { drafts: { autosave: true, schedulePublish: true }, maxPerDoc: 30 },
}
