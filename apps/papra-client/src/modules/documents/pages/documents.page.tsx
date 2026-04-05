import type { Component } from 'solid-js';
import { useParams, useSearchParams } from '@solidjs/router';
import { keepPreviousData, useQuery } from '@tanstack/solid-query';
import { Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { createParamSynchronizedPagination } from '@/modules/shared/pagination/query-synchronized-pagination';
import { createParamSynchronizedSignal } from '@/modules/shared/signals/params';
import { cn } from '@/modules/shared/style/cn';
import { useDebounce } from '@/modules/shared/utils/timing';
import { Button } from '@/modules/ui/components/button';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { FolderBreadcrumb } from '@/modules/folders/components/folder-breadcrumb.component';
import { FolderTree } from '@/modules/folders/components/folder-tree.component';
import { buildFolderTree, getFolderPath } from '@/modules/folders/folders.models';
import { fetchFolders } from '@/modules/folders/folders.services';
import { DocumentUploadArea } from '../components/document-upload-area.component';
import { createdAtColumn, createFolderColumn, DocumentsPaginatedList, standardActionsColumn, tagsColumn } from '../components/documents-list.component';
import { fetchOrganizationDocuments } from '../documents.services';

export const DocumentsPage: Component = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const [getSearchQuery, setSearchQuery] = createParamSynchronizedSignal<string>({ paramKey: 'query', defaultValue: '' });
  const debouncedSearchQuery = useDebounce(getSearchQuery, 300);
  const [getPagination, setPagination] = createParamSynchronizedPagination();

  // Read active folder from URL — undefined means "no filter", null means "root only"
  const getActiveFolderId = () => {
    const raw = searchParams.folder as string | undefined;
    if (raw === 'root') return null;
    return raw === undefined ? undefined : raw;
  };

  // Folders query — for the sidebar tree and breadcrumb
  const foldersQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'folders'],
    queryFn: () => fetchFolders({ organizationId: params.organizationId }),
  }));

  const folderTree = () => buildFolderTree({ folders: foldersQuery.data?.folders ?? [] });
  const folderPath = () => getFolderPath({
    folderId: getActiveFolderId() ?? null,
    folders: foldersQuery.data?.folders ?? [],
  });

  // Fast lookup: folderId → folder name for the folder column
  const getFolderName = (folderId: string): string | null => {
    const folder = foldersQuery.data?.folders.find(f => f.id === folderId);
    return folder?.name ?? null;
  };

  const documentsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', getPagination(), debouncedSearchQuery(), { folderId: getActiveFolderId() }],
    queryFn: () => fetchOrganizationDocuments({
      organizationId: params.organizationId,
      searchQuery: debouncedSearchQuery(),
      folderId: getActiveFolderId(),
      ...getPagination(),
    }),
    placeholderData: keepPreviousData,
  }));

  return (
    <div class="flex h-full min-h-0">
      {/* Left: Folder sidebar */}
      <aside class="w-56 shrink-0 border-r border-border/60 p-3 overflow-y-auto hidden lg:block">
        <Suspense fallback={<div class="h-4 bg-muted rounded animate-pulse mx-2" />}>
          <FolderTree
            nodes={folderTree()}
            organizationId={params.organizationId}
          />
        </Suspense>
      </aside>

      {/* Right: Document list */}
      <div class="flex-1 min-w-0 p-6 pb-32 overflow-y-auto">
        <div class="max-w-5xl mx-auto">
          {/* Breadcrumb */}
          <Show when={folderPath().length > 0}>
            <div class="mb-4">
              <FolderBreadcrumb path={folderPath()} />
            </div>
          </Show>

          <Suspense>
            {documentsQuery.data?.documents?.length === 0 && debouncedSearchQuery().length === 0
              ? (
                  <>
                    <h2 class="text-xl font-bold ">
                      {t('documents.list.no-documents.title')}
                    </h2>

                    <p class="text-muted-foreground mt-1 mb-6">
                      {t('documents.list.no-documents.description')}
                    </p>

                    <DocumentUploadArea />

                  </>
                )
              : (
                  <>
                    <h2 class="text-lg font-semibold mb-4">
                      {getActiveFolderId() !== undefined
                        ? (getActiveFolderId() === null ? 'Root' : (folderPath().at(-1)?.name ?? t('documents.list.title')))
                        : t('documents.list.title')}
                    </h2>

                    <div class="flex items-center">
                      <TextFieldRoot class="max-w-md flex-1">
                        <TextField
                          type="search"
                          name="search"
                          placeholder={t('documents.list.search.placeholder')}
                          value={getSearchQuery()}
                          onInput={e => setSearchQuery(e.currentTarget.value)}
                          class="pr-9"
                          autofocus
                        />
                      </TextFieldRoot>

                      <Show when={getSearchQuery().length > 0}>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="size-6 ml--8"
                          disabled={documentsQuery.isFetching}
                          onClick={() => setSearchQuery('')}
                          aria-label={documentsQuery.isFetching ? 'Loading' : 'Clear search'}
                        >
                          <div
                            class={cn('text-muted-foreground', documentsQuery.isFetching ? 'i-tabler-loader-2 animate-spin' : 'i-tabler-x')}
                          />
                        </Button>
                      </Show>

                    </div>
                    <div class="mb-4 text-sm text-muted-foreground mt-2 ml-2">
                      <Show
                        when={debouncedSearchQuery().length > 0}
                        fallback={t('documents.list.search.total-count-no-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                      >
                        {t('documents.list.search.total-count-with-query', { count: documentsQuery.data?.documentsCount ?? 0 })}
                      </Show>
                    </div>

                    <Show when={debouncedSearchQuery().length > 0 && documentsQuery.data?.documents.length === 0}>
                      <p class="text-muted-foreground mt-1 mb-6">
                        {t('documents.list.no-results')}
                      </p>
                    </Show>

                    <DocumentsPaginatedList
                      documents={documentsQuery.data?.documents ?? []}
                      documentsCount={documentsQuery.data?.documentsCount ?? 0}
                      getPagination={getPagination}
                      setPagination={setPagination}
                      extraColumns={[
                        // Show folder badge only in All Documents view
                        ...(!getActiveFolderId() ? [createFolderColumn(getFolderName)] : []),
                        tagsColumn,
                        createdAtColumn,
                        standardActionsColumn,
                      ]}
                    />
                  </>
                )}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
