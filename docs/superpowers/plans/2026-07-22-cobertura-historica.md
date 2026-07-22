# Cobertura histórica — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Owner/admin marca N meses (1–24) como cobertos no perfil do aluno, com R$ 0 e zero espelho no Caixa (`covered_reason: historical`).

**Architecture:** Reusa `bundle` + status `covered` em todos os meses; função dedicada de create (sem mirror); CTA + modal só no perfil.

**Tech Stack:** React, Appwrite `student_payments`, Vitest, handler em `api` via route existente.

**Spec:** [2026-07-22-cobertura-historica-design.md](../specs/2026-07-22-cobertura-historica-design.md)

---

### Task 1: Specs + preview (lib)

**Files:**
- Modify: `src/lib/bundleCoverage.js`
- Test: `src/test/bundleCoverage.test.js`

- [ ] `buildHistoricalCoverageMonthSpecs({ startYm, bundleMonths, note })` — todos `covered`, amount 0, `covered_reason: historical`
- [ ] `previewHistoricalCoverageActions(existingByMonth, specs)` — counts create/upsert/skip
- [ ] Constant `HISTORICAL_COVERED_REASON = 'historical'`
- [ ] Tests

### Task 2: Create server + client (no mirror)

**Files:**
- Modify: `lib/server/studentPaymentBundleCreate.js`
- Modify: `lib/server/studentPaymentsHandler.js`
- Modify: `src/lib/studentPayments.js`
- Modify: `src/lib/studentPaymentsApi.js`
- Test: `src/test/bundleCoverage.test.js` + handler test if needed

- [ ] `createHistoricalCoveragePaymentServer` — âncora = primeiro mês **criado**; skip paid/partial; never call mirror
- [ ] Handler: `covered_reason === 'historical'` (ou `action: historical_coverage`) before normal bundle; skip method validation / amount > 0; require owner/admin
- [ ] Client `createHistoricalCoveragePayment(data)`

### Task 3: UI perfil

**Files:**
- Create: `src/components/student/HistoricalCoverageModal.jsx` (+ CSS mínimo se preciso)
- Modify: `src/pages/StudentProfile.jsx`
- Modify: `src/components/student/StudentFinancialTimeline.jsx`

- [ ] CTA “Cobertura histórica” quando `canManagePayments`
- [ ] Modal: mês início, duração 1–24, nota; preview skipped/created
- [ ] Save → API → reload payments + toast

### Task 4: Timeline label + docs

**Files:**
- Modify: `src/lib/studentFinancialTimeline.js`
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`
- Modify: `docs/flows/VALIDATION.md`

- [ ] Bundle historical mostra título/subtítulo de migração
- [ ] Checklist no fluxo do perfil
- [ ] VALIDATION row

### Task 5: Verify

- [ ] `npm test -- bundleCoverage studentFinancialTimeline` (e handler se houver)
- [ ] Commit feature only
