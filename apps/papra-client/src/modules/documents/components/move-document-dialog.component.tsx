import type { Component } from 'solid-js';
import { createSignal, Show, For } from 'solid-js';
import { useMutation, useQueryClient, useQuery } from '@tanstack/solid-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/modules/ui/components/dialog';
import { fetchFolders, assignDocumentToFolder } from '@/modules/folders/folders.services';
import { createToast } from '@/modules/ui/components/sonner';
import { invalidateOrganizationDocumentsQuery } from '../documents.composables';

export const MoveDocumentDialog: Component<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  organizationId: string;
  currentFolderId: string | null | undefined;
}> = (props) => {
  const queryClient = useQueryClient();

  const foldersQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'folders'],
    queryFn: () => fetchFolders({ organizationId: props.organizationId }),
    enabled: props.open,
  }));

  const moveMutation = useMutation(() => ({
    mutationFn: (folderId: string | null) => 
      assignDocumentToFolder({
        organizationId: props.organizationId,
        documentId: props.documentId,
        folderId,
      }),
    onSuccess: () => {
      createToast({ type: 'success', message: 'Document moved successfully' });
      invalidateOrganizationDocumentsQuery({ organizationId: props.organizationId });
      queryClient.invalidateQueries({
        queryKey: ['organizations', props.organizationId, 'documents', props.documentId],
      });
      props.onOpenChange(false);
    },
  }));

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent class="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Move to folder</DialogTitle>
          <DialogDescription>
            Select a folder to move this document to.
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 overflow-y-auto py-4 flex flex-col gap-1">
          {/* Root option */}
          <button
            class="flex items-center gap-3 w-full p-2 rounded-md hover:bg-accent transition-colors text-left"
            onClick={() => moveMutation.mutate(null)}
            disabled={moveMutation.isPending}
          >
            <div class="i-tabler-folder size-5 text-muted-foreground shrink-0" />
            <span class="flex-1 text-sm font-medium">Root (no folder)</span>
            <Show when={!props.currentFolderId}>
              <div class="i-tabler-check size-4 text-primary shrink-0" />
            </Show>
          </button>

          {/* Folders list */}
          <For each={foldersQuery.data?.folders ?? []}>
            {(folder) => (
              <button
                class="flex items-center gap-3 w-full p-2 rounded-md hover:bg-accent transition-colors text-left"
                onClick={() => moveMutation.mutate(folder.id)}
                disabled={moveMutation.isPending}
              >
                <div 
                  class="i-tabler-folder size-5 shrink-0" 
                  style={{ color: folder.color ?? 'inherit' }}
                />
                <span class="flex-1 text-sm">{folder.name}</span>
                <Show when={props.currentFolderId === folder.id}>
                  <div class="i-tabler-check size-4 text-primary shrink-0" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </DialogContent>
    </Dialog>
  );
};
