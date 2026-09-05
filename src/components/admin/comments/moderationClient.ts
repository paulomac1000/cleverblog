/**
 * REST mutation helper for the comments workbench. Session cookie auth is
 * same-origin so no token handling is needed; Payload CSRF only rejects
 * cross-origin writes.
 *
 * The API base is derived from Payload's client config when available;
 * this project keeps the default /api route.
 */

export type CommentStatus = 'pending' | 'approved' | 'spam' | 'hidden'

export const updateCommentStatus = async (
  id: number | string,
  status: CommentStatus,
  expectedStatus?: CommentStatus,
): Promise<Record<string, unknown>> => {
  const body: Record<string, unknown> = { status }
  if (expectedStatus !== undefined) {
    body._expectedStatus = expectedStatus
  }
  const response = await fetch(`/api/comments/${String(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let detail = `${response.status}`
    try {
      const body = (await response.json()) as { errors?: Array<{ message?: string }> }
      detail = body.errors?.[0]?.message ?? detail
    } catch {
      // keep status code as detail
    }
    throw new Error(detail)
  }

  return (await response.json()) as Record<string, unknown>
}

export const runBulkStatusUpdate = async (
  ids: Array<number | string>,
  status: CommentStatus,
  onRowResult: (id: number | string, ok: boolean, doc?: Record<string, unknown>) => void,
  expectedStatusByid?: Map<number | string, CommentStatus | undefined>,
): Promise<{ succeeded: number; failed: number }> => {
  const CONCURRENCY = 5
  let cursor = 0
  let succeeded = 0
  let failed = 0

  const worker = async (): Promise<void> => {
    while (cursor < ids.length) {
      const id = ids[cursor]
      cursor += 1
      try {
        const doc = await updateCommentStatus(id, status, expectedStatusByid?.get(id))
        succeeded += 1
        onRowResult(id, true, doc)
      } catch {
        failed += 1
        onRowResult(id, false)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
  return { succeeded, failed }
}
