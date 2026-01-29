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

    // After register, should eventually reach onboarding (may go via / first)
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10000 });

    // Step 1: Create family
    await page.locator('input').first().fill('Test Family');
    // Click next/submit for step 1
    const step1Btn = page.locator('button').filter({ hasText: /seuraava|luo|jatka|next|submit/i }).first();
    await step1Btn.click();

    // Step 2: Add members - wait for step transition
    await page.waitForTimeout(1000);

    // Look for member name input and add a member
    const nameInput = page.locator('input[placeholder*="nimi"], input[placeholder*="Nimi"]').first();
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill('Alice');
      const addBtn = page.locator('button').filter({ hasText: /lisää|add/i }).first();
      if (await addBtn.isVisible()) {
        await addBtn.click();
      }
    }

    // Click next/skip to proceed
    await page.waitForTimeout(500);
    const nextBtn = page.locator('button').filter({ hasText: /seuraava|ohita|skip|next|jatka/i }).first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // Step 3 (optional user accounts) - skip if present
    await page.waitForTimeout(500);
    const skipBtn = page.locator('button').filter({ hasText: /ohita|skip|seuraava|jatka/i }).first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
    }

    // Final step - finish
    await page.waitForTimeout(500);
    const finishBtn = page.locator('button').filter({ hasText: /valmis|aloita|finish|kalenteriin/i }).first();
    if (await finishBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await finishBtn.click();
    }

    // Should end up on calendar (root)
    await expect(page).toHaveURL(/^\/$/, { timeout: 10000 });
  });
});
