import { chromium } from 'playwright';

/**
 * Stealth School scraper - responsible data access
 * - Authenticated users only (own child's data)
 * - Session reuse (cookies cached)
 * - Respectful delays
 * - Human-like behavior
 */

export async function scrapeSchoolExams(credentials, options = {}) {
  const {
    baseUrl,
    sessionCookies = null,
    headless = true
  } = options;
  
  if (!baseUrl) {
    throw new Error('baseUrl is required');
  }

  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox' // EC2 needs this
    ],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'fi-FI',
      timezoneId: 'Europe/Helsinki',
      ...(sessionCookies && { storageState: { cookies: sessionCookies } })
    });

    // Remove webdriver detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
    });

    const page = await context.newPage();

    // Check if session is still valid
    await page.goto(`${baseUrl}/calendar`, { waitUntil: 'domcontentloaded' });
    await randomDelay(500, 1500);

    // If redirected to login, authenticate
    if (page.url().includes('login') || page.url().includes('index_login')) {
      console.log('[School] Session expired, logging in...');
      await login(page, credentials, baseUrl);
    } else {
      console.log('[School] Session valid, reusing cookies');
    }

    // Navigate to calendar
    if (!page.url().includes('calendar')) {
      await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
      await randomDelay(300, 800);
    }

    // Parse exams from calendar
    const exams = await parseExams(page);

    // Save cookies for next time
    const cookies = await context.cookies();

    await browser.close();

    return { exams, cookies };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function login(page, credentials, baseUrl) {
  const { username, password } = credentials;

  await page.goto(`${baseUrl}/index_login`, { waitUntil: 'domcontentloaded' });
  await randomDelay(500, 1000);

  // Fill login form (School-specific selectors)
  await page.fill('input[name="Login"]', username);
  await randomDelay(100, 300);
  await page.fill('input[name="Password"]', password);
  await randomDelay(200, 500);

  // Submit
  await page.click('input[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle' });
  await randomDelay(500, 1000);

  // Check if login succeeded
  if (page.url().includes('index_login') || page.url().includes('error')) {
    throw new Error('School login failed - check credentials');
  }

  console.log('[School] Login successful');
}

async function parseExams(page) {
  // Wait for calendar to load
  await page.waitForSelector('table.schedule, .calendar, #schedule', { timeout: 10000 }).catch(() => {
    throw new Error('Calendar not found - page structure may have changed');
  });

  const exams = await page.evaluate(() => {
    const events = [];
    
    // School shows events in a table structure
    // Look for exam rows (usually contain word "koe" or specific class)
    const rows = document.querySelectorAll('tr.schedule-item, tr.event-row, table.schedule tr');
    
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      
      // Try to extract exam info from row
      const rowText = row.textContent || '';
      
      // Check if it's an exam (contains "koe", "tentti", "exam", "test")
      if (!/\b(koe|tentti|exam|test|kokeet)\b/i.test(rowText)) return;
      
      // Extract date (look for DD.MM.YYYY or similar)
      const dateMatch = rowText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dateMatch) return;
      
      const [, day, month, year] = dateMatch;
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Extract time (look for HH:MM or HH.MM)
      const timeMatch = rowText.match(/(\d{1,2})[:.:](\d{2})/);
      const timeStr = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : '08:00';
      
      // Extract student name (usually first name visible)
      // Look for capitalized words that might be names
      const nameMatch = rowText.match(/\b([A-ZÅÄÖ][a-zåäö]+)\b/);
      const studentName = nameMatch ? nameMatch[1] : null;
      
      // Extract exam subject/title (remove date, time, name)
      let title = rowText
        .replace(/\d{1,2}\.\d{1,2}\.\d{4}/g, '')
        .replace(/\d{1,2}[:.]\d{2}/g, '')
        .replace(/\b(ma|ti|ke|to|pe|la|su)\b/gi, '')
        .replace(/\(.*?\)/g, '')
        .trim();
      
      // Clean up excessive whitespace
      title = title.replace(/\s+/g, ' ').trim();
      
      if (title && dateStr) {
        events.push({
          title: title,
          date: dateStr,
          time: timeStr,
          studentName: studentName,
          type: 'exam',
          source: 'school'
        });
      }
    });

    return events;
  });

  console.log(`[School] Found ${exams.length} exams`);
  return exams;
}

function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}
