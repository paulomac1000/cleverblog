# WordPress migration tooling

This directory contains reproducible WordPress -> Payload migration tooling. Raw database dumps, WXR, JSON captures and uploads are production data and stay outside git. Only intentionally sanitised source artifacts and reconciliation reports belong in the repository.

## Source capture

Run capture on the legacy WordPress host or a restored copy. Capture the database and WXR first:

```bash
wp db export /secure-backup/wordpress.sql
wp export --dir=/secure-backup/wxr --max_file_size=-1

Capture posts and pages with the historical fields consumed by the normalizers:

Bash
wp post list --post_type=post --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status \
  --format=json > /secure-backup/posts.json

wp post list --post_type=page --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,post_modified,post_modified_gmt,post_excerpt,post_content,guid,comment_status,post_parent \
  --format=json > /secure-backup/pages.json

Capture comments and taxonomy definitions:

Bash
wp comment list --status=all \
  --fields=comment_ID,comment_post_ID,comment_parent,comment_author,comment_author_email,comment_author_url,comment_content,comment_approved,comment_date,comment_date_gmt \
  --format=json > /secure-backup/comments.json

wp term list category \
  --fields=term_id,name,slug,description,parent \
  --format=json > /secure-backup/categories.json

wp term list post_tag \
  --fields=term_id,name,slug,description \
  --format=json > /secure-backup/tags.json

Capture post-to-term relationships directly from the WordPress taxonomy tables. This is the exact capture used by the migration:

Bash
wp db query "
SELECT
  tr.object_id AS objectId,
  tt.term_id AS termId,
  tt.taxonomy AS taxonomy
FROM wp_term_relationships tr
JOIN wp_term_taxonomy tt
  ON tt.term_taxonomy_id = tr.term_taxonomy_id
" --format=json > /secure-backup/term-relations.json

Capture attachments:

Bash
wp post list --post_type=attachment --post_status=any \
  --fields=ID,post_title,post_name,post_status,post_date,post_date_gmt,guid,post_mime_type \
  --format=json > /secure-backup/media.json

_wp_attached_file is authoritative when present. Capture it together with _wp_attachment_image_alt using the exact command below:

Bash
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

Capture uploads without flattening paths:

Bash
tar -C wp-content -czf /secure-backup/uploads.tar.gz uploads

Place captures under migration-data/raw/ and extract uploads at migration-data/raw/uploads/. Never commit raw production captures. post_date_gmt is authoritative for historical publication timestamps; a published post/page without a valid GMT timestamp is rejected.

Prepare source artifacts
Bash
pnpm wordpress:normalize
pnpm wordpress:normalize:pages
pnpm wordpress:extract:media
pnpm wordpress:public-url-source

The normalized posts/pages preserve source HTML and deterministic source hashes. Media extraction verifies actual bytes, writes the portable migration-data/source/media-source.json and records unresolved attachments in migration-data/reports/media-issues.json.

P3 public URL source workflow

wordpress:public-url-source reads only migration-data/raw/{posts,pages,categories,tags}.json and emits sanitised migration-data/source/public-url-source.json. It records raw source counts plus the expected public legacy URL universe: only post_status === "publish" posts/pages and all categories/tags. It emits identity and fromURL only; titles/content are not copied.

Because raw capture is gitignored, generate and commit this artifact manually:

Bash
pnpm wordpress:public-url-source
git diff -- migration-data/source/public-url-source.json
git add migration-data/source/public-url-source.json
git commit

The committed WordPress-derived artifact is the cutover source of truth. Never derive the expected universe from Payload; deleting wp:202 or any other target record must not remove that source item from gate expectations. Missing/malformed fields, duplicate identities and conflicting legacy URLs fail closed.

Schema and import order

The redirects-plugin relationship change requires the normal Payload migration and JSON snapshot:

Bash
pnpm payload migrate:create p3-taxonomy-redirects

Do not replace the generated pair with hand-written SQL. Target order:

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

Importers are idempotent. Posts/pages skip unchanged versioned updates and retain legacy.importedAt across real updates.

Content and media contracts

legacy.originalHTML is immutable source provenance. legacy.renderHTML is the sanitised working copy; resolvable WordPress upload URLs are rewritten to Payload media URLs and supported resize/scaled variants are normalised only inside upload URLs.

Remaining WordPress upload references are committed to migration-data/reports/unrewritten-media-urls.json. The report merges by collection so posts/pages do not erase each other's findings. Import must not guess bytes, silently delete references or treat target deletion as reconciliation.

Unresolved attachments are committed to migration-data/reports/media-issues.json. Relevant issues support three explicit decisions:

recover: recover the original bytes and reconcile the reference.

retire: intentionally retire the missing asset/reference in the later reconciliation phase.

replace: use a deliberate replacement; the entry must also contain a non-empty string replacementNote explaining it.

replace without replacementNote is a blocker. Any decision is independent of the published-content URL check: if an expected published post/page still appears in unrewritten-media-urls.json, unrewritten-media-url remains a blocker.

Backup evidence may prove that bytes are absent or that similarly named files are unrelated, but it does not choose a media decision. Media 262/263 and post 202 remain explicit until human reconciliation.

Comments, redirects and archives

Only approved comments are imported. Historical comment_date_gmt becomes createdAt; comments are parent-first with bounded depth, broken parent chains are flattened, and unresolved published-post targets stay fail-visible in comments-issues.json.

Legacy redirect forms are:

post:     /?p=<legacyWordPressId>        -> posts
page:     /?page_id=<legacyWordPressId>  -> pages
category: /?cat=<legacyWordPressId>      -> categories
tag:      /?tag=<slug>                   -> tags

Redirects are 301 records with polymorphic to.reference. src/proxy.ts resolves their public targets to /articles/<slug>, /<slug>, /categories/<slug> and /tags/<slug> respectively. Category/tag archive routes expose related published posts and canonical metadata.

URL inventory and cutover gate

pnpm wordpress:inventory reads committed public-url-source.json and checks each expected item against live Payload. url-inventory.json contains:

expected[]: source-derived public universe;

sources[]: resolved Payload targets and public status;

missingFromPayload[]: expected items absent from Payload;

notPublicInPayload[]: expected post/page targets that exist but are not public;

redirectChecks[]: live redirect existence and exact relationship target;

unresolvedPublicIssues: committed media reports annotated against expected[].

currentlyPublished for unrewritten media is derived from source expected[], not from a live published query. Media relevance is derived from unresolved upload paths belonging to those source-published entries. Consequently, removing wp:202 from Payload produces missing-from-payload and does not suppress its unrewritten-media-url blocker.

pnpm wordpress:cutover:gate rebuilds the inventory, independently cross-checks expected[] against resolved sources/checks, writes cutover-gate.json and exits non-zero for missing/non-public targets, unresolved published media URLs, unresolved relevant media decisions, missing replacement notes, missing/mismatched redirects, incomplete coverage or gate errors.

P3 coverage contract

The report exposes coverage.implemented and coverage.pending. P3 round 2 deliberately leaves these checks pending:

full crawler/archive inventory

broken internal links scan

comments coverage check

canonical/sitemap/robots/RSS checks

100% source content reconciliation

While any item remains pending, the gate adds gate-coverage-incomplete; status is always blocked. Remove a pending constant only in the phase that actually implements and tests that check. Existing sitemap/robots/feed/canonical functionality is not equivalent to cutover verification.

Discovery baseline

The public app exposes /sitemap.xml, /robots.txt and /feed.xml; taxonomy archives are public routes. URLs use NEXT_PUBLIC_SERVER_URL with the existing localhost fallback.

Future work

Implement every pending coverage check, extend inventory with crawler/archive-derived path-style legacy URLs, reconcile approved-comment coverage, scan internal links, verify canonical/discovery outputs, perform 100% source-content reconciliation, and only then allow the gate to become ready.

### migration-data/reports/backup-recovery-evidence.json
```json
{
  "checkedAt": "2026-08-30T00:00:00+02:00",
  "backupArchive": "backup_2026-08-17-0728_cleverblogpl_9c9f76dd3451-uploads.zip",
  "findings": {
    "missingExpected": [
      "2021/02/image.png",
      "2021/02/image-1.png"
    ],
    "presentSimilarButDifferent": [
      "2021/04/image.png",
      "2021/04/image-1.png",
      "2021/04/image-18.png"
    ],
    "zipContainsExpected": false
  },
  "sqlEvidence": {
    "wp_postmeta 813": "post 341 -> 2021/04/image-18.png",
    "wp_postmeta 747": "post 316 -> 2021/04/image-1.png",
    "wp_posts 262/263 guid": "2021/02/..."
  },
  "conclusion": "Google Drive backup does not recover unresolved media 262/263. The similarly named 2021/04 files are different attachments per the sanitised SQL evidence above."
}
