import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "comments" ADD COLUMN "submission_hash" varchar;
    CREATE UNIQUE INDEX "comments_post_submission_hash_idx"
      ON "comments" USING btree ("post_id", "submission_hash");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "comments_post_submission_hash_idx";
    ALTER TABLE "comments" DROP COLUMN "submission_hash";
  `)
}
