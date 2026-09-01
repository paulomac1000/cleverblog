import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_provenance_origin_source_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  CREATE TYPE "public"."enum_posts_provenance_material_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  CREATE TYPE "public"."enum_posts_provenance_reconstruction_status" AS ENUM('not_required', 'completed_public_reconstruction');
  CREATE TYPE "public"."enum__posts_v_version_provenance_origin_source_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  CREATE TYPE "public"."enum__posts_v_version_provenance_material_visibility" AS ENUM('public', 'private', 'mixed', 'unknown');
  CREATE TYPE "public"."enum__posts_v_version_provenance_reconstruction_status" AS ENUM('not_required', 'completed_public_reconstruction');
  ALTER TABLE "posts" ADD COLUMN "provenance_origin_source_visibility" "enum_posts_provenance_origin_source_visibility" DEFAULT 'public';
  ALTER TABLE "posts" ADD COLUMN "provenance_material_visibility" "enum_posts_provenance_material_visibility" DEFAULT 'public';
  ALTER TABLE "posts" ADD COLUMN "provenance_reconstruction_status" "enum_posts_provenance_reconstruction_status" DEFAULT 'not_required';
  ALTER TABLE "_posts_v" ADD COLUMN "version_provenance_origin_source_visibility" "enum__posts_v_version_provenance_origin_source_visibility" DEFAULT 'public';
  ALTER TABLE "_posts_v" ADD COLUMN "version_provenance_material_visibility" "enum__posts_v_version_provenance_material_visibility" DEFAULT 'public';
  ALTER TABLE "_posts_v" ADD COLUMN "version_provenance_reconstruction_status" "enum__posts_v_version_provenance_reconstruction_status" DEFAULT 'not_required';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "provenance_origin_source_visibility";
  ALTER TABLE "posts" DROP COLUMN "provenance_material_visibility";
  ALTER TABLE "posts" DROP COLUMN "provenance_reconstruction_status";
  ALTER TABLE "_posts_v" DROP COLUMN "version_provenance_origin_source_visibility";
  ALTER TABLE "_posts_v" DROP COLUMN "version_provenance_material_visibility";
  ALTER TABLE "_posts_v" DROP COLUMN "version_provenance_reconstruction_status";
  DROP TYPE "public"."enum_posts_provenance_origin_source_visibility";
  DROP TYPE "public"."enum_posts_provenance_material_visibility";
  DROP TYPE "public"."enum_posts_provenance_reconstruction_status";
  DROP TYPE "public"."enum__posts_v_version_provenance_origin_source_visibility";
  DROP TYPE "public"."enum__posts_v_version_provenance_material_visibility";
  DROP TYPE "public"."enum__posts_v_version_provenance_reconstruction_status";`)
}
