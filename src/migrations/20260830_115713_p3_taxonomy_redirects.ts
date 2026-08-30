import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects_rels" ADD COLUMN "categories_id" integer;
  ALTER TABLE "redirects_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "redirects_rels" ADD CONSTRAINT "redirects_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "redirects_rels_categories_id_idx" ON "redirects_rels" USING btree ("categories_id");
  CREATE INDEX "redirects_rels_tags_id_idx" ON "redirects_rels" USING btree ("tags_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects_rels" DROP CONSTRAINT "redirects_rels_categories_fk";
  
  ALTER TABLE "redirects_rels" DROP CONSTRAINT "redirects_rels_tags_fk";
  
  DROP INDEX "redirects_rels_categories_id_idx";
  DROP INDEX "redirects_rels_tags_id_idx";
  ALTER TABLE "redirects_rels" DROP COLUMN "categories_id";
  ALTER TABLE "redirects_rels" DROP COLUMN "tags_id";`)
}
