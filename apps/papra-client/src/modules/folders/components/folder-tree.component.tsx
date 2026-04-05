import type { Component } from 'solid-js';
import type { FolderTreeNode } from '../folders.types';
import { createSignal, For, Show } from 'solid-js';
import { useCurrentUserRole } from '@/modules/organizations/organizations.composables';
import { useSearchParams } from '@solidjs/router';
import { useMutation, useQueryClient } from '@tanstack/solid-query';
import { cn } from '@/modules/shared/style/cn';
import { useConfirmModal } from '@/modules/shared/confirm';
import { Button } from '@/modules/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/modules/ui/components/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/modules/ui/components/tooltip';
import { deleteFolder, updateFolder } from '../folders.services';
import { CreateFolderDialog } from './create-folder-dialog.component';

// ── Single folder node (recursive) ──────────────────────────────────────────

const FolderNode: Component<{
  node: FolderTreeNode;
  organizationId: string;
  activeFolderId: string | null;
  onSelect: (folderId: string | null) => void;
}> = (props) => {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const [isExpanded, setIsExpanded] = createSignal(true);
  const [isCreateOpen, setIsCreateOpen] = createSignal(false);
  const [isRenameOpen, setIsRenameOpen] = createSignal(false);
  const { getIsAtLeastAdmin } = useCurrentUserRole({ organizationId: props.organizationId });

  const isActive = () => props.activeFolderId === props.node.id;
  const hasChildren = () => props.node.children.length > 0;

  const deleteMutation = useMutation(() => ({
    mutationFn: () => deleteFolder({ organizationId: props.organizationId, folderId: props.node.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['organizations', props.organizationId, 'folders'],
      });
      // If the active folder was deleted, reset to root
      if (isActive()) {
        props.onSelect(null);
      }
    },
  }));

  const handleDelete = async () => {
    const isConfirmed = await confirm({
      title: 'Delete folder?',
      message: (
        <>
          Are you sure you want to delete <span class="font-bold">{props.node.name}</span>? 
          Documents inside will be moved to the parent folder or All Documents. This cannot be undone.
        </>
      ),
      confirmButton: {
        text: 'Delete',
        variant: 'destructive',
      },
      cancelButton: {
        text: 'Cancel',
      },
    });

    if (isConfirmed) {
      deleteMutation.mutate();
    }
  };

  return (
    <div class="select-none">
      {/* Row */}
      <div
        class={cn(
          'group flex items-center gap-1 rounded-md px-2 py-1 text-sm cursor-pointer transition-colors',
          isActive()
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        onClick={() => props.onSelect(props.node.id)}
        style={{
          color: props.node.color ? props.node.color : undefined,
          'background-color': props.node.color
            ? isActive()
              ? `${props.node.color}40`
              : `${props.node.color}18`
            : undefined,
          'border-left': isActive() && props.node.color
            ? `2px solid ${props.node.color}`
            : undefined,
        }}
      >
        {/* Expand/collapse toggle */}
        <button
          class={cn(
            'size-4 flex items-center justify-center shrink-0 rounded transition-transform text-inherit',
            !hasChildren() && 'invisible',
          )}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(v => !v);
          }}
          aria-label={isExpanded() ? 'Collapse' : 'Expand'}
        >
          <div class={cn('i-tabler-chevron-right size-3.5 transition-transform', isExpanded() && 'rotate-90')} />
        </button>

        {/* Folder icon */}
        <div class={cn(
          'size-4 shrink-0 transition-colors',
          isActive() ? 'i-tabler-folder-open' : 'i-tabler-folder',
          (!props.node.color && isActive()) ? 'text-primary' : '',
          (!props.node.color && !isActive()) ? 'text-muted-foreground/70' : '',
        )}
        style={props.node.color ? { color: props.node.color } : undefined}
        />

        {/* Name */}
        <span class="flex-1 truncate">{props.node.name}</span>

        {/* Count Badge */}
        <Show when={props.node.documentCount && props.node.documentCount > 0}>
          <span 
            class={cn(
              "ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium min-w-[20px] text-center shrink-0",
              !props.node.color && "bg-primary/20 text-primary"
            )}
            style={props.node.color ? {
              "background-color": `${props.node.color}33`,
              "color": props.node.color,
            } : undefined}
          >
            {props.node.documentCount}
          </span>
        </Show>

        {/* Action bar (visible on hover) */}
        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Show when={getIsAtLeastAdmin()}>
            {/* Create subfolder */}
            <button
              class="size-5 flex items-center justify-center rounded hover:bg-primary/10 hover:text-primary text-muted-foreground/50"
              onClick={(e) => {
                e.stopPropagation();
                setIsCreateOpen(true);
              }}
              title="New subfolder"
            >
              <div class="i-tabler-folder-plus size-3.5" />
            </button>

            {/* ... menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                as="button"
                class="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground/50 hover:text-foreground"
                onClick={(e: MouseEvent) => e.stopPropagation()}
              >
                <div class="i-tabler-dots size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  class="cursor-pointer gap-2 text-sm"
                  onSelect={() => setIsRenameOpen(true)}
                >
                  <div class="i-tabler-pencil size-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  class="cursor-pointer gap-2 text-sm text-destructive focus:text-destructive"
                  onSelect={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <div class="i-tabler-trash size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Show>
        </div>
      </div>

      {/* Children */}
      <Show when={isExpanded() && hasChildren()}>
        <div class="ml-4 border-l border-border/50 pl-1 mt-0.5 flex flex-col gap-0.5">
          <For each={props.node.children}>
            {child => (
              <FolderNode
                node={child}
                organizationId={props.organizationId}
                activeFolderId={props.activeFolderId}
                onSelect={props.onSelect}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Create subfolder dialog */}
      <CreateFolderDialog
        open={isCreateOpen()}
        onOpenChange={setIsCreateOpen}
        organizationId={props.organizationId}
        parentFolderId={props.node.id}
      />

      {/* Rename dialog */}
      <Show when={isRenameOpen()}>
        <RenameFolderDialog
          open={isRenameOpen()}
          onOpenChange={setIsRenameOpen}
          organizationId={props.organizationId}
          folderId={props.node.id}
          currentName={props.node.name}
          currentColor={props.node.color ?? null}
        />
      </Show>
    </div>
  );
};

