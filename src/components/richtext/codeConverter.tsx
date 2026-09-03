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

    return (
      <pre>
        <code
          className={
            node.language
              ? `language-${node.language}`
              : undefined
          }
        >
          {children}
        </code>
      </pre>
    )
  },
}
