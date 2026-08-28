import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { searchPlugin } from '@payloadcms/plugin-search'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Categories } from '@/collections/Categories'
import { Comments } from '@/collections/Comments'
import { Evidence } from '@/collections/Evidence'
import { Media } from '@/collections/Media'
import { Pages } from '@/collections/Pages'
import { Posts } from '@/collections/Posts'
import { Tags } from '@/collections/Tags'
import { TopicCandidates } from '@/collections/TopicCandidates'
import { Users } from '@/collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'

export default buildConfig({
  admin: {
    importMap: { baseDir: path.resolve(dirname) },
    user: Users.slug,
  },
  collections: [
    Posts,
    Pages,
    Media,
    Categories,
    Tags,
    Comments,
    TopicCandidates,
    Evidence,
    Users,
  ],
  cors: [serverURL],
  csrf: [serverURL],
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL },
  }),
  editor: lexicalEditor({}),
  plugins: [
    seoPlugin({
      collections: ['posts', 'pages'],
      uploadsCollection: 'media',
      generateTitle: ({ doc }) => (doc?.title ? `${doc.title} | CleverBlog` : 'CleverBlog'),
      generateDescription: ({ doc }) => doc?.excerpt ?? undefined,
      generateURL: ({ collectionSlug, doc }) =>
        collectionSlug === 'posts'
          ? `${serverURL}/articles/${doc?.slug ?? ''}`
          : `${serverURL}/${doc?.slug ?? ''}`,
    }),
    searchPlugin({ collections: ['posts', 'pages'], defaultPriorities: { posts: 20, pages: 10 } }),
    redirectsPlugin({ collections: ['posts', 'pages'], redirectTypes: ['301', '302'] }),
    mcpPlugin({
      mcp: { serverOptions: { serverInfo: { name: 'cleverblog', version: '0.1.0' } } },
      collections: {
        posts: { description: 'Blog posts. Agents may draft; publication is backend-gated.', tools: { delete: false } },
        pages: { tools: { delete: false } },
        media: { tools: { delete: false } },
        categories: { tools: { delete: false } },
        tags: { tools: { delete: false } },
        comments: { description: 'Reader comments. Creation remains disabled until abuse protection exists.', tools: { create: false, delete: false } },
        'topic-candidates': { description: 'Potential article topics discovered during engineering work.', tools: { delete: false } },
        evidence: { description: 'Evidence and sources attached to article work.', tools: { delete: false } },
        users: {
          tools: {
            getCollectionSchema: false,
            find: false,
            create: false,
            update: false,
            delete: false,
          },
        },
      },
    }),
  ],
  secret: process.env.PAYLOAD_SECRET,
  serverURL,
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
