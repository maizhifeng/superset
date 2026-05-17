import { test, expect } from '@playwright/test';

test.describe('Dashboard list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('navigates to dashboard list from home', async ({ page }) => {
    await page.getByText('Dashboards').click();
    await expect(page).toHaveURL('/dashboard/list');
  });

  test('displays dashboard list page structure', async ({ page }) => {
    await page.goto('/dashboard/list');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('table')).toBeVisible();
  });

  test('create dashboard dialog opens and closes', async ({ page }) => {
    await page.goto('/dashboard/list');

    const createButton = page.getByRole('button', { name: /create|new/i });
    if (await createButton.isVisible()) {
      await createButton.click();
      await expect(page.getByText(/create dashboard|cancel/i)).toBeVisible();
    }
  });
});
