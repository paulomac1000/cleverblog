# cleverblog

A bilingual technical blog with Polish as the primary language at [cleverblog.pl](https://cleverblog.pl)
and English under `/en`, built on Payload CMS 3.88, Next.js 16 and PostgreSQL. It replaced a legacy
WordPress runtime while preserving permanent historical provenance and the `/?p=ID` resolution contract.
Production runs in Docker behind Cloudflare through nginx ingress, with external managed PostgreSQL.

## Highlights

- Localized Polish/English content, routes and navigation, including localized slugs and
  language-counterpart metadata for alternate-language discovery.
- Moderated public comments with Cloudflare Turnstile verified server-side, signed form-age tokens,
  per-IP rate limiting, a honeypot, duplicate suppression and spam scoring; comments are never
  auto-approved. Approved comments can optionally use the flagged machine-translation path with a
  per-comment/per-locale cache.
- Homepage article discovery keeps a server-rendered list as the baseline, with client-side metadata
  search across title, excerpt, category and tags plus popular-tag filtering.
- Server-side syntax highlighting with Shiki, integrated into the espresso editorial theme.
- Payload publication gate requires public provenance, verified status and approved review before
  publication; agent roles cannot publish posts or approve comments.
- Legacy WordPress HTML is preserved as provenance and rendered through a sanitized fallback path
  when needed.

## Not implemented yet

- S3/R2 production storage adapter; production still uses the local `./media` volume.
- Domain-specific MCP tools on top of the generic Payload MCP.

## Local development

Requirements: Node >= 24.15 and pnpm 10+.
The development PostgreSQL service comes from `docker-compose.yml`.

```bash
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm generate:types
pnpm dev
```

Verify: open http://localhost:3000 — the homepage renders the bilingual article list, and
http://localhost:3000/admin reaches the Payload admin (create the first admin user there).

Run `pnpm generate:types` before any typecheck because `src/payload-types.ts` is gitignored.

Endpoints:

- Frontend: http://localhost:3000
- Payload admin: http://localhost:3000/admin
- Payload REST API: http://localhost:3000/api
- MCP: http://localhost:3000/api/mcp

For MCP, use dedicated users with API keys and a restricted role; never reuse the human admin key.

## Security invariants

1. Agent roles cannot publish posts; they may create drafts only.
2. Content cannot be published unless `sourceVisibility=public`, `verification.status=verified` and
   `review.status=approved`.
3. MCP delete stays disabled even when Payload access control would otherwise permit deletion.
4. Historical WordPress HTML is retained permanently, and frontend fallback HTML is sanitized before
   rendering.
5. Raw or private project material must never enter public article content; `private`, `mixed` and
   `unknown` provenance cannot pass the publication gate.

## Releases

- Release boundary: one `vX.Y.Z` tag on `main`.
- `.github/workflows/release.yml` builds the image once, smoke-tests that exact image, publishes it to
  GHCR and records its digest; production deployment is operator-authorized and uses only that exact
  digest.
- `CHANGELOG.md` is the canonical release record, and `package.json` owns the repository version.

See [AGENTS.md](AGENTS.md) for agent workflow, invariants and canonical owners.
