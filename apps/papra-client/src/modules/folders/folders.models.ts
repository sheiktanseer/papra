import type { Folder, FolderTreeNode } from './folders.types';

/**
 * Converts a flat list of folders into a nested tree.
 * Root nodes have parentFolderId === null.
 * Children sorted alphabetically by name.
 */
export function buildFolderTree({ folders }: { folders: Folder[] }): FolderTreeNode[] {
  const nodeMap = new Map<string, FolderTreeNode>();

  // First pass: create all nodes with empty children arrays
  for (const folder of folders) {
    nodeMap.set(folder.id, { ...folder, children: [] });
  }

  const roots: FolderTreeNode[] = [];

  // Second pass: attach children to parents
  for (const node of nodeMap.values()) {
    if (node.parentFolderId === null) {
      roots.push(node);
    }
    else {
      const parent = nodeMap.get(node.parentFolderId);
      if (parent) {
        parent.children.push(node);
      }
      else {
        // Orphaned node (parent deleted) — treat as root
        roots.push(node);
      }
    }
  }

  // Sort each level alphabetically
  const sortNodes = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
    return nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(node => ({ ...node, children: sortNodes(node.children) }));
  };

  return sortNodes(roots);
}

/**
 * Returns the ancestor chain for a given folder, ordered from root to the
 * folder itself. Used to build the breadcrumb.
 * Returns [] if folderId is null (root).
 */
export function getFolderPath({
  folderId,
  folders,
}: {
  folderId: string | null;
  folders: Folder[];
}): Folder[] {
  if (!folderId) {
    return [];
  }

  const folderMap = new Map(folders.map(f => [f.id, f]));
  const path: Folder[] = [];
  let current: Folder | undefined = folderMap.get(folderId);

  // Walk up the parent chain (guarded against cycles)
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current);
    current = current.parentFolderId ? folderMap.get(current.parentFolderId) : undefined;
  }

  return path;
}
