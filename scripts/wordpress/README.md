# WordPress migration tooling

This directory contains reproducible WordPress -> Payload migration tooling. Raw database dumps, WXR, WordPress JSON exports and uploads are production data and stay outside git; only intentionally sanitised migration artifacts and reconciliation reports belong in the repository.

## Source capture

Capture the database/WXR before transforming anything:

```bash
wp db export /secure-backup/wordpress.sql
wp export --dir=/secure-backup/wxr --max_file_size=-1

Capture posts/pages with all historical content/date fields used by the normalizers. Pages must also include post_parent:

Bash
wp post list --post_type=post --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status \
  --format=json > /secure-backup/posts.json
wp post list --post_type=page --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status,post_parent \
  --format=json > /secure-backup/pages.json

Capture comments, taxonomy definitions, term relationships, attachments, _wp_attached_file, _wp_attachment_image_alt and the uploads tree. The expected filenames are comments.json, categories.json, tags.json, term-relations.json, media.json, attachment-meta.json and uploads/. _wp_attached_file is authoritative when present; preserve uploads-relative paths exactly.

Useful direct captures:

Bash
wp comment list --status=all \
  --fields=comment_ID,comment_post_ID,comment_parent,comment_author,comment_author_email,comment_author_url,comment_content,comment_approved,comment_date,comment_date_gmt \
  --format=json > /secure-backup/comments.json
wp term list category --fields=term_id,name,slug,description,parent --format=json > /secure-backup/categories.json
wp term list post_tag --fields=term_id,name,slug,description --format=json > /secure-backup/tags.json
wp post list --post_type=attachment --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,guid,post_mime_type \
  --format=json > /secure-backup/media.json
tar -C wp-content -czf /secure-backup/uploads.tar.gz uploads

For a migration run, place captures under migration-data/raw/ and extract uploads at migration-data/raw/uploads/. post_date_gmt is authoritative for historical publication timestamps; published content without a valid GMT timestamp is rejected rather than shifted silently.

Prepare and import

Preparation is deterministic and does not write Payload documents:

Bash
pnpm wordpress:normalize
pnpm wordpress:normalize:pages
pnpm wordpress:extract:media

The P3 redirects-plugin change alters the Postgres relationship schema. Generate and commit the normal Payload migration including its JSON snapshot after applying the config change:

Bash
pnpm payload migrate:create p3-taxonomy-redirects

Do not replace that generated pair with a hand-written SQL-only migration: Payload uses the JSON snapshot as the schema baseline for later migrate:create runs.

Target import/reconciliation order is:

Bash
pnpm payload migrate
pnpm wordpress:import:taxonomy
pnpm wordpress:import:media
pnpm wordpress:import:posts
pnpm wordpress:import:pages
pnpm wordpress:import:comments
pnpm wordpress:import:redirects
pnpm wordpress:inventory
pnpm wordpress:cutover:gate

Importers are idempotent. Posts/pages skip versioned updates when source-derived state is unchanged; legacy.importedAt is retained across real updates. Existing post verification, review and provenance fields remain human-owned workflow state.

Historical HTML and media

legacy.originalHTML is immutable source provenance. legacy.renderHTML is the sanitised working copy: resolvable WordPress upload URLs are rewritten to Payload media URLs, supported image variants are normalised only inside upload URLs, then HTML is sanitised before rendering.

Unresolved WordPress media references stay visible and are written to migration-data/reports/unrewritten-media-urls.json. The report is merge-by-collection, so posts and pages cannot erase each other's findings. Import never guesses replacement bytes or silently deletes unresolved references.

wordpress:extract:media writes unresolved attachments to migration-data/reports/media-issues.json. A media issue remains unresolved until its decision is explicitly reconciled. Backup evidence may prove a file absent or a similarly named file unrelated, but evidence does not choose recover or retire; P3 does not auto-decide media 262/263 or post 202.

Comments

Only approved WordPress comments are imported. comment_date_gmt is preserved as historical createdAt; comments are processed parent-first with bounded depth; broken parent chains are flattened instead of dropping descendants. Unknown/non-published post targets are fail-visible in migration-data/reports/comments-issues.json and skipped approved comments make import exit non-zero. Comments are upserted by legacyWordPressId.

Redirects and taxonomy archives

Redirect sources come from live imported Payload data:

post:     /?p=<legacyWordPressId>        -> posts
page:     /?page_id=<legacyWordPressId>  -> pages
category: /?cat=<legacyWordPressId>      -> categories
tag:      /?tag=<slug>                   -> tags

The importer reads published posts/pages and every publicly visible category/tag. Each source must have a usable slug and positive legacy WordPress ID; otherwise import fails closed. Redirects are upserted by from, use 301, and store a polymorphic to.reference.

The redirects plugin supports all four collections. src/proxy.ts serves the stored records as:

posts      -> /articles/<slug>
pages      -> /<slug>
categories -> /categories/<slug>
tags       -> /tags/<slug>

Taxonomy archive routes fetch category/tag by slug, 404 when absent and list related published posts newest-first. Category pages render their description when present. Both archive types provide canonical metadata.

URL inventory and cutover gate

pnpm wordpress:inventory regenerates migration-data/reports/url-inventory.json from live Payload data. sources[] covers published post/page query URLs plus category/tag query archives and their expected relation targets. unresolvedPublicIssues copies current media findings and annotates whether unrewritten content is still published and whether unresolved attachments match paths still referenced by published content.

Inventory and redirect import use the same fail-closed source loader, so a visible taxonomy item or published post/page cannot disappear merely because its legacy identity is incomplete.

pnpm wordpress:cutover:gate regenerates inventory, checks live redirects, writes migration-data/reports/cutover-gate.json and exits non-zero when:

a media issue relevant to published content still has decision: null;

a published post/page remains in unrewritten-media-urls.json;

an inventory source is missing its live redirect or points to the wrong relation target;

inventory/gate evaluation itself fails.

The gate report contains status, check counts and explicit blocker objects. With unresolved 262/263 and post 202 still represented by the reports, blocked is the expected state until humans reconcile them and regenerate the reports.

Discovery baseline

The public app exposes live Payload-backed discovery endpoints:

/sitemap.xml: homepage, published posts/pages, categories and tags;

/robots.txt: allows public crawling, excludes admin/API surfaces and points to the sitemap;

/feed.xml: RSS 2.0 for published posts with title, link, publication date, excerpt/description and content:encoded when legacy.renderHTML exists.

URLs use NEXT_PUBLIC_SERVER_URL with the existing localhost fallback. No extra RSS/sitemap library is required.

Future work

Convert suitable historical HTML to native Lexical while retaining both legacy provenance fields.

Classify unsupported shortcodes/blocks explicitly instead of guessing or dropping content.

Extend inventory with crawler/archive-derived path-style legacy URLs when evidence becomes available.

### package.json
```json
{
  "name": "cleverblog",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "cross-env NODE_OPTIONS=--no-deprecation payload generate:importmap && cross-env NODE_OPTIONS=--no-deprecation next build",
    "dev": "cross-env NODE_OPTIONS=--no-deprecation next dev",
    "generate:importmap": "cross-env NODE_OPTIONS=--no-deprecation payload generate:importmap",
    "generate:types": "cross-env NODE_OPTIONS=--no-deprecation payload generate:types",
    "lint": "cross-env NODE_OPTIONS=--no-deprecation eslint .",
    "payload": "cross-env NODE_OPTIONS=--no-deprecation payload",
    "start": "cross-env NODE_OPTIONS=--no-deprecation next start",
    "test": "cross-env NODE_OPTIONS=--no-deprecation vitest run",
    "wordpress:normalize": "tsx scripts/wordpress/normalize-posts.ts",
    "wordpress:import:posts": "tsx scripts/wordpress/import-posts.ts",
    "wordpress:extract:media": "tsx scripts/wordpress/extract-media.ts",
    "wordpress:import:taxonomy": "tsx scripts/wordpress/import-taxonomy.ts",
    "wordpress:import:media": "tsx scripts/wordpress/import-media.ts",
    "wordpress:normalize:pages": "tsx scripts/wordpress/normalize-pages.ts",
    "wordpress:import:pages": "tsx scripts/wordpress/import-pages.ts",
    "wordpress:import:comments": "tsx scripts/wordpress/import-comments.ts",
    "wordpress:import:redirects": "tsx scripts/wordpress/import-redirects.ts",
    "wordpress:inventory": "tsx scripts/wordpress/build-url-inventory.ts",
    "wordpress:cutover:gate": "tsx scripts/wordpress/cutover-gate.ts"
  },
  "dependencies": {
    "@payloadcms/db-postgres": "3.88.0",
    "@payloadcms/next": "3.88.0",
    "@payloadcms/plugin-mcp": "3.88.0",
    "@payloadcms/plugin-redirects": "3.88.0",
    "@payloadcms/plugin-search": "3.88.0",
    "@payloadcms/plugin-seo": "3.88.0",
    "@payloadcms/richtext-lexical": "3.88.0",
    "@payloadcms/ui": "3.88.0",
    "cross-env": "10.1.0",
    "next": "16.3.3",
    "payload": "3.88.0",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "sanitize-html": "2.17.7",
    "sharp": "0.34.2"
  },
  "devDependencies": {
    "@eslint/eslintrc": "3.3.1",
    "@types/node": "24.12.3",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@types/sanitize-html": "2.16.1",
    "eslint": "9.39.1",
    "eslint-config-next": "16.3.3",
    "tsx": "4.22.4",
    "typescript": "6.0.3",
    "vitest": "4.1.6"
  },
  "engines": {
    "node": ">=24.15.0",
    "pnpm": ">=10"
  },
  "pnpm": {
    "onlyBuiltDependencies": [
      "sharp",
      "esbuild",
      "unrs-resolver"
    ]
  }
}

P3 adds taxonomy redirects/routes, live inventory/gate, and discovery endpoints without deciding media 262/263 or post 202. The current unresolved reports intentionally keep the cutover gate blocked. The redirects-plugin schema change must be followed by pnpm payload migrate:create p3-taxonomy-redirects; that generated TypeScript + JSON snapshot should be committed before deployment. Syntax transpilation of the touched TypeScript/TSX files reports zero diagnostics.
