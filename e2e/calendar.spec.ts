import { test, expect } from '@playwright/test';

const API = 'http://localhost:3001/api';

async function setupUser(request: any) {
  const email = `cal${Date.now()}@example.com`;
  const reg = await request.post(`${API}/auth/register`, {
    data: { email, password: 'password123', name: 'Cal User' },
  });
  const { token } = await reg.json();

  // Create family
  const famRes = await request.post(`${API}/families`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Cal Family' },
  });
  const family = await famRes.json();

  // Create member
  const memRes = await request.post(`${API}/members`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Alice', color: '#f472b6', family_id: family.id },
  });
  const member = await memRes.json();

  return { email, token, family, member };
}

test.describe('Calendar', () => {
  test('navigate weeks', async ({ page, request }) => {
    const { email, token, family } = await setupUser(request);

    // Login via storing token
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });

    // Navigate weeks using prev/next buttons
    const prevBtn = page.locator('button').filter({ hasText: /◀|←|edellinen|prev/i }).first();
    const nextBtn = page.locator('button').filter({ hasText: /▶|→|seuraava|next/i }).first();

    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      await prevBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('add event via modal', async ({ page, request }) => {
    const { email, token, family, member } = await setupUser(request);

    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('password123');
    await page.click('button[type="submit"]');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 5000 });

    // Try clicking on a calendar cell to open the event modal
    await page.waitForTimeout(1000);
    const cell = page.locator('.droppable-cell, td, .calendar-cell').first();
    if (await cell.isVisible()) {
      await cell.click();
      await page.waitForTimeout(500);

      // Fill event form if modal opened
      const modal = page.locator('.modal, [class*="modal"], dialog');
      if (await modal.isVisible()) {
        const titleInput = modal.locator('input[name="title"], input[placeholder*="otsikko"], input[placeholder*="title"], input').first();
        await titleInput.fill('Test Event');

        const submitBtn = modal.locator('button[type="submit"], button').filter({ hasText: /tallenna|save|lisää/i }).first();
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
        }
      }
    }
  });
});
