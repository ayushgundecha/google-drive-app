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
