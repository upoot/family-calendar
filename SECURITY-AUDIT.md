# Security Audit Report — Family Calendar

**Date:** 2025-07-11  
**Branch:** `feature/onboarding-and-settings`  
**Auditor:** Automated security review  

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 5     |
| MEDIUM   | 5     |
| LOW      | 4     |

---

## CRITICAL

### C1. Hardcoded JWT Secret with Weak Fallback

**File:** `server/index.js:15`  
```js
const JWT_SECRET = process.env.JWT_SECRET || 'family-calendar-secret-change-me';
```

**Impact:** If `JWT_SECRET` env var is not set (very likely in dev/careless deploys), all tokens are signed with a publicly-known secret. Any attacker can forge arbitrary JWT tokens, impersonate any user including admin.

**Fix:**
```js
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}
```

### C2. Hardcoded Default Admin Credentials

**File:** `server/index.js:80-85`  
```js
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@family.cal');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin', 10);
  // password is literally "admin"
```

**Impact:** Default admin account `admin@family.cal` / `admin` gives full system access. Combined with C1, this is trivially exploitable.

**Fix:** Remove auto-seeded admin. Use a CLI setup command or require admin creation via env vars on first run.

---

## HIGH

### H1. No Rate Limiting on Authentication Endpoints

**File:** `server/index.js` — `/api/auth/login`, `/api/auth/register`

**Impact:** Brute-force attacks on login, credential stuffing, and mass account creation are unrestricted.

