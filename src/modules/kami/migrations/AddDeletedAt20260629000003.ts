import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class AddDeletedAt20260629000003 extends Migration {
  async up(): Promise<void> {
    for (const table of [
      "kami_session",
      "kami_message",
      "kami_skill",
      "kami_memory",
      "kami_job",
      "kami_audit_log",
      "kami_approval",
    ]) {
      this.addSql(
        `alter table "${table}" add column if not exists "deleted_at" timestamptz null;`
      )
    }
  }

  async down(): Promise<void> {
    for (const table of [
      "kami_approval",
      "kami_audit_log",
      "kami_job",
      "kami_memory",
      "kami_skill",
      "kami_message",
      "kami_session",
    ]) {
      this.addSql(
        `alter table "${table}" drop column if exists "deleted_at";`
      )
    }
  }
}

