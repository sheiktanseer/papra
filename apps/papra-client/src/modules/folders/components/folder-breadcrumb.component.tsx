import type { Component } from 'solid-js';
import type { Folder } from '../folders.types';
import { For, Show } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { cn } from '@/modules/shared/style/cn';

export const FolderBreadcrumb: Component<{
  path: Folder[];  // ordered from root → current, from getFolderPath()
}> = (props) => {
  const [, setSearchParams] = useSearchParams();

  const navigateTo = (folderId: string | null) => {
    setSearchParams({ folder: folderId ?? undefined }, { replace: true });
  };

  return (
    <Show when={props.path.length > 0}>
      <nav class="flex items-center gap-1 text-sm text-muted-foreground flex-wrap" aria-label="Folder path">
        {/* Root segment */}
        <button
          class="hover:text-foreground transition-colors"
          onClick={() => navigateTo(null)}
        >
          All Documents
        </button>

        <For each={props.path}>
          {(folder, index) => (
            <>
              <div class="i-tabler-chevron-right size-3.5 opacity-40 shrink-0" />
              <button
                class={cn(
                  'transition-colors max-w-32 truncate inline-flex items-center',
                  index() === props.path.length - 1
                    ? 'text-foreground font-medium cursor-default'
                    : 'hover:text-foreground',
                )}
                onClick={() => {
                  if (index() < props.path.length - 1) {
                    navigateTo(folder.id);
                  }
                }}
                disabled={index() === props.path.length - 1}
              >
                {folder.name}
              </button>
            </>
          )}
        </For>
      </nav>
    </Show>
  );
};
