# Agent instructions: cleverblog.pl

Polish tech blog (https://cleverblog.pl) — Payload CMS 3.88.0 + Next.js 16 (App Router) + PostgreSQL, Docker deploy on a small VPS behind Cloudflare.

## Non-negotiable invariants

- Agent users (`agent-*` roles) cannot publish posts or approve comments.
- New content requires public provenance + verified status + approved review to publish (`enforcePostPublicationGate`).
- Preserve `legacy.originalHTML` and all `legacy` group fields; they are permanent provenance, not scaffolding.
- Every imported WordPress object keeps a stable legacy identity; post upsert key is `legacy.wordpressId`. The `/?p=ID` URL contract must keep working.
- Comments: creation only via the server action (REST create disabled); Turnstile + rate limiting + moderation stay in place; only `approved` comments are public.
- Never expose delete through MCP.
- Do not put production credentials, WordPress dumps, emails, IP addresses or other personal data in git.
- Fix bugs minimally; do not refactor while fixing.

## Architecture decisions

- Payload stable 3.88.0, not Payload 4 canary.
- Next.js 16 / React 19, App Router only.
- PostgreSQL via `@payloadcms/db-postgres`; env var `DATABASE_URL`, `PAYLOAD_SECRET` >= 16 chars.
- Local filesystem media (`./media` volume) in production.
- Legacy HTML fallback is intentional: keep fidelity for `contentFormat: legacy-html` posts.
- Official Payload MCP plugin (`@payloadcms/plugin-mcp`) is the transport baseline; do not invent a second MCP server.
- URL contract: unprefixed paths are Polish and frozen; `/en/...` is English. A locale URL is never populated by fallback content.

## Verification commands

- `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm generate:types`, `pnpm build` (build needs the dev Postgres from `docker-compose.yml`).

## Deployment

Prod runs on the VPS via `docker-compose.prod.yml` (app + postgres + nginx ingress sidecar). Database is external (psql01.mikr.us). Before schema migrations: backup via `pg_dump -Fc`, test on a restored clone first.
