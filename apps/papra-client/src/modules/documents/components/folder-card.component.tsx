import type { Component } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import type { Folder } from '@/modules/folders/folders.types';
import { cn } from '@/modules/shared/style/cn';

export const FolderCard: Component<{
  folder: Folder;
}> = (props) => {
  const [, setSearchParams] = useSearchParams();
  const fileCount = () => props.folder.documentCount ?? 0;

  return (
    <button
      onClick={() => setSearchParams({ folder: props.folder.id })}
      class={cn(
        "group flex flex-col gap-3 rounded-xl border p-4 transition-all hover:scale-[1.02] active:scale-[0.98] text-left",
        !props.folder.color && "bg-primary/5 hover:bg-primary/10 border-primary/20 hover:border-primary/30"
      )}
      style={props.folder.color ? {
        "background-color": `${props.folder.color}26`,
        "border-color": props.folder.color,
      } : undefined}
    >
      <div class="flex items-center justify-between">
        <div 
          class={cn("size-10 rounded-lg flex items-center justify-center", !props.folder.color && "bg-primary/10")}
          style={props.folder.color ? { "background-color": `${props.folder.color}33` } : undefined}
        >
          <div 
            class={cn("i-tabler-folder size-6", !props.folder.color && "text-primary")}
            style={props.folder.color ? { color: props.folder.color } : undefined}
          />
        </div>
      </div>
      <div class="flex flex-col gap-0.5">
        <span class="font-semibold text-base truncate">{props.folder.name}</span>
        <span class="text-xs text-muted-foreground font-medium">
          {fileCount()} {fileCount() === 1 ? 'File' : 'Files'}
        </span>
      </div>
    </button>
  );
};
