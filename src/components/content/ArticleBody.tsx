// Shared presentational renderers for posts and pages.
// Used by both PL routes and /en routes. Receives already-fetched Payload
// documents and renders them with locale-aware formatting. All Querying lives
// in src/lib/content/* — this file does NOT call Payload.

import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'
import { RichText } from '@payloadcms/richtext-lexical/react'
import { CodeJSXConverter, ShikiHtmlConverter } from '@/components/richtext/codeConverter'
import { highlightLexicalCode } from '@/components/richtext/espresso'
import { CommentForm } from '@/components/comments/CommentForm'
import { CommentList } from '@/components/comments/CommentList'
import { CodeHighlight } from '@/components/CodeHighlight'
import { createFormToken } from '@/lib/comments/formToken'
import { getCommentConfig } from '@/lib/comments/config'
import { formatDate } from '@/i18n/format'
import { t } from '@/i18n/messages'
import type { Locale } from '@/i18n/config'

type RenderableMedia = {
  alt?: string | null
  url?: string | null
}

export type RenderablePost = {
  id: number
  title: string
  publishedAt?: string | null
  contentFormat: 'lexical' | 'legacy-html'
  content?: SerializedEditorState | null
  legacy?: { renderHTML?: string | null } | null
  commentsEnabled?: boolean | null
}

export type RenderablePage = {
  id: number
  title: string
  publishedAt?: string | null
  contentFormat: 'lexical' | 'legacy-html'
  content?: SerializedEditorState | null
  legacy?: { renderHTML?: string | null } | null
}

const resolveRenderHTML = (
  doc: RenderablePost | RenderablePage,
  locale: Locale,
): string | null => {
  const renderHTML = doc.legacy?.renderHTML
  // legacy.renderHTML is the POLISH body and is not localized — rendering it
  // on an EN route would violate the no-fallback invariant.
  if (locale === 'en') return null
  if (
    doc.contentFormat === 'legacy-html' &&
    typeof renderHTML === 'string' &&
    renderHTML.length > 0
  ) {
    return renderHTML
  }
  return null
}

export async function ArticleBody({
  post,
  locale,
}: {
  post: RenderablePost
  locale: Locale
}) {
  const renderHTML = resolveRenderHTML(post, locale)
  const highlighted: SerializedEditorState | null = post.content
    ? ((await highlightLexicalCode(
        post.content as never,
      )) as unknown as SerializedEditorState)
    : null
  const commentConfig = getCommentConfig()
  let commentFormToken: string | undefined
  let turnstileSiteKey: string | undefined

  if (post.commentsEnabled && commentConfig) {
    commentFormToken = createFormToken(post.id, commentConfig.securitySecret)
    turnstileSiteKey = commentConfig.turnstileSiteKey
  }

  return (
    <article className="article">
      <h1>{post.title}</h1>

      {post.publishedAt ? (
        <div className="meta">
          {t(locale, 'article.publishedLabel')}
          {formatDate(post.publishedAt, locale)}
        </div>
      ) : null}

      {renderHTML ? (
        <div
          className="legacy-content"
          dangerouslySetInnerHTML={{ __html: renderHTML }}
        />
      ) : highlighted ? (
        // CSS contract: prose rules (.payload-richtext headings/lists/blockquote)
        // require this wrapper; Tailwind preflight strips list styles otherwise.
        <div className="payload-richtext">
          <RichText
            converters={({ defaultConverters }) => ({
              ...defaultConverters,
              ...CodeJSXConverter,
              ...ShikiHtmlConverter,
            })}
            data={highlighted}
          />
        </div>
      ) : (
        <p>{t(locale, 'article.legacyFallback')}</p>
      )}

      <CodeHighlight />

      <CommentList locale={locale} postId={post.id} />
      <CommentForm
        formToken={commentFormToken}
        locale={locale}
        postId={post.id}
        siteKey={turnstileSiteKey}
      />
    </article>
  )
}

export function StaticPageBody({
  page,
  locale,
}: {
  page: RenderablePage
  locale: Locale
}) {
  const renderHTML = resolveRenderHTML(page, locale)

  return (
    <article className="article">
      <h1>{page.title}</h1>

      {/* Static pages are undated by design: no "published on" meta line.
          The underlying publishedAt data stays untouched. */}

      {renderHTML ? (
        <div
          className="legacy-content"
          dangerouslySetInnerHTML={{ __html: renderHTML }}
        />
      ) : page.content ? (
        <div className="payload-richtext">
          <RichText
            converters={({ defaultConverters }) => ({
              ...defaultConverters,
              ...CodeJSXConverter,
            })}
            data={page.content as SerializedEditorState}
          />
        </div>
      ) : (
        <p>{t(locale, 'article.legacyFallback')}</p>
      )}
    </article>
  )
}

export type { RenderableMedia }