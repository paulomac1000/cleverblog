import type { CollectionConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { allowRoles, publicOrRoles } from '@/access/roles'
import { enforcePostPublicationGate } from '@/hooks/enforcePostPublicationGate'

export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    read: publicOrRoles('admin', 'editor', 'agent-writer'),
    create: allowRoles('admin', 'editor', 'agent-writer'),
    update: allowRoles('admin', 'editor', 'agent-writer'),
    delete: allowRoles('admin'),
  },
  admin: {
    defaultColumns: ['title', 'slug', '_status', 'publishedAt', 'updatedAt'],
    useAsTitle: 'title',
  },
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
    { name: 'heroImage', type: 'upload', relationTo: 'media' },
    { name: 'categories', type: 'relationship', relationTo: 'categories', hasMany: true },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    { name: 'author', type: 'relationship', relationTo: 'users' },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'commentsEnabled', type: 'checkbox', defaultValue: true },
    {
      name: 'verification',
      type: 'group',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'needs-review',
          options: ['imported', 'needs-review', 'verified', 'stale', 'historical', 'superseded'],
        },
        { name: 'verifiedAt', type: 'date' },
        { name: 'environment', type: 'text' },
        { name: 'notes', type: 'textarea' },
      ],
    },
    {
      name: 'review',
      type: 'group',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'pending',
          options: ['pending', 'approved', 'rejected'],
        },
        { name: 'reviewedAt', type: 'date' },
        { name: 'reviewedBy', type: 'relationship', relationTo: 'users' },
      ],
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
      admin: { description: 'Immutable migration provenance; do not remove after conversion.' },
      fields: [
        { name: 'wordpressId', type: 'number', unique: true, index: true },
        { name: 'wordpressGuid', type: 'text' },
        { name: 'originalUrl', type: 'text' },
        { name: 'originalSlug', type: 'text' },
        { name: 'originalHTML', type: 'textarea' },
        { name: 'sourceHash', type: 'text', index: true },
        { name: 'importedAt', type: 'date' },
        { name: 'migrationVersion', type: 'text' },
      ],
    },
  ],
  hooks: {
    beforeChange: [enforcePostPublicationGate],
  },
  versions: {
    drafts: {
      autosave: { interval: 1000 },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
