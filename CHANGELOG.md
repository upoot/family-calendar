# Changelog

## [0.1.0] - 2026-01-30

### 🎉 Initial Release

First public release of Family Calendar - a modern, collaborative family scheduling app.

### ✨ Features

**Calendar & Events**
- Week-based calendar view with drag-and-drop events
- Multi-member support with color-coded avatars
- Recurring and one-time events
- Category system with emoji icons
- Timeline widget with infinite scroll
- Week numbers (ISO 8601) in header and timeline dividers
- Copy week events to next week

**Natural Language Processing**
- Smart event creation from text (e.g., "tennis tomorrow 15:00")
- Todo and shopping list creation via NLP
- Member assignment syntax (@name)
- Fallback to LLM when rules don't match

**Task Management**
- Todo list widget with checkboxes
- Shopping list widget with quantity support
- Persistent state across sessions

**User & Family Management**
- Multi-family support (switch between families)
- Invite system with shareable links
- Role-based access (owner, member)
- Onboarding flow for new users

**UX & Polish**
- Dark theme with subtle gradients
- Responsive design (mobile-friendly)
- i18n support (Finnish & English)
- Smooth animations and transitions
- Landing page (/welcome)

**Admin & Settings**
- Superadmin panel
- Family settings (name, members, categories)
- User password change

### 🔧 Technical

- **Stack:** Express + better-sqlite3 backend, React + Vite frontend
- **Auth:** JWT-based authentication
- **Testing:** Playwright E2E tests, Vitest API tests
- **Deployment:** Ready for production (build script included)

### 📦 72 commits since project start

This release represents the foundation of a modern family calendar app with AI-powered features and collaborative scheduling.
