import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, eq, isNull, sql, getTableColumns } from 'drizzle-orm';
import { documentsTable } from '../documents/documents.table';
import { isNil } from '../shared/utils';
import { createFolderNotFoundError } from './folders.errors';
import { foldersTable } from './folders.table';

export type FoldersRepository = ReturnType<typeof createFoldersRepository>;

export function createFoldersRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      createFolder,
      getFolderById,
      getOrganizationFolders,
      getChildFolders,
      updateFolderName,
      updateFolderColor,
      updateFolderParent,
      deleteFolderCascade,
    },
    { db },
  );
}

async function createFolder({
  name,
  organizationId,
  parentFolderId = null,
  color = null,
  createdBy = null,
  db,
}: {
  name: string;
  organizationId: string;
  parentFolderId?: string | null;
  color?: string | null;
  createdBy?: string | null;
  db: Database;
}) {
  const [folder] = await db
    .insert(foldersTable)
    .values({ name, organizationId, parentFolderId, color, createdBy })
    .returning();

  if (isNil(folder)) {
    throw new Error('Failed to create folder');
  }

  return { folder };
}

async function getFolderById({
  folderId,
  organizationId,
  db,
}: {
  folderId: string;
  organizationId: string;
  db: Database;
}) {
  const [folder] = await db
    .select()
    .from(foldersTable)
    .where(
      and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.organizationId, organizationId),
      ),
    );

  return { folder };
}

async function getOrganizationFolders({
  organizationId,
  db,
}: {
  organizationId: string;
  db: Database;
}) {
  const folders = await db
    .select({
      ...getTableColumns(foldersTable),
      documentCount: sql<number>`count(${documentsTable.id})`.mapWith(Number),
    })
    .from(foldersTable)
    .leftJoin(documentsTable, and(eq(documentsTable.folderId, foldersTable.id), eq(documentsTable.isDeleted, false)))
    .where(eq(foldersTable.organizationId, organizationId))
    .groupBy(foldersTable.id)
    .orderBy(foldersTable.name);

  return { folders };
}

async function getChildFolders({
  parentFolderId,
  organizationId,
  db,
}: {
  parentFolderId: string | null;
  organizationId: string;
  db: Database;
}) {
  const parentFilter = isNil(parentFolderId)
    ? isNull(foldersTable.parentFolderId)
    : eq(foldersTable.parentFolderId, parentFolderId);

  const folders = await db
    .select({
      ...getTableColumns(foldersTable),
      documentCount: sql<number>`count(${documentsTable.id})`.mapWith(Number),
    })
    .from(foldersTable)
    .leftJoin(documentsTable, and(eq(documentsTable.folderId, foldersTable.id), eq(documentsTable.isDeleted, false)))
    .where(and(eq(foldersTable.organizationId, organizationId), parentFilter))
    .groupBy(foldersTable.id)
    .orderBy(foldersTable.name);

  return { folders };
}

async function updateFolderName({
  folderId,
  organizationId,
  name,
  db,
}: {
  folderId: string;
  organizationId: string;
  name: string;
  db: Database;
}) {
  const [folder] = await db
    .update(foldersTable)
    .set({ name })
    .where(
      and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.organizationId, organizationId),
      ),
    )
    .returning();

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  return { folder };
}

async function updateFolderColor({
  folderId,
  organizationId,
  color,
  db,
}: {
  folderId: string;
  organizationId: string;
  color: string | null;
  db: Database;
}) {
  const [folder] = await db
    .update(foldersTable)
    .set({ color })
    .where(
      and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.organizationId, organizationId),
      ),
    )
    .returning();

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  return { folder };
}

async function updateFolderParent({
  folderId,
  organizationId,
  parentFolderId,
  db,
}: {
  folderId: string;
  organizationId: string;
  parentFolderId: string | null;
  db: Database;
}) {
  const [folder] = await db
    .update(foldersTable)
    .set({ parentFolderId })
    .where(
      and(
        eq(foldersTable.id, folderId),
        eq(foldersTable.organizationId, organizationId),
      ),
    )
    .returning();

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  return { folder };
}

/**
 * Atomically deletes a folder and handles its dependents:
 *   1. Reparents direct child folders to the deleted folder's parent (or root if top-level).
 *   2. Moves all documents in the folder to root (folderId = null) — documents are NEVER deleted.
 *   3. Deletes the folder record itself.
 *
 * All three steps run inside a single database transaction to ensure consistency.
 */
async function deleteFolderCascade({
  folderId,
  organizationId,
  db,
}: {
  folderId: string;
  organizationId: string;
  db: Database;
}) {
  const { folder } = await getFolderById({ folderId, organizationId, db });

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  // Note: db.batch() is used here instead of db.transaction() because
  // @libsql/client in :memory: mode does not support interactive transactions.
  // db.batch() provides equivalent atomicity guarantees for LibSQL.
  await db.batch([
    // Step 1: Reparent direct child folders to the deleted folder's parent (or root)
    db
      .update(foldersTable)
      .set({ parentFolderId: folder.parentFolderId })
      .where(
        and(
          eq(foldersTable.parentFolderId, folderId),
          eq(foldersTable.organizationId, organizationId),
        ),
      ),

    // Step 2: Move documents in this folder to root (never delete them)
    db
      .update(documentsTable)
      .set({ folderId: null })
      .where(
        and(
          eq(documentsTable.folderId, folderId),
          eq(documentsTable.organizationId, organizationId),
        ),
      ),

    // Step 3: Delete the folder
    db
      .delete(foldersTable)
      .where(
        and(
          eq(foldersTable.id, folderId),
          eq(foldersTable.organizationId, organizationId),
        ),
      ),
  ]);
}
