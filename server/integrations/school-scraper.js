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
    headless = true,
    onProgress = () => {} // Callback: (step, status, message) => void
  } = options;
  
  if (!baseUrl) {
    throw new Error('baseUrl is required');
  }

  onProgress('init', 'started', 'Käynnistetään selainta...');

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

    onProgress('auth', 'started', 'Tarkistetaan istuntoa...');

    // Check if session is still valid
    await page.goto(`${baseUrl}/calendar`, { waitUntil: 'domcontentloaded' });
    await randomDelay(500, 1500);

    // If redirected to login, authenticate
    if (page.url().includes('login') || page.url().includes('index_login')) {
      onProgress('auth', 'started', 'Kirjaudutaan sisään...');
      await login(page, credentials, baseUrl, onProgress);
      onProgress('auth', 'success', 'Kirjautuminen onnistui');
    } else {
      onProgress('auth', 'success', 'Istunto voimassa, käytetään tallennettuja evästeitä');
    }

    // Navigate to calendar
    if (!page.url().includes('calendar')) {
      onProgress('navigate', 'started', 'Siirrytään kalenteriin...');
      await page.goto(`${baseUrl}/calendar`, { waitUntil: 'networkidle' });
      await randomDelay(300, 800);
      onProgress('navigate', 'success', 'Kalenteri ladattu');
    }

    // Parse exams from calendar
    onProgress('find_exams', 'started', 'Haetaan kokeita kalenterista...');
    const exams = await parseExams(page, onProgress);
    onProgress('find_exams', 'success', `Löydettiin ${exams.length} koetta`);

    // Save cookies for next time
    const cookies = await context.cookies();

    await browser.close();

    return { exams, cookies };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

async function login(page, credentials, baseUrl, onProgress) {
  const { username, password } = credentials;

  await page.goto(`${baseUrl}/index_login`, { waitUntil: 'domcontentloaded' });
  await randomDelay(500, 1000);

  onProgress('auth', 'started', 'Täytetään kirjautumislomaketta...');

  // Fill login form (School-specific selectors)
  await page.fill('input[name="Login"]', username);
  await randomDelay(100, 300);
  await page.fill('input[name="Password"]', password);
  await randomDelay(200, 500);

  onProgress('auth', 'started', 'Lähetetään kirjautumistiedot...');

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

async function parseExams(page, onProgress) {
  onProgress('find_exams', 'started', 'Etsitään kokeiden taulukoita...');
  
  // Wait for exam tables to load
  await page.waitForSelector('table.table-grey', { timeout: 10000 }).catch(() => {
    throw new Error('Exam tables not found - page structure may have changed');
  });
  
  onProgress('find_exams', 'started', 'Jäsennetään kokeiden tietoja...');

  const exams = await page.evaluate(() => {
    const events = [];
    
    // Find all exam tables (each exam is in its own table)
    const tables = document.querySelectorAll('table.table-grey');
    
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;
      
      // First row contains date and title
      const firstRow = rows[0];
      const cells = firstRow.querySelectorAll('td');
      if (cells.length < 2) return;
      
      // Extract date from first cell (format: "Ti 3.2.2026")
      const dateCell = cells[0];
      const dateText = dateCell.textContent.trim();
      const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dateMatch) return;
      
      const [, day, month, year] = dateMatch;
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Extract title and subject from second cell
      // Format: "Sanakoe teksti 7 : ENA.8A ENA02 : Englanti, A1"
      // We want the part before the first colon as title
      const titleCell = cells[1];
      const titleText = titleCell.textContent.trim();
      
      // Split by colon and take first part as exam title
      const parts = titleText.split(':').map(p => p.trim());
      let title = parts[0] || titleText;
      
      // If we have a subject (after last colon), append it
      if (parts.length > 2) {
        const subject = parts[parts.length - 1];
        title = `${title} (${subject})`;
      }
      
      // Default time to 08:00 (exams usually in morning)
      const timeStr = '08:00';
      
      if (title && dateStr) {
        events.push({
          title: title,
          date: dateStr,
          time: timeStr,
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
