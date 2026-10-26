# Histórico de graduação do aluno — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Histórico manual de promoções no perfil (fonte da verdade de `belt`) + filtro por tempo na faixa na lista de Alunos.

**Architecture:** Módulo puro `beltHistory.js` (parse/serialize/sort/derive/seed). Persistência em `students.belt_history_json` + derivados `belt` e `belt_since`. Filtro client-side na lista. Sem API nova.

**Tech Stack:** React (Vite), Vitest, Appwrite (string attrs), Zustand student store.

**Spec:** [docs/superpowers/specs/2026-10-26-historico-graduacao-aluno-design.md](../specs/2026-10-26-historico-graduacao-aluno-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/beltHistory.js` | Parse, serialize, sort, derive, seed, cap, months filter helper |
| `src/test/beltHistory.test.js` | Unit tests do núcleo |
| `src/lib/mapAppwriteStudentDoc.js` | Mapear `beltHistory` + `beltSince` |
| `src/store/useStudentStore.js` | Patch Appwrite dos novos campos |
| `src/lib/studentAppwritePatch.js` | Atributos opcionais (strip unknown) |
| `src/lib/studentsListFilters.js` | Filtro `filtroTempoFaixa` client-side |
| `src/hooks/useStudentsListFilters.js` | Estado do filtro |
| `src/pages/Students.jsx` | UI do select de filtro |
| `src/components/student/StudentBeltHistorySection.jsx` | UI add/edit/delete histórico |
| `src/pages/StudentProfile.jsx` | Integrar seção, seed, belt read-only |
| `src/hooks/useStudentsCreateForm.js` | Seed no create |
| `lib/studentNlUpdates.js` | Remover `belt` do patch NL |
| `scripts/ensure-student-belt-history-attrs.mjs` + `package.json` | Provisionar attrs |
| `docs/appwrite-setup.md` | Documentar attrs |
| `docs/flows/crm/aluno-perfil-presenca.md` | Nota do histórico (se checklist mudar) |

---

### Task 1: Núcleo `beltHistory.js` (TDD)

**Files:**
- Create: `src/lib/beltHistory.js`
- Create: `src/test/beltHistory.test.js`

- [ ] **Step 1:** Escrever testes (seed, sort, derive, empty, cap, `studentMatchesBeltSinceMonths`)
- [ ] **Step 2:** Rodar `npx vitest run src/test/beltHistory.test.js` — deve falhar
- [ ] **Step 3:** Implementar módulo
- [ ] **Step 4:** Testes passam
- [ ] **Step 5:** Commit `feat(crm): núcleo de histórico de graduação (beltHistory)`

API mínima:

```js
export const BELT_HISTORY_MAX = 50;
export function parseBeltHistoryJson(raw) { /* [{id,belt,date}] */ }
export function serializeBeltHistory(entries) { /* JSON string */ }
export function sortBeltHistory(entries) { /* date asc, empty first, id tiebreak */ }
export function deriveBeltFields(entries) { /* { belt, beltSince } from last */ }
export function seedBeltHistoryFromLegacy({ belt, enrollmentDate }) { /* one entry or [] */ }
export function ensureBeltHistorySeeded(student) { /* returns { entries, belt, beltSince, didSeed } */ }
export function buildBeltHistoryPatch(entries) { /* { beltHistory, belt, beltSince, belt_history_json, belt_since } */ }
export function studentMatchesBeltSinceMonths(student, minMonths, todayYmd) { /* true if belt_since <= today-N months */ }
```

---

### Task 2: Persistência (map / store / optional attrs / docs / provision)

- [ ] Mapear em `mapAppwriteStudentDoc.js`
- [ ] Patch em `useStudentStore.js` (`beltHistory` → `belt_history_json`, `beltSince` → `belt_since`)
- [ ] `OPTIONAL_STUDENT_PATCH_ATTRS` += `belt_history_json`, `belt_since`
- [ ] Script `scripts/ensure-student-belt-history-attrs.mjs` + npm script
- [ ] Atualizar `docs/appwrite-setup.md`
- [ ] Commit `feat(crm): persistir belt_history_json e belt_since`

---

### Task 3: Filtro lista Alunos

- [ ] Estender `studentMatchesClientFilters` + hook + limparFiltros / filtrosAtivos
- [ ] Select na UI de `Students.jsx` (desktop + mobile)
- [ ] Testes em `studentsListFilters.test.js`
- [ ] Commit `feat(crm): filtrar alunos por tempo na faixa atual`

---

### Task 4: UI perfil — histórico + seed + belt read-only

- [ ] Componente `StudentBeltHistorySection.jsx`
- [ ] Integrar em `StudentProfile.jsx` (abaixo dados / junto à graduação)
- [ ] Seed idempotente na abertura do perfil
- [ ] Com `graduationsActive`: `GraduationSelect` disabled; salvar dados não manda `belt` editável
- [ ] Commit `feat(crm): histórico de graduação no perfil do aluno`

---

### Task 5: Create form + NL

- [ ] `useStudentsCreateForm.js`: se belt, incluir seed no payload de create
- [ ] Remover `belt` de `ALLOWED_STUDENT_PATCH_KEYS` em `lib/studentNlUpdates.js` (+ teste se existir)
- [ ] Commit `feat(crm): seed de graduação no create e bloquear belt via NL`
- [ ] Atualizar checklist em `docs/flows/crm/aluno-perfil-presenca.md` se aplicável

---

## Self-review vs spec

| Spec item | Task |
|-----------|------|
| JSON + belt/belt_since | 1–2 |
| Seed legado / create | 1, 4, 5 |
| Histórico manual UI | 4 |
| Filtro lista 3/6/12/24 | 3 |
| Sem alerta / sem API nova | — |
| NL não manda belt | 5 |
| Docs Appwrite | 2 |
