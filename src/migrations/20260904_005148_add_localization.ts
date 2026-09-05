import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * localization enablement: pl/en, defaultLocale pl, fallback:false.
 * HAND-AUGMENTED (2026-09-04): added explicit PL data backfill into *_locales
 * tables BEFORE the original columns are dropped — Payload 3.88
 * `payload migrate:create` generates schema changes only, with no data
 * migration, and running it unmodified would have destroyed all existing
 * titles/slugs/content. Also guarded comments.submission_hash, which was
 * added by a hand-written migration after the previous drizzle snapshot.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."_locales" AS ENUM('pl', 'en');
  CREATE TYPE "public"."enum__posts_v_published_locale" AS ENUM('pl', 'en');
  CREATE TYPE "public"."enum__pages_v_published_locale" AS ENUM('pl', 'en');
  CREATE TABLE "posts_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_posts_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_content" jsonb,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_locales" (
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"content" jsonb,
  	"meta_title" varchar,
  	"meta_description" varchar,
  	"meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_locales" (
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_content" jsonb,
  	"version_meta_title" varchar,
  	"version_meta_description" varchar,
  	"version_meta_image_id" integer,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "media_locales" (
  	"alt" varchar NOT NULL,
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "categories_locales" (
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "search_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "posts" DROP CONSTRAINT "posts_meta_image_id_media_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_meta_image_id_media_id_fk";
  
  ALTER TABLE "pages" DROP CONSTRAINT "pages_meta_image_id_media_id_fk";
  
  ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_meta_image_id_media_id_fk";
  
  DROP INDEX "posts_slug_idx";
  DROP INDEX "posts_meta_meta_image_idx";
  DROP INDEX "_posts_v_version_version_slug_idx";
  DROP INDEX "_posts_v_version_meta_version_meta_image_idx";
  DROP INDEX "pages_slug_idx";
  DROP INDEX "pages_meta_meta_image_idx";
  DROP INDEX "_pages_v_version_version_slug_idx";
  DROP INDEX "_pages_v_version_meta_version_meta_image_idx";
  DROP INDEX "categories_slug_idx";
  DROP INDEX "tags_slug_idx";
  ALTER TABLE "_posts_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "_posts_v" ADD COLUMN "published_locale" "enum__posts_v_published_locale";
  ALTER TABLE "_pages_v" ADD COLUMN "snapshot" boolean;
  ALTER TABLE "_pages_v" ADD COLUMN "published_locale" "enum__pages_v_published_locale";
  ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "submission_hash" varchar;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_locales" ADD CONSTRAINT "posts_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_locales" ADD CONSTRAINT "_posts_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_meta_image_id_media_id_fk" FOREIGN KEY ("meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_locales" ADD CONSTRAINT "pages_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_version_meta_image_id_media_id_fk" FOREIGN KEY ("version_meta_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_locales" ADD CONSTRAINT "_pages_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_locales" ADD CONSTRAINT "media_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "categories_locales" ADD CONSTRAINT "categories_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_locales" ADD CONSTRAINT "search_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."search"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "posts_slug_idx" ON "posts_locales" USING btree ("slug","_locale");
  CREATE INDEX "posts_meta_meta_image_idx" ON "posts_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "posts_locales_locale_parent_id_unique" ON "posts_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_version_version_slug_idx" ON "_posts_v_locales" USING btree ("version_slug","_locale");
  CREATE INDEX "_posts_v_version_meta_version_meta_image_idx" ON "_posts_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_posts_v_locales_locale_parent_id_unique" ON "_posts_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages_locales" USING btree ("slug","_locale");
  CREATE INDEX "pages_meta_meta_image_idx" ON "pages_locales" USING btree ("meta_image_id","_locale");
  CREATE UNIQUE INDEX "pages_locales_locale_parent_id_unique" ON "pages_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v_locales" USING btree ("version_slug","_locale");
  CREATE INDEX "_pages_v_version_meta_version_meta_image_idx" ON "_pages_v_locales" USING btree ("version_meta_image_id","_locale");
  CREATE UNIQUE INDEX "_pages_v_locales_locale_parent_id_unique" ON "_pages_v_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "media_locales_locale_parent_id_unique" ON "media_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "categories_slug_idx" ON "categories_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "categories_locales_locale_parent_id_unique" ON "categories_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "tags_slug_idx" ON "tags_locales" USING btree ("slug","_locale");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE UNIQUE INDEX "search_locales_locale_parent_id_unique" ON "search_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_posts_v_snapshot_idx" ON "_posts_v" USING btree ("snapshot");
  CREATE INDEX "_posts_v_published_locale_idx" ON "_posts_v" USING btree ("published_locale");
  CREATE INDEX "_pages_v_snapshot_idx" ON "_pages_v" USING btree ("snapshot");
  CREATE INDEX "_pages_v_published_locale_idx" ON "_pages_v" USING btree ("published_locale");
  DROP INDEX IF EXISTS "comments_post_submission_hash_idx";
  CREATE UNIQUE INDEX IF NOT EXISTS "post_submissionHash_idx" ON "comments" USING btree ("post_id","submission_hash");
  -- BEGIN hand-added PL backfill: preserve existing default-locale (pl) data
  -- before the original columns are dropped. Payload 3.88 migrate:create does
  -- NOT generate data migration for localization enablement.
  INSERT INTO "posts_locales" ("title", "slug", "excerpt", "content", "meta_title", "meta_description", "meta_image_id", "_locale", "_parent_id")
  SELECT "title", "slug", "excerpt", "content", "meta_title", "meta_description", "meta_image_id", 'pl', "id"
  FROM "posts"
  WHERE "title" IS NOT NULL OR "slug" IS NOT NULL OR "content" IS NOT NULL;

  INSERT INTO "_posts_v_locales" ("version_title", "version_slug", "version_excerpt", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "_locale", "_parent_id")
  SELECT "version_title", "version_slug", "version_excerpt", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", 'pl', "id"
  FROM "_posts_v"
  WHERE "version_title" IS NOT NULL OR "version_slug" IS NOT NULL OR "version_content" IS NOT NULL;

  INSERT INTO "pages_locales" ("title", "slug", "excerpt", "content", "meta_title", "meta_description", "meta_image_id", "_locale", "_parent_id")
  SELECT "title", "slug", "excerpt", "content", "meta_title", "meta_description", "meta_image_id", 'pl', "id"
  FROM "pages"
  WHERE "title" IS NOT NULL OR "slug" IS NOT NULL OR "content" IS NOT NULL;

  INSERT INTO "_pages_v_locales" ("version_title", "version_slug", "version_excerpt", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", "_locale", "_parent_id")
  SELECT "version_title", "version_slug", "version_excerpt", "version_content", "version_meta_title", "version_meta_description", "version_meta_image_id", 'pl', "id"
  FROM "_pages_v"
  WHERE "version_title" IS NOT NULL OR "version_slug" IS NOT NULL OR "version_content" IS NOT NULL;

  INSERT INTO "media_locales" ("alt", "caption", "_locale", "_parent_id")
  SELECT "alt", "caption", 'pl', "id" FROM "media" WHERE "alt" IS NOT NULL;

  INSERT INTO "categories_locales" ("name", "slug", "description", "_locale", "_parent_id")
  SELECT "name", "slug", "description", 'pl', "id" FROM "categories"
  WHERE "name" IS NOT NULL AND "slug" IS NOT NULL;

  INSERT INTO "tags_locales" ("name", "slug", "_locale", "_parent_id")
  SELECT "name", "slug", 'pl', "id" FROM "tags" WHERE "name" IS NOT NULL AND "slug" IS NOT NULL;

  INSERT INTO "search_locales" ("title", "_locale", "_parent_id")
  SELECT "title", 'pl', "id" FROM "search" WHERE "title" IS NOT NULL;
  -- END hand-added PL backfill

  ALTER TABLE "posts" DROP COLUMN "title";
  ALTER TABLE "posts" DROP COLUMN "slug";
  ALTER TABLE "posts" DROP COLUMN "excerpt";
  ALTER TABLE "posts" DROP COLUMN "content";
  ALTER TABLE "posts" DROP COLUMN "meta_title";
  ALTER TABLE "posts" DROP COLUMN "meta_description";
  ALTER TABLE "posts" DROP COLUMN "meta_image_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_title";
  ALTER TABLE "_posts_v" DROP COLUMN "version_slug";
  ALTER TABLE "_posts_v" DROP COLUMN "version_excerpt";
  ALTER TABLE "_posts_v" DROP COLUMN "version_content";
  ALTER TABLE "_posts_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "_posts_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "_posts_v" DROP COLUMN "version_meta_image_id";
  ALTER TABLE "pages" DROP COLUMN "title";
  ALTER TABLE "pages" DROP COLUMN "slug";
  ALTER TABLE "pages" DROP COLUMN "excerpt";
  ALTER TABLE "pages" DROP COLUMN "content";
  ALTER TABLE "pages" DROP COLUMN "meta_title";
  ALTER TABLE "pages" DROP COLUMN "meta_description";
  ALTER TABLE "pages" DROP COLUMN "meta_image_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_slug";
  ALTER TABLE "_pages_v" DROP COLUMN "version_excerpt";
  ALTER TABLE "_pages_v" DROP COLUMN "version_content";
  ALTER TABLE "_pages_v" DROP COLUMN "version_meta_title";
  ALTER TABLE "_pages_v" DROP COLUMN "version_meta_description";
  ALTER TABLE "_pages_v" DROP COLUMN "version_meta_image_id";
  ALTER TABLE "media" DROP COLUMN "alt";
  ALTER TABLE "media" DROP COLUMN "caption";
  ALTER TABLE "categories" DROP COLUMN "name";
  ALTER TABLE "categories" DROP COLUMN "slug";
  ALTER TABLE "categories" DROP COLUMN "description";
  ALTER TABLE "tags" DROP COLUMN "name";
  ALTER TABLE "tags" DROP COLUMN "slug";
  ALTER TABLE "search" DROP COLUMN "title";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Rollback must PRESERVE the canonical Polish content: copy every *_locales
  // PL row back into the legacy non-localized columns BEFORE dropping the
  // locale tables, then restore the old constraints/indexes.
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "title" varchar;
  ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "excerpt" text;
  ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "slug" varchar;
  ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "content" jsonb;
  UPDATE "posts" p SET "title" = l."title", "excerpt" = l."excerpt", "slug" = l."slug", "content" = l."content"
    FROM "posts_locales" l WHERE l."_parent_id" = p."id" AND l."_locale" = 'pl';
  UPDATE "posts" p SET "title" = COALESCE(p."title", pl.title) FROM (SELECT "_parent_id", MIN("title") AS title FROM "posts_locales" GROUP BY "_parent_id") pl WHERE p."id" = pl."_parent_id" AND p."title" IS NULL;

  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "title" varchar;
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "slug" varchar;
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "content" jsonb;
  UPDATE "pages" p SET "title" = l."title", "slug" = l."slug", "content" = l."content"
    FROM "pages_locales" l WHERE l."_parent_id" = p."id" AND l."_locale" = 'pl';

  ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "name" varchar;
  ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "slug" varchar;
  ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "description" text;
  UPDATE "categories" c SET "name" = l."name", "slug" = l."slug", "description" = l."description"
    FROM "categories_locales" l WHERE l."_parent_id" = c."id" AND l."_locale" = 'pl';

  ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "name" varchar;
  ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "slug" varchar;
  UPDATE "tags" t SET "name" = l."name", "slug" = l."slug"
    FROM "tags_locales" l WHERE l."_parent_id" = t."id" AND l."_locale" = 'pl';

  ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "alt" varchar;
  UPDATE "media" m SET "alt" = l."alt"
    FROM "media_locales" l WHERE l."_parent_id" = m."id" AND l."_locale" = 'pl';

  DROP TABLE IF EXISTS "posts_locales";
  DROP TABLE IF EXISTS "_posts_v_locales";
  DROP TABLE IF EXISTS "pages_locales";
  DROP TABLE IF EXISTS "_pages_v_locales";
  DROP TABLE IF EXISTS "media_locales";
  DROP TABLE IF EXISTS "categories_locales";
  DROP TABLE IF EXISTS "tags_locales";
  DROP TABLE IF EXISTS "_posts_v_rels";
  DROP TABLE IF EXISTS "_pages_v_rels";

  CREATE UNIQUE INDEX IF NOT EXISTS "posts_slug_idx" ON "posts" ("slug");
  CREATE UNIQUE INDEX IF NOT EXISTS "pages_slug_idx" ON "pages" ("slug");
  CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_idx" ON "categories" ("slug");
  CREATE UNIQUE INDEX IF NOT EXISTS "tags_slug_idx" ON "tags" ("slug");
  `)
}
