import type { ColumnDef } from '@tanstack/solid-table';
import type { Accessor, Component, Setter } from 'solid-js';
import type { Document } from '../documents.types';
import type { Pagination } from '@/modules/shared/pagination/pagination.types';
import type { Tag } from '@/modules/tags/tags.types';
import { formatBytes } from '@corentinth/chisels';
import { A } from '@solidjs/router';
import {
  createSolidTable,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
} from '@tanstack/solid-table';
import { For, Match, Show, Switch } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagsList } from '@/modules/tags/components/tag-list.component';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/modules/ui/components/table';
import { getDocumentIcon, getDocumentNameExtension, getDocumentNameWithoutExtension } from '../document.models';
import { DocumentManagementDropdown } from './document-management-dropdown.component';
import { Checkbox, CheckboxControl } from '@/modules/ui/components/checkbox';
import { MoveDocumentDialog } from './move-document-dialog.component';
import { createSignal } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { deleteDocument } from '../documents.services';
import { invalidateOrganizationDocumentsQuery } from '../documents.composables';
import { createToast } from '@/modules/ui/components/sonner';

export const createdAtColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.created')}</span>;
  },
  accessorKey: 'createdAt',
  cell: data => <RelativeTime class="text-muted-foreground hidden sm:block" date={data.getValue<Date>()} />,
};

export const deletedAtColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.deleted')}</span>;
  },
  accessorKey: 'deletedAt',
  cell: data => <RelativeTime class="text-muted-foreground hidden sm:block" date={data.getValue<Date>()} />,
};

export const standardActionsColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="block text-right">{t('documents.list.table.headers.actions')}</span>;
  },
  id: 'actions',
  cell: data => (
    <div class="flex items-center justify-end">
      <DocumentManagementDropdown document={data.row.original} />
    </div>
  ),
};

export const tagsColumn: ColumnDef<Document> = {
  header: () => {
    const { t } = useI18n();
    return <span class="hidden sm:block">{t('documents.list.table.headers.tags')}</span>;
  },
  accessorKey: 'tags',
  cell: data => (
    <DocumentTagsList
      tags={data.getValue<Tag[]>()}
      tagClass="text-xs text-muted-foreground"
      triggerClass="size-6"
      documentId={data.row.original.id}
      organizationId={data.row.original.organizationId}
      asLink
    />
  ),
};

/**
 * Creates a folder column that shows the folder name badge.
 * Accepts a getter for the folder map so it stays reactive.
 */
export function createFolderColumn(getFolderName: (folderId: string) => string | null): ColumnDef<Document> {
  return {
    header: () => <span class="hidden md:block text-muted-foreground">Folder</span>,
    id: 'folder',
    cell: (data) => {
      const folderId = data.row.original.folderId;
      if (!folderId) {
        return null;
      }
      const name = getFolderName(folderId);
      if (!name) {
        return null;
      }
      return (
        <div class="hidden md:flex items-center">
          <a
            href={`?folder=${encodeURIComponent(folderId)}`}
            class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-muted/60 rounded px-1.5 py-0.5 max-w-28 truncate"
            title={name}
          >
            <div class="i-tabler-folder size-3 shrink-0" />
            <span class="truncate">{name}</span>
          </a>
        </div>
      );
    },
  };
}

