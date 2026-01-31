#!/usr/bin/env node
/**
 * Take a screenshot of the family calendar daily report.
 * Usage: node daily-screenshot.js [YYYY-MM-DD] [output.png]
 * 
 * Date defaults to today.
 * Output defaults to /tmp/calendar-day-YYYY-MM-DD.png
 */

const { chromium } = require('playwright');

const BASE_URL = process.env.FAMILYCAL_URL || 'http://localhost:5173';
const EMAIL = process.env.FAMILYCAL_EMAIL || 'ulpukka@koskimaki.fi';
const PASSWORD = process.env.FAMILYCAL_PASSWORD || 'Ulpukka2026!';

(async () => {
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  const output = process.argv[3] || `/tmp/calendar-day-${dateArg}.png`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const url = `${BASE_URL}/report/daily?date=${dateArg}&email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`;
    await page.goto(url, { timeout: 15000 });

    // Wait for content to load
    await page.waitForSelector('.report-page', { timeout: 10000 });
    await page.waitForTimeout(1000); // Wait for weather

    await page.screenshot({ path: output, fullPage: false });
    console.log(output);
  } finally {
    await browser.close();
  }
})();
