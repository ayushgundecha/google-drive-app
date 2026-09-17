import { useEffect, useState } from 'react';

type Content =
  { kind: 'image'; url: string } | { kind: 'pdf'; data: ArrayBuffer } | { kind: 'unsupported' };

// Content bytes, not the filename or the uploader's MIME hint, select the renderer.
function imageType(bytes: Uint8Array) {
  const starts = (...signature: number[]) => signature.every((value, i) => bytes[i] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (starts(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif';
  return null;
}

export function useFileContent(id: string, enabled = true) {
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    setContent(null);
    setError('');
    async function load() {
      try {
        const response = await fetch(`/api/files/${id}/download`, {
          credentials: 'same-origin',
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? 'Your session expired. Sign in again to preview this file.'
              : response.status === 404
                ? 'This file was deleted or you no longer have access.'
                : 'Unable to load this preview. Please try again.',
          );
        }
        const data = await response.arrayBuffer();
        if (controller.signal.aborted) return;
        const header = new Uint8Array(data, 0, Math.min(data.byteLength, 16));
        const type = imageType(header);
        if (type) {
          objectUrl = URL.createObjectURL(new Blob([data], { type }));
          setContent({ kind: 'image', url: objectUrl });
        } else if (String.fromCharCode(...header.subarray(0, 5)) === '%PDF-') {
          setContent({ kind: 'pdf', data });
        } else {
          setContent({ kind: 'unsupported' });
        }
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, enabled, attempt]);
  return { content, error, retry: () => setAttempt((value) => value + 1) };
}
