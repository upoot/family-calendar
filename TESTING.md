# 🧪 Testing Strategy — Family Calendar

## Testing Pyramid

```
         ╱ E2E ╲          Playwright (critical user flows)
        ╱───────╲
       ╱  Integ  ╲        Supertest + SQLite (API contract)
      ╱───────────╲
     ╱    Unit     ╲      Vitest (logic, utils, hooks)
    ╱───────────────╲
```

## Stack

| Layer | Tool | Why |
|-------|------|-----|
| **Unit** | **Vitest** | Vite-native, fastest, shared config |
| **API / Contract** | **Vitest + Supertest** | Endpoint testing, response contract validation |
| **Component** | **Vitest + Testing Library** | Isolated React component testing |
| **E2E / UI** | **Playwright** | Cross-browser, auto-wait, best-in-class |
| **Contract** | **Zod schemas** | Shared types → runtime validation → API contract enforcement |

## Scope

### 1. Unit Tests (Vitest)
- Date/week utility functions (getMonday, fmt, addDays)
- Auth helpers (token parsing, validation logic)
- Form validation logic
- Event filtering/sorting

### 2. API Contract Tests (Vitest + Supertest)
- **Auth flow**: register → login → me → change-password
- **Family CRUD**: create, get, update, delete
- **Member CRUD**: create, update, reorder, delete
- **Event CRUD**: create, get (by week), update, patch (drag), delete
- **User management**: family admin creates user, must_change_password flow
- **AuthZ**: owner vs member vs superadmin permissions
- **Error cases**: 401, 403, 404, validation errors
- **Zod schemas**: response shape validation — backend and frontend share same schemas

### 3. Component Tests (Vitest + Testing Library)
- EventModal: form validation, submit, delete
- OnboardingPage: wizard step navigation
- SettingsPage: tab switching, CRUD forms
- AuthContext: login/logout/token management
- ChangePasswordPage: validation, forced flow

### 4. E2E Tests (Playwright)
Critical user journeys:
- **Happy path**: Register → onboarding wizard → calendar → add event → drag event
- **Family admin**: Login → settings → add member → create user → invite link
- **Temp password**: Login with temp → forced change → calendar
- **Multi-family**: Switch between families
- **Auth guard**: Unauthenticated → redirect to login

## Directory Structure

```
family-calendar/
├── shared/
│   └── schemas.ts          # Zod schemas (API contract)
├── server/
│   └── __tests__/
│       ├── auth.test.ts
│       ├── families.test.ts
│       ├── members.test.ts
│       ├── events.test.ts
│       └── authorization.test.ts
├── client/
│   └── src/
│       ├── __tests__/
│       │   ├── utils.test.ts
│       │   └── components/
│       │       ├── EventModal.test.tsx
│       │       ├── Onboarding.test.tsx
│       │       └── Settings.test.tsx
│       └── ...
├── e2e/
│   ├── auth.spec.ts
│   ├── calendar.spec.ts
│   ├── onboarding.spec.ts
│   ├── settings.spec.ts
│   └── fixtures/
│       └── test-helpers.ts
├── vitest.config.ts
└── playwright.config.ts
```

## Contract Testing — Zod Flow

```typescript
// shared/schemas.ts — single source of truth
export const UserSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(['superadmin', 'user']),
  must_change_password: z.number(),
});

// In API tests:
const res = await request(app).get('/api/auth/me');
expect(() => UserSchema.parse(res.body)).not.toThrow();

// In frontend:
const user = UserSchema.parse(await apiFetch('/api/auth/me'));
// → type safety + runtime validation
```

## Scripts

```bash
npm run test:unit       # Vitest unit + component tests
npm run test:api        # Vitest + Supertest API contract tests
npm run test:e2e        # Playwright E2E tests
npm run test            # All tests
```

## CI/CD (GitHub Actions)

```yaml
jobs:
  test:
    steps:
      - npm run test:unit
      - npm run test:api
      - npm run test:e2e
```

## Priority (for shipping)

1. 🔴 **API contract tests** — ensures backend doesn't break frontend expectations
2. 🔴 **E2E happy paths** — critical user journeys work
3. 🟡 **Unit tests** — utility functions
4. 🟢 **Component tests** — nice to have
