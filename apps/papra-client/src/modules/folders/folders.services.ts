import type { AsDto } from '../shared/http/http-client.types';
import type { Document } from '../documents/documents.types';
import type { Folder } from './folders.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

export async function fetchFolders({ organizationId }: { organizationId: string }) {
  const { folders } = await apiClient<{ folders: AsDto<Folder>[] }>({
    method: 'GET',
    path: `/api/organizations/${organizationId}/folders`,
  });

  return {
    folders: folders.map(coerceDates),
  };
}

export async function createFolder({
  organizationId,
  name,
  parentFolderId,
  color,
}: {
  organizationId: string;
  name: string;
  parentFolderId?: string | null;
  color?: string | null;
}) {
  const { folder } = await apiClient<{ folder: AsDto<Folder> }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/folders`,
    body: { name, parentFolderId: parentFolderId ?? null, color: color ?? null },
  });

  return { folder: coerceDates(folder) };
}

export async function updateFolder({
  organizationId,
  folderId,
  name,
  color,
}: {
  organizationId: string;
  folderId: string;
  name?: string;
  color?: string | null;
}) {
  const body: Record<string, any> = {};
  if (name !== undefined) body.name = name;
  if (color !== undefined) body.color = color;

  const { folder } = await apiClient<{ folder: AsDto<Folder> }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/folders/${folderId}`,
    body,
  });

  return { folder: coerceDates(folder) };
}

export async function moveFolder({
  organizationId,
  folderId,
  parentFolderId,
}: {
  organizationId: string;
  folderId: string;
  parentFolderId: string | null;
}) {
  const { folder } = await apiClient<{ folder: AsDto<Folder> }>({
    method: 'POST',
    path: `/api/organizations/${organizationId}/folders/${folderId}/move`,
    body: { parentFolderId },
  });

  return { folder: coerceDates(folder) };
}

export async function deleteFolder({
  organizationId,
  folderId,
}: {
  organizationId: string;
  folderId: string;
}) {
  await apiClient({
    method: 'DELETE',
    path: `/api/organizations/${organizationId}/folders/${folderId}`,
  });
}

export async function assignDocumentToFolder({
  organizationId,
  documentId,
  folderId,
}: {
  organizationId: string;
  documentId: string;
  folderId: string | null;
}) {
  const { document } = await apiClient<{ document: AsDto<Document> }>({
    method: 'PATCH',
    path: `/api/organizations/${organizationId}/documents/${documentId}/folder`,
    body: { folderId },
  });

  return { document: coerceDates(document) };
}
