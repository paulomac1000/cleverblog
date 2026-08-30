import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const RAW_DIR = path.join(process.cwd(), 'migration-data/raw')
const OUT_PATH = path.join(process.cwd(), 'migration-data/source/public-url-source.json')

export type PublicUrlExpected =
  | { collection: 'posts' | 'pages' | 'categories'; wordpressId: number; fromURL: string }
  | { collection: 'tags'; slug: string; fromURL: string }

export type PublicUrlSource = {
  generatedAt: string
  wordpressSource: { posts: number; pages: number; categories: number; tags: number }
  expected: PublicUrlExpected[]
}

type Captures = { posts: unknown; pages: unknown; categories: unknown; tags: unknown }
type Row = Record<string, unknown>

const rows = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

const row = (value: unknown, label: string): Row => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Row
}

const id = (value: unknown, label: string): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`)
  return parsed
}

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

const count = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
  return value
}

export const publicUrlExpectedKey = (item: PublicUrlExpected): string =>
  item.collection === 'tags' ? `tags:slug:${item.slug}` : `${item.collection}:wp:${item.wordpressId}`

const expectedFromURL = (item: PublicUrlExpected): string => {
  if (item.collection === 'tags') return `/?tag=${item.slug}`
  if (item.collection === 'posts') return `/?p=${item.wordpressId}`
  if (item.collection === 'pages') return `/?page_id=${item.wordpressId}`
  return `/?cat=${item.wordpressId}`
}

const validateExpected = (items: PublicUrlExpected[]): PublicUrlExpected[] => {
  const identities = new Set<string>()
  const urls = new Set<string>()
  for (const item of items) {
    if (item.fromURL !== expectedFromURL(item)) {
      throw new Error(`${publicUrlExpectedKey(item)} has invalid fromURL: ${item.fromURL}`)
    }
    const key = publicUrlExpectedKey(item)
    if (identities.has(key)) throw new Error(`Duplicate public URL identity: ${key}`)
    if (urls.has(item.fromURL)) throw new Error(`Duplicate public URL: ${item.fromURL}`)
    identities.add(key)
    urls.add(item.fromURL)
  }
  return items.sort((a, b) => a.fromURL.localeCompare(b.fromURL))
}

export const buildPublicUrlSource = (
  captures: Captures,
  generatedAt = new Date().toISOString(),
): PublicUrlSource => {
  const posts = rows(captures.posts, 'posts.json')
  const pages = rows(captures.pages, 'pages.json')
  const categories = rows(captures.categories, 'categories.json')
  const tags = rows(captures.tags, 'tags.json')
  const expected: PublicUrlExpected[] = []

  for (const [index, raw] of posts.entries()) {
    const item = row(raw, `posts.json[${index}]`)
    const wordpressId = id(item.ID, `posts.json[${index}].ID`)
    const status = text(item.post_status, `posts.json[${index}].post_status`)
    if (status === 'publish') expected.push({ collection: 'posts', wordpressId, fromURL: `/?p=${wordpressId}` })
  }

  for (const [index, raw] of pages.entries()) {
    const item = row(raw, `pages.json[${index}]`)
    const wordpressId = id(item.ID, `pages.json[${index}].ID`)
    const status = text(item.post_status, `pages.json[${index}].post_status`)
    if (status === 'publish') expected.push({ collection: 'pages', wordpressId, fromURL: `/?page_id=${wordpressId}` })
  }

  for (const [index, raw] of categories.entries()) {
    const item = row(raw, `categories.json[${index}]`)
    const wordpressId = id(item.term_id, `categories.json[${index}].term_id`)
    text(item.slug, `categories.json[${index}].slug`)
    expected.push({ collection: 'categories', wordpressId, fromURL: `/?cat=${wordpressId}` })
  }

  for (const [index, raw] of tags.entries()) {
    const item = row(raw, `tags.json[${index}]`)
    id(item.term_id, `tags.json[${index}].term_id`)
    const slug = text(item.slug, `tags.json[${index}].slug`)
    expected.push({ collection: 'tags', slug, fromURL: `/?tag=${slug}` })
  }

  return {
    generatedAt,
    wordpressSource: { posts: posts.length, pages: pages.length, categories: categories.length, tags: tags.length },
    expected: validateExpected(expected),
  }
}

export const parsePublicUrlSource = (value: unknown): PublicUrlSource => {
  const root = row(value, 'public-url-source.json')
  const counts = row(root.wordpressSource, 'public-url-source.json.wordpressSource')
  const expected = rows(root.expected, 'public-url-source.json.expected').map((raw, index): PublicUrlExpected => {
    const item = row(raw, `public-url-source.json.expected[${index}]`)
    const collection = text(item.collection, `public-url-source.json.expected[${index}].collection`)
    const fromURL = text(item.fromURL, `public-url-source.json.expected[${index}].fromURL`)
    if (collection === 'tags') {
      if ('wordpressId' in item) throw new Error(`public-url-source.json.expected[${index}] tag must not contain wordpressId`)
      return { collection, slug: text(item.slug, `public-url-source.json.expected[${index}].slug`), fromURL }
    }
    if (collection === 'posts' || collection === 'pages' || collection === 'categories') {
      if ('slug' in item) throw new Error(`public-url-source.json.expected[${index}] ${collection} must not contain slug`)
      return { collection, wordpressId: id(item.wordpressId, `public-url-source.json.expected[${index}].wordpressId`), fromURL }
    }
    throw new Error(`public-url-source.json.expected[${index}].collection is invalid`)
  })

  return {
    generatedAt: text(root.generatedAt, 'public-url-source.json.generatedAt'),
    wordpressSource: {
      posts: count(counts.posts, 'public-url-source.json.wordpressSource.posts'),
      pages: count(counts.pages, 'public-url-source.json.wordpressSource.pages'),
      categories: count(counts.categories, 'public-url-source.json.wordpressSource.categories'),
      tags: count(counts.tags, 'public-url-source.json.wordpressSource.tags'),
    },
    expected: validateExpected(expected),
  }
}

export const readPublicUrlSource = async (): Promise<PublicUrlSource> =>
  parsePublicUrlSource(JSON.parse(await readFile(OUT_PATH, 'utf8')) as unknown)

const readRaw = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(path.join(RAW_DIR, name), 'utf8')) as unknown

const main = async (): Promise<void> => {
  const source = buildPublicUrlSource({
    posts: await readRaw('posts.json'),
    pages: await readRaw('pages.json'),
    categories: await readRaw('categories.json'),
    tags: await readRaw('tags.json'),
  })
  await mkdir(path.dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, `${JSON.stringify(source, null, 2)}\n`, 'utf8')
  console.log(`public URL source: ${source.expected.length} expected public URL(s)`)
  console.log('wrote migration-data/source/public-url-source.json')
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) await main()
