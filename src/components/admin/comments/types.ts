export type CommentRowModel = {
  id: number
  post: number | { id: number; title?: string | null } | null
  parent: number | { id: number } | null
  authorName: string
  content: string
  status: 'pending' | 'approved' | 'spam' | 'hidden'
  moderation?: { spamScore?: number | null } | null
  createdAt: string
}

export const asRowModel = (doc: Record<string, unknown>): CommentRowModel => ({
  id: typeof doc.id === 'number' ? doc.id : Number(doc.id),
  post: (doc.post ?? null) as CommentRowModel['post'],
  parent: (doc.parent ?? null) as CommentRowModel['parent'],
  authorName: typeof doc.authorName === 'string' ? doc.authorName : '',
  content: typeof doc.content === 'string' ? doc.content : '',
  status: (doc.status ?? 'pending') as CommentRowModel['status'],
  moderation: (doc.moderation ?? null) as CommentRowModel['moderation'],
  createdAt: typeof doc.createdAt === 'string' ? doc.createdAt : '',
})
