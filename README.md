# cleverblog

Payload CMS 3.88 + Next.js 16 + PostgreSQL blog at [cleverblog.pl](https://cleverblog.pl). Replaced the legacy WordPress runtime; historical content keeps permanent provenance in the `legacy` group (`/?p=ID` URLs still resolve).

## Status

Production is live (Docker, external PostgreSQL, nginx ingress behind Cloudflare).

Implemented:

- Payload 3.88.0 (stable line) with drafts, versions, scheduled publishing and a backend publication gate.
- Official SEO, search, redirects and MCP plugins; MCP delete disabled.
- Collections for posts, pages, media, categories, tags, comments, topic candidates, evidence, users.
- Agent roles with collection access controls; agents cannot publish or approve comments.
- Moderated public comments: Cloudflare Turnstile (action + hostname verified server-side), signed form-age tokens, per-IP rate limiting, honeypot, duplicate suppression, spam scoring. Everything lands `pending` or `spam` — never auto-approved.
- Chronological homepage with a zero-JS category filter and `/category/[slug]` archives (legacy category URLs preserved).
- Legacy sanitized HTML fallback rendering (`contentFormat: legacy-html`).

Not implemented yet:

- R2/S3 production storage adapter (local filesystem media in production).
- Domain-specific MCP tools such as `propose_topic` (generic Payload MCP is available first).

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

## Security invariants

1. Agent roles cannot publish posts; drafts only.
2. Content cannot be published unless `sourceVisibility=public`, `verification.status=verified`, and `review.status=approved`.
3. MCP delete is disabled even when Payload access control would otherwise allow deletion.
4. Historical WordPress HTML is always retained; frontend fallback HTML is sanitized before rendering.
5. Raw/private project material must never be copied into public article content. `private`, `mixed`, and `unknown` provenance cannot pass the publication gate.

See [AGENTS.md](AGENTS.md) for agent workflow and invariants.
