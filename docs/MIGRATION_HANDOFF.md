# Migration handoff

## Goal

Perform a blue/green migration of cleverblog.pl from WordPress to Payload. WordPress remains the source of truth until a clean-room import into an empty Payload database passes the migration quality gate.

## Phases

1. **Capture** — DB dump, WXR, uploads, plugin/theme inventory, public crawler inventory.
2. **Model** — Payload collections and migration metadata (foundation implemented).
3. **Import core** — users/taxonomy/media/posts/pages/comments; idempotent mappings.
4. **Convert** — clean HTML to Lexical after media mapping; keep original HTML permanently.
5. **Redirect** — every old public URL gets a destination or explicit retirement decision.
6. **QA** — semantic content comparison, links/images, dates, comments, canonical/sitemap/RSS, representative visual QA.
7. **Rehearsal** — empty DB -> Payload migrations -> importer -> validation, repeated until deterministic.
8. **Cutover** — freeze WordPress writes, final snapshot, final clean import, verification, route traffic to Payload.
9. **Observe** — 404s, redirect misses, indexing and application errors.
10. **Retire** — keep WordPress runtime as rollback target initially; archive DB/uploads/WXR permanently.

## Cutover gate

Do not switch cleverblog.pl unless all statements are true:

- 100% of published WordPress posts and pages are accounted for.
- approved comment counts reconcile or differences are explicitly documented.
- no required media is missing.
- no internal link is broken.
- every known historical URL returns the intended page or a single permanent redirect.
- original publication timestamps are preserved.
- canonical URLs, sitemap, robots and RSS are correct.
- migration is reproducible from an empty Payload database.
- rollback to the WordPress origin has been exercised.

## Content status policy

Imported content starts as `verification.status=imported`; migration must never change an old article to `verified` simply because it was copied successfully. Content maintenance later classifies each article as keep/update/merge/historical/retire.

`publishedAt` is historical publication time. `verification.verifiedAt` records a later technical re-verification. Never overwrite the former with the latter.

## Data minimisation

Do not migrate historic commenter IP addresses or user-agent strings. Email addresses, if needed for comment continuity, must remain non-public and outside MCP access. Raw WordPress artifacts may contain personal or secret data and must remain outside git.

## Production storage

Development currently uses Payload local upload storage (`media/`). Before production deployment, configure an official S3/R2 storage adapter, migrate media into it, and verify object checksums/URLs. Do not cut over with ephemeral container filesystem uploads.
