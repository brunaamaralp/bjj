# Student profile payments status-first — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Make the student profile Payments tab answer “is this student paid up?” in seconds, with a compact ledger.

**Architecture:** Keep data builders in `studentFinancialTimeline.js`; restyle/restructure `StudentFinancialTimeline.jsx` (status hero + compact rows + no duplicate extrato list). CSS in `student-profile.css`.

**Tech Stack:** React, existing paymentStatus/summary helpers, Vitest

---

### Task 1: Summary labels + default filter constants (TDD)

**Files:**
- Modify: `src/lib/studentFinancialTimeline.js`
- Test: `src/test/studentFinancialTimeline.test.js`

- [x] Add/adjust tests for pending → “Em atraso”, paid → “Em dia…”
- [x] Export default filter constants if useful (`DEFAULT_TYPE_FILTER`, `DEFAULT_PERIOD_FILTER`)
- [x] Implement label tweaks

### Task 2: Redesign StudentFinancialTimeline UI

**Files:**
- Modify: `src/components/student/StudentFinancialTimeline.jsx`
- Modify: `src/styles/student-profile.css`

- [x] StatusSituationBand at top
- [x] Register CTA under band
- [x] Compact ledger rows; actions only when expanded
- [x] Remove unified extrato row list (keep totals + CSV)
- [x] Defaults: plan + 3m; soft freeze control

### Task 3: Docs + verify

**Files:**
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`
- Spec already at `docs/superpowers/specs/2026-07-16-student-profile-payments-status-first-design.md`

- [x] Checklist items for new UX
- [x] Run `npm test -- studentFinancialTimeline`
