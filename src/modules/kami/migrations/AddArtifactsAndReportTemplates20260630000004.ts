import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class AddArtifactsAndReportTemplates20260630000004 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "kami_artifact" (
        "id" text not null,
        "session_id" text not null,
        "type" text not null default 'report',
        "title" text null,
        "schema_version" text not null default '1.0',
        "payload" jsonb not null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_artifact_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_artifact_session_id" on "kami_artifact" ("session_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_artifact_type" on "kami_artifact" ("type");`
    )

    this.addSql(`
      create table if not exists "kami_report_template" (
        "id" text not null,
        "name" text not null,
        "title" text not null,
        "description" text null,
        "prompt" text not null,
        "required_tools" jsonb null,
        "artifact_schema" jsonb null,
        "category" text not null default 'general',
        "disabled" boolean not null default false,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_report_template_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create unique index if not exists "IDX_kami_report_template_name" on "kami_report_template" ("name");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_report_template_disabled" on "kami_report_template" ("disabled");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_report_template_category" on "kami_report_template" ("category");`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "kami_report_template";`)
    this.addSql(`drop table if exists "kami_artifact";`)
  }
}
