import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  readPublicUrlSource,
} from './build-public-url-source'

import type {
  PublicUrlExpected,
  PublicUrlSource,
} from './build-public-url-source'

const RAW_DIR = path.join(
  process.cwd(),
  'migration-data/raw',
)

const REPORT_PATH = path.join(
  process.cwd(),
  'migration-data/reports/path-style-urls.json',
)

const INTERNAL_ORIGIN =
  'https://cleverblog.pl'

const INTERNAL_HOSTS = new Set([
  'cleverblog.pl',
  'www.cleverblog.pl',
])

export const LINK_AUDIT_VERSION =
  'p3-links-v1'

export type HtmlReferenceAttribute =
  | 'href'
  | 'src'

export type InternalReference = {
  attribute: HtmlReferenceAttribute
  rawUrl: string
  normalizedUrl: string
}

export type LinkOccurrence = {
  collection: 'posts' | 'pages'
  wordpressId: number
  rawHref: string
}

export type LegacyPathClassification =
  | 'redirect'
  | 'route'
  | 'uncovered'

export type LegacyPathEntry = {
  url: string
  classification: LegacyPathClassification
  occurrences: LinkOccurrence[]
}

export type PathStyleUrlsReport = {
  version: string
  generatedAt: string
  sourceFingerprint: string
  checks: {
    scannedDocuments: number
    internalHrefOccurrences: number
    uniqueInternalPaths: number
    coveredByRedirect: number
    coveredByRoute: number
    uncovered: number
  }
  legacyPaths: LegacyPathEntry[]
  uncovered: string[]
}

export type CrawlerCaptures = {
  posts: unknown
  pages: unknown
  categories: unknown
  tags: unknown
}

export type CrawlerInputs = {
  captures: CrawlerCaptures
  publicUrlSource: PublicUrlSource
}

type ContentRow = {
  wordpressId: number
  status: string
  slug: string
  html: string
  path: string
}

type TermRow = {
  wordpressId: number
  slug: string
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value)

const asArray = (
  value: unknown,
  label: string,
): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  return value
}

const positiveInteger = (
  value: unknown,
  label: string,
): number => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' &&
          /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN

  if (
    !Number.isSafeInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `${label} must be a positive integer`,
    )
  }

  return parsed
}

const stringValue = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`)
  }

  return value
}

const nonEmptyString = (
  value: unknown,
  label: string,
): string => {
  const result =
    stringValue(value, label).trim()

  if (!result) {
    throw new Error(
      `${label} must be a non-empty string`,
    )
  }

  return result
}

const decodeHtmlEntities = (
  value: string,
): string =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, raw) => {
      const codePoint = Number.parseInt(
        String(raw),
        16,
      )

      return Number.isSafeInteger(codePoint)
        ? String.fromCodePoint(codePoint)
        : _
    })
    .replace(/&#(\d+);/g, (_, raw) => {
      const codePoint = Number(raw)

      return Number.isSafeInteger(codePoint)
        ? String.fromCodePoint(codePoint)
        : _
    })

const normalizePathname = (
  pathname: string,
): string => {
  if (pathname === '/') return '/'

  const withoutTrailing =
    pathname.replace(/\/+$/, '')

  return withoutTrailing || '/'
}

export const normalizeInternalUrl = (
  rawUrl: string,
  documentPath?: string,
): string | null => {
  const value =
    decodeHtmlEntities(rawUrl).trim()

  if (!value || value.startsWith('#')) {
    return null
  }

  if (
    /^(?:mailto|tel|javascript|data):/i.test(
      value,
    )
  ) {
    return null
  }

  let parsed: URL

  try {
    if (value.startsWith('//')) {
      parsed = new URL(`https:${value}`)
    } else if (
      documentPath !== undefined &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !value.startsWith('/')
    ) {
      // RFC 3986 §5.3: relative hrefs
      // resolve against the document URL,
      // not the site root.
      const base =
        new URL(
          documentPath,
          INTERNAL_ORIGIN,
        )
      parsed = new URL(value, base)
    } else {
      parsed = new URL(
        value,
        INTERNAL_ORIGIN,
      )
    }
  } catch {
    return null
  }

  if (
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'https:'
  ) {
    return null
  }

  if (
    !INTERNAL_HOSTS.has(
      parsed.hostname.toLowerCase(),
    )
  ) {
    return null
  }

  return `${normalizePathname(
    parsed.pathname,
  )}${parsed.search}`
}

const extractAttributeValues = (
  html: string,
  attribute: HtmlReferenceAttribute,
): string[] => {
  const escaped =
    attribute.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    )

  const pattern = new RegExp(
    `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,
    'gi',
  )

  const values: string[] = []

  for (
    let match = pattern.exec(html);
    match !== null;
    match = pattern.exec(html)
  ) {
    const value =
      match[1] ?? match[2] ?? match[3]

    if (value !== undefined) {
      values.push(
        decodeHtmlEntities(value),
      )
    }
  }

  return values
}

