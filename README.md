# cleverblog

Modern replacement for the legacy WordPress installation at cleverblog.pl.

This branch establishes the replatforming foundation: Payload CMS 3.88 + Next.js + PostgreSQL, a migration-safe content model, draft/version controls, first-party SEO/search/redirects, and a least-privilege MCP surface for future OpenCode agents.

## Status

The repository is intentionally at **foundation** stage. It does not cut over production and it does not claim that WordPress content has already been migrated.

Implemented:

- Payload 3.88.0 pinned (stable line; Payload 4 remains canary at the time of this bootstrap).
- Next.js App Router with Payload admin/API routes and a minimal public blog frontend.
- PostgreSQL adapter and local Docker Compose database.
- Collections for posts, pages, media, categories, tags, comments, topic candidates, evidence, and users.
- Drafts, versions, scheduled publishing and a backend publication gate.
- Official SEO, search, redirects and MCP plugins.
- Agent roles and collection access controls.
- MCP delete disabled; user CRUD/schema discovery disabled through MCP.
- WordPress normalization/import skeleton with idempotent post upsert by `legacy.wordpressId`.
- Legacy HTML is preserved and rendered only after server-side sanitization.
- Migration contract tests for normalization and redirect generation.
- CI for lint, tests, generated types and build.

Implemented:

- WordPress migration (posts, pages, media, taxonomy, approved comments) with idempotent upserts keyed by `legacy.wordpressId`.
- Moderated public comment submissions: Cloudflare Turnstile (Managed, action + hostname verified server-side), signed form-age tokens, in-memory per-IP rate limiting (HMAC'd keys, no raw IP storage), honeypot, duplicate suppression via `submissionHash`, deterministic spam scoring. Everything lands as `pending` or `spam` — never auto-approved. Fail-closed: the form requires `COMMENTS_ENABLED=true` plus Turnstile keys and `COMMENT_SECURITY_SECRET`; approved comments stay visible regardless.
- Chronological homepage with a zero-JS category filter and `/category/[slug]` archives (legacy WordPress category URLs preserved).
- Production deployment (Docker, cleverblog.pl) with legacy `/?p=` and category redirects.

Not implemented yet:

- HTML-to-Lexical conversion for migrated posts (legacy sanitized HTML renders as-is).
- R2/S3 production storage adapter (local filesystem media in production).
- Domain-specific MCP tools such as `propose_topic` and `submit_for_review` (generic Payload MCP is available first).

## Local development

Requirements: Node >= 24.15 and pnpm 10+.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm generate:types
pnpm dev
```

Open:

- frontend: http://localhost:3000
- Payload admin: http://localhost:3000/admin
- Payload REST API: http://localhost:3000/api
- MCP: http://localhost:3000/api/mcp

Create the first admin user through Payload Admin. For MCP, create dedicated users with API keys and a restricted role; do not reuse the human admin API key.

## WordPress migration workflow

The migration is deliberately repeatable:

```text
WordPress backup/inventory
        ↓
migration-data/raw/posts.json
        ↓
pnpm wordpress:normalize
        ↓
migration-data/normalized/posts.json
        ↓
pnpm wordpress:import:posts
        ↓
Payload staging
        ↓
validation / redirect report
```

The post importer stores historical HTML in `legacy.originalHTML` and marks the document `contentFormat=legacy-html`. That is a safe baseline: no migration-time AI rewrite and no lossy conversion. A later migration step should convert clean documents to native Lexical while retaining the original HTML snapshot.

Published legacy posts may bypass the new-content publication gate **only** when created by the migration code with `context.wordpressMigration=true`. The bypass is not available through HTTP/MCP.

See [scripts/wordpress/README.md](scripts/wordpress/README.md) and [docs/MIGRATION_HANDOFF.md](docs/MIGRATION_HANDOFF.md).

## Security invariants

1. Agent roles cannot publish posts. They may create or update drafts only.
2. New non-WordPress content cannot be published unless `sourceVisibility=public`, `verification.status=verified`, and `review.status=approved`.
3. MCP delete is disabled even when Payload access control would otherwise allow deletion.
4. Comments are not publicly creatable until abuse protection exists.
5. Historical WordPress HTML is always retained; frontend fallback HTML is sanitized before rendering.
6. Raw/private project material must never be copied into public article content. `private`, `mixed`, and `unknown` provenance cannot pass the publication gate.

## Next agent

Start with `AGENTS.md`. The highest-value next milestone is a real, read-only WordPress inventory/export run followed by media import and migration QA. Do not jump directly to autonomous publishing.
