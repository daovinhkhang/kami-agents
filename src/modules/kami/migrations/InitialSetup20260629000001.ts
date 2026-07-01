import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Initial KAMI schema: kami_session + kami_message.
 * Enum fields are stored as TEXT (Medusa convention).
 * JSON fields are stored as JSONB.
 * created_at / updated_at are auto-managed by Medusa.
 */
export class InitialSetup20260629000001 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table if not exists "kami_session" (
        "id" text not null,
        "title" text null,
        "source" text not null default 'admin',
        "user_id" text null,
        "parent_session_id" text null,
        "status" text not null default 'active',
        "message_count" integer not null default 0,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_session_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_session_user_id" on "kami_session" ("user_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_session_status" on "kami_session" ("status");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_session_parent" on "kami_session" ("parent_session_id");`
    )

    this.addSql(`
      create table if not exists "kami_message" (
        "id" text not null,
        "session_id" text not null,
        "role" text not null,
        "content" text null,
        "tool_calls" jsonb null,
        "tool_call_id" text null,
        "reasoning" jsonb null,
        "tokens_in" integer not null default 0,
        "tokens_out" integer not null default 0,
        "metadata" jsonb null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "deleted_at" timestamptz null,
        constraint "kami_message_pkey" primary key ("id")
      );
    `)
    this.addSql(
      `create index if not exists "IDX_kami_message_session_id" on "kami_message" ("session_id");`
    )
    this.addSql(
      `create index if not exists "IDX_kami_message_role" on "kami_message" ("role");`
    )
  }

  async down(): Promise<void> {
    this.addSql(`drop table if exists "kami_message";`)
    this.addSql(`drop table if exists "kami_session";`)
  }
}