export const extractInternalReferences = (
  html: string,
  attributes: readonly HtmlReferenceAttribute[] = [
    'href',
    'src',
  ],
  documentPath?: string,
): InternalReference[] => {
  const result: InternalReference[] = []

  for (const attribute of attributes) {
    for (const rawUrl of extractAttributeValues(
      html,
      attribute,
    )) {
      const normalizedUrl =
        normalizeInternalUrl(
          rawUrl,
          documentPath,
        )

      if (normalizedUrl === null) continue

      result.push({
        attribute,
        rawUrl,
        normalizedUrl,
      })
    }
  }

  return result
}

const parseContentRows = (
  value: unknown,
  label: string,
): ContentRow[] => {
  const rows = asArray(value, label)

  const parsed = rows.map(
    (raw, index): ContentRow => {
      if (!isRecord(raw)) {
        throw new Error(
          `${label}[${index}] must be an object`,
        )
      }

      const wordpressId =
        positiveInteger(
          raw.ID,
          `${label}[${index}].ID`,
        )

      return {
        wordpressId,
        status: nonEmptyString(
          raw.post_status,
          `${label}[${index}].post_status`,
        ),
        slug:
          stringValue(
            raw.post_name,
            `${label}[${index}].post_name`,
          ).trim() ||
          `wordpress-${wordpressId}`,
        html: stringValue(
          raw.post_content,
          `${label}[${index}].post_content`,
        ),
        path: stringValue(
          raw.post_name,
          `${label}[${index}].post_name`,
        ).trim()
          ? `/${stringValue(
              raw.post_name,
              `${label}[${index}].post_name`,
            ).trim()}`
          : `/?p=${wordpressId}`,
      }
    },
  )

  const seen = new Set<number>()

  for (const item of parsed) {
    if (seen.has(item.wordpressId)) {
      throw new Error(
        `${label} contains duplicate WordPress ID ${item.wordpressId}`,
      )
    }

    seen.add(item.wordpressId)
  }

  return parsed.sort(
    (a, b) =>
      a.wordpressId - b.wordpressId,
  )
}

const parseTermRows = (
  value: unknown,
  label: string,
): TermRow[] => {
  const rows = asArray(value, label)

  const parsed = rows.map(
    (raw, index): TermRow => {
      if (!isRecord(raw)) {
        throw new Error(
          `${label}[${index}] must be an object`,
        )
      }

      return {
        wordpressId:
          positiveInteger(
            raw.term_id,
            `${label}[${index}].term_id`,
          ),
        slug: nonEmptyString(
          raw.slug,
          `${label}[${index}].slug`,
        ),
      }
    },
  )

  const seenIds = new Set<number>()
  const seenSlugs = new Set<string>()

  for (const item of parsed) {
    if (seenIds.has(item.wordpressId)) {
      throw new Error(
        `${label} contains duplicate term_id ${item.wordpressId}`,
      )
    }

    if (seenSlugs.has(item.slug)) {
      throw new Error(
        `${label} contains duplicate slug ${item.slug}`,
      )
    }

    seenIds.add(item.wordpressId)
    seenSlugs.add(item.slug)
  }

  return parsed.sort(
    (a, b) =>
      a.wordpressId - b.wordpressId,
  )
}

const expectedIdentity = (
  expected: PublicUrlExpected,
): string =>
  expected.collection === 'tags'
    ? `tags:slug:${expected.slug}`
    : `${expected.collection}:wp:${expected.wordpressId}`

