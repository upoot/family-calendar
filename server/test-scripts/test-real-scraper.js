#!/usr/bin/env node
/**
 * Test real scraper against actual school service
 * 
 * Usage: node test-real-scraper.js <url> <username> <password>
 * Example: node test-real-scraper.js "https://example.com/exams/calendar" "user" "pass"
 */

import { scrapeSchoolExams } from './integrations/school-scraper.js';

const [,, targetUrl, username, password] = process.argv;

if (!targetUrl || !username || !password) {
  console.error('Usage: node test-real-scraper.js <url> <username> <password>');
  process.exit(1);
}

console.log('🧪 Testing REAL scraper...\n');
console.log(`📍 URL: ${targetUrl}`);
console.log(`👤 User: ${username}\n`);

const startTime = Date.now();

try {
  const result = await scrapeSchoolExams(
    { username, password },
    {
      targetUrl,
      sessionCookies: null,
      headless: true,
      onProgress: (step, status, message) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
        console.log(`[${elapsed}s] ${emoji} [${step}] ${status.toUpperCase()} - ${message}`);
      }
    }
  );

  console.log(`\n📝 Found ${result.exams.length} exams:`);
  result.exams.forEach((exam, i) => {
    console.log(`  ${i + 1}. ${exam.date} ${exam.time} - ${exam.title}`);
  });

  console.log(`\n🍪 Got ${result.cookies.length} cookies for session reuse`);
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ TEST PASSED (${totalTime}s)`);
} catch (error) {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.error(`\n❌ TEST FAILED (${totalTime}s)`);
  console.error(`Error: ${error.message}`);
  console.error(`\nStack trace:\n${error.stack}`);
  process.exit(1);
}
