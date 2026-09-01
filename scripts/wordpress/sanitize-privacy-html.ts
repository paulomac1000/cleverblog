import sanitizeHtml from 'sanitize-html'

export const sanitizePrivacyHtml = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'h1',
      'h2',
    ]),
    allowedAttributes: {
      '*': ['href', 'src', 'alt', 'title', 'class', 'id', 'rel'],
      a: ['target'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'nofollow noopener',
      }),
    },
  })
