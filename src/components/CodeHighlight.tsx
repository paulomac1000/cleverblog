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

    nodes.forEach((node) => {
      if (node.dataset.highlighted !== 'yes') {
        hljs.highlightElement(node)
        node.dataset.highlighted = 'yes'
      }

      const pre = node.closest('pre')
      if (!pre || pre.dataset.copyEnhanced === 'yes') return

      pre.dataset.copyEnhanced = 'yes'

      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'code-copy-button'
      button.textContent = 'Kopiuj'
      button.setAttribute('aria-label', 'Kopiuj kod do schowka')

      const status = document.createElement('span')
      status.className = 'code-copy-status'
      status.setAttribute('role', 'status')
      status.setAttribute('aria-live', 'polite')
      status.setAttribute('aria-atomic', 'true')

      let resetTimer: number | undefined
      const resetLabel = () => {
        button.textContent = 'Kopiuj'
        button.setAttribute('aria-label', 'Kopiuj kod do schowka')
        status.textContent = ''
      }

      const onClick = async () => {
        const copied = await copyText(node.textContent ?? '')

        const buttonLabel = copied ? 'Skopiowano' : 'Błąd'
        const statusMessage = copied
          ? 'Kod skopiowano do schowka.'
          : 'Nie udało się skopiować kodu.'

        button.textContent = buttonLabel
        button.setAttribute('aria-label', statusMessage)
        status.textContent = statusMessage

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
      })
    })

    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }, [])

  return null
}
