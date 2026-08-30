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

Capture comments including moderation state and parent relationships:

```bash
wp comment list --status=all \
  --fields=comment_ID,comment_post_ID,comment_parent,comment_author,comment_author_email,comment_author_url,comment_content,comment_approved,comment_date,comment_date_gmt \
  --format=json > /secure-backup/comments.json
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
wp eval '
$rows = $GLOBALS["wpdb"]->get_results(
  "SELECT tr.object_id AS objectId, tt.term_id AS termId, tt.taxonomy AS taxonomy
   FROM {$GLOBALS["wpdb"]->term_relationships} tr
   JOIN {$GLOBALS["wpdb"]->term_taxonomy} tt ON tt.term_taxonomy_id = tr.term_taxonomy_id",
  ARRAY_A
);
echo wp_json_encode(array_values($rows));
' > /secure-backup/term-relations.json
```

Capture attachment rows used to build the media manifest:

```bash
wp post list --post_type=attachment --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,guid,post_mime_type \
  --format=json > /secure-backup/media.json
```

`_wp_attached_file` is the authoritative uploads-relative path when present. Capture it together with `_wp_attachment_image_alt` from `wp_postmeta`. The PHP capture emits the object keyed by attachment ID that `extract-media.ts` consumes directly, so no `jq` reshaping step is required:

```bash
wp eval '
$sql = $GLOBALS["wpdb"]->prepare(
  "SELECT
     post_id AS wordpressId,
     MAX(CASE WHEN meta_key = %s THEN meta_value END) AS attachedFile,
     MAX(CASE WHEN meta_key = %s THEN meta_value END) AS alt
   FROM {$GLOBALS["wpdb"]->postmeta}
   WHERE meta_key IN (%s, %s)
   GROUP BY post_id",
  "_wp_attached_file",
  "_wp_attachment_image_alt",
  "_wp_attached_file",
  "_wp_attachment_image_alt"
);
$rows = $GLOBALS["wpdb"]->get_results($sql, ARRAY_A);

$meta = [];
foreach (array_values($rows) as $row) {
  $meta[(string) $row["wordpressId"]] = [
    "attachedFile" => $row["attachedFile"],
    "alt" => $row["alt"],
  ];
}
echo wp_json_encode((object) $meta);
' > /secure-backup/attachment-meta.json
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
pnpm wordpress:import:comments
pnpm wordpress:import:redirects
```

Set a migration version when required, for example:

```bash
WORDPRESS_MIGRATION_VERSION=wp-rehearsal-001 pnpm wordpress:import:posts
WORDPRESS_MIGRATION_VERSION=wp-rehearsal-001 pnpm wordpress:import:pages
```

The importers are designed for idempotent re-runs. Taxonomy, media, posts, pages, comments and redirects resolve their WordPress identity or legacy URL and update the corresponding Payload record rather than creating a second migration copy.

Posts and pages compare the source-derived target state before updating a versioned Payload document. An unchanged re-run logs `unchanged wp:<id>` and does not create another Payload version. `legacy.importedAt` is preserved across real updates, and a `migrationVersion` change by itself does not multiply document versions.

For posts, `verification`, `review` and `provenance` are migration defaults applied only when the Payload document is first created. Re-runs may update source-owned fields but must not overwrite those three human-owned workflow fields on an existing document.

The current P2c1 scope ends with approved-comments import and query-style redirects. Full migration reconciliation, archive inventory, resolution of outstanding media inventory and the cutover gate are P3 work and are not claimed by this phase.

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

The current unresolved WordPress media IDs are 262 and 263. They remain explicit migration issues; their recover/retire decisions and reconciliation against the archive inventory belong to P3 rather than P2c1.

### Drafts and published rows

WordPress publish records are imported as published Payload documents. Non-published WordPress records are imported with `draft: true`, so they are retained through Payload versions/drafts rather than becoming public main rows.

The production/main-row migration contract is therefore: only historically published posts and pages are public/published rows; draft/private/unpublished source records must not become published merely because the migration was re-run.

### Comments

