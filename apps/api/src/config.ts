import { z } from 'zod';
import { resolve } from 'node:path';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().default('drive'),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  STORAGE_BACKEND: z.enum(['local', 'gridfs']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  USER_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  TOTAL_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(300 * 1024 * 1024),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  // Render supplies its assigned public URL, avoiding a guessed OAuth origin on first deploy.
  const config = envSchema.parse({ ...env, APP_ORIGIN: env.APP_ORIGIN || env.RENDER_EXTERNAL_URL });
  if (
    config.NODE_ENV === 'production' &&
    (!config.GOOGLE_CLIENT_ID ||
      !config.GOOGLE_CLIENT_SECRET ||
      !config.APP_ORIGIN.startsWith('https://'))
  )
    throw new Error('Production requires Google OAuth credentials and an HTTPS APP_ORIGIN.');
  if (
    config.MAX_FILE_BYTES > config.USER_QUOTA_BYTES ||
    config.USER_QUOTA_BYTES > config.TOTAL_QUOTA_BYTES
  )
    throw new Error('Quota limits must satisfy file <= user <= total.');
  return {
    ...config,
    APP_ORIGIN: new URL(config.APP_ORIGIN).origin,
    UPLOAD_DIR: resolve(config.UPLOAD_DIR),
  };
}
export type Config = ReturnType<typeof loadConfig>;
