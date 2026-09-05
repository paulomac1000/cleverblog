import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_related_links_kind" AS ENUM('github-skill', 'repository', 'documentation');
  CREATE TYPE "public"."enum__posts_v_version_related_links_kind" AS ENUM('github-skill', 'repository', 'documentation');
  CREATE TABLE "posts_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"kind" "enum_posts_related_links_kind" DEFAULT 'repository'
  );
  
  CREATE TABLE "_posts_v_version_related_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"url" varchar,
  	"kind" "enum__posts_v_version_related_links_kind" DEFAULT 'repository',
  	"_uuid" varchar
  );
  
  ALTER TABLE "posts_related_links" ADD CONSTRAINT "posts_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_related_links" ADD CONSTRAINT "_posts_v_version_related_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_related_links_order_idx" ON "posts_related_links" USING btree ("_order");
  CREATE INDEX "posts_related_links_parent_id_idx" ON "posts_related_links" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_related_links_order_idx" ON "_posts_v_version_related_links" USING btree ("_order");
  CREATE INDEX "_posts_v_version_related_links_parent_id_idx" ON "_posts_v_version_related_links" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "posts_related_links" CASCADE;
  DROP TABLE "_posts_v_version_related_links" CASCADE;
  DROP TYPE "public"."enum_posts_related_links_kind";
  DROP TYPE "public"."enum__posts_v_version_related_links_kind";`)
}
