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

- [ ] Add/adjust tests for pending → “Em atraso”, paid → “Em dia…”
- [ ] Export default filter constants if useful (`DEFAULT_TYPE_FILTER`, `DEFAULT_PERIOD_FILTER`)
- [ ] Implement label tweaks

### Task 2: Redesign StudentFinancialTimeline UI

**Files:**
- Modify: `src/components/student/StudentFinancialTimeline.jsx`
- Modify: `src/styles/student-profile.css`

- [ ] StatusSituationBand at top
- [ ] Register CTA under band
- [ ] Compact ledger rows; actions only when expanded
- [ ] Remove unified extrato row list (keep totals + CSV)
- [ ] Defaults: plan + 3m; soft freeze control

### Task 3: Docs + verify

**Files:**
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`
- Spec already at `docs/superpowers/specs/2026-07-16-student-profile-payments-status-first-design.md`

- [ ] Checklist items for new UX
- [ ] Run `npm test -- studentFinancialTimeline`
