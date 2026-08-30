# WordPress migration tooling

This directory is migration code, not a one-off pastebin. Keep source capture reproducible and target imports idempotent.

## Source capture

Run source capture on the legacy WordPress host or against a restored copy. Database dumps, WXR, raw JSON and uploads stay outside git; only intentionally sanitised migration artifacts belong in the repository.

Capture the database and WXR first:

```bash
wp db export /secure-backup/wordpress.sql
wp export --dir=/secure-backup/wxr --max_file_size=-1
```

Capture posts with the historical fields consumed by the normalizer:

```bash
wp post list --post_type=post --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status \
  --format=json > /secure-backup/posts.json
```

Capture pages with the same content/date fields plus `post_parent`:

```bash
wp post list --post_type=page --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status,post_parent \
  --format=json > /secure-backup/pages.json
```

Capture taxonomy definitions:

```bash
wp term list category \
  --fields=term_id,name,slug,description,parent \
  --format=json > /secure-backup/categories.json

wp term list post_tag \
  --fields=term_id,name,slug,description \
  --format=json > /secure-backup/tags.json
```

Capture post-to-term relationships directly from the WordPress taxonomy tables:

```bash
wp db query "
SELECT
  tr.object_id AS objectId,
  tt.term_id AS termId,
  tt.taxonomy AS taxonomy
FROM wp_term_relationships tr
JOIN wp_term_taxonomy tt
  ON tt.term_taxonomy_id = tr.term_taxonomy_id
" --format=json > /secure-backup/term-relations.json
```

Capture attachment rows used to build the media manifest:

```bash
wp post list --post_type=attachment --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,guid,post_mime_type \
  --format=json > /secure-backup/media.json
```

`_wp_attached_file` is the authoritative uploads-relative path when present. Capture it together with `_wp_attachment_image_alt` from `wp_postmeta` and reshape the SQL rows into the object keyed by attachment ID that `extract-media.ts` consumes:

```bash
wp db query "
SELECT
  post_id AS wordpressId,
  MAX(CASE WHEN meta_key = '_wp_attached_file' THEN meta_value END) AS attachedFile,
  MAX(CASE WHEN meta_key = '_wp_attachment_image_alt' THEN meta_value END) AS alt
FROM wp_postmeta
WHERE meta_key IN ('_wp_attached_file', '_wp_attachment_image_alt')
GROUP BY post_id
" --format=json \
  | jq 'map({key: (.wordpressId | tostring), value: {attachedFile, alt}}) | from_entries' \
  > /secure-backup/attachment-meta.json
```

Capture the uploads tree as a tar archive so attachment paths remain intact:

```bash
tar -C wp-content -czf /secure-backup/uploads.tar.gz uploads
```

For a migration run, place the required captures under `migration-data/raw/` and extract the archive so files are rooted at `migration-data/raw/uploads/`. Never commit the unsanitised production captures.

`post_date` is the WordPress site's local wall-clock value and must not be interpreted as UTC. The normalizers use `post_date_gmt`; a published post or page without a valid GMT timestamp is rejected instead of silently shifting its historical publication time.

## Prepare normalized artifacts

Preparation is deterministic and does not write target Payload documents:

```bash
pnpm wordpress:normalize
pnpm wordpress:normalize:pages
pnpm wordpress:extract:media
```

`wordpress:normalize` and `wordpress:normalize:pages` validate WordPress IDs, preserve the captured source HTML and compute deterministic source hashes. `wordpress:extract:media` resolves attachment paths, hashes the actual upload bytes, emits the portable `migration-data/source/media-source.json` rewrite source and records unresolved attachments in `migration-data/reports/media-issues.json`.

## Run order

The target import order is fixed. Do not reorder these steps:

```bash
pnpm payload migrate
pnpm wordpress:import:taxonomy
pnpm wordpress:import:media
pnpm wordpress:import:posts
pnpm wordpress:import:pages
```

Set a migration version when required, for example:

```bash
WORDPRESS_MIGRATION_VERSION=wp-rehearsal-001 pnpm wordpress:import:posts
WORDPRESS_MIGRATION_VERSION=wp-rehearsal-001 pnpm wordpress:import:pages
```

The importers are designed for idempotent re-runs. Taxonomy, media, posts and pages resolve their WordPress identity and update the corresponding Payload record rather than creating a second migration copy.

## Migration contracts

### Historical HTML and render HTML

`legacy.originalHTML` is the immutable historical snapshot. Migration rendering must never rewrite, sanitise or otherwise mutate it.

`legacy.renderHTML` is a separate working copy produced from `originalHTML`. It rewrites resolvable WordPress upload URLs to `/api/media/file/<wpId>-<basename>`, normalises supported WordPress-generated image variants only inside `/wp-content/uploads/` URLs, and then applies the migration HTML sanitiser.

### Fail-visible media references

Posts and pages run `collectUnrewrittenUrls()` after render generation. Any WordPress upload URL that remains unresolved is written to:

```text
migration-data/reports/unrewritten-media-urls.json
```

The report is merge-by-collection: a posts import replaces only `collection: "posts"` entries, and a pages import replaces only `collection: "pages"` entries. Re-running either importer must not erase unresolved-media findings produced by the other collection.

Unrewritten references stay visible in `renderHTML`; the migration must not guess a replacement or silently delete them.

### Media issues

Media extraction treats `_wp_attached_file` as authoritative when it exists, verifies actual upload bytes and records unresolved attachments in:

```text
migration-data/reports/media-issues.json
```

The current unresolved WordPress media IDs are 262 and 263. They remain explicit migration issues until each receives a recover/retire decision; they are not silently substituted with another file.

### Drafts and published rows

WordPress publish records are imported as published Payload documents. Non-published WordPress records are imported with `draft: true`, so they are retained through Payload versions/drafts rather than becoming public main rows.

The production/main-row migration contract is therefore: only historically published posts and pages are public/published rows; draft/private/unpublished source records must not become published merely because the migration was re-run.

## Future work

- Add HTML normalisation and `convertHTMLToLexical()` for clean structured content while retaining `legacy.originalHTML` as the immutable source snapshot and `legacy.renderHTML` as the migration working copy.
- Add explicit warning/fallback classification for unsupported shortcodes, blocks and HTML-to-Lexical conversion failures instead of guessing or silently dropping source content.
- Import comments in two passes so post associations and parent-comment relationships can be reconstructed deterministically.
- Materialise redirect records for historical WordPress URL forms and verify them against a crawler-derived public URL inventory.
- Produce a cutover-grade machine migration report covering published content, taxonomy, media, comments and redirects, and fail cutover when any required published legacy item remains unaccounted for.
