# Agent instructions: cleverblog.pl
Applies repository-wide. Direct user instructions and platform safety requirements take precedence; conflicting repository instructions fail closed and must be surfaced.
Adopted standards: ai-skills.lock.yaml (layout: single, profile: application, language: en).
Polish tech blog (https://cleverblog.pl) — Payload CMS + Next.js App Router + PostgreSQL, Docker deploy on a small VPS behind Cloudflare.

## Non-negotiable invariants
- Agent users (`agent-*` roles) cannot publish posts or approve comments.
- New content requires public provenance, verified status and approved review before publication; enforcement belongs to `src/hooks/enforcePostPublicationGate.ts`.
- Preserve `legacy.originalHTML` and every `legacy` group field permanently as provenance, not scaffolding.
- Every imported WordPress object keeps a stable legacy identity; post upserts use `legacy.wordpressId`, and the `/?p=ID` URL contract must keep working.
- Comments are created only through the server action; REST create stays disabled, Turnstile + rate limiting + moderation stay in place, and only `approved` comments are public.
- Never expose delete through MCP.
- Never put production credentials, WordPress dumps, emails, IP addresses or other personal data in git.
- Fix bugs minimally; do not refactor while fixing.

## Architecture decisions
- Stay on the supported Payload stable line; never adopt Payload 4 canary without an explicit, owner-approved migration (exact version owned by `package.json`).
- App Router only; framework/runtime versions owned by `package.json`.
- PostgreSQL uses `@payloadcms/db-postgres`; `DATABASE_URL` is required and `PAYLOAD_SECRET` must be at least 16 characters.
- Production media stays on the local filesystem (`./media` volume).
- Legacy HTML fallback is intentional; preserve fidelity for `contentFormat: legacy-html` posts.
- Official Payload MCP plugin (`@payloadcms/plugin-mcp`) is the transport baseline; do not invent a second MCP server.

## Canonical owners
- Publication gate → `src/hooks/enforcePostPublicationGate.ts`.
- Comments intake → `src/actions/submitComment.ts`.
- Publish readiness → `src/lib/admin/publishReadiness.ts`.
- Quality gate → `.github/workflows/ci.yml`.
- Release build/smoke/publish → `.github/workflows/release.yml`.
- Release metadata → `CHANGELOG.md`.
- Repository version → `package.json`.
- Production topology → `docker-compose.prod.yml`.
- Dev database → `docker-compose.yml`.
- Adopted standards → `ai-skills.lock.yaml`.

## Verification
- Local completion gate, in order: `pnpm generate:types` (`src/payload-types.ts` is gitignored and required before tsc), `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build` (needs dev Postgres from `docker-compose.yml`).
- Hosted CI (`.github/workflows/ci.yml`) runs the same gate plus `pnpm payload migrate`; a change is complete only when the local gate passes and CI is green on the exact final commit.

## Releases and deployment
- Release boundary: one `vX.Y.Z` tag on `main`; `.github/workflows/release.yml` builds, smoke-tests and publishes the image to GHCR and records its digest.
- Production deployment is operator-authorized: deploy only the exact digest recorded by the release workflow run for that tag (`docker pull ghcr.io/...@sha256:...`), never a locally rebuilt image.
- Before schema migrations, take a `pg_dump -Fc` backup and test on a restored clone first. In non-interactive shells `payload migrate` can block on a confirmation prompt that never renders: when a data-loss warning is expected pass `--force-accept-warning`; otherwise apply the SQL via psql and insert the row into `payload_migrations` (name + batch), then confirm with `migrate:status`.
- Production PostgreSQL is external and managed; the connection is supplied via `CLEVERBLOG_DATABASE_URL`, with no hostname in tracked files.
