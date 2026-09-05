import type {
  JSXConverterArgs,
  JSXConverters,
} from '@payloadcms/richtext-lexical/react'
import type { SerializedLexicalNode } from '@payloadcms/richtext-lexical/lexical'


type SerializedCodeNode = {
  children: SerializedLexicalNode[]
  language: string | null
  type: 'code'
  version: number
}

export const CodeJSXConverter: JSXConverters = {
  code: ({
    node,
    nodesToJSX,
  }: JSXConverterArgs<SerializedCodeNode>) => {
    const children = nodesToJSX({
      nodes: node.children,
    })

    const language =
      node.language?.trim() || undefined

    // Shiki runs server-side on a cached highlighter singleton; unknown or
    // unloaded languages fall back to the plain renderer below.
    return (
      <pre data-language={language}>
        <code
          className={
            language
              ? `language-${language}`
              : undefined
          }
        >
          {children}
        </code>
      </pre>
    )
  },
}

const collectText = (nodes: SerializedLexicalNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') {
        return (node as { text?: string }).text ?? ''
      }
      const kids = (node as { children?: SerializedLexicalNode[] }).children
      return kids ? collectText(kids) : ''
    })
    .join('')

// The highlighter loads asynchronously once per process; the converter stays
// synchronous by serving from the memoized result after warm-up.
let warmup: Promise<void> | null = null
const memo = new Map<string, string | null>()

const highlightCodeSync = (code: string, language: string | null): string | null => {
  const key = `${language ?? ''}:${code}`
  if (memo.has(key)) return memo.get(key) ?? null
  if (!warmup) {
    warmup = import('./espresso').then(async (m) => {
      await m.getEspressoHighlighter()
    })
  }
  // First render before warm-up completes falls back to plain; subsequent
  // requests (and the ISR/revalidation pass) hit the memoized highlight.
  void warmup.then(async () => {
    const mod = await import('./espresso')
    const html = await mod.highlightCode(code, language)
    if (html) memo.set(key, html)
  })
  return null
}

export const ShikiHtmlConverter: JSXConverters = {
  'shiki-html': ({ node }: JSXConverterArgs) => {
    const html = (node as { _shikiHtml?: string })._shikiHtml ?? ''
    if (!html) return null
    return <div dangerouslySetInnerHTML={{ __html: html }} />
  },
}
