# Public Experimental Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formulário público `/experimental/:token` que cria ou reagenda lead em Aula experimental com slot opcional e lotação.

**Architecture:** Espelha `publicEnrollment` (settings + token HMAC + handler em `api/leads.js`). Lógica de booking reutiliza `class_slots`/`bookings` e `buildSchedulePatch` para status do funil.

**Tech Stack:** React (Vite), Appwrite, Vercel Functions (`api/leads.js`), Vitest.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/publicExperimentalSettings.js` | Settings, audience rules, form config |
| `src/lib/publicExperimentalToken.js` | HMAC token `nave-exp:v1` |
| `src/lib/publicExperimentalAudience.js` | Idade → tipo; filtro de slots |
| `lib/server/publicExperimentalBook.js` | POST: lead + booking |
| `lib/server/publicExperimentalHandler.js` | GET/POST público + config |
| `src/pages/PublicExperimentalBooking.jsx` | UI pública |
| `src/components/academy/PublicExperimentalSection.jsx` | Admin link |
| `src/test/publicExperimental.test.js` | Client unit tests |
| `lib/server/__tests__/publicExperimentalBook.test.js` | Server unit tests |

**Modify:** `api/leads.js`, `src/App.jsx`, `StudentsSection.jsx`, `lib/bookingCore.js`

---

### Task 1: Core libs (settings, token, audience)

- [ ] `publicExperimentalSettings.js` — read/merge/buildFormConfig
- [ ] `publicExperimentalToken.js` — create/verify
- [ ] `publicExperimentalAudience.js` — inferProfileType, filterSlots, slot visibility
- [ ] Tests in `src/test/publicExperimental.test.js`

### Task 2: Server book + handler

- [ ] `publicExperimentalBook.js` — bookPublicExperimental, listPublicSlots
- [ ] `publicExperimentalHandler.js` — GET slots, POST book, config
- [ ] `BOOKING_SOURCE_PUBLIC` in `bookingCore.js`
- [ ] Wire `api/leads.js`
- [ ] Server tests

### Task 3: Public UI

- [ ] `PublicExperimentalBooking.jsx`
- [ ] `App.jsx` — route + auth bypass for `/experimental/`

### Task 4: Admin UI

- [ ] `PublicExperimentalSection.jsx`
- [ ] Embed in `StudentsSection.jsx` matrícula tab

### Task 5: Verify

- [ ] `npm test -- publicExperimental publicExperimentalBook`