const buildRouteSet = (
  posts: ContentRow[],
  pages: ContentRow[],
  categories: TermRow[],
  tags: TermRow[],
  source: PublicUrlSource,
): Set<string> => {
  const postById = new Map(
    posts.map((item) => [
      item.wordpressId,
      item,
    ]),
  )
  const pageById = new Map(
    pages.map((item) => [
      item.wordpressId,
      item,
    ]),
  )
  const categoryById = new Map(
    categories.map((item) => [
      item.wordpressId,
      item,
    ]),
  )
  const tagBySlug = new Map(
    tags.map((item) => [
      item.slug,
      item,
    ]),
  )

  const routes = new Set<string>([
    '/',
    '/sitemap.xml',
    '/robots.txt',
    '/feed.xml',
  ])

  for (const expected of source.expected) {
    if (expected.collection === 'posts') {
      const row =
        postById.get(expected.wordpressId)

      if (!row || row.status !== 'publish') {
        throw new Error(
          `${expectedIdentity(expected)} is missing from the published posts capture`,
        )
      }

      routes.add(
        `/articles/${row.slug}`,
      )
      continue
    }

    if (expected.collection === 'pages') {
      const row =
        pageById.get(expected.wordpressId)

      if (!row || row.status !== 'publish') {
        throw new Error(
          `${expectedIdentity(expected)} is missing from the published pages capture`,
        )
      }

      routes.add(`/${row.slug}`)
      continue
    }

    if (
      expected.collection ===
      'categories'
    ) {
      const row =
        categoryById.get(
          expected.wordpressId,
        )

      if (!row) {
        throw new Error(
          `${expectedIdentity(expected)} is missing from categories.json`,
        )
      }

      routes.add(
        `/categories/${row.slug}`,
      )
      continue
    }

    if (!('slug' in expected)) {
      throw new Error(
        `${expectedIdentity(expected)} is not a tag-archive entry`,
      )
    }

    if (!tagBySlug.has(expected.slug)) {
      throw new Error(
        `${expectedIdentity(expected)} is missing from tags.json`,
      )
    }

    routes.add(`/tags/${expected.slug}`)
  }

  return routes
}

const sourceFingerprint = (
  posts: ContentRow[],
  pages: ContentRow[],
  categories: TermRow[],
  tags: TermRow[],
  source: PublicUrlSource,
): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: LINK_AUDIT_VERSION,
        posts,
        pages,
        categories,
        tags,
        expected: source.expected,
      }),
    )
    .digest('hex')

export const buildPathStyleReport = (
  captures: CrawlerCaptures,
  publicUrlSource: PublicUrlSource,
  generatedAt = new Date().toISOString(),
): PathStyleUrlsReport => {
  const posts = parseContentRows(
    captures.posts,
    'posts.json',
  )
  const pages = parseContentRows(
    captures.pages,
    'pages.json',
  )
  const categories = parseTermRows(
    captures.categories,
    'categories.json',
  )
  const tags = parseTermRows(
    captures.tags,
    'tags.json',
  )

  const redirects = new Set(
    publicUrlSource.expected.map(
      (item) => item.fromURL,
    ),
  )

  const routes = buildRouteSet(
    posts,
    pages,
    categories,
    tags,
    publicUrlSource,
  )

  const entries =
    new Map<string, LegacyPathEntry>()

  let internalHrefOccurrences = 0

  const scan = (
    collection: 'posts' | 'pages',
    row: ContentRow,
  ) => {
    for (const reference of
      extractInternalReferences(
        row.html,
        ['href'],
        row.path,
      )) {
      internalHrefOccurrences += 1

      const classification:
        LegacyPathClassification =
        redirects.has(
          reference.normalizedUrl,
        )
          ? 'redirect'
          : routes.has(
                reference.normalizedUrl,
              )
            ? 'route'
            : 'uncovered'

      const occurrence: LinkOccurrence = {
        collection,
        wordpressId:
          row.wordpressId,
        rawHref: reference.rawUrl,
      }

      const existing = entries.get(
        reference.normalizedUrl,
      )

      if (existing) {
        if (
          existing.classification !==
          classification
        ) {
          throw new Error(
            `Classification changed within one run for ${reference.normalizedUrl}`,
          )
        }

        existing.occurrences.push(occurrence)
      } else {
        entries.set(
          reference.normalizedUrl,
          {
            url: reference.normalizedUrl,
            classification,
            occurrences: [occurrence],
          },
        )
      }
    }
  }

  for (const post of posts) {
    scan('posts', post)
  }

  for (const page of pages) {
    scan('pages', page)
  }

  const legacyPaths = [...entries.values()]
    .map((entry) => ({
      ...entry,
      occurrences:
        [...entry.occurrences].sort(
          (a, b) =>
            a.collection.localeCompare(
              b.collection,
            ) ||
            a.wordpressId -
              b.wordpressId ||
            a.rawHref.localeCompare(
              b.rawHref,
            ),
        ),
    }))
    .sort((a, b) =>
      a.url.localeCompare(b.url),
    )

  const uncovered = legacyPaths
    .filter(
      (entry) =>
        entry.classification ===
        'uncovered',
    )
    .map((entry) => entry.url)

  return {
    version: LINK_AUDIT_VERSION,
    generatedAt,
    sourceFingerprint:
      sourceFingerprint(
        posts,
        pages,
        categories,
        tags,
        publicUrlSource,
      ),
    checks: {
      scannedDocuments:
        posts.length + pages.length,
      internalHrefOccurrences,
      uniqueInternalPaths:
        legacyPaths.length,
      coveredByRedirect:
        legacyPaths.filter(
          (entry) =>
            entry.classification ===
            'redirect',
        ).length,
      coveredByRoute:
        legacyPaths.filter(
          (entry) =>
            entry.classification ===
            'route',
        ).length,
      uncovered: uncovered.length,
    },
    legacyPaths,
    uncovered,
  }
}

