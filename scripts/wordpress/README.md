# WordPress migration tooling

This directory is migration code, not a one-off pastebin. Keep it reproducible and idempotent.

## Source capture

Run source capture on the legacy WordPress host or against a restored copy. Keep database/WXR/uploads artifacts outside git.

Minimum artifacts:

```bash
wp db export /secure-backup/wordpress.sql
wp export --dir=/secure-backup/wxr --max_file_size=-1
rsync -a wp-content/uploads/ /secure-backup/uploads/
wp post list --post_type=post --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_modified,post_excerpt,post_content,guid,comment_status \
  --format=json > /secure-backup/posts.json
```

Copy only the sanitised `posts.json` needed for a staging rehearsal to `migration-data/raw/posts.json`. Never commit the real raw file.

Before the first production rehearsal, extend source capture with pages, authors, taxonomy, attachment metadata, comments and a crawler-derived public URL inventory.

## Normalize

```bash
pnpm wordpress:normalize
```

Normalization validates WordPress IDs, computes a deterministic source hash and generates the guaranteed legacy `/?p=ID` URL. It intentionally does not rewrite article content.

## Import posts

With Payload/Postgres running:

```bash
WORDPRESS_MIGRATION_VERSION=wp-rehearsal-001 pnpm wordpress:import:posts
```

The importer:

- upserts by `legacy.wordpressId`;
- preserves raw article HTML under `legacy.originalHTML`;
- sets `contentFormat=legacy-html`;
- retains the original publication date;
- marks verification as `imported`;
- uses `context.wordpressMigration=true` so historical public posts can be inserted without weakening the normal publication gate.

Running it repeatedly must update the same documents instead of creating duplicates.

## Required next steps

1. Import categories/tags before posts and map relationships.
2. Import media before HTML-to-Lexical conversion; key media by WordPress attachment ID and SHA-256.
3. Add HTML normalisation and `convertHTMLToLexical()` for clean content while retaining original HTML.
4. Add warning/fallback classification rather than guessing when conversion encounters unknown shortcodes/blocks.
5. Import comments in two passes so parent relationships can be reconstructed.
6. Materialise redirect records and test every historical URL.
7. Produce a machine migration report and fail cutover if any published legacy item is unaccounted for.
