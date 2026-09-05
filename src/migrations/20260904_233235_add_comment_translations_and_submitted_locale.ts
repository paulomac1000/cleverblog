import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_comments_submitted_locale" AS ENUM('pl', 'en');
  CREATE TYPE "public"."enum_comment_translations_locale" AS ENUM('en');
  CREATE TYPE "public"."enum_comment_translations_status" AS ENUM('ready', 'failed');
  CREATE TABLE "comment_translations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"comment_id" integer NOT NULL,
  	"locale" "enum_comment_translations_locale" NOT NULL,
  	"text" varchar NOT NULL,
  	"status" "enum_comment_translations_status" DEFAULT 'ready' NOT NULL,
  	"provider" varchar DEFAULT 'openrouter',
  	"model" varchar,
  	"source_hash" varchar,
  	"translation_version" numeric DEFAULT 1,
  	"next_retry_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "comments" ADD COLUMN "submitted_locale" "enum_comments_submitted_locale" DEFAULT 'pl';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "comment_translations_id" integer;
  ALTER TABLE "comment_translations" ADD CONSTRAINT "comment_translations_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "comment_translations_comment_idx" ON "comment_translations" USING btree ("comment_id");
  CREATE INDEX "comment_translations_locale_idx" ON "comment_translations" USING btree ("locale");
  CREATE INDEX "comment_translations_status_idx" ON "comment_translations" USING btree ("status");
  CREATE INDEX "comment_translations_source_hash_idx" ON "comment_translations" USING btree ("source_hash");
  CREATE INDEX "comment_translations_updated_at_idx" ON "comment_translations" USING btree ("updated_at");
  CREATE INDEX "comment_translations_created_at_idx" ON "comment_translations" USING btree ("created_at");
  CREATE UNIQUE INDEX "comment_locale_idx" ON "comment_translations" USING btree ("comment_id","locale");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comment_translations_fk" FOREIGN KEY ("comment_translations_id") REFERENCES "public"."comment_translations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_comment_translations_id_idx" ON "payload_locked_documents_rels" USING btree ("comment_translations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "comment_translations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "comment_translations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_comment_translations_fk";
  
  DROP INDEX "payload_locked_documents_rels_comment_translations_id_idx";
  ALTER TABLE "comments" DROP COLUMN "submitted_locale";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "comment_translations_id";
  DROP TYPE "public"."enum_comments_submitted_locale";
  DROP TYPE "public"."enum_comment_translations_locale";
  DROP TYPE "public"."enum_comment_translations_status";`)
}
