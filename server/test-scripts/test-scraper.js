#!/usr/bin/env node
import Database from 'better-sqlite3';
import { scrapeSchoolExams } from './integrations/school-scraper.js';
import { writeFileSync } from 'fs';

const logFile = './scraper-test.log';
const logs = [];

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  logs.push(line);
}

const db = new Database('./calendar.db');

// Get integration settings
const settings = db.prepare(`
  SELECT * FROM integration_settings 
  WHERE integration_type = 'school'
  LIMIT 1
`).get();

if (!settings) {
  log('❌ ERROR: No school integration settings found');
  process.exit(1);
}

const config = JSON.parse(settings.config);
const sessionData = settings.session_data ? JSON.parse(settings.session_data) : null;

// Get member to find targetUrl
const member = db.prepare('SELECT exam_url FROM members WHERE id = ?').get(settings.member_id);
const targetUrl = member?.exam_url || config.baseUrl;

log('🔍 TEST STARTED');
log(`📍 Target URL: ${targetUrl}`);
log(`👤 Username: ${config.username}`);
log(`🍪 Has session cookies: ${sessionData ? 'YES' : 'NO'}`);
log('');

try {
  const result = await scrapeSchoolExams(
    { username: config.username, password: config.password },
    {
      targetUrl: targetUrl,
      sessionCookies: sessionData,
      headless: true,
      onProgress: (step, status, message) => {
        const emoji = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
        log(`${emoji} [${step}] ${status.toUpperCase()} - ${message}`);
      }
    }
  );

  log('');
  log(`📝 Found ${result.exams.length} exams:`);
  result.exams.forEach((exam, i) => {
    log(`  ${i + 1}. ${exam.date} ${exam.time} - ${exam.title}`);
  });
  
  log('');
  log('✅ TEST COMPLETED SUCCESSFULLY');

  // Save logs
  writeFileSync(logFile, logs.join('\n'), 'utf-8');
  log(`💾 Logs saved to: ${logFile}`);

  db.close();
} catch (error) {
  log('');
  log(`❌ ERROR: ${error.message}`);
  log('');
  log('Stack trace:');
  log(error.stack);
  
  // Save logs
  writeFileSync(logFile, logs.join('\n'), 'utf-8');
  log(`💾 Error logs saved to: ${logFile}`);
  
  db.close();
  process.exit(1);
}
