import type { foldersTable } from './folders.table';

export type Folder = typeof foldersTable.$inferSelect;
export type InsertableFolder = typeof foldersTable.$inferInsert;
