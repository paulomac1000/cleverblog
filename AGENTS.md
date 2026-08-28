# Agent handoff: cleverblog replatforming

## Mission

Replace the legacy cleverblog.pl WordPress runtime with Payload without losing published content, media, comments, dates, backlinks or SEO identity. Build automation only after migration correctness is measurable.

## Current branch

`feat/payload-replatform-foundation`

## Non-negotiable invariants

- Migration and content modernization are separate operations.
- Preserve `legacy.originalHTML` even after Lexical conversion.
- Every imported WordPress object must have a stable legacy identity; post upsert key is `legacy.wordpressId`.
- Importers must be idempotent and safe to run repeatedly against staging.
- Agent users cannot publish.
- New content requires public provenance + verified status + approved review to publish.
- Only migration code with `context.wordpressMigration=true` can import an old public post while its verification state is `imported`.
- Never expose delete through MCP.
- Do not enable anonymous comment creation before Turnstile + rate limiting + moderation are implemented.
- Do not put production credentials, WordPress dumps, emails, IP addresses or other personal data in git.

## Architecture decisions already made

- Payload stable 3.88.0, not Payload 4 canary.
- Next.js 16 / React 19.
- PostgreSQL via `@payloadcms/db-postgres`.
- Local filesystem media for development only; production storage remains an explicit R2/S3 task.
- Legacy HTML fallback is intentional. First get fidelity; then convert clean posts to Lexical.
- Official Payload MCP is the transport baseline. Add domain tools later rather than inventing a second MCP server now.

## Priority next work

### P0 — prove bootstrap

1. Generate and commit `pnpm-lock.yaml`.
2. Run `pnpm lint`, `pnpm test`, `pnpm generate:types`, `pnpm build` locally.
3. Fix any incompatibility found against Payload 3.88.0; do not upgrade to canary as a shortcut.
4. Generate/commit the real Payload import map if the build changes it.

### P1 — capture WordPress source safely

1. Run a full database dump and filesystem backup outside git.
2. Export WXR as a secondary recovery artifact.
3. Produce machine inventory: posts/pages/status/dates/slugs/GUIDs/categories/tags/comments/media/internal links/current public URLs.
4. Record source artifact hashes in a migration manifest.
5. Keep raw dumps outside the repository; commit only schemas, sanitised fixtures and reports.

### P2 — finish migration core

1. Implement taxonomy upsert.
2. Implement media import first, keyed by WordPress attachment ID and SHA-256.
3. Rewrite media references in article HTML.
4. Add HTML -> Lexical conversion for clean documents; retain fallback for warnings/failures.
5. Import pages and comments while preserving comment parent relationships.
6. Create redirect records for `/?p=ID`, previous pretty permalinks, categories/tags that change, and attachment URLs where needed.

### P3 — migration QA

For every published legacy URL require one of:

- new page returns 200 with equivalent semantic content; or
- one-hop permanent redirect to a valid destination; or
- explicitly reviewed retirement.

Gate cutover on: zero unaccounted published posts/pages, zero missing required media, zero broken internal links, comment counts reconciled, sitemap/canonical/RSS correct, and rollback proven.

### P4 — agent workflow

Only after migration QA, add domain MCP tools:

- `propose_topic`
- `find_related_articles`
- `get_article_context`
- `create_article_draft`
- `attach_evidence`
- `submit_for_review`
- `report_stale_article`

Keep the backend publication gate authoritative; prompts are not a security boundary.
