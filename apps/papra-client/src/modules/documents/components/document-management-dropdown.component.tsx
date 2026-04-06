import type { DropdownMenuSubTriggerProps } from '@kobalte/core/dropdown-menu';
import type { Component } from 'solid-js';
import type { Document } from '../documents.types';
import { A } from '@solidjs/router';
import { Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/modules/ui/components/dropdown-menu';
import { getDocumentOpenWithApps } from '../document.models';
import { useDeleteDocument } from '../documents.composables';
import { DocumentOpenWithDropdownItems } from './open-with.component';
import { useCurrentUserRole } from '@/modules/organizations/organizations.composables';
import { useSession } from '@/modules/auth/composables/use-session.composable';
import { useRenameDocumentDialog } from './rename-document-button.component';
import { MoveDocumentDialog } from './move-document-dialog.component';
import { createSignal } from 'solid-js';

export const DocumentManagementDropdown: Component<{ document: Document }> = (props) => {
  const [isMoveOpen, setIsMoveOpen] = createSignal(false);
  const { deleteDocument } = useDeleteDocument();
  const { openRenameDialog } = useRenameDocumentDialog();
  const { t } = useI18n();
  const { getIsAtLeastAdmin } = useCurrentUserRole({ organizationId: props.document.organizationId });
  const { getUser } = useSession();

  const deleteDoc = () => deleteDocument({
    documentId: props.document.id,
    organizationId: props.document.organizationId,
    documentName: props.document.name,
  });

  const getOpenWithApps = () => getDocumentOpenWithApps({ document: props.document });

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger
        as={(props: DropdownMenuSubTriggerProps) => (
          <Button variant="ghost" size="icon" {...props}>
            <div class="i-tabler-dots-vertical size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent class="w-48">
        <DropdownMenuItem
          class="cursor-pointer "
          as={A}
          href={`/organizations/${props.document.organizationId}/documents/${props.document.id}`}
        >
          <div class="i-tabler-info-circle size-4 mr-2" />
          <span>Document details</span>
        </DropdownMenuItem>

        <Show when={getOpenWithApps().length > 0}>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger class="cursor-pointer">
              <div class="i-tabler-app-window size-4 mr-2" />
              <span>{t('documents.open-with.label')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DocumentOpenWithDropdownItems apps={getOpenWithApps()} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Show>

        <DropdownMenuItem
          class="cursor-pointer"
          onSelect={() => setIsMoveOpen(true)}
        >
          <div class="i-tabler-folder-share size-4 mr-2" />
          <span>Move to folder</span>
        </DropdownMenuItem>

        <Show when={getIsAtLeastAdmin()}>
          <DropdownMenuItem
            class="cursor-pointer"
            onClick={() => openRenameDialog({
              documentId: props.document.id,
              organizationId: props.document.organizationId,
              documentName: props.document.name,
            })}
          >
            <div class="i-tabler-pencil size-4 mr-2" />
            <span>Rename document</span>
          </DropdownMenuItem>
        </Show>

        <Show when={getIsAtLeastAdmin() || props.document.createdBy === getUser()?.id}>
          <DropdownMenuItem
            class="cursor-pointer text-red"
            onClick={() => deleteDoc()}
          >
            <div class="i-tabler-trash size-4 mr-2" />
            <span>Delete document</span>
          </DropdownMenuItem>
        </Show>
      </DropdownMenuContent>
    </DropdownMenu>

      <MoveDocumentDialog
        open={isMoveOpen()}
        onOpenChange={setIsMoveOpen}
        documentId={props.document.id}
        organizationId={props.document.organizationId}
        currentFolderId={props.document.folderId}
      />
    </>
  );
};
