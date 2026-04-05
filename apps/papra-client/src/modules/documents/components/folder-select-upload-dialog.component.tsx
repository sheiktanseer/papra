import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { useQuery } from '@tanstack/solid-query';
import { fetchFolders } from '@/modules/folders/folders.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { promptUploadFiles } from '@/modules/shared/files/upload';
import { Button } from '@/modules/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';

export const FolderSelectUploadDialog: Component<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  initialFolderId: string | null;
  onUpload: (args: { files: File[]; folderId: string | null }) => Promise<void>;
}> = (props) => {
  const { t } = useI18n();
  // Using "" to represent null for Select options since Kobalte accepts string primitives normally
  const [selectedFolderId, setSelectedFolderId] = createSignal<string>(props.initialFolderId ?? '');

  const foldersQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'folders'],
    queryFn: () => fetchFolders({ organizationId: props.organizationId }),
  }));

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setSelectedFolderId(props.initialFolderId ?? '');
    }
    props.onOpenChange(open);
  };

  const handleChooseFiles = async () => {
    props.onOpenChange(false);
    const { files } = await promptUploadFiles();
    if (files.length > 0) {
      // Map it back to null before sending
      const folderId = selectedFolderId() === '' ? null : selectedFolderId();
      await props.onUpload({ files, folderId });
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('upload-dialog.title')}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4 py-4">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{t('upload-dialog.select-folder.label')}</span>
            <Select<{ value: string; label: string }>
              value={[
                { value: '', label: t('upload-dialog.select-folder.root') },
                ...(foldersQuery.data?.folders ?? []).map(folder => ({
                  value: folder.id,
                  label: folder.name,
                }))
              ].find(o => o.value === selectedFolderId())}
              onChange={(opt) => opt && setSelectedFolderId(opt.value)}
              options={[
                { value: '', label: t('upload-dialog.select-folder.root') },
                ...(foldersQuery.data?.folders ?? []).map(folder => ({
                  value: folder.id,
                  label: folder.name,
                })),
              ]}
              optionValue="value"
              optionTextValue="label"
              placeholder={t('upload-dialog.select-folder.placeholder')}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>
                  {itemProps.item.rawValue.label}
                </SelectItem>
              )}
            >
              <SelectTrigger>
                <SelectValue<any>>
                  {state => state.selectedOption() ? state.selectedOption()?.label : t('upload-dialog.select-folder.root')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {t('upload-dialog.cancel')}
          </Button>
          <Button onClick={handleChooseFiles}>
            <div class="i-tabler-upload mr-2 size-4" />
            {t('upload-dialog.choose-files')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
