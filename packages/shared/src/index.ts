import { z } from 'zod';
export const filenameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a filename.')
  .max(180, 'Use at most 180 characters.')
  .refine(
    (v) => !/[\u0000-\u001f\u007f/\\]/.test(v) && v !== '.' && v !== '..',
    'Use a filename without slashes or control characters.',
  );
export const renameSchema = z.object({ name: filenameSchema }).strict();
export const shareSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254) })
  .strict();
export const listSchema = z.object({
  scope: z.enum(['owned', 'shared']).default('owned'),
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export interface FileItem {
  id: string;
  name: string;
  originalName: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  ownerName: string;
  isOwner: boolean;
}
export interface Me {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  usedBytes: number;
  quotaBytes: number;
  maxFileBytes: number;
}
export interface FileList {
  files: FileItem[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ShareItem {
  recipientId: string;
  name: string;
  email: string;
  createdAt: string;
}
export interface ApiError {
  error: { code: string; message: string; fields?: Record<string, string[]> };
}