Only WordPress comments with `comment_approved === "1"` are imported. Comments are imported topologically: roots first, then descendants, with a bounded maximum parent depth.

`comment_date_gmt` is authoritative for the Payload `createdAt` timestamp. It must have the WordPress UTC form `YYYY-MM-DD HH:MM:SS`; the importer converts it to an explicit UTC ISO timestamp and throws on an invalid value. Both creates and updates write that historical `createdAt`, so a re-run repairs comments that were previously stamped with migration time.

A source comment whose parent is not present in the approved source set is promoted to a root instead of being dropped. Missing or skipped Payload parents are handled with the same flattening fail-safe.

Post resolution is public-only and fail-closed: `comment_post_ID` must resolve by `legacy.wordpressId` to a Payload post whose `_status` is `published`. A comment whose post cannot be resolved is skipped rather than attached to a guessed or draft document; descendants continue through the traversal and are flattened if their parent chain was broken.

Every source-parent flattening, missing Payload parent and unknown-post skip is written to:

```text
migration-data/reports/comments-issues.json
```

That report is overwritten with the complete findings from the current comments import. Parent flattening is an intentional migration transformation and does not by itself make the import fail. Any approved comment skipped because its published Payload post cannot be resolved makes the importer log `FAIL` and exit non-zero after the report has been written.

Comments are upserted by `legacyWordPressId`. Re-running an unchanged 12-comment approved set therefore produces zero duplicate documents; the existing non-versioned Comments collection may be updated safely.

### Redirects

Historical WordPress query URLs are materialised from live imported Payload documents rather than from ignored normalized artifacts:

```text
post: /?p=<wordpressId>
page: /?page_id=<wordpressId>
```

The migration-level redirect model calls these values `fromURL` and `toURL`. In `@payloadcms/plugin-redirects@3.88.0`, the actual collection persists them as `from` and `to.reference`, where `to.reference` is the polymorphic relationship to `posts` or `pages`; redirect type is `301`.

Redirects are upserted by their historical source URL. The importer queries published post/page documents only. Every returned published document must have a positive numeric `legacy.wordpressId` and a non-empty slug; a missing or invalid value throws instead of silently reducing the redirect inventory.

The Payload redirects plugin stores redirect configuration but does not serve redirects itself. Next.js 16 `src/proxy.ts` queries the redirects REST collection using the complete incoming `pathname + search`, requests `depth=1`, and resolves relationship targets as:

```text
posts -> /articles/<slug>
pages -> /<slug>
```

The minimal `[slug]` frontend page route is therefore part of the redirect contract: page redirects to `/kontakt`, `/o-nas`, policy pages and other static migrated pages must resolve to an actual frontend route.

Redirect lookup uses the incoming request origin by default, so production does not depend on a localhost API URL. `REDIRECTS_API_ORIGIN` may optionally supply a different exact origin, for example `https://cleverblog.pl`; it must not include `/api` or another path.

Proxy redirect API requests have a 2-second timeout. Successful redirect hits and misses are cached in memory for 60 seconds, with a hard maximum of 500 entries and oldest-entry eviction when the cache is full. API errors, timeouts and malformed redirect targets fall through to normal Next.js routing.

The proxy matcher excludes `/api`, `/_next`, `/admin`, `/media`, the favicon and common static asset extensions. Historical `.html` and `.php` paths are deliberately not excluded, because they may themselves be legacy redirect sources.

## Future work

- Add HTML normalisation and `convertHTMLToLexical()` for clean structured content while retaining `legacy.originalHTML` as the immutable source snapshot and `legacy.renderHTML` as the migration working copy.
- Add explicit warning/fallback classification for unsupported shortcodes, blocks and HTML-to-Lexical conversion failures instead of guessing or silently dropping source content.
- P3: reconcile unresolved media IDs 262/263 and the complete archive inventory instead of treating the current imported subset as cutover-complete.
- P3: verify materialised redirects against a crawler/archive-derived public URL inventory.
- P3: produce a cutover-grade machine migration report covering published content, taxonomy, media, comments and redirects, and fail the cutover gate when any required published legacy item remains unaccounted for.
