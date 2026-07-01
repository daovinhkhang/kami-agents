import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class PhaseOneSetup20260629000002 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "kami_skill" (
        "id" text not null,
        "name" text not null,
        "description" text null,
        "category" text null,
        "version" text not null default '0.1.0',
        "content" text not null,
        "frontmatter" jsonb null,
        "origin" text not null default 'human',
        "platforms" jsonb null,
        "disabled" boolean not null default false,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_skill_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create unique index if not exists "IDX_kami_skill_name" on "kami_skill" ("name");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_skill_disabled" on "kami_skill" ("disabled");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_skill_search" on "kami_skill" using gin (to_tsvector('simple', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce("content", '')));`
    )

    this.addSql(`
      create table if not exists "kami_memory" (
        "id" text not null,
        "user_id" text null,
        "session_id" text null,
        "type" text not null default 'factual',
        "content" text not null,
        "importance" integer not null default 1,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_memory_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_memory_user_id" on "kami_memory" ("user_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_memory_session_id" on "kami_memory" ("session_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_memory_type" on "kami_memory" ("type");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_memory_search" on "kami_memory" using gin (to_tsvector('simple', coalesce("content", '')));`
    )

    this.addSql(`
      create table if not exists "kami_job" (
        "id" text not null,
        "name" text not null,
        "prompt" text not null,
        "schedule" text not null,
        "deliver" jsonb null,
        "session_id" text null,
        "enabled" boolean not null default true,
        "next_run_at" timestamptz null,
        "last_run_at" timestamptz null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_job_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_job_enabled_next_run" on "kami_job" ("enabled", "next_run_at");`
    )

    this.addSql(`
      create table if not exists "kami_audit_log" (
        "id" text not null,
        "session_id" text null,
        "tool" text not null,
        "args" jsonb null,
        "result_summary" text null,
        "risk_level" text not null default 'safe',
        "actor" text not null default 'kami',
        "approved_by" text null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_audit_log_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_audit_session_id" on "kami_audit_log" ("session_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_audit_tool" on "kami_audit_log" ("tool");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_audit_risk_level" on "kami_audit_log" ("risk_level");`
    )

    this.addSql(`
      create table if not exists "kami_approval" (
        "id" text not null,
        "session_id" text null,
        "tool" text not null,
        "args" jsonb null,
        "status" text not null default 'pending',
        "requested_at" timestamptz null default now(),
        "decided_by" text null,
        "decided_at" timestamptz null,
        "execution_result" jsonb null,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_approval_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_approval_session_id" on "kami_approval" ("session_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_approval_status" on "kami_approval" ("status");`
    )

    this.addSql(
      `create index if not exists "IDX_kami_session_search" on "kami_session" using gin (to_tsvector('simple', coalesce("title", '')));`
    )
    this.addSql(
      `create index if not exists "IDX_kami_message_search" on "kami_message" using gin (to_tsvector('simple', coalesce("content", '')));`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "kami_approval";`)
    this.addSql(`drop table if exists "kami_audit_log";`)
    this.addSql(`drop table if exists "kami_job";`)
    this.addSql(`drop table if exists "kami_memory";`)
    this.addSql(`drop table if exists "kami_skill";`)
    this.addSql(`drop index if exists "IDX_kami_message_search";`)
    this.addSql(`drop index if exists "IDX_kami_session_search";`)
  }
}
