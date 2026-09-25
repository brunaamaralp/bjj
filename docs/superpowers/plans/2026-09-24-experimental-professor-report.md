# Professor da experimental + relatório — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Gravar quem conduziu a experimental no lead e exibir relatório mensal (comparecimentos + conversões por professor) no Funil.

**Architecture:** Campos no lead + domínio puro `lib/experimentalProfessor.js`; UI modal no fechamento Veio/Não veio; agregação em `aggregateLeadsReport`; seção no `ReportsFunilPanel`. Sem nova function Vercel.

**Tech Stack:** Appwrite leads/students, React, Vitest.

---

### Task 1: Domínio + testes

- Create: `lib/experimentalProfessor.js`
- Test: `tests/unit/experimentalProfessor.test.js`

- [x] Patch/clear professor, aggregate by professor, CSV rows
- [x] Testes verdes

### Task 2: Schema + map/store

- Modify: `scripts/verify-and-fix-schema-crm.mjs` (leads + students attrs)
- Modify: `src/lib/mapAppwriteLeadDoc.js`, `src/store/useLeadStore.js`
- Modify: `lib/server/reportsPeople.js` (merge preserve + student map)
- Modify: `src/lib/leadPresenceActions.js` (undo limpa professor)

- [x] Schema + map/store

### Task 3: Modal + wiring presença

- Create: `src/components/leads/ConfirmExperimentalProfessorModal.jsx`
- Modify: Dashboard, LeadProfile, Pipeline (Compareceu / Não compareceu / editar)

- [x] Modal + wiring

### Task 4: Relatório Funil

- Modify: `lib/server/reportsAggregate.js`, `lib/reportsMetricDefinitions.js`
- Modify: `ReportsFunilPanel.jsx` (+ export CSV se padrão existir)
- Modify: `docs/flows/analise/relatorios-indicadores.md`, `funil-lead-matricula.md`
- Test: estender `src/test/reports.test.js`

- [x] Relatório + docs
