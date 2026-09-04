// Tiny dictionary for the user-visible strings used in shared components.
// PL is authoritative: every PL key matches the pre-i18n strings byte-for-byte.
// EN keys provide the mirror translation; if a key is missing in EN the
// component falls back to the PL string rather than rendering nothing.

import type { Locale } from './config'

type MessageValue = string | ((...args: any[]) => string)

type Messages = Record<string, MessageValue>

const pl: Messages = {
  'site.tagline': 'engineering notes, not content filler',
  'site.footer.articles': 'Artykuły',
  'site.footer.about': 'O nas',
  'site.footer.contact': 'Kontakt',
  'site.footer.note':
    'cleverblog.pl — praktyczne notatki z prawdziwej pracy inżynierskiej.',

  'home.hero.tagline': 'cleverblog.pl',
  'home.hero.heading':
    'Praktyczne notatki z prawdziwej pracy inżynierskiej.',
  'home.hero.lead':
    'Linux, Raspberry Pi i automatyka domowa — sprawdzone na produkcji.',
  'home.hero.categoryFilter.label': 'Filtruj artykuły po kategorii',
  'home.hero.categoryFilter.hint':
    'Zmiana kategorii automatycznie otwiera wybraną kategorię.',
  'home.hero.categoryFilter.submit': 'Pokaż',
  'home.latest.heading': 'Najnowsze artykuły',
  'home.empty.page': 'Brak artykułów na tej stronie.',

  'home.empty.locale.heading': 'No English articles yet.',
  'home.empty.locale.body':
    'This section is being translated. In the meantime you can read everything on the Polish homepage.',
  'home.empty.locale.cta': 'Go to Polish homepage',

  'archive.breadcrumb.all': 'Wszystkie artykuły',
  'archive.breadcrumb.category': 'Kategoria',
  'archive.breadcrumb.tag': 'Tag',
  'archive.empty.category': 'Brak artykułów w tej kategorii.',
  'archive.empty.tag': 'Brak artykułów z tym tagiem.',

  'pagination.prev': '← Nowsze',
  'pagination.next': 'Starsze →',
  'pagination.status': (page: number, total: number): string =>
    `Strona ${page} z ${total}`,
  'pagination.aria.articles': 'Stronicowanie artykułów',
  'pagination.aria.category': (name: string): string =>
    `Stronicowanie kategorii ${name}`,
  'pagination.aria.tag': (name: string): string => `Stronicowanie tagu ${name}`,
  'pagination.aria.en.articles': 'Article pagination',
  'pagination.aria.en.category': (name: string): string =>
    `Pagination for category ${name}`,
  'pagination.aria.en.tag': (name: string): string =>
    `Pagination for tag ${name}`,

  'categorySelect.all': 'Wszystkie kategorie',
  'categorySelect.ariaLabel': 'Filter articles by category',

  'switcher.aria': 'Zmień język / Change language',
  'switcher.toEnglish': 'EN',
  'switcher.toPolish': 'PL',
  'switcher.noTranslation.title': 'Brak tłumaczenia',

  'article.publishedLabel': 'Opublikowano: ',
  'article.legacyFallback': 'Treść nie została jeszcze zmigrowana.',

  'tag.heading': (name: string): string => `Artykuły oznaczone tagiem ${name}.`,
}

const en: Messages = {
  'home.hero.heading': 'Practical engineering notes from real production work.',
  'home.hero.lead':
    'Linux, Raspberry Pi and home automation — verified in production.',
  'home.hero.categoryFilter.label': 'Filter articles by category',
  'home.hero.categoryFilter.hint':
    'Changing the category automatically opens the selected category.',
  'home.hero.categoryFilter.submit': 'Show',
  'home.latest.heading': 'Latest articles',
  'home.empty.page': 'No articles on this page.',

  'home.empty.locale.heading': 'No English articles yet.',
  'home.empty.locale.body':
    'This section is being translated. In the meantime you can read everything on the Polish homepage.',
  'home.empty.locale.cta': 'Go to Polish homepage',

  'archive.breadcrumb.all': 'All articles',
  'archive.empty.category': 'No articles in this category.',
  'archive.empty.tag': 'No articles with this tag.',

  'pagination.prev': '← Newer',
  'pagination.next': 'Older →',
  'pagination.aria.en.articles': 'Article pagination',

  'categorySelect.all': 'All categories',
  'categorySelect.ariaLabel': 'Filter articles by category',

  'switcher.aria': 'Change language',
  'switcher.toEnglish': 'EN',
  'switcher.toPolish': 'PL',
  'switcher.noTranslation.title': 'Translation unavailable',

  'article.publishedLabel': 'Published: ',
  'article.legacyFallback': 'Content has not been migrated yet.',
}

const messagesByLocale: Record<Locale, Messages> = { pl, en }

/**
 * Translate a key. EN falls back to PL only if the key is missing in EN —
 * every string rendered to the user should already be in `en` so this is a
 * safety net for incomplete translations, not a normal code path.
 */
export const t = (locale: Locale, key: string): string => {
  const value = messagesByLocale[locale]?.[key] ?? messagesByLocale.pl[key]
  return typeof value === 'string' ? value : key
}

/**
 * Formatter variant for keys whose value is a function (e.g. pagination
 * status). Keeps `t` typed as returning a renderable string while allowing
 * parameterised messages: `tf(locale, 'pagination.status')(page, total)`.
 */
export const tf =
  (locale: Locale, key: string): ((...args: any[]) => string) =>
  (...args) => {
    const value = messagesByLocale[locale]?.[key] ?? messagesByLocale.pl[key]
    if (typeof value === 'function') return value(...args)
    return typeof value === 'string' ? value : key
  }

export type MessageKey = keyof Messages