const parsePathStyleReport = (
  value: unknown,
): PathStyleUrlsReport => {
  if (!isRecord(value)) {
    throw new Error(
      'path-style-urls.json must contain an object',
    )
  }

  if (
    value.version !==
    LINK_AUDIT_VERSION
  ) {
    throw new Error(
      `path-style-urls.json.version must be ${LINK_AUDIT_VERSION}`,
    )
  }

  const generatedAt =
    nonEmptyString(
      value.generatedAt,
      'path-style-urls.json.generatedAt',
    )

  const fingerprint =
    nonEmptyString(
      value.sourceFingerprint,
      'path-style-urls.json.sourceFingerprint',
    )

  if (!isRecord(value.checks)) {
    throw new Error(
      'path-style-urls.json.checks must be an object',
    )
  }

  const checks = (value.checks ?? {}) as Record<string, unknown>

  const count = (
    name: string,
  ): number => {
    const raw = checks[name]

    if (
      typeof raw !== 'number' ||
      !Number.isSafeInteger(raw) ||
      raw < 0
    ) {
      throw new Error(
        `path-style-urls.json.checks.${name} must be a non-negative integer`,
      )
    }

    return raw
  }

  const rawLegacyPaths = asArray(
    value.legacyPaths,
    'path-style-urls.json.legacyPaths',
  )

  const legacyPaths =
    rawLegacyPaths.map(
      (raw, index): LegacyPathEntry => {
        if (!isRecord(raw)) {
          throw new Error(
            `path-style-urls.json.legacyPaths[${index}] must be an object`,
          )
        }

        if (
          raw.classification !==
            'redirect' &&
          raw.classification !==
            'route' &&
          raw.classification !==
            'uncovered'
        ) {
          throw new Error(
            `path-style-urls.json.legacyPaths[${index}].classification is invalid`,
          )
        }

        const occurrences = asArray(
          raw.occurrences,
          `path-style-urls.json.legacyPaths[${index}].occurrences`,
        ).map(
          (
            occurrence,
            occurrenceIndex,
          ): LinkOccurrence => {
            if (!isRecord(occurrence)) {
              throw new Error(
                `path-style-urls.json.legacyPaths[${index}].occurrences[${occurrenceIndex}] must be an object`,
              )
            }

            if (
              occurrence.collection !==
                'posts' &&
              occurrence.collection !==
                'pages'
            ) {
              throw new Error(
                `path-style-urls.json.legacyPaths[${index}].occurrences[${occurrenceIndex}].collection is invalid`,
              )
            }

            return {
              collection:
                occurrence.collection,
              wordpressId:
                positiveInteger(
                  occurrence.wordpressId,
                  `path-style-urls.json.legacyPaths[${index}].occurrences[${occurrenceIndex}].wordpressId`,
                ),
              rawHref: stringValue(
                occurrence.rawHref,
                `path-style-urls.json.legacyPaths[${index}].occurrences[${occurrenceIndex}].rawHref`,
              ),
            }
          },
        )

        return {
          url: nonEmptyString(
            raw.url,
            `path-style-urls.json.legacyPaths[${index}].url`,
          ),
          classification:
            raw.classification,
          occurrences,
        }
      },
    )

  if (
    !Array.isArray(value.uncovered) ||
    !value.uncovered.every(
      (item) =>
        typeof item === 'string',
    )
  ) {
    throw new Error(
      'path-style-urls.json.uncovered must be a string array',
    )
  }

  return {
    version: LINK_AUDIT_VERSION,
    generatedAt,
    sourceFingerprint:
      fingerprint,
    checks: {
      scannedDocuments: count(
        'scannedDocuments',
      ),
      internalHrefOccurrences: count(
        'internalHrefOccurrences',
      ),
      uniqueInternalPaths: count(
        'uniqueInternalPaths',
      ),
      coveredByRedirect: count(
        'coveredByRedirect',
      ),
      coveredByRoute: count(
        'coveredByRoute',
      ),
      uncovered: count('uncovered'),
    },
    legacyPaths,
    uncovered: [...value.uncovered],
  }
}

