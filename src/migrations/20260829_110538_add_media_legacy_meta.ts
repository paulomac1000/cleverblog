import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "legacy_imported_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "legacy_migration_version" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "legacy_imported_at";
  ALTER TABLE "media" DROP COLUMN "legacy_migration_version";`)
}
