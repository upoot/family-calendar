import { Page } from '@playwright/test';

let counter = 0;

export function uniqueEmail() {
  return `test${Date.now()}_${counter++}@example.com`;
}

export async function register(page: Page, email: string, password: string, name: string) {
  await page.goto('/register');
  await page.fill('input[name="name"], input[type="text"]', name);
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
}

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"], input[type="password"]', password);
  await page.click('button[type="submit"]');
}
