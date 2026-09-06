# Changelog

Notable consumer- and operator-visible changes are recorded here. The release boundary is one `vX.Y.Z` git tag on `main`; `package.json` `version` is the canonical repository version; the matching CHANGELOG heading, git tag and GitHub Release must agree. Published tags are immutable, so mistakes become a new version. Production deployment uses the exact GHCR digest built by `.github/workflows/release.yml` for the release tag.

## [Unreleased]

## [0.3.9] - 2026-09-06

### Security
- Bumped the production nginx edge from 1.27 to 1.31.5 to include the fix for CVE-2026-42533.
- Made Payload auth cookies explicitly Secure in production with SameSite=Lax.
- Added security response headers: HSTS without preload, nosniff, SAMEORIGIN, and strict-origin-when-cross-origin referrer policy.
- Added release workflow provenance guards: the release tag must be a real tag on an ancestor of main and match the `package.json` version.

## [0.3.8] - 2026-09-06

### Changed
- Release images are now published to the public package `ghcr.io/paulomac1000/cleverblog-site`, linked to this public repository; the historical private `cleverblog` package remains as an archive of versions up to v0.3.7.

## [0.3.7] - 2026-09-06

### Fixed
- The global comment admission limit is now charged only after successful Turnstile verification, so junk requests can no longer exhaust the shared quota for legitimate visitors (hardening found in the pre-publication security review). The per-IP rate-limit store now degrades open under capacity pressure by evicting the oldest bucket instead of rejecting previously unseen clients.

## [0.3.6] - 2026-09-06

### Fixed
- Fixed the release workflow so it builds the application bundle (`pnpm install --frozen-lockfile`, `pnpm payload migrate`, `pnpm generate:types`, `pnpm build`) and creates the `media/` directory before the image build.
- Fixed the release smoke probe to use `/api/access` (a real Payload REST endpoint that returns 200 regardless of database content) instead of bare `/api`, which returns 404 by design.
- The v0.3.5 tag run failed at image build and no release was published.

### Changed
- v0.3.6 is the first release published through the tag-triggered release pipeline.

## [0.3.5] - 2026-09-06

### Added
- Added a separate hosted CI security gate using `pnpm audit --audit-level=high --prod` against production dependencies.

### Changed
- Prepared repository release metadata for v0.3.5, whose tag will validate the tag-triggered release workflow end-to-end.

## [0.3.4] - 2026-09-05

### Added
- Added metadata search across title, excerpt, category and tags, with diacritics-insensitive AND-token matching.
- Added a popular-tag strip for tags used by at least two posts.

### Changed
- Search state is synchronized through `?q=` while the server-rendered article list remains the progressive-enhancement baseline.

## [0.3.3] - 2026-09-05

### Added
- Added localized About and Contact pages at `/o-nas`, `/kontakt`, `/en/about` and `/en/contact`.

### Changed
- Footer labels and page slugs now follow the active locale.
- Rich prose uses the `.payload-richtext` styling contract with 1.72 line height, a deeper code background, a warm copy button and Shiki background aligned to the `--code-bg` token.

## [0.3.2] - 2026-09-05

### Added
- Added the warm espresso visual palette and editorial color map.
- Added server-side Shiki syntax highlighting with the espresso theme, callout styling and breakout figures.

### Changed
- The release tag was repointed once during rollout; published tag mutation is no longer permitted, and corrections must ship as a new version.

## [0.3.1] - 2026-09-05

### Fixed
- Fixed literal `**bold**` markup artifacts and stray list markers in rendered article content.

### Changed
- Refined prose typography with language-gated justification, pretty wrapping and hyphenation; justification is enabled for English prose only.
- This tag had no GitHub Release notes; this changelog is the canonical release record for the version.

## [0.3.0] - 2026-09-05

### Added
- Added full Polish/English localization for posts, pages, categories and tags, including `/en` routes, hreflang links and a language switcher.
- Added English translations for all published posts.
- Added comment translations through a flagged OpenRouter pipeline with a unique comment+locale cache and failed-row retry lifecycle.

### Changed
- Redesigned the administration experience for the localized publishing workflow.
- Added a localization migration with rollback backfill support.

## 0.2.0 and earlier

Detailed history predates this changelog.
