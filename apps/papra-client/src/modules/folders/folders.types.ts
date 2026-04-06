export type Folder = {
  id: string;
  organizationId: string;
  name: string;
  parentFolderId: string | null;
  color?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  documentCount?: number;
};

export type FolderTreeNode = Folder & {
  children: FolderTreeNode[];
};
