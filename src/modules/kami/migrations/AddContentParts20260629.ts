import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class AddContentParts20260629 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table "kami_message" add column if not exists "content_parts" jsonb null;`
    )
  }

  async down(): Promise<void> {
    this.addSql(
      `alter table "kami_message" drop column if exists "content_parts";`
    )
  }
}
