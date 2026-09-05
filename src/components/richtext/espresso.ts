import {
  createHighlighter,
  type Highlighter,
  type ThemeRegistrationRaw,
} from 'shiki'

/**
 * Warm espresso syntax theme — token hexes per the chatgpt-mcp design spec.
 * Plain-text default plus nine semantic roles; all clear AA on #0f0d0b.
 */
export const espressoTheme: ThemeRegistrationRaw = {
  name: 'cleverblog-espresso',
  type: 'dark',
  colors: {
    'editor.background': '#0f0d0b',
    'editor.foreground': '#e2ddd7',
  },
  settings: [
    { scope: [], settings: { foreground: '#e2ddd7' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#9c958c', fontStyle: 'italic' } },
    { scope: ['keyword', 'keyword.control', 'storage.type', 'storage.modifier'], settings: { foreground: '#e6815f' } },
    { scope: ['string', 'string.quoted'], settings: { foreground: '#9fca7a' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: '#d7a6e8' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: '#e8c66a' } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], settings: { foreground: '#f0a66a' } },
    { scope: ['variable', 'variable.other', 'meta.property-name'], settings: { foreground: '#c9b28f' } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: '#bdb5ac' } },
  ],
}

const LANGS = [
  'python', 'bash', 'sql', 'typescript', 'tsx', 'javascript', 'json',
  'yaml', 'ini', 'dockerfile', 'c', 'cpp', 'css', 'html', 'markdown',
]

let highlighterPromise: Promise<Highlighter> | null = null

export const getEspressoHighlighter = (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [espressoTheme],
      langs: LANGS,
    }).catch((error) => {
      // Allow a later request to retry instead of caching the rejection.
      highlighterPromise = null
      throw error
    })
  }
  return highlighterPromise
}

export const highlightCode = async (
  code: string,
  language: string | null,
): Promise<string | null> => {
  try {
    const highlighter = await getEspressoHighlighter()
    const lang = (language ?? '').trim()
    const loaded = highlighter.getLoadedLanguages()
    const target = lang && (loaded.includes(lang) || LANGS.includes(lang as never))
      ? lang
      : 'text'
    return highlighter.codeToHtml(code, {
      lang: target,
      theme: 'cleverblog-espresso',
    })
  } catch {
    return null
  }
}

type LexicalNode = {
  type?: string
  children?: LexicalNode[]
  language?: string | null
  text?: string
  [key: string]: unknown
}

const htmlMemo = new Map<string, string>()
const HTML_MEMO_MAX = 600

const memoSet = (key: string, value: string): void => {
  if (htmlMemo.size >= HTML_MEMO_MAX) {
    htmlMemo.delete(htmlMemo.keys().next().value as string)
  }
  htmlMemo.set(key, value)
}

const walkAndHighlight = async (node: LexicalNode): Promise<void> => {
  if (node.type === 'code' && typeof node._code === 'string') {
    const key = `${node.language ?? ''}:${node._code}`
    let html = htmlMemo.get(key)
    if (html === undefined) {
      const rendered = await highlightCode(node._code, node.language ?? null)
      html = rendered ?? ''
      memoSet(key, html)
    }
    if (!html) {
      // Highlighter unavailable — keep the plain code node (fallback render).
      delete node._code
      return
    }
    node._shikiHtml = html
    delete node._code
    node.children = []
    node.type = 'shiki-html'
    return
  }
  for (const child of node.children ?? []) {
    await walkAndHighlight(child)
  }
}

/**
 * Replace lexical `code` nodes in the tree with pre-highlighted Shiki HTML
 * nodes (type: 'shiki-html'). Mutates and returns the same tree so the
 * RichText converters can render the html node directly.
 */
export const highlightLexicalCode = async (
  content: { root: LexicalNode },
): Promise<{ root: LexicalNode }> => {
  const stashCode = (node: LexicalNode): void => {
    for (const child of node.children ?? []) {
      if (child.type === 'code') {
        child._code = extractCode(child)
      }
      stashCode(child)
    }
  }
  stashCode(content.root)
  await walkAndHighlight(content.root)
  return content
}

const extractCode = (node: LexicalNode): string =>
  (node.children ?? [])
    .map((child) =>
      child.type === 'text'
        ? (child.text ?? '')
        : extractCode(child),
    )
    .join('')
