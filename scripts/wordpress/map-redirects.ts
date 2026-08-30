export type RedirectCollection = 'posts' | 'pages'

export type RedirectSource = {
  wordpressId: number
  slug: string
  collection: RedirectCollection
  payloadId: string | number
}

export type RedirectSpec = {
  fromURL: string
  toURL: {
    relationTo: RedirectCollection
    value: string | number
  }
  type: '301'
}

const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

const assertValidSource = (source: RedirectSource): void => {
  if (!Number.isSafeInteger(source.wordpressId) || source.wordpressId <= 0) {
    throw new Error(`Invalid redirect WordPress ID: ${source.wordpressId}`)
  }

  if (!source.slug.trim()) {
    throw new Error(
      `Redirect target ${source.collection} wp:${source.wordpressId} has no usable slug`,
    )
  }

  if (
    (typeof source.payloadId !== 'string' && typeof source.payloadId !== 'number') ||
    String(source.payloadId).length === 0
  ) {
    throw new Error(
      `Redirect target ${source.collection} wp:${source.wordpressId} has no Payload ID`,
    )
  }
}

const sameTarget = (a: RedirectSpec, b: RedirectSpec): boolean =>
  a.type === b.type &&
  a.toURL.relationTo === b.toURL.relationTo &&
  String(a.toURL.value) === String(b.toURL.value)

export const buildRedirectSpecs = (sources: RedirectSource[]): RedirectSpec[] => {
  const byFromURL = new Map<string, RedirectSpec>()

  const sorted = [...sources].sort((a, b) => {
    const collectionOrder = compareStrings(a.collection, b.collection)
    return collectionOrder !== 0 ? collectionOrder : a.wordpressId - b.wordpressId
  })

  for (const source of sorted) {
    assertValidSource(source)

    const fromURL =
      source.collection === 'posts'
        ? `/?p=${source.wordpressId}`
        : `/?page_id=${source.wordpressId}`

    const redirect: RedirectSpec = {
      fromURL,
      toURL: {
        relationTo: source.collection,
        value: source.payloadId,
      },
      type: '301',
    }

    const existing = byFromURL.get(fromURL)
    if (!existing) {
      byFromURL.set(fromURL, redirect)
      continue
    }

    if (!sameTarget(existing, redirect)) {
      throw new Error(`Conflicting redirect targets for ${fromURL}`)
    }
  }

  return [...byFromURL.values()].sort((a, b) => compareStrings(a.fromURL, b.fromURL))
}
