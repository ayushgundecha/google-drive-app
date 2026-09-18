import { test, expect } from '@playwright/test';
async function signIn(context: import('@playwright/test').BrowserContext, user = 'alice') {
  await context.addCookies([{ name: 'test-user', value: user, domain: '127.0.0.1', path: '/' }]);
}
test('complete file workflow and private sharing across two users', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.goto('/drive');
  await expect(page.getByRole('heading', { name: 'My Drive', exact: true })).toBeVisible();
  await page.getByLabel('Upload files', { exact: true }).setInputFiles({
    name: 'Project notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Our shared project notes.'),
  });
  await expect(page.getByRole('button', { name: 'Project notes.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Project notes.txt' }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Filename', { exact: true }).fill('Roadmap.txt');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Roadmap.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Roadmap.txt' }).click();
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await page.getByLabel('Add a person').fill('bob@example.com');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByText('bob@example.com', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const other = await browser.newContext();
  await signIn(other, 'bob');
  const recipient = await other.newPage();
  await recipient.goto('/shared');
  await expect(recipient.getByRole('button', { name: 'Roadmap.txt', exact: true })).toBeVisible();
  await recipient.getByRole('button', { name: 'Actions for Roadmap.txt' }).click();
  await expect(recipient.getByRole('menuitem', { name: 'Rename', exact: true })).toHaveAttribute(
    'data-disabled',
    '',
  );
  const downloadPromise = recipient.waitForEvent('download');
  await recipient.getByRole('menuitem', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Roadmap.txt');
  await page.getByRole('button', { name: 'Actions for Roadmap.txt' }).click();
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('bob@example.com', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await recipient.reload();
  await expect(recipient.getByRole('heading', { name: 'A space for shared files' })).toBeVisible();
  await other.close();
  await page.getByRole('textbox', { name: 'Search in Drive' }).fill('not-found');
  await expect(page.getByRole('heading', { name: 'No matching files' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Roadmap.txt' }).click();
  await page.getByRole('menuitem', { name: 'Delete permanently' }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A fresh start for your files' })).toBeVisible();
});
test('responsive layout, keyboard interaction and unavailable controls', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/drive');
  await expect(page.getByRole('heading', { name: 'My Drive', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('link', { name: 'Shared with me' })).toBeVisible();
  await page.getByRole('link', { name: 'Shared with me' }).click();
  await expect(page.getByRole('heading', { name: 'Shared with me', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/drive');
  await expect(page.getByRole('button', { name: 'Starred', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByLabel('Upload files', { exact: true }).setInputFiles([
    {
      name: 'Design brief.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('File-type illustration only.'),
    },
    { name: 'Notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Notes') },
    { name: 'Budget.csv', mimeType: 'text/csv', buffer: Buffer.from('item,cost\nHosting,0') },
    {
      name: 'Reference.png',
      mimeType: 'image/png',
      buffer: Buffer.from('File-type illustration only.'),
    },
  ]);
  await expect(page.getByRole('button', { name: 'Actions for Design brief.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for Reference.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss uploads' }).click();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Actions for Notes.txt' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Actions for Notes.txt' })).toBeFocused();
});
test('signed-out users see Google authentication', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
    'href',
    '/auth/google',
  );
});

test('main workspace and share dialog have no automated accessibility violations', async ({
  page,
  context,
}) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await signIn(context);
  await page.goto('/drive');
  await expect(page.getByRole('heading', { name: 'My Drive', exact: true })).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('Upload files', { exact: true }).setInputFiles({
    name: 'Accessible.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Accessibility test'),
  });
  await page.getByRole('button', { name: 'Actions for Accessible.txt' }).click();
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

function previewPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    ...['First page', 'Second page'].map((text) => {
      const stream = `0.1 0.4 0.8 rg 20 20 100 100 re f BT /F1 18 Tf 30 300 Td (${text}) Tj ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    }),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(document);
}

test('real image thumbnails, PDF pages, unsupported files and private preview access', async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.goto('/drive');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#204ac9';
    ctx.fillRect(0, 0, 320, 200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Upload files', { exact: true }).setInputFiles([
    { name: 'Preview image.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') },
    { name: 'Preview pages.pdf', mimeType: 'application/pdf', buffer: previewPdf() },
    {
      name: 'Pretend image.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('<script>window.previewAttack=true</script>'),
    },
    { name: 'Broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\ninvalid') },
  ]);
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('button', { name: 'Preview image.png', exact: true }) });
  await expect(card.locator('img.image-thumbnail')).toBeVisible();
  await expect
    .poll(() => card.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(320);
  await page.getByRole('button', { name: 'Preview Preview image.png', exact: true }).click();
  const image = page.getByRole('dialog').getByRole('img', { name: 'Preview image.png' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(320);
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/image-preview.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Preview Preview image.png', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Preview pages.pdf', exact: true }).click();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'PDF page 1', exact: true })).toBeVisible();
  await expect(page.getByText('First page', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByRole('img', { name: 'PDF page 2', exact: true })).toBeVisible();
  await expect(page.getByText('Second page', { exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/pdf-preview-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Pretend image.jpg', exact: true }).click();
  await expect(page.getByText('No preview available', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => 'previewAttack' in window)).toBe(false);
  const download = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Download', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('Pretend image.jpg');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Broken.pdf', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('could not be opened');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole('button', { name: 'Actions for Preview image.png' }).click();
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await page.getByLabel('Add a person').fill('bob@example.com');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(page.getByText('bob@example.com', { exact: true })).toBeVisible();
  const other = await browser.newContext();
  await signIn(other, 'bob');
  const recipient = await other.newPage();
  await recipient.goto('/shared');
  await recipient.getByRole('button', { name: 'Preview image.png', exact: true }).click();
  await expect(
    recipient.getByRole('dialog').getByRole('img', { name: 'Preview image.png' }),
  ).toBeVisible();
  await recipient.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('bob@example.com', { exact: true })).toHaveCount(0);
  await recipient.getByRole('button', { name: 'Preview image.png', exact: true }).click();
  await expect(recipient.getByRole('dialog').getByRole('alert')).toContainText(
    'no longer have access',
  );
  await other.close();
  expect(errors).toEqual([]);
});

test('sign-out shows progress, recovers on failure and removes the authenticated session', async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto('/drive');
  await expect(page.getByRole('heading', { name: 'My Drive', exact: true })).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/auth/logout', async (route) => {
    await pending;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Please try again.' } }),
    });
  });
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Signing you out…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  release();
  await expect(page.getByRole('status')).toContainText('Could not sign out. Please try again.');
  expect((await context.request.get('/api/me')).status()).toBe(200);
  await page.unroute('**/auth/logout');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('You’ve signed out of Drive.');
  expect((await context.request.get('/api/me')).status()).toBe(401);
  expect((await context.cookies()).some((cookie) => cookie.name === 'drive.sid')).toBe(false);
  await page.goto('/drive');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'My Drive', exact: true })).toHaveCount(0);
});
