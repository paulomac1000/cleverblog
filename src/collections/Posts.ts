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
  labels: { singular: 'Wpis', plural: 'Wpisy' },
  admin: {
    group: 'Treść',
    defaultColumns: ['title', 'publishReadiness', 'adminLocale', '_status', 'publishedAt', 'updatedAt'],
    useAsTitle: 'title',
  },
  fields: [
    { name: 'title', type: 'text', required: true, localized: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, localized: true },
    { name: 'excerpt', type: 'textarea', localized: true },
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
    { name: 'content', type: 'richText', editor: lexicalEditor({}), localized: true },
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
      name: 'publishReadiness',
      type: 'ui',
      label: 'Gotowość',
      admin: {
        components: {
          Field: '/components/admin/posts/PublishReadinessField#PublishReadinessField',
          Cell: '/components/admin/posts/PublishReadinessCell#PublishReadinessCell',
        },
      },
    },
    {
      name: 'adminLocale',
      type: 'ui',
      label: 'Język',
      admin: {
        components: {
          Field: '/components/admin/posts/LocaleField#LocaleField',
          Cell: '/components/admin/posts/LocaleCell#LocaleCell',
        },
      },
    },
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
        {
          name: 'originSourceVisibility',
          type: 'select',
          defaultValue: 'public',
          options: ['public', 'private', 'mixed', 'unknown'],
          admin: {
            description:
              'Visibility of the ORIGINAL inspiration. A privately-inspired article reaches the CMS only as a safe public reconstruction; this field preserves that audit distinction.',
          },
        },
        {
          name: 'materialVisibility',
          type: 'select',
          defaultValue: 'public',
          options: ['public', 'private', 'mixed', 'unknown'],
        },
        {
          name: 'reconstructionStatus',
          type: 'select',
          defaultValue: 'not_required',
          options: ['not_required', 'completed_public_reconstruction'],
        },
        { name: 'generatedBy', type: 'text' },
      ],
    },
    {
      name: 'relatedLinks',
      type: 'array',
      maxRows: 3,
      admin: {
        description:
          'Optional GitHub skill / repository / docs cards rendered under the article body.',
      },
      fields: [
        {
          name: 'label',
          type: 'text',
          required: true,
          maxLength: 80,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
          validate: (value: unknown) => {
            if (typeof value !== 'string' || !value) return 'URL is required'
            let parsed: URL
            try {
              parsed = new URL(value)
            } catch {
              return 'Must be a valid absolute URL'
            }
            if (parsed.protocol !== 'https:') return 'Only https:// URLs'
            const host = parsed.hostname
            if (host !== 'github.com' && host !== 'www.github.com') {
              return 'Only github.com URLs'
            }
            return true
          },
        },
        {
          name: 'kind',
          type: 'select',
          required: true,
          defaultValue: 'repository',
          options: [
            { label: 'GitHub Skill', value: 'github-skill' },
            { label: 'Repository', value: 'repository' },
            { label: 'Documentation', value: 'documentation' },
          ],
        },
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
        { name: 'renderHTML', type: 'textarea' },
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
