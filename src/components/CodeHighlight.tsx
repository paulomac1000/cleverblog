'use client'

import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/a11y-dark.css'
import { useEffect } from 'react'

export function CodeHighlight() {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>(
      '.legacy-content pre code',
    )
    for (const node of nodes) {
      if (node.dataset.highlighted === 'yes') continue
      const result = hljs.highlightAuto(node.textContent ?? '')
      node.innerHTML = result.value
      node.dataset.highlighted = 'yes'
    }
  }, [])

  return null
}
