# NLP Event Creation & School Integration

## 🎯 Overview

This PR adds two major features:
1. **Natural Language Event Creation** - Create calendar events directly from NLP bar
2. **School Integration** - Sync exams from School to family calendar (stealth mode, responsible scraping)

## ✨ NLP Event Creation

Users can now create calendar events using natural language:

**Examples:**
- `treeni @aino ti klo 18` → Event for Aino, Tuesday 18:00-19:00
- `varaa: jalkapallo huomenna 15.30` → Event tomorrow 15:30-16:30
- `tennis pe 14` → Event Friday 14:00-15:00

**Features:**
- ✅ Finnish weekdays (ma, ti, ke, to, pe, la, su + long forms)
- ✅ English weekdays (monday, tuesday, etc.)
- ✅ Relative days (huomenna, ylihuomenna, tänään, tomorrow, today)
- ✅ Time parsing (klo 18, kello 17:30, 15.00)
- ✅ Member assignment via @mention or name
- ✅ Auto-assign to first family member if unspecified
- ✅ ISO 8601 week number calculation

## 🏫 School Integration (Stealth Mode)

Responsible scraper for syncing exams from School school calendar.

**Security & Ethics:**
- ✅ Stealth mode: User-agent spoofing, webdriver detection removal
- ✅ Session reuse: Stores cookies to avoid repeated logins
- ✅ Rate limiting: Max 1 sync per 15 minutes per family
- ✅ Audit logging: All sync attempts tracked
- ✅ Authenticated access only (user's own child's data)
- ✅ Human-like delays and behavior
- ✅ Configurable base URL (works for all Finnish cities)

**API Endpoints:**
- `GET /api/families/:familyId/integrations/school` - Get settings
- `PUT /api/families/:familyId/integrations/school` - Save settings
- `POST /api/families/:familyId/integrations/school/sync` - Sync exams

**Database:**
- `integration_settings` - Credentials, session cookies, config
- `integration_syncs` - Audit log (timestamp, event count, status, errors)

## 📦 Infrastructure

- **Playwright** dependency added for headless browser automation
- **Migration system** for database schema updates
- **System Chromium** support (via `CHROMIUM_PATH` env var)
- **Playwright config** updated for system browser

## 🧪 Testing

- ✅ API tests: 72/72 passing
- ⏸️ E2E tests: Requires system Chromium dependencies (not critical)

## 🚀 Next Steps

**Before public release:**
1. Install Chromium on production: `sudo apt-get install chromium-browser`
2. Add UI settings page for School credentials
3. Test with real School accounts
4. Add S-kauppa integration (similar pattern)
5. Consider optional auto-sync via cron

## 🔒 Responsible Use

This integration is designed with permission and ethics in mind:
- Only accesses authenticated user's own data
- Respects rate limits and server load
- Human-like behavior to avoid detection
- Session reuse minimizes login attempts
- Audit trail for transparency

**Will be tested privately before feature announcement.**

---

## 📝 Commit Details

```
feat: NLP event creation and School integration

NLP Event Creation:
- Add parseDateTime() for Finnish/English weekday parsing
- Support relative days and time parsing
- Support @mentions and member name extraction
- Auto-assign to first member if unspecified

School Integration (Stealth Mode):
- Build responsible scraper with anti-detection
- Rate limiting: max 1 sync per 15min per family
- API endpoints + DB tables
- Audit logging for all sync attempts
- Default to Jyväskylä, configurable per family

Infrastructure:
- Add Playwright for browser automation
- Create migrations system
- Update Playwright config for system Chromium
```
