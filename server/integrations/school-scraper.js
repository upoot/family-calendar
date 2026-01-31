import { chromium } from 'playwright';

/**
 * Generic school system scraper
 * - Works with any login-redirect pattern
 * - No hardcoded paths or selectors
 * - Follows redirects naturally
 * - Session reuse via cookies
 * - Detailed progress reporting via onProgress callback
 */

export async function scrapeSchoolExams(credentials, options = {}) {
  const {
    targetUrl,  // Full URL to exams page (will redirect to login if needed)
    sessionCookies = null,
    headless = true,
    onProgress = () => {} // Callback: (step, status, message) => void
  } = options;
  
  if (!targetUrl) {
    onProgress('init', 'error', 'targetUrl puuttuu');
    throw new Error('targetUrl is required (full URL to exams calendar)');
  }

  onProgress('init', 'started', 'Käynnistetään Playwright-selainta...');

  let browser;
  try {
    browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox' // EC2 needs this
      ],
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
    });
  } catch (error) {
    onProgress('init', 'error', `Selaimen käynnistys epäonnistui: ${error.message}`);
    throw error;
  }

  onProgress('init', 'success', 'Selain käynnistetty ✅');

  try {
    onProgress('init', 'started', 'Luodaan selainkonteksti...');
    
    const contextOptions = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'fi-FI',
      timezoneId: 'Europe/Helsinki'
    };
    
    if (sessionCookies) {
      contextOptions.storageState = { cookies: sessionCookies };
      onProgress('init', 'started', 'Ladataan tallennettuja evästeitä...');
    }
    
    const context = await browser.newContext(contextOptions);

    // Remove webdriver detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;
    });

    const page = await context.newPage();
    onProgress('init', 'success', 'Konteksti ja sivu valmis ✅');

    // Navigate to target URL
    onProgress('navigate', 'started', `Navigoidaan: ${targetUrl}`);
    
    try {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (error) {
      onProgress('navigate', 'error', `Navigointi epäonnistui: ${error.message}`);
      throw error;
    }
    
    await randomDelay(500, 1500);
    onProgress('navigate', 'success', 'Sivu ladattu ✅');

    // Check if we were redirected to login
    const currentUrl = page.url();
    
    if (currentUrl.includes('login')) {
      onProgress('navigate', 'success', 'Redirectattiin login-sivulle → kirjautuminen tarvitaan');
      
      // Generic login - find form and fill it
      await loginGeneric(page, credentials, onProgress);
      
      // Wait for redirect back to target
      await randomDelay(500, 1000);
    } else {
      onProgress('navigate', 'success', 'Ei redirectiä → sessio voimassa');
      onProgress('auth', 'success', 'Istunto voimassa, käytetään tallennettuja evästeitä ✅');
    }

    // We should now be on the exams calendar page
    onProgress('find_exams', 'started', 'Etsitään kokeiden kalenteria sivulta...');
    const exams = await parseExams(page, onProgress);
    onProgress('find_exams', 'success', `Löydettiin ${exams.length} koetta kalenterista`);

    // Logout before closing to avoid duplicate session warnings
    onProgress('save', 'started', 'Kirjaudutaan ulos...');
    try {
      // Try common logout paths
      const currentUrl = new URL(page.url());
      const logoutUrl = `${currentUrl.origin}/logout`;
      await page.goto(logoutUrl, { waitUntil: 'domcontentloaded', timeout: 5000 });
      onProgress('save', 'success', 'Uloskirjautuminen onnistui ✅');
    } catch (e) {
      // Logout failed - not critical, continue
      onProgress('save', 'started', 'Uloskirjautuminen ohitettu (ei kriittinen)');
    }
    
    await randomDelay(300, 500);

    onProgress('save', 'started', 'Suljetaan selain...');
    await browser.close();
    onProgress('save', 'success', `Valmis! ${exams.length} koetta palautettu ✅`);

    return { exams, cookies };
  } catch (error) {
    onProgress('error', 'error', `Virhe: ${error.message}`);
    await browser.close();
    throw error;
  }
}

