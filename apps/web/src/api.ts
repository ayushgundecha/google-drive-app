import type { ApiError } from '@drive/shared';
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(
      body?.error.message ?? 'Unable to connect. Please try again.',
      res.status,
    );
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
export async function mutate<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { token } = await request<{ token: string }>('/api/csrf');
  return request<T>(path, {
    method,
    headers: { 'X-CSRF-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
export async function upload(
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const { token } = await request<{ token: string }>('/api/csrf');
  if (signal.aborted) throw new Error('Upload cancelled.');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.timeout = 120000;
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = 'Upload failed. Please try again.';
        try {
          message = JSON.parse(xhr.responseText).error.message;
        } catch {}
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Connection lost. Please try again.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Please try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.onloadend = () => signal.removeEventListener('abort', abort);
    const data = new FormData();
    data.append('file', file);
    xhr.send(data);
  });
}
export function bytes(value: number) {
  if (value === 0) return '0 B';
  const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** unit).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${['B', 'KB', 'MB', 'GB'][unit]}`;
}
export const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
