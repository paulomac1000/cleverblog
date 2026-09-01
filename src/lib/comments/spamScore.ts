type SpamScoreInput = {
  authorName: string
  content: string
}

export type SpamScoreResult = {
  reason: string | null
  score: number
}

const URL_PATTERN = /(?:https?:\/\/|www\.)/gi

const SPAM_PATTERNS = [
  /\b(?:viagra|cialis|casino|payday loan|escort)\b/i,
  /\b(?:buy followers|seo services?|guest posts?|backlinks? package)\b/i,
  /\b(?:guaranteed profit|double your money|instant loan)\b/i,
]

export const scoreCommentSpam = ({
  authorName,
  content,
}: SpamScoreInput): SpamScoreResult => {
  let score = 0
  const reasons: string[] = []
  const links = content.match(URL_PATTERN)?.length ?? 0

  if (links >= 7) {
    score += 80
    reasons.push('many-links')
  } else if (links >= 4) {
    score += 35
    reasons.push('multiple-links')
  }

  const matchedPatterns = SPAM_PATTERNS.filter((pattern) => pattern.test(content)).length
  if (matchedPatterns > 0) {
    score += Math.min(90, matchedPatterns * 45)
    reasons.push('spam-phrases')
  }

  if (/(?:https?:\/\/|www\.|\.(?:com|net|org)\b)/i.test(authorName)) {
    score += 30
    reasons.push('link-in-name')
  }

  if (links > 0 && content.length < 40) {
    score += 25
    reasons.push('short-link-comment')
  }

  if (content.length >= 40) {
    const letters = content.match(/[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]/g)?.length ?? 0
    const uppercase = content.match(/[A-ZĄĆĘŁŃÓŚŹŻ]/g)?.length ?? 0
    if (letters >= 20 && uppercase / letters > 0.8) {
      score += 15
      reasons.push('mostly-uppercase')
    }
  }

  return {
    reason: reasons.length > 0 ? reasons.join(', ') : null,
    score: Math.min(100, score),
  }
}
