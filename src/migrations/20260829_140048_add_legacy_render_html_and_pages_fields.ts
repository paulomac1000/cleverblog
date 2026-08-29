import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_content_format" AS ENUM('lexical', 'legacy-html');
  CREATE TYPE "public"."enum_pages_provenance_origin" AS ENUM('wordpress', 'manual', 'agent');
  CREATE TYPE "public"."enum_pages_provenance_source_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  CREATE TYPE "public"."enum__pages_v_version_content_format" AS ENUM('lexical', 'legacy-html');
  CREATE TYPE "public"."enum__pages_v_version_provenance_origin" AS ENUM('wordpress', 'manual', 'agent');
  CREATE TYPE "public"."enum__pages_v_version_provenance_source_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  ALTER TABLE "posts" ADD COLUMN "legacy_render_h_t_m_l" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_render_h_t_m_l" varchar;
  ALTER TABLE "pages" ADD COLUMN "content_format" "enum_pages_content_format" DEFAULT 'lexical';
  ALTER TABLE "pages" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "pages" ADD COLUMN "provenance_origin" "enum_pages_provenance_origin" DEFAULT 'manual';
  ALTER TABLE "pages" ADD COLUMN "provenance_source_visibility" "enum_pages_provenance_source_visibility" DEFAULT 'unknown';
  ALTER TABLE "pages" ADD COLUMN "provenance_generated_by" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_wordpress_guid" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_render_h_t_m_l" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_source_hash" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_imported_at" timestamp(3) with time zone;
  ALTER TABLE "pages" ADD COLUMN "legacy_migration_version" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_content_format" "enum__pages_v_version_content_format" DEFAULT 'lexical';
  ALTER TABLE "_pages_v" ADD COLUMN "version_published_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_provenance_origin" "enum__pages_v_version_provenance_origin" DEFAULT 'manual';
  ALTER TABLE "_pages_v" ADD COLUMN "version_provenance_source_visibility" "enum__pages_v_version_provenance_source_visibility" DEFAULT 'unknown';
  ALTER TABLE "_pages_v" ADD COLUMN "version_provenance_generated_by" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_wordpress_guid" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_render_h_t_m_l" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_source_hash" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_imported_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_migration_version" varchar;
  CREATE INDEX "pages_legacy_legacy_source_hash_idx" ON "pages" USING btree ("legacy_source_hash");
  CREATE INDEX "_pages_v_version_legacy_version_legacy_source_hash_idx" ON "_pages_v" USING btree ("version_legacy_source_hash");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages_legacy_legacy_source_hash_idx";
  DROP INDEX "_pages_v_version_legacy_version_legacy_source_hash_idx";
  ALTER TABLE "posts" DROP COLUMN "legacy_render_h_t_m_l";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_render_h_t_m_l";
  ALTER TABLE "pages" DROP COLUMN "content_format";
  ALTER TABLE "pages" DROP COLUMN "published_at";
  ALTER TABLE "pages" DROP COLUMN "provenance_origin";
  ALTER TABLE "pages" DROP COLUMN "provenance_source_visibility";
  ALTER TABLE "pages" DROP COLUMN "provenance_generated_by";
  ALTER TABLE "pages" DROP COLUMN "legacy_wordpress_guid";
  ALTER TABLE "pages" DROP COLUMN "legacy_render_h_t_m_l";
  ALTER TABLE "pages" DROP COLUMN "legacy_source_hash";
  ALTER TABLE "pages" DROP COLUMN "legacy_imported_at";
  ALTER TABLE "pages" DROP COLUMN "legacy_migration_version";
  ALTER TABLE "_pages_v" DROP COLUMN "version_content_format";
  ALTER TABLE "_pages_v" DROP COLUMN "version_published_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_provenance_origin";
  ALTER TABLE "_pages_v" DROP COLUMN "version_provenance_source_visibility";
  ALTER TABLE "_pages_v" DROP COLUMN "version_provenance_generated_by";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_wordpress_guid";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_render_h_t_m_l";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_source_hash";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_imported_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_migration_version";
  DROP TYPE "public"."enum_pages_content_format";
  DROP TYPE "public"."enum_pages_provenance_origin";
  DROP TYPE "public"."enum_pages_provenance_source_visibility";
  DROP TYPE "public"."enum__pages_v_version_content_format";
  DROP TYPE "public"."enum__pages_v_version_provenance_origin";
  DROP TYPE "public"."enum__pages_v_version_provenance_source_visibility";`)
}
