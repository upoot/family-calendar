#!/usr/bin/env node
/**
 * Take a screenshot of the family calendar weekly report.
 * Usage: node calendar-screenshot.js [YYYY-MM-DD] [output.png]
 * 
 * Date defaults to current date (report shows that week).
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
  const dateArg = process.argv[2] || new Date().toISOString().slice(0, 10);
  const monday = getMonday(dateArg);
  const output = process.argv[3] || `/tmp/calendar-week-${monday}.png`;

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-gpu']
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const url = `${BASE_URL}/report/weekly?date=${dateArg}&email=${encodeURIComponent(EMAIL)}&password=${encodeURIComponent(PASSWORD)}`;
    await page.goto(url, { timeout: 15000 });

    // Wait for content to load (grid appears)
    await page.waitForSelector('.report-week-grid', { timeout: 10000 });
    await page.waitForTimeout(500);

    await page.screenshot({ path: output, fullPage: false });
    console.log(output);
  } finally {
    await browser.close();
  }
})();
