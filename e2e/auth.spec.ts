import { test, expect } from '@playwright/test';

const uniqueEmail = () => `test${Date.now()}@example.com`;

test.describe('Authentication', () => {
  test('register new user', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/register');
    await page.locator('input').first().fill('Test User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.click('button[type="submit"]');

    // Should redirect away from register page (to onboarding or calendar)
    await expect(page).not.toHaveURL(/\/register/);
  });

  test('login with valid credentials', async ({ page }) => {
    const email = uniqueEmail();
    // Register first via API
    await page.request.post('http://localhost:3001/api/auth/register', {
      data: { email, password: 'password123', name: 'Login Test' },
    });

    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.click('button[type="submit"]');

    // Should redirect away from login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('noone@example.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error and stay on login
    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 5000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('register link from login page works', async ({ page }) => {
    await page.goto('/login');
    await page.click('a[href="/register"]');
    await expect(page).toHaveURL(/\/register/);
  });

  test('login link from register page works', async ({ page }) => {
    await page.goto('/register');
    await page.click('a[href="/login"]');
    await expect(page).toHaveURL(/\/login/);
  });
});
