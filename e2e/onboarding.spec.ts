import { test, expect } from '@playwright/test';

const uniqueEmail = () => `onboard${Date.now()}@example.com`;

test.describe('Onboarding wizard', () => {
  test('full onboarding flow: register → create family → add members → finish', async ({ page }) => {
    const email = uniqueEmail();

    // Register
    await page.goto('/register');
    await page.locator('input').first().fill('Onboard User');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.click('button[type="submit"]');

    // Should go to onboarding
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 5000 });

    // Step 1: Create family
    await page.locator('input').first().fill('Test Family');
    await page.click('button[type="submit"]');

    // Step 2: Add members - wait for the member input to appear
    await page.waitForTimeout(500);
    const memberInput = page.locator('input[placeholder*="nimi"], input[placeholder*="Nimi"], input').first();
    await memberInput.fill('Alice');
    // Click add member button
    const addBtn = page.locator('button').filter({ hasText: /lisää|Lisää|add/i });
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
    }

    // Finish onboarding
    await page.waitForTimeout(500);
    const finishBtn = page.locator('button').filter({ hasText: /valmis|Valmis|aloita|Aloita|finish/i });
    if (await finishBtn.count() > 0) {
      await finishBtn.first().click();
    }

    // Should end up on calendar (root)
    await expect(page).toHaveURL(/^\/$|\/calendar/, { timeout: 5000 });
  });
});
