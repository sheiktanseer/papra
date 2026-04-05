import type { Database } from '../app/database/database.types';
import { injectArguments } from '@corentinth/chisels';
import { and, eq, inArray, isNull, sql, getTableColumns } from 'drizzle-orm';
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
 * Atomically deletes a folder and ALL its descendants:
 *   1. Recursively collects all subfolder IDs (depth-first, deepest first).
 *   2. Soft-deletes every document in the folder tree (sets isDeleted = true).
 *   3. Deletes every folder row (deepest first, so no FK conflicts).
 *
 * Note: db.batch() is used instead of db.transaction() because
 * @libsql/client in :memory: mode does not support interactive transactions.
 * db.batch() provides equivalent atomicity guarantees for LibSQL.
 */
async function deleteFolderCascade({
  folderId,
  organizationId,
  userId,
  db,
}: {
  folderId: string;
  organizationId: string;
  userId: string;
  db: Database;
}) {
  const { folder } = await getFolderById({ folderId, organizationId, db });

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  // Fetch all folders in the org once — cheap since folder counts are always small
  const { folders } = await getOrganizationFolders({ organizationId, db });

  // Post-order DFS: collect IDs deepest-first so FK constraints are satisfied
  // when we delete them (child rows deleted before their parents).
  const allFolderIdsToProcess: string[] = [];
  const findChildren = (parentId: string) => {
    for (const f of folders) {
      if (f.parentFolderId === parentId) {
        findChildren(f.id);
      }
    }
    allFolderIdsToProcess.push(parentId);
  };
  findChildren(folderId);

  const now = new Date();

  // Build delete statements for each folder (deepest first)
  const folderDeleteQueries = allFolderIdsToProcess.map(id =>
    db
      .delete(foldersTable)
      .where(
        and(
          eq(foldersTable.id, id),
          eq(foldersTable.organizationId, organizationId),
        ),
      ),
  );

  // Step 1 (soft-delete documents) + Step 2 (delete folders deepest-first)
  await db.batch([
    db
      .update(documentsTable)
      .set({
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
      })
      .where(
        and(
          inArray(documentsTable.folderId, allFolderIdsToProcess),
          eq(documentsTable.organizationId, organizationId),
          eq(documentsTable.isDeleted, false),
        ),
      ),
    ...folderDeleteQueries,
  ]);
}