export const DocumentsPaginatedList: Component<{
  documents: Document[];
  documentsCount: number;
  getPagination?: Accessor<Pagination>;
  setPagination?: Setter<Pagination>;
  extraColumns?: ColumnDef<Document>[];
  showPagination?: boolean;
}> = (props) => {
  const { t } = useI18n();
  const { confirm } = useConfirmModal();

  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set());
  const [isMoveOpen, setIsMoveOpen] = createSignal(false);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(props.documents.map(d => d.id)));
    } else {
      setSelectedIds(new Set<string>());
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds());
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const allSelected = () => props.documents.length > 0 && selectedIds().size === props.documents.length;
  const someSelected = () => selectedIds().size > 0 && selectedIds().size < props.documents.length;

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds());
    if (ids.length === 0) return;
    
    const orgId = props.documents[0]?.organizationId;
    if (!orgId) return;

    const isConfirmed = await confirm({
      title: 'Delete documents',
      message: `Are you sure you want to delete ${ids.length} documents?`,
      confirmButton: { text: 'Delete', variant: 'destructive' },
      cancelButton: { text: 'Cancel' },
    });

    if (!isConfirmed) return;

    await Promise.all(ids.map(id => deleteDocument({ documentId: id, organizationId: orgId })));
    
    createToast({ type: 'success', message: `${ids.length} documents deleted` });
    invalidateOrganizationDocumentsQuery({ organizationId: orgId });
    setSelectedIds(new Set<string>());
  };

  const selectionColumn: ColumnDef<Document> = {
    id: 'select',
    header: () => (
      <Checkbox
        checked={allSelected()}
        onChange={handleSelectAll}
      >
        <CheckboxControl class="mt-1" />
      </Checkbox>
    ),
    cell: (data) => (
      <Checkbox
        class={cn("transition-opacity", selectedIds().has(data.row.original.id) ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
        checked={selectedIds().has(data.row.original.id)}
        onChange={(checked) => handleSelect(data.row.original.id, checked)}
      >
        <CheckboxControl />
      </Checkbox>
    ),
  };

  const table = createSolidTable({
    get data() {
      return props.documents ?? [];
    },
    columns: [
      selectionColumn,
      {
        header: () => t('documents.list.table.headers.file-name'),
        id: 'fileName',
        cell: data => (
          <div class="overflow-hidden flex gap-4 items-center">
            <div class="bg-muted flex items-center justify-center p-2 rounded-lg">
              <div
                class={cn(
                  getDocumentIcon({ document: data.row.original }),
                  'size-6 text-primary',
                )}
              />
            </div>

            <div class="flex-1 flex flex-col gap-1 truncate">
              <A
                href={`/organizations/${data.row.original.organizationId}/documents/${data.row.original.id}`}
                class="font-bold truncate block hover:underline"
              >
                {getDocumentNameWithoutExtension({
                  name: data.row.original.name,
                })}
              </A>

              <div class="text-xs text-muted-foreground lh-tight">
                {[
                  formatBytes({ bytes: data.row.original.originalSize, base: 1000 }),
                  getDocumentNameExtension({ name: data.row.original.name }),
                  data.row.original.createdByName
                ].filter(Boolean).join(' · ')}
                {' '}
                ·
                {' '}
                <RelativeTime date={data.row.original.createdAt} />
              </div>
            </div>
          </div>
        ),
      },
      ...(props.extraColumns ?? []),
    ],
    get rowCount() {
      return props.documentsCount;
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: props.setPagination,
    state: {
      get pagination() {
        return props.getPagination?.();
      },
    },
    manualPagination: true,
  });

  return (
    <div>
      <Switch>
        <Match when={props.documentsCount > 0}>
          <Table>
            <TableHeader>
              <For each={table.getHeaderGroups()}>
                {headerGroup => (
                  <TableRow>
                    <For each={headerGroup.headers}>
                      {(header) => {
                        return (
                          <TableHead>
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                          </TableHead>
                        );
                      }}
                    </For>
                  </TableRow>
                )}
              </For>
            </TableHeader>

            <TableBody>
              <Show when={table.getRowModel().rows?.length}>
                <For each={table.getRowModel().rows}>
                  {row => (
                    <TableRow class="group transition-colors" data-state={selectedIds().has(row.original.id) && 'selected'}>
                      <For each={row.getVisibleCells()}>
                        {cell => (
                          <TableCell>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        )}
                      </For>
                    </TableRow>
                  )}
                </For>
              </Show>
            </TableBody>
          </Table>

          <Show when={props.showPagination ?? true}>
            <div class="flex flex-col-reverse items-center gap-4 sm:flex-row sm:justify-end mt-4">
              <div class="flex items-center space-x-2">
                <p class="whitespace-nowrap text-sm font-medium">
                  {t('common.tables.rows-per-page')}
                </p>
                <Select
                  value={table.getState().pagination.pageSize}
                  onChange={value => value && table.setPageSize(value)}
                  options={[15, 50, 100]}
                  itemComponent={props => (
                    <SelectItem item={props.item}>
                      {props.item.rawValue}
                    </SelectItem>
                  )}
                >
                  <SelectTrigger class="h-8 w-[4.5rem]">
                    <SelectValue<string>>
                      {state => state.selectedOption()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div class="flex items-center justify-center whitespace-nowrap text-sm font-medium">
                {t('common.tables.pagination-info', {
                  currentPage: table.getState().pagination.pageIndex + 1,
                  totalPages: table.getPageCount(),
                })}
              </div>
              <div class="flex items-center space-x-2">
                <Button
                  aria-label="Go to first page"
                  variant="outline"
                  class="flex size-8 p-0"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <div class="size-4 i-tabler-chevrons-left" />
                </Button>
                <Button
                  aria-label="Go to previous page"
                  variant="outline"
                  size="icon"
                  class="size-8"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <div class="size-4 i-tabler-chevron-left" />
                </Button>
                <Button
                  aria-label="Go to next page"
                  variant="outline"
                  size="icon"
                  class="size-8"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <div class="size-4 i-tabler-chevron-right" />
                </Button>
                <Button
                  aria-label="Go to last page"
                  variant="outline"
                  size="icon"
                  class="flex size-8"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  <div class="size-4 i-tabler-chevrons-right" />
                </Button>
              </div>
            </div>
          </Show>
        </Match>
      </Switch>

      <Show when={selectedIds().size > 0}>
        <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-full px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-5">
          <span class="text-sm font-medium pr-2 border-r">{selectedIds().size} selected</span>
          <Button variant="ghost" size="sm" onClick={() => setIsMoveOpen(true)} class="h-8">
            <div class="i-tabler-folder-share size-4 mr-2" />
            Move
          </Button>
          <Button variant="ghost" size="sm" onClick={handleBulkDelete} class="h-8 text-destructive hover:text-destructive">
            <div class="i-tabler-trash size-4 mr-2" />
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set<string>())} class="h-8">
            <div class="i-tabler-x size-4 mr-2" />
            Clear
          </Button>
        </div>
      </Show>
      
      <MoveDocumentDialog
        open={isMoveOpen()}
        onOpenChange={setIsMoveOpen}
        documentIds={Array.from(selectedIds())}
        organizationId={props.documents[0]?.organizationId ?? ''}
        onSuccess={() => setSelectedIds(new Set<string>())}
      />
    </div>
  );
};
