#!/usr/bin/env node
/**
 * Test scraper against local mock service
 */
import { scrapeSchoolExams } from './integrations/school-scraper.js';

const TARGET_URL = 'http://localhost:3002/exams/calendar';
const CREDENTIALS = {
  username: 'test.user',
  password: 'password123'
};

console.log('🧪 Testing scraper against mock service...\n');
console.log(`📍 URL: ${TARGET_URL}`);
console.log(`👤 User: ${CREDENTIALS.username}\n`);

try {
  const result = await scrapeSchoolExams(CREDENTIALS, {
    targetUrl: TARGET_URL,
    sessionCookies: null, // No session - force login flow
    headless: true,
    onProgress: (step, status, message) => {
      const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
      console.log(`${emoji} [${step}] ${status.toUpperCase()} - ${message}`);
    }
  });

  console.log('\n📝 Found exams:');
  result.exams.forEach((exam, i) => {
    console.log(`  ${i + 1}. ${exam.date} ${exam.time} - ${exam.title}`);
  });

  console.log(`\n🍪 Got ${result.cookies.length} cookies for session reuse`);
  console.log('\n✅ TEST PASSED');
} catch (error) {
  console.error('\n❌ TEST FAILED');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
