/**
 * Mock school scraper - realistic flow with mocked data
 * - REAL browser launch (Playwright)
 * - REAL HTTP GET to targetUrl
 * - REAL redirect to login page
 * - REAL HTML parsing (sees login form)
 * - BUT returns MOCKED exam data (no actual login/scraping)
 * 
 * Use for testing redirect logic and URL structure without hitting real credentials.
 */
import { chromium } from 'playwright';

const MOCK_EXAMS = [
  {
    title: 'Sanakoe teksti 7 (Englanti, A1)',
    date: '2026-02-03',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Jaksollinen järjestelmä, alkuaineiden ominaisuudet ja erilaiset sidokset (Kemia)',
    date: '2026-02-19',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Englannin koe (Englanti, A1)',
    date: '2026-03-10',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Koe (Matematiikka)',
    date: '2026-03-11',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Ruotsin koe KPL 1-2. (Ruotsin kieli, B1)',
    date: '2026-03-13',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Iso koe (Maantieto)',
    date: '2026-03-16',
    time: '08:00',
    type: 'exam',
    source: 'school'
  },
  {
    title: 'Valtiovertailun palautuspäivä (Maantieto)',
    date: '2026-03-27',
    time: '08:00',
    type: 'exam',
    source: 'school'
  }
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function scrapeSchoolExamsMock(credentials, options = {}) {
  const { targetUrl, onProgress = () => {} } = options;

  console.log('[Mock Scraper] 🎭 Starting REALISTIC mock (real browser, real redirects, mocked data)');

  onProgress('init', 'started', 'Käynnistetään Playwright-selainta...');
  await delay(200);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ],
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser'
  });

  onProgress('init', 'success', 'Selain käynnistetty ✅');
  await delay(100);

  try {
    onProgress('init', 'started', 'Luodaan selainkonteksti...');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'fi-FI',
      timezoneId: 'Europe/Helsinki'
    });

    const page = await context.newPage();
    onProgress('init', 'success', 'Konteksti valmis ✅');
    await delay(100);

    onProgress('navigate', 'started', `Navigoidaan: ${targetUrl}`);
    console.log(`[Mock Scraper] GET ${targetUrl}`);

    // REAL HTTP request to target URL
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    onProgress('navigate', 'success', 'Sivu ladattu ✅');
    await delay(300);

    const currentUrl = page.url();
    console.log(`[Mock Scraper] Current URL after navigation: ${currentUrl}`);

    // Check if redirected to login
    if (currentUrl.includes('login')) {
      onProgress('navigate', 'success', 'Redirectattiin login-sivulle → kirjautuminen tarvitaan');
      console.log('[Mock Scraper] ✅ Redirect to login detected');
      await delay(200);

      // REAL LOGIN FLOW (same as real scraper)
      onProgress('auth', 'started', 'Etsitään kirjautumislomaketta...');
      await delay(200);

      const usernameInput = page.locator('input[name="Login"], input[name="login"], input[name="username"]').first();
      const passwordInput = page.locator('input[name="Password"], input[name="password"]').first();

      onProgress('auth', 'started', 'Lomake löydetty, täytetään käyttäjätunnus...');
      await usernameInput.fill(credentials.username);
      await delay(150);
      
      onProgress('auth', 'started', 'Täytetään salasana...');
      await passwordInput.fill(credentials.password);
      await delay(200);

      onProgress('auth', 'started', 'Lähetetään kirjautumislomake...');
      const submitButton = page.locator('input[type="submit"], button[type="submit"]').first();
      await submitButton.click();

      onProgress('auth', 'started', 'Odotetaan kirjautumisen valmistumista...');
      // Wait for navigation (redirect back to returnpath)
      await page.waitForLoadState('networkidle');
      await delay(300);

      const finalUrl = page.url();
      console.log(`[Mock Scraper] After login, URL: ${finalUrl}`);

      // Check if login succeeded
      if (finalUrl.includes('login')) {
        onProgress('auth', 'error', 'Kirjautuminen epäonnistui - väärät tunnukset?');
        throw new Error('Login failed - still on login page (check credentials)');
      }

      console.log('[Mock Scraper] ✅ Login successful, redirected to:', finalUrl);
      onProgress('auth', 'success', `Kirjautuminen onnistui! Redirectattiin: ${finalUrl}`);
    } else {
      console.log('[Mock Scraper] ℹ️ No redirect (session still valid or different flow)');
      onProgress('navigate', 'success', 'Ei redirectiä → sessio voimassa');
      onProgress('auth', 'success', 'Istunto voimassa, ei kirjautumista tarvittu ✅');
    }
    
    await delay(200);

    onProgress('find_exams', 'started', 'Etsitään kokeiden kalenteria sivulta...');
    await delay(200);
    
    onProgress('find_exams', 'started', 'Etsitään taulukoita sivulta...');
    await delay(200);
    
    onProgress('find_exams', 'started', 'Jäsennetään kokeiden tietoja...');
    await delay(300);

    await browser.close();
    onProgress('find_exams', 'success', 'Selain suljettu ✅');
    await delay(100);

    console.log(`[Mock Scraper] ✅ Returning ${MOCK_EXAMS.length} mocked exams`);
    onProgress('find_exams', 'success', `Löydettiin ${MOCK_EXAMS.length} koetta kalenterista`);
    await delay(100);
    
    onProgress('save', 'started', 'Palautetaan kokeet backendille tallennettavaksi...');
    await delay(200);
    onProgress('save', 'success', `Valmis! ${MOCK_EXAMS.length} koetta palautettu ✅`);

    return {
      exams: MOCK_EXAMS,
      cookies: [] // No real cookies in mock mode
    };

  } catch (error) {
    await browser.close();
    throw error;
  }
}
