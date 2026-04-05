import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { documentsTable } from '../documents/documents.table';
import { foldersTable } from './folders.table';
import {
  FOLDER_CIRCULAR_NESTING_ERROR_CODE,
  FOLDER_NOT_FOUND_ERROR_CODE,
  FOLDER_PARENT_NOT_IN_ORGANIZATION_ERROR_CODE,
} from './folders.errors';
import { createFoldersRepository } from './folders.repository';
import {
  createFolder,
  deleteFolder,
  getFolderOrThrow,
  moveFolder,
  renameFolder,
} from './folders.usecases';

describe('folders usecases', () => {
  // ---------------------------------------------------------------------------
  // getFolderOrThrow
  // ---------------------------------------------------------------------------

  describe('getFolderOrThrow', () => {
    test('returns the folder when it exists in the given organization', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-1', name: 'Invoices', organizationId: 'org-1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await getFolderOrThrow({ folderId: 'fld-1', organizationId: 'org-1', foldersRepository });

      expect(folder).to.include({ id: 'fld-1', name: 'Invoices', organizationId: 'org-1' });
    });

    test('throws FOLDER_NOT_FOUND when the folder does not exist', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        getFolderOrThrow({ folderId: 'fld-missing', organizationId: 'org-1', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_NOT_FOUND_ERROR_CODE });
    });

    test('throws FOLDER_NOT_FOUND when the folder belongs to a different organization (IDOR protection)', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [{ id: 'fld-1', name: 'Invoices', organizationId: 'org-2' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        getFolderOrThrow({ folderId: 'fld-1', organizationId: 'org-1', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_NOT_FOUND_ERROR_CODE });
    });
  });

  // ---------------------------------------------------------------------------
  // createFolder
  // ---------------------------------------------------------------------------

  describe('createFolder', () => {
    test('creates a root-level folder when no parentFolderId is given', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await createFolder({
        name: 'Invoices',
        organizationId: 'org-1',
        foldersRepository,
      });

      expect(folder).to.include({ name: 'Invoices', organizationId: 'org-1', parentFolderId: null });

      const rows = await db.select().from(foldersTable);
      expect(rows.length).to.eql(1);
      expect(rows[0]).to.eql(folder);
    });

    test('creates a nested folder when a valid parentFolderId in the same org is given', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-parent', name: 'Invoices', organizationId: 'org-1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await createFolder({
        name: 'Q1 2024',
        organizationId: 'org-1',
        parentFolderId: 'fld-parent',
        foldersRepository,
      });

      expect(folder).to.include({ name: 'Q1 2024', organizationId: 'org-1', parentFolderId: 'fld-parent' });
    });

    test('rejects when parentFolderId belongs to a different organization', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [{ id: 'fld-other-org', name: 'Invoices', organizationId: 'org-2' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        createFolder({
          name: 'Q1',
          organizationId: 'org-1',
          parentFolderId: 'fld-other-org',
          foldersRepository,
        }),
      ).rejects.toMatchObject({ code: FOLDER_PARENT_NOT_IN_ORGANIZATION_ERROR_CODE });
    });

    test('records the createdBy user when provided', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        users: [{ id: 'user-1', email: 'test@example.com' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await createFolder({
        name: 'Contracts',
        organizationId: 'org-1',
        createdBy: 'user-1',
        foldersRepository,
      });

      expect(folder.createdBy).to.eql('user-1');
    });
  });

  // ---------------------------------------------------------------------------
  // renameFolder
  // ---------------------------------------------------------------------------

  describe('renameFolder', () => {
    test('renames a folder that belongs to the organization', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-1', name: 'Old Name', organizationId: 'org-1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await renameFolder({
        folderId: 'fld-1',
        organizationId: 'org-1',
        name: 'New Name',
        foldersRepository,
      });

      expect(folder.name).to.eql('New Name');
    });

    test('throws FOLDER_NOT_FOUND when trying to rename a folder from another org (IDOR protection)', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [{ id: 'fld-1', name: 'Secret Folder', organizationId: 'org-2' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        renameFolder({ folderId: 'fld-1', organizationId: 'org-1', name: 'Hacked', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_NOT_FOUND_ERROR_CODE });
    });
  });

  // ---------------------------------------------------------------------------
  // moveFolder (including cycle detection)
  // ---------------------------------------------------------------------------

  describe('moveFolder', () => {
    test('moves a folder to a new parent in the same organization', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-1', name: 'Folder A', organizationId: 'org-1' },
          { id: 'fld-2', name: 'Folder B', organizationId: 'org-1' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await moveFolder({
        folderId: 'fld-1',
        organizationId: 'org-1',
        parentFolderId: 'fld-2',
        foldersRepository,
      });

      expect(folder.parentFolderId).to.eql('fld-2');
    });

    test('moves a folder to root by passing null as the parentFolderId', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-parent', name: 'Parent', organizationId: 'org-1' },
          { id: 'fld-child', name: 'Child', organizationId: 'org-1', parentFolderId: 'fld-parent' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await moveFolder({
        folderId: 'fld-child',
        organizationId: 'org-1',
        parentFolderId: null,
        foldersRepository,
      });

      expect(folder.parentFolderId).to.eql(null);
    });

    test('throws FOLDER_NOT_FOUND when the folder to move belongs to another org (IDOR protection)', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [
          { id: 'fld-victim', name: 'Victim', organizationId: 'org-2' },
          { id: 'fld-target', name: 'Target', organizationId: 'org-1' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        moveFolder({ folderId: 'fld-victim', organizationId: 'org-1', parentFolderId: 'fld-target', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_NOT_FOUND_ERROR_CODE });
    });

    test('throws FOLDER_PARENT_NOT_IN_ORGANIZATION when the new parent belongs to another org', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [
          { id: 'fld-mine', name: 'Mine', organizationId: 'org-1' },
          { id: 'fld-other', name: 'Other Org', organizationId: 'org-2' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        moveFolder({ folderId: 'fld-mine', organizationId: 'org-1', parentFolderId: 'fld-other', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_PARENT_NOT_IN_ORGANIZATION_ERROR_CODE });
    });

    test('detects and rejects a direct self-reference (folder moved into itself)', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-1', name: 'Folder A', organizationId: 'org-1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        moveFolder({ folderId: 'fld-1', organizationId: 'org-1', parentFolderId: 'fld-1', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_CIRCULAR_NESTING_ERROR_CODE });
    });

    test('detects and rejects an indirect circular nesting (A > B > C, then moving A into C)', async () => {
      // Setup: A → B → C  (A is root, B is child of A, C is child of B)
      // Attempted: move A into C  → would create C → A → B → C  (cycle!)
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-A', name: 'A', organizationId: 'org-1', parentFolderId: null },
          { id: 'fld-B', name: 'B', organizationId: 'org-1', parentFolderId: 'fld-A' },
          { id: 'fld-C', name: 'C', organizationId: 'org-1', parentFolderId: 'fld-B' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        moveFolder({ folderId: 'fld-A', organizationId: 'org-1', parentFolderId: 'fld-C', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_CIRCULAR_NESTING_ERROR_CODE });
    });

    test('allows moving a folder to a sibling (non-circular)', async () => {
      // A → B and A → C. Moving B into C is valid (no cycle).
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-A', name: 'A', organizationId: 'org-1', parentFolderId: null },
          { id: 'fld-B', name: 'B', organizationId: 'org-1', parentFolderId: 'fld-A' },
          { id: 'fld-C', name: 'C', organizationId: 'org-1', parentFolderId: 'fld-A' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      const { folder } = await moveFolder({
        folderId: 'fld-B',
        organizationId: 'org-1',
        parentFolderId: 'fld-C',
        foldersRepository,
      });

      expect(folder.parentFolderId).to.eql('fld-C');
    });
  });

  // ---------------------------------------------------------------------------
  // deleteFolder
  // ---------------------------------------------------------------------------

  describe('deleteFolder', () => {
    test('deletes the folder record from the database', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-1', name: 'Invoices', organizationId: 'org-1' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await deleteFolder({ folderId: 'fld-1', organizationId: 'org-1', foldersRepository });

      const rows = await db.select().from(foldersTable);
      expect(rows.length).to.eql(0);
    });

    test('throws FOLDER_NOT_FOUND when trying to delete a folder from another org (IDOR protection)', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [{ id: 'fld-1', name: 'Secret', organizationId: 'org-2' }],
      });

      const foldersRepository = createFoldersRepository({ db });

      await expect(
        deleteFolder({ folderId: 'fld-1', organizationId: 'org-1', foldersRepository }),
      ).rejects.toMatchObject({ code: FOLDER_NOT_FOUND_ERROR_CODE });
    });

    test('moves direct child folders to the deleted folder\'s parent (not root) when it was a nested folder', async () => {
      // Before: grandparent → parent → [child-A, child-B]
      // Delete: parent
      // After:  grandparent → [child-A, child-B]  (promoted one level up)
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-grandparent', name: 'Grandparent', organizationId: 'org-1', parentFolderId: null },
          { id: 'fld-parent', name: 'Parent', organizationId: 'org-1', parentFolderId: 'fld-grandparent' },
          { id: 'fld-child-A', name: 'Child A', organizationId: 'org-1', parentFolderId: 'fld-parent' },
          { id: 'fld-child-B', name: 'Child B', organizationId: 'org-1', parentFolderId: 'fld-parent' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await deleteFolder({ folderId: 'fld-parent', organizationId: 'org-1', foldersRepository });

      const rows = await db.select().from(foldersTable);
      const remainingIds = rows.map(r => r.id).sort();

      expect(remainingIds).to.eql(['fld-child-A', 'fld-child-B', 'fld-grandparent'].sort());

      const childA = rows.find(r => r.id === 'fld-child-A');
      const childB = rows.find(r => r.id === 'fld-child-B');

      // Children are promoted to grandparent (the deleted folder's parent)
      expect(childA?.parentFolderId).to.eql('fld-grandparent');
      expect(childB?.parentFolderId).to.eql('fld-grandparent');
    });

    test('moves direct child folders to root (null) when a top-level folder is deleted', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [
          { id: 'fld-top', name: 'Top Level', organizationId: 'org-1', parentFolderId: null },
          { id: 'fld-child', name: 'Child', organizationId: 'org-1', parentFolderId: 'fld-top' },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await deleteFolder({ folderId: 'fld-top', organizationId: 'org-1', foldersRepository });

      const rows = await db.select().from(foldersTable);
      expect(rows.length).to.eql(1);
      expect(rows[0]).to.include({ id: 'fld-child', parentFolderId: null });
    });

    test('documents in the deleted folder are moved to root — they are NEVER deleted', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [{ id: 'org-1', name: 'Org 1' }],
        folders: [{ id: 'fld-1', name: 'Invoices', organizationId: 'org-1' }],
        documents: [
          {
            id: 'doc-1',
            organizationId: 'org-1',
            folderId: 'fld-1',
            name: 'invoice.pdf',
            originalName: 'invoice.pdf',
            mimeType: 'application/pdf',
            originalStorageKey: 'org-1/originals/doc-1.pdf',
            originalSha256Hash: 'hash-1',
          },
          {
            id: 'doc-2',
            organizationId: 'org-1',
            folderId: 'fld-1',
            name: 'receipt.pdf',
            originalName: 'receipt.pdf',
            mimeType: 'application/pdf',
            originalStorageKey: 'org-1/originals/doc-2.pdf',
            originalSha256Hash: 'hash-2',
          },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await deleteFolder({ folderId: 'fld-1', organizationId: 'org-1', foldersRepository });

      // Folder is gone
      const folderRows = await db.select().from(foldersTable);
      expect(folderRows.length).to.eql(0);

      // Documents still exist, moved to root
      const docRows = await db.select().from(documentsTable);
      expect(docRows.length).to.eql(2);
      expect(docRows.every(d => d.folderId === null)).to.eql(true);
    });

    test('documents in other orgs\' folders are not affected by the deletion', async () => {
      const { db } = await createInMemoryDatabase({
        organizations: [
          { id: 'org-1', name: 'Org 1' },
          { id: 'org-2', name: 'Org 2' },
        ],
        folders: [
          { id: 'fld-org1', name: 'Org1 Folder', organizationId: 'org-1' },
          { id: 'fld-org2', name: 'Org2 Folder', organizationId: 'org-2' },
        ],
        documents: [
          {
            id: 'doc-org2',
            organizationId: 'org-2',
            folderId: 'fld-org2',
            name: 'other-org.pdf',
            originalName: 'other-org.pdf',
            mimeType: 'application/pdf',
            originalStorageKey: 'org-2/originals/doc-org2.pdf',
            originalSha256Hash: 'hash-org2',
          },
        ],
      });

      const foldersRepository = createFoldersRepository({ db });

      await deleteFolder({ folderId: 'fld-org1', organizationId: 'org-1', foldersRepository });

      const docRows = await db.select().from(documentsTable);
      expect(docRows[0]?.folderId).to.eql('fld-org2');
    });
  });
});
