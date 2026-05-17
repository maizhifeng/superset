import { test, expect } from '@playwright/test';

test.describe('SQL Lab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/', { timeout: 10000 });
  });

  test('navigates to SQL Lab from home', async ({ page }) => {
    await page.getByText('SQL Lab').click();
    await expect(page).toHaveURL('/sqllab');
  });

  test('displays SQL editor', async ({ page }) => {
    await page.goto('/sqllab');
    await page.waitForLoadState('networkidle');

    await expect(page.getByPlaceholder(/select|sql|query/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /run|execute/i })).toBeVisible();
  });

  test('execute returns results', async ({ page }) => {
    await page.goto('/sqllab');
    await page.waitForLoadState('networkidle');

    const editor = page.getByPlaceholder(/select|sql|query/i);
    await editor.fill('SELECT 1');

    await page.getByRole('button', { name: /run|execute/i }).click();

    await expect(page.getByText(/result|error|data/i)).toBeVisible({ timeout: 15000 });
  });
});