export const pathStyleReportsEquivalent = (
  left: PathStyleUrlsReport,
  right: PathStyleUrlsReport,
): boolean =>
  JSON.stringify({
    version: left.version,
    sourceFingerprint:
      left.sourceFingerprint,
    checks: left.checks,
    legacyPaths: left.legacyPaths,
    uncovered: left.uncovered,
  }) ===
  JSON.stringify({
    version: right.version,
    sourceFingerprint:
      right.sourceFingerprint,
    checks: right.checks,
    legacyPaths: right.legacyPaths,
    uncovered: right.uncovered,
  })

const readRaw = async (
  name: string,
): Promise<unknown> =>
  JSON.parse(
    await readFile(
      path.join(RAW_DIR, name),
      'utf8',
    ),
  ) as unknown

export const loadCrawlerInputs =
  async (): Promise<CrawlerInputs> => ({
    captures: {
      posts: await readRaw('posts.json'),
      pages: await readRaw('pages.json'),
      categories:
        await readRaw('categories.json'),
      tags: await readRaw('tags.json'),
    },
    publicUrlSource:
      await readPublicUrlSource(),
  })

export const readPathStyleReport =
  async (): Promise<PathStyleUrlsReport> =>
    parsePathStyleReport(
      JSON.parse(
        await readFile(
          REPORT_PATH,
          'utf8',
        ),
      ) as unknown,
    )

export const writePathStyleReport =
  async (
    report: PathStyleUrlsReport,
  ): Promise<void> => {
    await mkdir(
      path.dirname(REPORT_PATH),
      { recursive: true },
    )

    await writeFile(
      REPORT_PATH,
      `${JSON.stringify(
        report,
        null,
        2,
      )}\n`,
      'utf8',
    )
  }

const main = async (): Promise<void> => {
  const inputs =
    await loadCrawlerInputs()

  const report =
    buildPathStyleReport(
      inputs.captures,
      inputs.publicUrlSource,
    )

  await writePathStyleReport(report)

  console.log(
    `link inventory: ${report.checks.internalHrefOccurrences} internal href occurrence(s), ${report.checks.uniqueInternalPaths} unique path(s), ${report.checks.uncovered} uncovered`,
  )
  console.log(
    'wrote migration-data/reports/path-style-urls.json',
  )

  if (report.uncovered.length > 0) {
    console.error(
      `link inventory: ${report.uncovered.length} uncovered legacy path(s); cutover gate will remain blocked`,
    )
  }
}

const invokedPath = process.argv[1]

if (
  invokedPath &&
  import.meta.url ===
    pathToFileURL(
      path.resolve(invokedPath),
    ).href
) {
  await main()
}
