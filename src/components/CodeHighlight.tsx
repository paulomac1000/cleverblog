'use client'

import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/a11y-dark.css'
import { useEffect } from 'react'

const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy copy path.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

export function CodeHighlight() {
  useEffect(() => {
    const cleanups: Array<() => void> = []
    const nodes = document.querySelectorAll<HTMLElement>(
      '.article .legacy-content pre code, .article .payload-richtext pre code',
    )

    nodes.forEach((node, index) => {
      if (node.dataset.highlighted !== 'yes') {
        hljs.highlightElement(node)
        node.dataset.highlighted = 'yes'
      }

      const pre = node.closest('pre')
      if (!pre || pre.dataset.copyEnhanced === 'yes') return

      pre.dataset.copyEnhanced = 'yes'
      const previousPosition = pre.style.position
      const previousPaddingTop = pre.style.paddingTop
      pre.style.position = 'relative'
      pre.style.paddingTop = '3.25rem'

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy-button'
      button.textContent = 'Kopiuj'
      button.setAttribute('aria-label', 'Kopiuj kod do schowka')

      const status = document.createElement('span')
      status.className = 'code-copy-status'
      status.id = `code-copy-status-${index}`
      status.setAttribute('aria-live', 'polite')
      status.setAttribute('role', 'status')
      button.setAttribute('aria-describedby', status.id)

      let resetTimer: number | undefined
      const resetLabel = () => {
        button.textContent = 'Kopiuj'
        button.setAttribute('aria-label', 'Kopiuj kod do schowka')
        status.textContent = ''
      }

      const onClick = async () => {
        const copied = await copyText(node.textContent ?? '')
        const label = copied ? 'Skopiowano' : 'Nie udało się skopiować'
        button.textContent = label
        button.setAttribute('aria-label', label)
        status.textContent = copied
          ? 'Kod skopiowano do schowka.'
          : 'Nie udało się skopiować kodu.'

        if (resetTimer) window.clearTimeout(resetTimer)
        resetTimer = window.setTimeout(resetLabel, 2_000)
      }

      button.addEventListener('click', onClick)
      pre.append(button, status)

      cleanups.push(() => {
        if (resetTimer) window.clearTimeout(resetTimer)
        button.removeEventListener('click', onClick)
        button.remove()
        status.remove()
        delete pre.dataset.copyEnhanced
        pre.style.position = previousPosition
        pre.style.paddingTop = previousPaddingTop
      })
    })

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  return (
    <style>{`
      .code-copy-button {
        position: absolute;
        top: 0.65rem;
        right: 0.65rem;
        z-index: 2;
        min-height: 2rem;
        padding: 0.35rem 0.65rem;
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 700;
        line-height: 1.2;
        cursor: pointer;
      }

      .code-copy-button:hover {
        border-color: var(--accent);
      }

      .code-copy-button:active {
        border-color: var(--accent);
        background: var(--surface-raised);
        transform: translateY(1px);
      }

      .code-copy-button:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .code-copy-status {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 640px) {
        .code-copy-button {
          top: 0.5rem;
          right: 0.5rem;
          min-height: 2.25rem;
        }
      }
    `}</style>
  )
}
