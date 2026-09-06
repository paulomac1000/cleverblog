// Shared homepage `?page=` interpretation. Both the page body and
// generateMetadata MUST use this so one request yields one page number for
// rendering, canonical and hreflang alike.
//
// Only a safe integer >= 1 counts; anything else (arrays' non-first members,
// decimals, negatives, whitespace, "2e0", garbage) coerces to page 1 so an
// invalid value can never legitimise an indexable junk variant.

export const parsePageParam = (value?: string | string[]): number => {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1
}
