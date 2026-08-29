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
import { mcpCollectionsConfig } from '@/mcp/collectionCapabilities'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const serverURL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'

function requirePayloadSecret(): string {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret || secret.length < 16) {
    throw new Error(
      'PAYLOAD_SECRET is missing or too short. Set it in .env (PAYLOAD_SECRET=<32+ random chars>) or the environment. Failing closed instead of booting with a known secret.',
    )
  }
  return secret
}

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
      collections: mcpCollectionsConfig,
    }),
  ],
  secret: requirePayloadSecret(),
  serverURL,
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
