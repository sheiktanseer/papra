import type { Migration } from '../migrations.types';
import { sql } from 'drizzle-orm';

export const foldersColorMigration = {
  name: 'folder-color',

  up: async ({ db }) => {
    const tableInfo = await db.run(sql`PRAGMA table_info(folders)`);
    const existingColumns = tableInfo.rows.map(row => row.name);
    const hasColumn = (columnName: string) => existingColumns.includes(columnName);

    if (!hasColumn('color')) {
      await db.run(sql`
        ALTER TABLE "folders" ADD COLUMN "color" text
      `);
    }
  },

  down: async () => {
    // SQLite does not support DROP COLUMN on columns with foreign key constraints
    // in older versions. Leaving as a no-op comment for documentation.
    // ALTER TABLE "folders" DROP COLUMN "color";
  },
} satisfies Migration;
