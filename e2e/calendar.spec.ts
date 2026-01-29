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

async function loginAndWaitForCalendar(page: any, email: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('password123');
  await page.click('button[type="submit"]');

  // Wait for calendar to load — may briefly pass through onboarding redirect
  // but setupUser already created a family so it should land on /
  await page.waitForURL(/^\/$/, { timeout: 10000 });

  // Wait for calendar grid to be visible
  await page.locator('.calendar-grid, .member-label').first().waitFor({ timeout: 10000 });
}

test.describe('Calendar', () => {
  test('navigate weeks', async ({ page, request }) => {
    const { email } = await setupUser(request);
    await loginAndWaitForCalendar(page, email);

    // Navigate weeks using prev/next buttons
    const prevBtn = page.locator('button').filter({ hasText: /◀|edellinen/i }).first();
    const nextBtn = page.locator('button').filter({ hasText: /▶|seuraava/i }).first();

    await expect(nextBtn).toBeVisible({ timeout: 5000 });
    await nextBtn.click();
    await page.waitForTimeout(500);
    await prevBtn.click();
    await page.waitForTimeout(500);
  });

  test('add event via modal', async ({ page, request }) => {
    const { email } = await setupUser(request);
    await loginAndWaitForCalendar(page, email);

    // Click on a calendar cell to open the event modal
    const cell = page.locator('.droppable-cell').first();
    await expect(cell).toBeVisible({ timeout: 5000 });
    await cell.click();

    // Fill event form in modal
    const modal = page.locator('.modal-overlay, .modal, [class*="modal"]').first();
    await expect(modal).toBeVisible({ timeout: 3000 });

    // Fill title
    const titleInput = modal.locator('input').first();
    await titleInput.fill('Test Event');

    // Submit
    const submitBtn = modal.locator('button[type="submit"], button').filter({ hasText: /tallenna|save|lisää/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});
