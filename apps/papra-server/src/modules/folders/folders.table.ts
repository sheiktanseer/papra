import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { organizationsTable } from '../organizations/organizations.table';
import { createPrimaryKeyField, createTimestampColumns } from '../shared/db/columns.helpers';
import { generateId } from '../shared/random/ids';
import { usersTable } from '../users/users.table';
import { FOLDER_ID_PREFIX } from './folders.constants';

export function generateFolderId() {
  return generateId({ prefix: FOLDER_ID_PREFIX });
}

export const foldersTable = sqliteTable(
  'folders',
  {
    ...createPrimaryKeyField({ idGenerator: generateFolderId }),
    ...createTimestampColumns(),

    name: text('name').notNull(),
    color: text('color'),

    organizationId: text('organization_id')
      .notNull()
      .references(() => organizationsTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // Self-referential FK for nesting. ON DELETE SET NULL so deleting a parent does not
    // cascade-delete its children — children become top-level (parentFolderId = null).
    parentFolderId: text('parent_folder_id')
      .references((): AnySQLiteColumn => foldersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    createdBy: text('created_by')
      .references(() => usersTable.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  },
  table => [
    // To list/filter all folders belonging to an organization
    index('folders_organization_id_index').on(table.organizationId),
    // To efficiently resolve children of a given folder
    index('folders_parent_folder_id_index').on(table.parentFolderId),
    // Compound index for org + parent lookups (listing folder's direct children)
    index('folders_organization_id_parent_folder_id_index').on(table.organizationId, table.parentFolderId),
  ],
);
