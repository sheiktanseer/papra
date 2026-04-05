import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { useMutation, useQueryClient } from '@tanstack/solid-query';
import { Button } from '@/modules/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/modules/ui/components/dialog';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { ColorSwatchPicker } from '@/modules/ui/components/color-swatch-picker';
import { DEFAULT_COLOR_PALETTE } from '@/modules/ui/constants/colors.constants';
import { createFolder } from '../folders.services';

export const CreateFolderDialog: Component<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  parentFolderId: string | null;
  /** Optional override — used for the rename dialog */
  title?: string;
  submitLabel?: string;
  initialName?: string;
  initialColor?: string | null;
  /** Override the submit action — defaults to createFolder */
  onSubmit?: (data: { name: string; color: string | null }) => Promise<void>;
}> = (props) => {
  const queryClient = useQueryClient();
  const [name, setName] = createSignal(props.initialName ?? '');
  const [color, setColor] = createSignal(props.initialColor?.toUpperCase() ?? null);
  const [error, setError] = createSignal('');

  const mutation = useMutation(() => ({
    mutationFn: async () => {
      const trimmed = name().trim();
      if (trimmed.length < 1) {
        throw new Error('Folder name is required');
      }
      if (trimmed.length > 255) {
        throw new Error('Folder name must be 255 characters or less');
      }

      if (props.onSubmit) {
        await props.onSubmit({ name: trimmed, color: color() });
      }
      else {
        await createFolder({
          organizationId: props.organizationId,
          name: trimmed,
          color: color(),
          parentFolderId: props.parentFolderId,
        });
        queryClient.invalidateQueries({
          queryKey: ['organizations', props.organizationId, 'folders'],
        });
      }
    },
    onSuccess: () => {
      setName('');
      setColor(null);
      setError('');
      props.onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  }));

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName(props.initialName ?? '');
      setColor(props.initialColor ?? null);
      setError('');
    }
    props.onOpenChange(open);
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title ?? 'New Folder'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <TextFieldRoot class="flex flex-col gap-1 mb-4">
            <TextFieldLabel for="folder-name">Name</TextFieldLabel>
            <TextField
              type="text"
                placeholder="Folder name"
                value={name()}
                onInput={e => setName(e.currentTarget.value)}
                autofocus
                maxLength={255}
                required
                aria-label="Folder name"
              />
            </TextFieldRoot>
            {error() && (
              <p class="text-sm text-destructive">{error()}</p>
            )}

          <TextFieldRoot class="flex flex-col gap-1 mb-4">
            <TextFieldLabel for="folder-color">Color <span class="font-normal text-muted-foreground ml-1">(Optional)</span></TextFieldLabel>
            <ColorSwatchPicker value={color() ?? ''} onChange={setColor} colors={DEFAULT_COLOR_PALETTE} />
          </TextFieldRoot>

          <div class="flex flex-row-reverse justify-between items-center mt-6">
            <Button
              type="submit"
              disabled={mutation.isPending || name().trim().length === 0}
            >
              {mutation.isPending
                ? (
                    <span class="flex items-center gap-2">
                      <div class="i-tabler-loader-2 animate-spin size-4" />
                      Saving…
                    </span>
                  )
                : (props.submitLabel ?? 'Create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
