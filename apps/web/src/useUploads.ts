import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Me } from '@drive/shared';
import { bytes, upload } from './api';
interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  error?: string;
}
export function useUploads(me: Me, setToast: (message: string) => void) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const uploadLock = useRef(false);
  const client = useQueryClient();
  useEffect(() => () => controller.current?.abort(), []);
  const updateUpload = (id: string, change: Partial<UploadItem>) =>
    setUploads((items) => items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  async function uploadFiles(selected: globalThis.FileList | File[]) {
    if (uploadLock.current) {
      setToast('Wait for the current upload to finish.');
      return;
    }
    const chosen = Array.from(selected as ArrayLike<File>);
    if (!chosen.length) return;
    uploadLock.current = true;
    setUploading(true);
    controller.current = new AbortController();
    const signal = controller.current.signal;
    const items = chosen.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
      status: 'queued' as const,
    }));
    setUploads(items);
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i],
        id = items[i].id;
      if (signal.aborted) {
        updateUpload(id, { status: 'error', error: 'Upload cancelled.' });
        continue;
      }
      if (file.size === 0 || file.size > me.maxFileBytes) {
        updateUpload(id, {
          status: 'error',
          error: file.size === 0 ? 'Empty file.' : `Maximum size is ${bytes(me.maxFileBytes)}.`,
        });
        continue;
      }
      updateUpload(id, { status: 'uploading' });
      try {
        await upload(file, (progress) => updateUpload(id, { progress }), signal);
        updateUpload(id, { progress: 100, status: 'done' });
      } catch (error) {
        updateUpload(id, { status: 'error', error: (error as Error).message });
      }
    }
    await Promise.all([
      client.invalidateQueries({ queryKey: ['files'] }),
      client.invalidateQueries({ queryKey: ['me'] }),
    ]);
    setUploading(false);
    uploadLock.current = false;
    controller.current = null;
  }
  return {
    uploads,
    uploading,
    uploadFiles,
    cancel: () => controller.current?.abort(),
    dismiss: () => setUploads([]),
  };
}
