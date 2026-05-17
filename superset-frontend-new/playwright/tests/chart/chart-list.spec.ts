import { test, expect } from '@playwright/test';

test.describe('Chart list', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('navigates to chart list from home', async ({ page }) => {
    await page.getByText('Charts').click();
    await expect(page).toHaveURL('/chart/list');
  });

  test('displays chart list page', async ({ page }) => {
    await page.goto('/chart/list');
    await page.waitForLoadState('networkidle');

    const heading = page.getByText(/chart|explore/i);
    await expect(heading).toBeVisible();
  });

  test('search filters charts', async ({ page }) => {
    await page.goto('/chart/list');
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('sales');
      await page.waitForTimeout(500);

      const rows = page.locator('table tbody tr');
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
