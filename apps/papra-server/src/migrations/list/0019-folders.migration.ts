import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const foldersMigration = {
  name: 'folders',

  up: async ({ db }) => {
    await db.batch([
      // Create the folders table
      db.run(sql`
        CREATE TABLE IF NOT EXISTS "folders" (
          "id"               text    PRIMARY KEY NOT NULL,
          "created_at"       integer NOT NULL,
          "updated_at"       integer NOT NULL,
          "name"             text    NOT NULL,
          "organization_id"  text    NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "parent_folder_id" text    REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          "created_by"       text    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `),

      // Index: all folders for an organization
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "folders_organization_id_index"
        ON "folders" ("organization_id")
      `),

      // Index: direct children of a folder
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "folders_parent_folder_id_index"
        ON "folders" ("parent_folder_id")
      `),

      // Compound index: org + parent — used when listing a folder's direct children scoped to org
      db.run(sql`
        CREATE INDEX IF NOT EXISTS "folders_organization_id_parent_folder_id_index"
        ON "folders" ("organization_id", "parent_folder_id")
      `),
    ]);

    // Add folder_id column to documents (nullable, defaults to NULL = root-level)
    // Using PRAGMA + conditional ADD to be idempotent on re-run
    const tableInfo = await db.run(sql`PRAGMA table_info(documents)`);
    const existingColumns = tableInfo.rows.map(row => row.name);
    const hasColumn = (columnName: string) => existingColumns.includes(columnName);

    if (!hasColumn('folder_id')) {
      await db.run(sql`
        ALTER TABLE "documents" ADD COLUMN "folder_id" text REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE
      `);
    }

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS "documents_folder_id_index"
      ON "documents" ("folder_id")
    `);
  },

  down: async ({ db }) => {
    await db.batch([
      db.run(sql`DROP INDEX IF EXISTS "documents_folder_id_index"`),
      db.run(sql`DROP INDEX IF EXISTS "folders_organization_id_parent_folder_id_index"`),
      db.run(sql`DROP INDEX IF EXISTS "folders_parent_folder_id_index"`),
      db.run(sql`DROP INDEX IF EXISTS "folders_organization_id_index"`),
    ]);

    // SQLite does not support DROP COLUMN on columns with foreign key constraints
    // in older versions. We recreate the table without the column instead.
    // Note: In practice, rollback of this migration would require a more
    // involved table rebuild. Leaving as a no-op comment for documentation.
    // ALTER TABLE "documents" DROP COLUMN "folder_id";

    await db.run(sql`DROP TABLE IF EXISTS "folders"`);
  },
} satisfies Migration;
