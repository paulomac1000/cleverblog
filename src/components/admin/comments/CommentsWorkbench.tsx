'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { asRowModel, type CommentRowModel } from './types'
import { CommentRow } from './CommentRow'
import { ModerationBulkBar } from './ModerationBulkBar'
import { runBulkStatusUpdate, updateCommentStatus } from './moderationClient'

type Tab = 'pending' | 'approved' | 'spam' | 'hidden' | 'all'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pending', label: 'Oczekujące' },
  { key: 'approved', label: 'Zatwierdzone' },
  { key: 'spam', label: 'Spam' },
  { key: 'hidden', label: 'Ukryte' },
  { key: 'all', label: 'Wszystkie' },
]

const PAGE_SIZE = 25

type Props = {
  canApprove: boolean
  postTitles: Record<number, string>
  initialStatus: Tab
}

/**
 * Deliberate deviation from the "use useListQuery()" guidance: the workbench
 * issues its own REST queries so every row always carries the full document
 * (Payload's list data is shaped by the visitor's column state, which would
 * starve the preview/spam-score/thread cells). Query mechanics are simple
 * REST with explicit state; mutations are PATCH with optimistic rows either
 * way.
 */
export const CommentsWorkbench = ({ canApprove, postTitles, initialStatus }: Props) => {
  const [tab, setTab] = useState<Tab>(initialStatus)
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<CommentRowModel[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number | string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [refetchTick, setRefetchTick] = useState(0)

  // Pending-first fetch on tab/page change. setLoading(true) for user-driven
  // refetches happens in the event handlers (click), never synchronously in
  // the effect body — after the first await, state updates are legal here.
  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setError(null)
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          page: String(page),
          sort: '-createdAt',
          depth: '0',
        })
        if (tab !== 'all') {
          params.set('where[status][equals]', tab)
        }
        const response = await fetch(`/api/comments?${params.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(`API ${response.status}`)
        const body = (await response.json()) as {
          docs: Array<Record<string, unknown>>
          totalPages?: number
        }
        if (cancelled) return
        setRows(body.docs.map(asRowModel))
        setTotalPages(body.totalPages ?? 1)
        setLoading(false)
      } catch (cause) {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Nie udało się pobrać komentarzy.')
        setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [tab, page, refetchTick])


  const applyLocalStatus = (id: number | string, status: CommentRowModel['status']) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, status } : row)),
    )
  }

  const handleStatus = async (id: number, status: 'approved' | 'spam') => {
    setNotice(null)
    applyLocalStatus(id, status)
    try {
      await updateCommentStatus(id, status)
      setRefetchTick((tick) => tick + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operacja nie powiodła się.')
      setRefetchTick((tick) => tick + 1)
    }
  }

  const handleBulk = async (status: 'approved' | 'spam') => {
    const ids = [...selected].map(Number)
    if (ids.length === 0) return
    setBulkBusy(true)
    setNotice(null)
    const { succeeded, failed } = await runBulkStatusUpdate(ids, status, (id, ok, doc) => {
      if (ok && doc) {
        const nextStatus = (doc.doc ?? doc) as { status?: CommentRowModel['status'] }
        applyLocalStatus(id, nextStatus.status ?? status)
      }
    })
    setBulkBusy(false)
    setSelected(new Set())
    setNotice(
      failed === 0
        ? `Zaktualizowano ${succeeded} komentarzy.`
        : `Zaktualizowano ${succeeded}, nie powiodło się ${failed}.`,
    )
    setRefetchTick((tick) => tick + 1)
  }

  const toggle = (id: number | string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedCount = useMemo(() => selected.size, [selected])

  return (
    <div className="cb-workbench">
      <div className="cb-workbench__tabs" role="group" aria-label="Filtr statusu komentarzy">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="cb-tab"
            aria-pressed={tab === entry.key}
            onClick={() => {
              setTab(entry.key)
              setPage(1)
              setSelected(new Set())
              setLoading(true)
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {notice ? <p className="cb-row__meta">{notice}</p> : null}
      {error ? <p className="cb-row__meta">Błąd: {error}</p> : null}

      {selectedCount > 0 ? (
        <ModerationBulkBar
          count={selectedCount}
          canApprove={canApprove}
          busy={bulkBusy}
          onApprove={() => void handleBulk('approved')}
          onSpam={() => void handleBulk('spam')}
        />
      ) : null}

      {loading ? (
        <p className="cb-row__meta">Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p className="cb-row__meta">Brak komentarzy w tym widoku.</p>
      ) : (
        rows.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            postTitle={
              typeof comment.post === 'object' && comment.post !== null
                ? comment.post.title ?? null
                : postTitles[Number(comment.post)] ?? null
            }
            canApprove={canApprove}
            busy={bulkBusy}
            selected={selected.has(comment.id)}
            onToggle={toggle}
            onStatus={(id, status) => void handleStatus(id, status)}
          />
        ))
      )}

      <div className="cb-row__meta" style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          className="cb-btn"
          disabled={page <= 1 || loading}
          onClick={() => {
            setLoading(true)
            setPage((current) => Math.max(1, current - 1))
          }}
        >
          ← Poprzednia
        </button>
        <span>
          Strona {page} z {totalPages}
        </span>
        <button
          type="button"
          className="cb-btn"
          disabled={page >= totalPages || loading}
          onClick={() => {
            setLoading(true)
            setPage((current) => current + 1)
          }}
        >
          Następna →
        </button>
      </div>
    </div>
  )
}

export default CommentsWorkbench
