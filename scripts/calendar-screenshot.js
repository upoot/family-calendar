#!/usr/bin/env node
/**
 * Take a screenshot of the family calendar for a given week.
 * Usage: node calendar-screenshot.js [YYYY-MM-DD] [output.png]
 * 
 * Date defaults to current week's Monday.
 * Output defaults to /tmp/calendar-week-YYYY-MM-DD.png
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.FAMILYCAL_URL || 'http://localhost:5173';
const EMAIL = process.env.FAMILYCAL_EMAIL || 'ulpukka@koskimaki.fi';
const PASSWORD = process.env.FAMILYCAL_PASSWORD || 'Ulpukka2026!';

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

(async () => {
  const dateArg = process.argv[2] || getMonday(new Date());
  const monday = getMonday(dateArg);
  const output = process.argv[3] || `/tmp/calendar-week-${monday}.png`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    
    // Go to login page
    await page.goto(`${BASE_URL}/login`, { timeout: 15000 });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Login
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for calendar to load
    await page.waitForTimeout(2000);
    
    // Navigate to correct week by clicking Seuraava ▶
    // Calculate how many weeks to move
    const currentMonday = new Date();
    const day = currentMonday.getDay();
    currentMonday.setDate(currentMonday.getDate() - day + (day === 0 ? -6 : 1));
    currentMonday.setHours(0,0,0,0);
    
    const targetMonday = new Date(monday + 'T00:00:00');
    const diffWeeks = Math.round((targetMonday - currentMonday) / (7 * 24 * 60 * 60 * 1000));
    
    const buttonText = diffWeeks > 0 ? 'Seuraava' : 'Edellinen';
    const clicks = Math.abs(diffWeeks);
    
    for (let i = 0; i < clicks; i++) {
      await page.getByText(buttonText, { exact: false }).first().click();
      await page.waitForTimeout(300);
    }
    
    await page.waitForTimeout(1000);
    
    // Take screenshot of calendar area only
    await page.screenshot({ path: output, fullPage: false });
    console.log(output);
  } finally {
    await browser.close();
  }
})();
