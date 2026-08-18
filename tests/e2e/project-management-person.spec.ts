import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright';

import {
  closeAbuElectron,
  createElectronDataRoot,
  launchAbuElectron,
  removeElectronDataRoot,
  type ElectronDataRoot,
} from './electronHelpers';

const READY_TIMEOUT = 45_000;

async function openMembers(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow({ timeout: READY_TIMEOUT });
  await page.waitForLoadState('domcontentloaded');
  const disclaimer = page.locator('.fixed.bottom-6.right-6');
  if (await disclaimer.isVisible()) await disclaimer.getByRole('button').first().click();
  const portal = page.locator('[data-project-management-portal]');
  const portalControl = page.locator('[data-window-control="project-management"]');
  if (!await portal.isVisible()) {
    await expect(portalControl).toBeVisible({ timeout: READY_TIMEOUT });
    await portalControl.click();
  }
  await expect(portal).toBeVisible({ timeout: READY_TIMEOUT });
  await portal.locator('nav button').last().click();
  await expect(page.locator('[data-pm-portal-module="members"]')).toBeVisible({ timeout: READY_TIMEOUT });
  return page;
}

test('Person CRUD persists across real Electron restarts without Account mapping', async () => {
  const dataRoot: ElectronDataRoot = createElectronDataRoot();
  let app: ElectronApplication | undefined;
  try {
    ({ app } = await launchAbuElectron(dataRoot));
    let page = await openMembers(app);
    await page.locator('.pm-portal-page__actions button').click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill('Morgan');
    await dialog.locator('input').nth(1).fill('Program Lead');
    await dialog.locator('button[type="submit"]').dispatchEvent('click');
    await expect(page.getByText('Morgan', { exact: true })).toBeVisible();

    await closeAbuElectron(app);
    app = (await launchAbuElectron(dataRoot)).app;
    page = await openMembers(app);
    await page.locator('.pm-member-row').filter({ hasText: 'Morgan' }).click();
    await page.locator('.pm-member-detail > footer button').first().click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill('Morgan Lee');
    await dialog.locator('button[type="submit"]').dispatchEvent('click');
    await expect(page.getByText('Morgan Lee', { exact: true })).toBeVisible();

    await closeAbuElectron(app);
    app = (await launchAbuElectron(dataRoot)).app;
    page = await openMembers(app);
    await expect(page.getByText('Morgan Lee', { exact: true })).toBeVisible();
    await page.locator('.pm-portal-page__actions button').click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill('Unused Person');
    await dialog.locator('button[type="submit"]').dispatchEvent('click');
    await expect(page.getByText('Unused Person', { exact: true })).toBeVisible();
    await page.locator('.pm-member-row').filter({ hasText: 'Unused Person' }).click();
    await page.locator('.pm-member-detail > footer button').last().click();
    await page.getByRole('dialog').locator('button[type="submit"]').dispatchEvent('click');

    await closeAbuElectron(app);
    app = (await launchAbuElectron(dataRoot)).app;
    page = await openMembers(app);
    await expect(page.getByText('Morgan Lee', { exact: true })).toBeVisible();
    await expect(page.getByText('Unused Person', { exact: true })).toHaveCount(0);
  } finally {
    if (app) await closeAbuElectron(app);
    removeElectronDataRoot(dataRoot);
  }
});
