import type { FoldersRepository } from './folders.repository';
import { isNil } from '../shared/utils';
import {
  createFolderCircularNestingError,
  createFolderNotFoundError,
  createFolderParentNotInOrganizationError,
} from './folders.errors';

// ---------------------------------------------------------------------------
// Public use-cases
// ---------------------------------------------------------------------------

export async function getFolderOrThrow({
  folderId,
  organizationId,
  foldersRepository,
}: {
  folderId: string;
  organizationId: string;
  foldersRepository: FoldersRepository;
}) {
  const { folder } = await foldersRepository.getFolderById({ folderId, organizationId });

  if (isNil(folder)) {
    throw createFolderNotFoundError();
  }

  return { folder };
}

export async function createFolder({
  name,
  organizationId,
  parentFolderId = null,
  color = null,
  createdBy,
  foldersRepository,
}: {
  name: string;
  organizationId: string;
  parentFolderId?: string | null;
  color?: string | null;
  createdBy?: string | null;
  foldersRepository: FoldersRepository;
}) {
  // Verify the parent belongs to the same org (prevents cross-org folder adoption)
  if (!isNil(parentFolderId)) {
    await ensureParentFolderBelongsToOrganization({ parentFolderId, organizationId, foldersRepository });
  }

  const { folder } = await foldersRepository.createFolder({
    name,
    organizationId,
    parentFolderId,
    color,
    createdBy,
  });

  return { folder };
}

export async function renameFolder({
  folderId,
  organizationId,
  name,
  foldersRepository,
}: {
  folderId: string;
  organizationId: string;
  name: string;
  foldersRepository: FoldersRepository;
}) {
  // IDOR protection: verify folder belongs to this org before any mutation
  await getFolderOrThrow({ folderId, organizationId, foldersRepository });

  const { folder } = await foldersRepository.updateFolderName({ folderId, organizationId, name });

  return { folder };
}

export async function updateFolderColor({
  folderId,
  organizationId,
  color,
  foldersRepository,
}: {
  folderId: string;
  organizationId: string;
  color: string | null;
  foldersRepository: FoldersRepository;
}) {
  await getFolderOrThrow({ folderId, organizationId, foldersRepository });

  const { folder } = await foldersRepository.updateFolderColor({ folderId, organizationId, color });

  return { folder };
}

export async function moveFolder({
  folderId,
  organizationId,
  parentFolderId,
  foldersRepository,
}: {
  folderId: string;
  organizationId: string;
  parentFolderId: string | null;
  foldersRepository: FoldersRepository;
}) {
  // IDOR protection: verify the folder to move belongs to this org
  await getFolderOrThrow({ folderId, organizationId, foldersRepository });

  if (!isNil(parentFolderId)) {
    // Verify the new parent is in the same org (prevents cross-org reparenting)
    await ensureParentFolderBelongsToOrganization({ parentFolderId, organizationId, foldersRepository });

    // Guard against circular nesting (e.g. moving a parent into one of its own descendants)
    const { wouldCycle } = await checkForCircularNesting({
      folderId,
      proposedParentId: parentFolderId,
      organizationId,
      foldersRepository,
    });

    if (wouldCycle) {
      throw createFolderCircularNestingError();
    }
  }

  const { folder } = await foldersRepository.updateFolderParent({ folderId, organizationId, parentFolderId });

  return { folder };
}

export async function deleteFolder({
  folderId,
  organizationId,
  userId,
  foldersRepository,
}: {
  folderId: string;
  organizationId: string;
  userId: string;
  foldersRepository: FoldersRepository;
}) {
  // IDOR protection: verify folder belongs to this org before deletion
  await getFolderOrThrow({ folderId, organizationId, foldersRepository });

  // Recursively soft-deletes all documents in this folder tree, then deletes all subfolders and the folder itself.
  await foldersRepository.deleteFolderCascade({ folderId, organizationId, userId });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function ensureParentFolderBelongsToOrganization({
  parentFolderId,
  organizationId,
  foldersRepository,
}: {
  parentFolderId: string;
  organizationId: string;
  foldersRepository: FoldersRepository;
}) {
  const { folder: parentFolder } = await foldersRepository.getFolderById({
    folderId: parentFolderId,
    organizationId,
  });

  if (isNil(parentFolder)) {
    throw createFolderParentNotInOrganizationError();
  }

  return { parentFolder };
}

/**
 * Walks up the ancestor chain from `proposedParentId`, checking at each step
 * whether `folderId` appears — which would indicate a circular nesting.
 *
 * Uses an iterative approach to avoid stack overflow on deeply nested trees.
 * Stops as soon as a cycle is detected or the root is reached.
 */
async function checkForCircularNesting({
  folderId,
  proposedParentId,
  organizationId,
  foldersRepository,
}: {
  folderId: string;
  proposedParentId: string | null;
  organizationId: string;
  foldersRepository: FoldersRepository;
}): Promise<{ wouldCycle: boolean }> {
  let currentId: string | null = proposedParentId;

  while (!isNil(currentId)) {
    if (currentId === folderId) {
      return { wouldCycle: true };
    }

    const { folder: current } = await foldersRepository.getFolderById({
      folderId: currentId,
      organizationId,
    });

    if (isNil(current)) {
      // Ancestor not found — chain is broken (shouldn't happen in consistent data)
      return { wouldCycle: false };
    }

    currentId = current.parentFolderId;
  }

  return { wouldCycle: false };
}
