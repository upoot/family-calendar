#!/usr/bin/env node
/**
 * Mock School Service
 * 
 * Simulates a generic school service with:
 * - Login redirect flow
 * - Session cookies
 * - Exam calendar HTML
 * 
 * Run: node mock-school-service.js
 * Then point scraper to: http://localhost:3002/exams/calendar
 */

import express from 'express';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = 3002;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Mock credentials
const VALID_USERNAME = 'test.user';
const VALID_PASSWORD = 'password123';

// Session store (in-memory, simple)
const sessions = new Map();

// Generate session ID
function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 15);
}

/**
 * GET / - Root redirect
 */
app.get('/', (req, res) => {
  res.send('<h1>Mock School Service</h1><p>Try: <a href="/exams/calendar">/exams/calendar</a></p>');
});

/**
 * GET /exams/calendar - Protected page (redirects to login if not authenticated)
 */
app.get('/exams/calendar', (req, res) => {
  const sessionId = req.cookies.session_id;
  
  if (!sessionId || !sessions.has(sessionId)) {
    // Not logged in - redirect to login with returnpath
    const returnPath = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?returnpath=${returnPath}`);
  }
  
  // Logged in - show exams calendar
  res.send(getExamsCalendarHTML());
});

/**
 * GET /login - Login page
 */
app.get('/login', (req, res) => {
  const returnPath = req.query.returnpath || '/';
  res.send(getLoginPageHTML(returnPath));
});

/**
 * POST /login - Handle login
 */
app.post('/login', (req, res) => {
  const { Login, Password, returnpath } = req.body;
  
  // Validate credentials
  if (Login !== VALID_USERNAME || Password !== VALID_PASSWORD) {
    return res.status(401).send(getLoginPageHTML(returnpath, 'Invalid username or password'));
  }
  
  // Create session
  const sessionId = generateSessionId();
  sessions.set(sessionId, {
    username: Login,
    createdAt: Date.now()
  });
  
  console.log(`[Mock Service] ✅ Login successful: ${Login} (session: ${sessionId})`);
  
  // Set session cookie and redirect
  res.cookie('session_id', sessionId, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24h
  });
  
  const redirectTo = returnpath || '/';
  res.redirect(redirectTo);
});

/**
 * GET /logout - Clear session
 */
app.get('/logout', (req, res) => {
  const sessionId = req.cookies.session_id;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.clearCookie('session_id');
  res.redirect('/login');
});

// --- HTML Templates ---

function getLoginPageHTML(returnpath = '/', error = null) {
  return `
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <title>Kirjaudu sisään</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 400px; margin: 50px auto; padding: 20px; }
    .error { color: red; margin-bottom: 15px; }
    input { display: block; width: 100%; padding: 8px; margin: 10px 0; }
    button { padding: 10px 20px; background: #0066cc; color: white; border: none; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Kirjaudu sisään</h1>
  ${error ? `<div class="error">${error}</div>` : ''}
  <form method="POST" action="/login">
    <label>Käyttäjätunnus:</label>
    <input type="text" name="Login" required autofocus>
    
    <label>Salasana:</label>
    <input type="password" name="Password" required>
    
    <input type="hidden" name="returnpath" value="${returnpath}">
    
    <button type="submit">Kirjaudu</button>
  </form>
  
  <p style="margin-top: 30px; font-size: 12px; color: #666;">
    Test credentials: ${VALID_USERNAME} / ${VALID_PASSWORD}
  </p>
</body>
</html>
`;
}

function getExamsCalendarHTML() {
  return `
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <title>Kokeet - Kalenteri</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 20px auto; padding: 20px; }
    h1 { color: #333; }
    .table-grey { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .table-grey th { background: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; }
    .table-grey td { padding: 10px; border: 1px solid #ddd; }
    .logout { float: right; }
  </style>
</head>
<body>
  <a href="/logout" class="logout">Kirjaudu ulos</a>
  <h1>Kokeet - Kalenteri</h1>
  
  <table class="table-grey">
    <thead>
      <tr>
        <th>Päivämäärä</th>
        <th>Koe</th>
        <th>Kurssi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>3.2.2026</td>
        <td>Sanakoe teksti 7 : ENA.8A ENA02 : Englanti, A1</td>
        <td>ENA02</td>
      </tr>
      <tr>
        <td>19.2.2026</td>
        <td>Jaksollinen järjestelmä, alkuaineiden ominaisuudet ja erilaiset sidokset : KE.8A KE02 : Kemia</td>
        <td>KE02</td>
      </tr>
      <tr>
        <td>10.3.2026</td>
        <td>Englannin koe : ENA.8A ENA02 : Englanti, A1</td>
        <td>ENA02</td>
      </tr>
      <tr>
        <td>11.3.2026</td>
        <td>Koe : MA.8A MAA02 : Matematiikka</td>
        <td>MAA02</td>
      </tr>
      <tr>
        <td>13.3.2026</td>
        <td>Ruotsin koe KPL 1-2. : RUB.8A RUB12 : Ruotsin kieli, B1</td>
        <td>RUB12</td>
      </tr>
      <tr>
        <td>16.3.2026</td>
        <td>Iso koe : GE.8A GE02 : Maantieto</td>
        <td>GE02</td>
      </tr>
      <tr>
        <td>27.3.2026</td>
        <td>Valtiovertailun palautuspäivä : GE.8A GE02 : Maantieto</td>
        <td>GE02</td>
      </tr>
    </tbody>
  </table>
  
  <p style="color: #666; font-size: 12px;">
    Mock data - ${sessions.size} active session(s)
  </p>
</body>
</html>
`;
}

// Start server
app.listen(PORT, () => {
  console.log(`🎭 Mock School Service running on http://localhost:${PORT}`);
  console.log(`📍 Test URL: http://localhost:${PORT}/exams/calendar`);
  console.log(`👤 Test credentials: ${VALID_USERNAME} / ${VALID_PASSWORD}`);
});