**Fix:** Add `express-rate-limit`:
```js
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

### H2. CORS Allows All Origins

**File:** `server/index.js:13`  
```js
app.use(cors({ origin: true, credentials: true }));
```

**Impact:** `origin: true` reflects any requesting origin, meaning any website can make authenticated cross-origin requests. Combined with credential-bearing requests, this enables cross-site attacks.

**Fix:**
```js
app.use(cors({ origin: 'https://your-domain.com', credentials: true }));
```

### H3. JWT Stored in localStorage (XSS → Full Account Takeover)

**File:** `client/src/context/AuthContext.tsx:44,73,79`  
```ts
localStorage.setItem('token', data.token);
```

**Impact:** Any XSS vulnerability allows token theft and full account takeover. localStorage is accessible to all JS on the page.

**Fix:** Use `httpOnly` cookies set by the server. The frontend should not handle tokens directly.

### H4. No Password Strength Requirements

**File:** `server/index.js` — register endpoint, `client/src/pages/RegisterPage.tsx:36`  
```html
<input type="password" ... required minLength={4} />
```

Server-side has **zero** password validation. Client only requires 4 characters (easily bypassed).

**Fix:** Server-side: require minimum 8 characters, reject common passwords. Client validation is cosmetic only.

### H5. No CSRF Protection

**Impact:** Since CORS reflects all origins and credentials are included, state-changing requests (POST/PUT/DELETE) can be triggered from malicious sites. Even with Bearer tokens (which mitigate classic CSRF), the overly permissive CORS (H2) opens the door.

**Fix:** Restrict CORS origins (fixes both H2 and H5). If using cookies, add CSRF tokens.

---

## MEDIUM

### M1. Invite Codes Have Low Entropy

**File:** `server/index.js:73`  
```js
function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex chars = 32 bits
}
```

**Impact:** 2^32 ≈ 4 billion possibilities. While not trivially brute-forceable without rate limiting, it's below recommended entropy for invite links. Combined with no rate limiting, an attacker could enumerate codes.

**Fix:** Use at least 16 bytes (128 bits):
```js
return crypto.randomBytes(16).toString('hex');
```

### M2. Logout is a No-Op (No Token Invalidation)

**File:** `server/index.js:139-141`  
```js
app.post('/api/auth/logout', (req, res) => {
  res.json({ ok: true });
});
```

**Impact:** Stolen tokens remain valid for the full 7-day expiry. No server-side token revocation.

**Fix:** Implement a token blacklist (Redis/DB) or switch to short-lived access tokens + refresh tokens.

### M3. Admin Page Has No Server-Side Route Protection for Frontend

**File:** `client/src/pages/AdminPage.tsx`

The admin page relies on the API returning 403 for non-admin users, but the **route itself** is accessible to any authenticated user in the React router. While API calls will fail, it leaks that an admin panel exists and may expose UI elements.

**Fix:** Add a `ProtectedRoute` wrapper that checks `user.role === 'admin'` before rendering.

### M4. `GET /api/invite/:code` Exposes Family Info Without Authentication

**File:** `server/index.js:179-182`  
```js
app.get('/api/invite/:code', (req, res) => {
  const family = db.prepare('SELECT id, name, slug FROM families WHERE invite_code = ?').get(req.params.code);
```

**Impact:** Unauthenticated endpoint. If invite codes are brute-forced (see M1), family names and IDs are leaked.

**Fix:** Rate-limit this endpoint. Consider requiring authentication.

### M5. No Input Length/Type Validation on Most Endpoints

**File:** `server/index.js` — all POST/PUT handlers

Fields like `title`, `name`, `description`, `location` accept arbitrary-length strings with no validation. `member_id`, `category_id` are not validated as integers.

**Impact:** Storage abuse, potential edge cases. No SQL injection risk (parameterized queries are used correctly), but malformed data could cause issues.

**Fix:** Add input validation (e.g., `zod` or `joi`) with max lengths and type checks.

---

## LOW

### L1. 7-Day Token Expiry is Long

**File:** `server/index.js:113`  
```js
jwt.sign({ ... }, JWT_SECRET, { expiresIn: '7d' });
```

**Impact:** Stolen tokens have a long window of use.

**Fix:** Use shorter access tokens (15-60 min) with refresh token rotation.

### L2. Error Messages May Leak Information

- Login returns `"Invalid credentials"` (good — no user enumeration)
- Register returns `"Email already registered"` — **leaks whether an email is registered**

**Fix:** Return generic error: `"Registration failed"` (trade-off with UX).

### L3. No HTTPS Enforcement

No TLS configuration. Server listens on plain HTTP port 3001.

**Fix:** Deploy behind a reverse proxy (nginx/Caddy) with TLS, or add HSTS headers.

### L4. `invite_code` Returned in Family API Responses

**File:** `server/index.js` — `GET /api/families`, `GET /api/families/:familyId`

The `SELECT *` queries return `invite_code` to all family members, not just owners.

**Fix:** Only return `invite_code` to owners/admins, or strip it from general queries:
```js
const { invite_code, ...safe } = family;
```

---

## Positive Findings ✅

1. **SQL Injection: SAFE** — All `db.prepare()` calls use parameterized queries with `?` placeholders. No string concatenation in SQL.
2. **XSS: LOW RISK** — No use of `dangerouslySetInnerHTML`. React auto-escapes by default.
3. **Password Hashing: GOOD** — bcrypt with cost factor 10 (adequate).
4. **Auth Middleware: GOOD** — All data endpoints require `authMiddleware`. Family access is checked via `requireFamily` or inline membership checks.
5. **AuthZ: GOOD** — Owner-only operations (member CRUD, family edit) properly check `familyRole === 'owner'`. Admin routes check `user.role === 'admin'`.
6. **No Sensitive Data Leakage** — Login endpoint strips `password_hash` before returning user data. `/api/auth/me` selects specific columns.

---

## Recommended Priority Actions

1. **Remove hardcoded JWT secret** — require env var (C1)
2. **Remove default admin seeding** — or randomize password and print to console (C2)
3. **Add rate limiting** on auth endpoints (H1)
4. **Restrict CORS** to actual frontend origin (H2)
5. **Increase invite code entropy** to 128+ bits (M1)
6. **Add server-side password validation** — min 8 chars (H4)
7. **Consider httpOnly cookies** instead of localStorage for tokens (H3)