async function loginGeneric(page, credentials, onProgress) {
  const { username, password } = credentials;

  onProgress('auth', 'started', 'Etsitään kirjautumislomaketta...');

  // Find login form generically
  const usernameInput = await page.locator('input[name="Login"], input[name="login"], input[name="username"], input[name="user"]').first();
  const passwordInput = await page.locator('input[name="Password"], input[name="password"], input[name="passwd"]').first();
  
  const usernameCount = await usernameInput.count();
  const passwordCount = await passwordInput.count();
  
  if (!usernameCount || !passwordCount) {
    onProgress('auth', 'error', `Kirjautumislomaketta ei löydetty (username: ${usernameCount}, password: ${passwordCount})`);
    throw new Error('Could not find login form fields');
  }

  onProgress('auth', 'started', 'Lomake löydetty, täytetään käyttäjätunnus...');
  await usernameInput.fill(username);
  await randomDelay(100, 300);
  
  onProgress('auth', 'started', 'Täytetään salasana...');
  await passwordInput.fill(password);
  await randomDelay(200, 500);

  onProgress('auth', 'started', 'Etsitään lähetä-painiketta...');
  const submitButton = await page.locator('input[type="submit"], button[type="submit"]').first();
  const submitCount = await submitButton.count();
  
  if (!submitCount) {
    onProgress('auth', 'error', 'Lähetä-painiketta ei löydetty');
    throw new Error('Could not find submit button');
  }

  onProgress('auth', 'started', 'Lähetetään kirjautumislomake...');
  await submitButton.click();
  
  onProgress('auth', 'started', 'Odotetaan kirjautumisen valmistumista...');
  
  // Wait for navigation (redirect back to returnpath)
  try {
    await page.waitForLoadState('networkidle', { timeout: 15000 });
  } catch (error) {
    onProgress('auth', 'error', `Kirjautumisen odotus aikakatkaistiin: ${error.message}`);
    throw error;
  }
  
  await randomDelay(500, 1000);

  // Check if login succeeded (we should NOT be on login page anymore)
  const finalUrl = page.url();
  
  if (finalUrl.includes('login')) {
    onProgress('auth', 'error', 'Kirjautuminen epäonnistui - väärät tunnukset?');
    throw new Error('Login failed - still on login page (check credentials)');
  }

  onProgress('auth', 'success', `Kirjautuminen onnistui! Redirectattiin: ${finalUrl}`);
  console.log('[Scraper] Login successful, redirected to:', finalUrl);
}

async function parseExams(page, onProgress) {
  onProgress('find_exams', 'started', 'Etsitään kokeiden taulukoita...');
  
  // Generic table finder - try multiple selectors to be resilient
  const tableSelectors = [
    'table.table-grey',
    'table[class*="exam"]',
    'table[class*="calendar"]',
    '.exam-table table',
    '.calendar-table table',
    'table' // Fallback to any table
  ];
  
  let tables = null;
  let usedSelector = null;
  for (const selector of tableSelectors) {
    tables = await page.locator(selector).count();
    if (tables > 0) {
      usedSelector = selector;
      console.log(`[Scraper] Found ${tables} tables with selector: ${selector}`);
      break;
    }
  }
  
  if (!tables || tables === 0) {
    onProgress('find_exams', 'error', 'Taulukoita ei löydetty - sivurakenne on muuttunut?');
    throw new Error('No exam tables found - page structure may have changed');
  }
  
  onProgress('find_exams', 'started', `Löydettiin ${tables} taulukko(a) (${usedSelector})`);
  onProgress('find_exams', 'started', 'Jäsennetään kokeiden tietoja...');

  const exams = await page.evaluate(() => {
    const events = [];
    
    const tables = document.querySelectorAll('table');
    
    tables.forEach(table => {
      const rows = table.querySelectorAll('tr');
      if (rows.length === 0) return;
      
      rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 2) return;
        
        const dateText = cells[0].textContent.trim();
        const titleText = cells[1].textContent.trim();
        
        // Try to find date in Finnish format: d.M.yyyy or dd.MM.yyyy
        const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (!dateMatch) return;
        
        const [, day, month, year] = dateMatch;
        const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        // Parse title - clean up whitespace first
        let title = titleText.replace(/\s+/g, ' ').trim();
        
        // Parse title - extract exam name and subject abbreviation from course code
        // Format: "Sanakoe teksti 7 : ENA.8A ENA02 : Englanti, A1"
        // Result: "Sanakoe teksti 7 (ENA)"
        if (title.includes(':')) {
          const parts = title.split(':').map(p => p.trim());
          const examName = parts[0];
          
          // Extract subject abbreviation from course code (2nd part)
          // e.g. "ENA.8A ENA02" → "ENA", "KE.8A KE02" → "KE", "MAA02" → "MAA"
          let subjectAbbr = '';
          if (parts.length >= 2) {
            const codeMatch = parts[1].match(/^([A-ZÄÖÅ]+)/);
            if (codeMatch) {
              subjectAbbr = codeMatch[1];
            }
          }
          
          title = subjectAbbr ? `${examName} (${subjectAbbr})` : examName;
        }
        
        if (title && title.length > 2 && dateStr) {
          events.push({
            title: title,
            date: dateStr,
            time: '08:00',
            type: 'exam',
            source: 'school'
          });
        }
      });
    });

    return events;
  });

  console.log(`[Scraper] Found ${exams.length} exams`);
  return exams;
}

function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}
