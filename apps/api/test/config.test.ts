import { expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
const production = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://localhost:27017',
  SESSION_SECRET: 'x'.repeat(32),
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
};
it('uses the assigned Render URL for production OAuth and CSRF origin', () => {
  expect(
    loadConfig({ ...production, RENDER_EXTERNAL_URL: 'https://drive-example.onrender.com' })
      .APP_ORIGIN,
  ).toBe('https://drive-example.onrender.com');
});
it('preserves an explicit custom-domain origin over the Render URL', () => {
  expect(
    loadConfig({
      ...production,
      RENDER_EXTERNAL_URL: 'https://drive-example.onrender.com',
      APP_ORIGIN: 'https://files.example.com/',
    }).APP_ORIGIN,
  ).toBe('https://files.example.com');
});
