export type WpCommentItem = {
  comment_ID: string
  comment_post_ID: string
  comment_parent: string
  comment_author: string
  comment_author_email: string
  comment_author_url: string
  comment_content: string
  comment_approved: string
  comment_date: string
  comment_date_gmt: string
}

const parseNonNegativeInteger = (value: string, field: string): number => {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid WordPress comment ${field}: ${JSON.stringify(value)}`)
  }
  return parsed
}

const commentId = (comment: WpCommentItem): number =>
  parseNonNegativeInteger(comment.comment_ID, 'comment_ID')

const compareComments = (a: WpCommentItem, b: WpCommentItem): number => commentId(a) - commentId(b)

export const selectApprovedComments = (raw: WpCommentItem[]): WpCommentItem[] =>
  raw.filter((comment) => comment.comment_approved === '1')

export const buildCommentTree = (
  approved: WpCommentItem[],
): {
  roots: WpCommentItem[]
  children: Map<string, WpCommentItem[]>
  flattened: WpCommentItem[]
} => {
  const sorted = [...approved].sort(compareComments)
  const byId = new Map<string, WpCommentItem>()

  for (const comment of sorted) {
    const key = String(commentId(comment))
    if (byId.has(key)) {
      throw new Error(`Duplicate approved WordPress comment ID: ${key}`)
    }
    byId.set(key, comment)
  }

  const roots: WpCommentItem[] = []
  const children = new Map<string, WpCommentItem[]>()
  const flattened: WpCommentItem[] = []

  for (const comment of sorted) {
    const parentId = parseNonNegativeInteger(comment.comment_parent, 'comment_parent')

    if (parentId === 0) {
      roots.push(comment)
      continue
    }

    const parentKey = String(parentId)
    if (!byId.has(parentKey)) {
      roots.push(comment)
      flattened.push(comment)
      continue
    }

    const existing = children.get(parentKey)
    if (existing) {
      existing.push(comment)
    } else {
      children.set(parentKey, [comment])
    }
  }

  roots.sort(compareComments)
  flattened.sort(compareComments)

  for (const childList of children.values()) {
    childList.sort(compareComments)
  }

  return { roots, children, flattened }
}