// ── Inline rename dialog ─────────────────────────────────────────────────────

const RenameFolderDialog: Component<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  folderId: string;
  currentName: string;
  currentColor: string | null;
}> = (props) => {
  const queryClient = useQueryClient();

  const handleSubmit = async (data: { name: string; color: string | null }) => {
    await updateFolder({
      organizationId: props.organizationId,
      folderId: props.folderId,
      name: data.name,
      color: data.color,
    });
    queryClient.invalidateQueries({
      queryKey: ['organizations', props.organizationId, 'folders'],
    });
  };

  return (
    <CreateFolderDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      organizationId={props.organizationId}
      parentFolderId={null}
      title="Edit Folder"
      submitLabel="Save"
      initialName={props.currentName}
      initialColor={props.currentColor}
      onSubmit={handleSubmit}
    />
  );
};

// ── Root folder tree ─────────────────────────────────────────────────────────

export const FolderTree: Component<{
  nodes: FolderTreeNode[];
  organizationId: string;
}> = (props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isCreateRootOpen, setIsCreateRootOpen] = createSignal(false);
  const { getIsAtLeastAdmin } = useCurrentUserRole({ organizationId: props.organizationId });

  const activeFolderRaw = () => searchParams.folder as string | undefined;

  const handleSelect = (folderId: string | null) => {
    setSearchParams({ folder: folderId ?? undefined }, { replace: true });
  };

  return (
    <div class="flex flex-col gap-0.5">
      {/* Section header */}
      <div class="flex items-center justify-between px-1 py-1 mb-1">
        <span class="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider pl-1">Folders</span>
        <Show when={getIsAtLeastAdmin()}>
          <Tooltip>
            <TooltipTrigger as="div">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setIsCreateRootOpen(true)}
              >
                <div class="i-tabler-folder-plus size-3.5" />
                New
              </Button>
            </TooltipTrigger>
            <TooltipContent>New root folder</TooltipContent>
          </Tooltip>
        </Show>
      </div>

      {/* All Documents (root) item */}
      <button
        class={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm w-full text-left transition-colors',
          activeFolderRaw() === undefined
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        onClick={() => handleSelect(null)}
      >
        <div class="i-tabler-files size-4 shrink-0" />
        <span>All Documents</span>
      </button>

      {/* Root (Unfoldered) item */}
      <button
        class={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm w-full text-left transition-colors mb-2',
          activeFolderRaw() === 'root'
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        onClick={() => handleSelect('root')}
      >
        <div class="i-tabler-folder size-4 shrink-0" />
        <span>Root</span>
      </button>

      {/* Folder tree */}
      <div class="flex flex-col gap-0.5 mt-1">
        <For each={props.nodes}>
          {node => (
            <FolderNode
              node={node}
              organizationId={props.organizationId}
              activeFolderId={activeFolderRaw() ?? null}
              onSelect={handleSelect}
            />
          )}
        </For>

        <Show when={props.nodes.length === 0}>
          <p class="text-xs text-muted-foreground/50 italic px-2 py-1">No folders yet</p>
        </Show>
      </div>

      <CreateFolderDialog
        open={isCreateRootOpen()}
        onOpenChange={setIsCreateRootOpen}
        organizationId={props.organizationId}
        parentFolderId={null}
      />
    </div>
  );
};
