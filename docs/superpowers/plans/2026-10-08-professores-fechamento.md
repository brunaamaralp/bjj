# Professores — fechamento mensal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/professores` para fechar o mês por professor/instrutor (aulas + experimentais − retiradas) e marcar pago com despesa liquidada no Financeiro.

**Architecture:** Domínio puro em `lib/professorCompensation.js` + `lib/professorClosing.js`; config em `academy.settings.professorCompensation`; retiradas via `saida_professor` em stock moves; fechamentos em coleção Appwrite `professor_closings`; agregação + mark-paid em `api/finance.js?route=professor-closing` (sem nova Serverless Function). UI hub/ficha + modal de retirada compartilhado com Estoque.

**Tech Stack:** React, Vitest, Appwrite, `api/finance.js`, `api/agent.js?route=academy-settings` (leitura settings via academy doc), handlers inventory existentes.

**Spec:** [2026-10-08-professores-fechamento-design.md](../specs/2026-10-08-professores-fechamento-design.md)

**Ship increments (opcional):** após Task 4 = hub só leitura; após Task 6 = retiradas; após Task 8 = mark paid completo.

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/professorCompensation.js` | Parse/normalize config, rates por papel/override, débito produto |
| `lib/professorClosing.js` | Contagem aulas (dedupe), agregação créditos/débitos, snapshot, status, despesa valor |
| `tests/unit/professorCompensation.test.js` | Config + desconto |
| `tests/unit/professorClosing.test.js` | Fórmula + dedupe + snapshot |
| `src/lib/professorCompensationStorage.js` | Ler/gravar `settings.professorCompensation` |
| `lib/server/professorClosingHandler.js` | GET mês + POST mark-paid / reopen |
| `lib/server/professorClosingAggregate.js` | Query slots + leads + moves → DTO |
| `api/finance.js` | Dispatch `route=professor-closing` |
| `lib/server/inventoryMoveHandler.js` | Aceitar `saida_professor` |
| `src/lib/stockInventory.js` | Delta/labels para `saida_professor` |
| `lib/server/stockMoveFields.js` | Schema write + payload builder |
| `scripts/provision-professor-closing-schema.mjs` | Coleção + attrs stock `staff_ref` se faltar |
| `src/lib/professorClosingApi.js` | Client fetch |
| `src/pages/Professores.jsx` | Página |
| `src/components/professores/ProfessoresHub.jsx` | Lista mês |
| `src/components/professores/ProfessorClosingSheet.jsx` | Ficha |
| `src/components/professores/ProfessorCompensationConfig.jsx` | Tabela + % |
| `src/components/professores/ProfessorProductWithdrawModal.jsx` | Modal compartilhado |
| `src/App.jsx`, `src/lib/naviMenu.js` | Rota + menu |
| `docs/flows/operacao/professores-fechamento.md` | Jornada |
| Flows estoque / equipe / financeiro | Atalhos e origem do lançamento |

---

### Task 1: Domínio — compensação e débito de produto

**Files:**
- Create: `lib/professorCompensation.js`
- Test: `tests/unit/professorCompensation.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PRODUCT_DISCOUNT_PCT,
  normalizeProfessorCompensation,
  resolveStaffRates,
  computeProductDebitAmount,
} from '../../lib/professorCompensation.js';

describe('professorCompensation', () => {
  it('defaults product discount to 30', () => {
    const cfg = normalizeProfessorCompensation({});
    expect(cfg.product_discount_pct).toBe(DEFAULT_PRODUCT_DISCOUNT_PCT);
    expect(DEFAULT_PRODUCT_DISCOUNT_PCT).toBe(30);
  });

  it('resolveStaffRates uses override over role', () => {
    const cfg = normalizeProfessorCompensation({
      roles: {
        professor: { lesson_amount: 50, experimental_amount: 30 },
        instructor: { lesson_amount: 40, experimental_amount: 20 },
      },
      overrides: {
        'roster:abc': { lesson_amount: 60 },
      },
    });
    expect(resolveStaffRates(cfg, 'roster:abc', 'professor')).toEqual({
      lesson_amount: 60,
      experimental_amount: 30,
    });
    expect(resolveStaffRates(cfg, 'roster:xyz', 'instructor').lesson_amount).toBe(40);
  });

  it('computeProductDebitAmount applies discount on sale price', () => {
    expect(computeProductDebitAmount({ unitPrice: 100, qty: 2, discountPct: 30 })).toBe(140);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/professorCompensation.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```js
// lib/professorCompensation.js
export const DEFAULT_PRODUCT_DISCOUNT_PCT = 30;

export function normalizeProfessorCompensation(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const pct = Number(src.product_discount_pct);
  const product_discount_pct =
    Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : DEFAULT_PRODUCT_DISCOUNT_PCT;

  const role = (key) => {
    const r = src.roles?.[key] || {};
    return {
      lesson_amount: Math.max(0, Number(r.lesson_amount) || 0),
      experimental_amount: Math.max(0, Number(r.experimental_amount) || 0),
    };
  };

  const overrides = {};
  for (const [ref, o] of Object.entries(src.overrides || {})) {
    if (!ref) continue;
    const lesson = o?.lesson_amount;
    const exp = o?.experimental_amount;
    overrides[ref] = {
      ...(lesson != null && Number.isFinite(Number(lesson))
        ? { lesson_amount: Math.max(0, Number(lesson)) }
        : {}),
      ...(exp != null && Number.isFinite(Number(exp))
        ? { experimental_amount: Math.max(0, Number(exp)) }
        : {}),
    };
  }

  return {
    product_discount_pct,
    roles: {
      professor: role('professor'),
      instructor: role('instructor'),
    },
    overrides,
  };
}

export function resolveStaffRates(cfg, staffRef, role) {
  const c = normalizeProfessorCompensation(cfg);
  const base =
    role === 'instructor' ? c.roles.instructor : c.roles.professor;
  const o = c.overrides[String(staffRef || '').trim()] || {};
  return {
    lesson_amount: o.lesson_amount != null ? o.lesson_amount : base.lesson_amount,
    experimental_amount:
      o.experimental_amount != null ? o.experimental_amount : base.experimental_amount,
  };
}

export function computeProductDebitAmount({ unitPrice, qty, discountPct }) {
  const price = Math.max(0, Number(unitPrice) || 0);
  const q = Math.max(0, Math.trunc(Number(qty) || 0));
  const d = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const factor = 1 - d / 100;
  return Math.round(price * q * factor * 100) / 100;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/unit/professorCompensation.test.js`

- [ ] **Step 5: Commit**

```bash
git add lib/professorCompensation.js tests/unit/professorCompensation.test.js
git commit -m "feat(professores): domain for compensation rates and product debit"
```

---

### Task 2: Domínio — fechamento (contagens + líquido + snapshot)

**Files:**
- Create: `lib/professorClosing.js`
- Test: `tests/unit/professorClosing.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  countLessonsForStaff,
  buildClosingAmounts,
  financeExpenseAmountFromNet,
  CLOSING_STATUS_OPEN,
  CLOSING_STATUS_PAID,
} from '../../lib/professorClosing.js';

describe('professorClosing', () => {
  it('dedupes same person as professor and instructor on one slot', () => {
    const slots = [
      {
        lesson_status: 'confirmed',
        slot_date: '2026-10-01',
        professor_user_id: 'roster:p1',
        instructor_user_id: 'roster:p1',
      },
    ];
    expect(countLessonsForStaff(slots, 'roster:p1')).toBe(1);
  });

  it('buildClosingAmounts applies rates', () => {
    const amounts = buildClosingAmounts({
      lessonCount: 2,
      experimentalCount: 1,
      productDebits: [70, 30],
      rates: { lesson_amount: 50, experimental_amount: 20 },
    });
    expect(amounts).toEqual({
      credits_lessons: 100,
      credits_experimental: 20,
      debits_products: 100,
      net: 20,
    });
  });

  it('financeExpenseAmountFromNet clamps negative to 0', () => {
    expect(financeExpenseAmountFromNet(-40)).toBe(0);
    expect(financeExpenseAmountFromNet(120)).toBe(120);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```js
// lib/professorClosing.js
import { LESSON_STATUS_CONFIRMED, normalizeLessonStatus, parseLessonInstructors } from './lessonStaffRegister.js';

export const CLOSING_STATUS_OPEN = 'aberto';
export const CLOSING_STATUS_PAID = 'pago';

export function countLessonsForStaff(slots = [], staffRef) {
  const ref = String(staffRef || '').trim();
  if (!ref) return 0;
  let n = 0;
  for (const slot of slots || []) {
    if (normalizeLessonStatus(slot?.lesson_status) !== LESSON_STATUS_CONFIRMED) continue;
    const professorId = String(slot.professor_user_id || '').trim();
    const instructorIds = parseLessonInstructors(slot).map((e) => e.id);
    const hit = professorId === ref || instructorIds.includes(ref);
    if (hit) n += 1;
  }
  return n;
}

export function buildClosingAmounts({
  lessonCount = 0,
  experimentalCount = 0,
  productDebits = [],
  rates = {},
} = {}) {
  const lessonRate = Math.max(0, Number(rates.lesson_amount) || 0);
  const expRate = Math.max(0, Number(rates.experimental_amount) || 0);
  const credits_lessons = Math.round(lessonCount * lessonRate * 100) / 100;
  const credits_experimental = Math.round(experimentalCount * expRate * 100) / 100;
  const debits_products =
    Math.round(
      (productDebits || []).reduce((s, v) => s + (Number(v) || 0), 0) * 100
    ) / 100;
  const net =
    Math.round((credits_lessons + credits_experimental - debits_products) * 100) / 100;
  return { credits_lessons, credits_experimental, debits_products, net };
}

export function financeExpenseAmountFromNet(net) {
  const n = Number(net);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function buildPaidSnapshot({ counts, amounts, rates, discountPct }) {
  return {
    status: CLOSING_STATUS_PAID,
    counts: { ...counts },
    amounts: { ...amounts },
    rates_snapshot: { ...rates, product_discount_pct: discountPct },
  };
}
```

Use `parseLessonInstructors` — if instructor blob is only `instructor_user_id` string without JSON, existing parser already handles it.

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/unit/professorClosing.test.js`

- [ ] **Step 5: Commit**

```bash
git add lib/professorClosing.js tests/unit/professorClosing.test.js
git commit -m "feat(professores): closing amounts and lesson counts domain"
```

---

### Task 3: Persistência da config em academy.settings

**Files:**
- Create: `src/lib/professorCompensationStorage.js`
- Modify: `lib/server/academySettingsHandler.js` — permitir merge de `settings` patch **ou** rota dedicada em `api/agent.js?route=professor-compensation` que faz get academy → merge `settings.professorCompensation` → update (preferir rota dedicada para não abrir `settings` inteiro no ALLOWED_KEYS)
- Test: `src/test/professorCompensationStorage.test.js`

- [ ] **Step 1: Storage helpers**

```js
// src/lib/professorCompensationStorage.js
import { parseAcademySettings } from './stockSettings.js';
import { normalizeProfessorCompensation } from '../../lib/professorCompensation.js';

export const PROFESSOR_COMPENSATION_SETTINGS_KEY = 'professorCompensation';

export function readProfessorCompensationFromAcademy(academyDoc) {
  const settings = parseAcademySettings(academyDoc?.settings ?? academyDoc?.settings_json);
  return normalizeProfessorCompensation(settings[PROFESSOR_COMPENSATION_SETTINGS_KEY]);
}

export function mergeProfessorCompensationIntoSettings(rawSettings, compensation) {
  const base = parseAcademySettings(rawSettings);
  return {
    ...base,
    [PROFESSOR_COMPENSATION_SETTINGS_KEY]: normalizeProfessorCompensation(compensation),
  };
}
```

- [ ] **Step 2: API save (owner/admin)**

Create `lib/server/professorCompensationHandler.js`:
- GET: return `readProfessorCompensationFromAcademy`
- POST body `{ compensation }`: `ensureAcademyOwnerOrAdmin` → merge settings JSON → `databases.updateDocument` academies
- Wire in `api/agent.js`: `route === 'professor-compensation'`

- [ ] **Step 3: Tests for merge/read + commit**

```bash
git add src/lib/professorCompensationStorage.js lib/server/professorCompensationHandler.js api/agent.js src/test/professorCompensationStorage.test.js
git commit -m "feat(professores): persist compensation config in academy settings"
```

---

### Task 4: Schema fechamento + agregador GET (hub só leitura)

**Files:**
- Create: `scripts/provision-professor-closing-schema.mjs` — coleção `professor_closings` (env `VITE_APPWRITE_PROFESSOR_CLOSINGS_COLLECTION_ID`) com attrs: `academy_id`, `staff_ref`, `staff_name`, `role`, `year_month`, `status`, `counts_json`, `amounts_json`, `rates_snapshot_json`, `finance_tx_id`, `paid_at`, `paid_by` (+ indexes academy+month, academy+staff+month unique)
- Create: `lib/server/professorClosingAggregate.js`
- Create: `lib/server/professorClosingHandler.js` (GET only nesta task)
- Modify: `api/finance.js` — `route=professor-closing`
- Create: `src/lib/professorClosingApi.js`
- Test: `tests/unit/professorClosingAggregate.test.js` (funções puras de merge se extraídas)

**GET contract** `GET /api/finance?route=professor-closing&month=YYYY-MM`:

```json
{
  "ok": true,
  "month": "2026-10",
  "compensation": { "...normalize..." },
  "rows": [
    {
      "staff_ref": "roster:x",
      "name": "Ana",
      "role": "professor",
      "counts": { "lessons": 8, "experimentals": 2, "withdrawals": 1 },
      "amounts": { "credits_lessons": 400, "credits_experimental": 60, "debits_products": 70, "net": 390 },
      "status": "aberto",
      "closing_id": null,
      "finance_tx_id": null,
      "post_paid_activity": false
    }
  ]
}
```

**Aggregate sources:**
1. Active roster + login staff that appear in confirmed slots / experimentals / withdrawals that month (union).
2. Slots: reuse query pattern from `lessonStaffRegisterServer` filtered by `slot_date` in month; `countLessonsForStaff`.
3. Experimentals: leads with `attended_at` in month and `experimental_professor_user_id` = staff_ref (same as funil report).
4. Withdrawals: stock moves `movement_kind=professor` or `tipo` granular `saida_professor` with date in month; sum `line_total` as debit (Task 5 cria os moves — até lá lista vazia).
5. Existing `professor_closings` docs for status/snapshot when `pago`.

**Role for rates:** roster `role`; login-only staff default `professor` unless they only appear as instructor counts (if `as_instructor > 0 && as_professor === 0` → instructor).

- [ ] Provision script + wire GET + unit tests on pure helpers
- [ ] Commit: `feat(professores): aggregate monthly closing hub payload`

---

### Task 5: Retirada `saida_professor` (estoque)

**Files:**
- Modify: `src/lib/stockInventory.js` — `quantityDeltaForMoveType` case `saida_professor` → negativo; label “Saída (professor)”
- Modify: `lib/server/stockMoveFields.js` — `stockMoveTipoForSchemaWrite('saida_professor') === 'saida'`; add `buildProfessorWithdrawStockMovePayload`
- Modify: `lib/server/inventoryMoveHandler.js` — `validateMoveTipo` include `saida_professor`; pass through `unit_price`, `line_total`, `movement_kind: 'professor'`, `referencia_id: staff_ref`, `notes` with `discount_pct`
- Modify: `src/lib/inventoryStockPatch.js` — treat `saida_professor` like sale pool exit (`buildSaleStockPatch` SALE) **or** available qty delta (prefer available qty if product not sold via dual pool — mirror `saida_venda` only when item is sale-scoped; else available patch)
- Create modal: `src/components/professores/ProfessorProductWithdrawModal.jsx`
- Wire button in Inventory moves panel + Professores page (Task 7)
- Extend provision script: attr `staff_ref` string on stock_moves if not using only `referencia_id`

**Payload builder:**

```js
export function buildProfessorWithdrawStockMovePayload({
  academyId,
  itemEstoqueId,
  productId,
  quantidade,
  staffRef,
  staffName,
  unitPrice,
  discountPct,
  debitAmount,
  usuarioId,
  usuarioName,
}) {
  return {
    academy_id: academyId,
    item_estoque_id: itemEstoqueId,
    tipo: 'saida_professor',
    quantidade,
    referencia_id: staffRef,
    motivo: `Retirada professor: ${staffName || staffRef}`,
    usuario_id: usuarioId,
    movement_kind: 'professor',
    product_id: productId,
    unit_price: unitPrice,
    line_total: debitAmount,
    source: 'professor_withdraw',
    notes: JSON.stringify({ discount_pct: discountPct, staff_name: staffName }),
    usuario_name: usuarioName,
  };
}
```

- [ ] Tests: `src/test/stockMoveFields.test.js` extend mapping; debit amount in domain already covered
- [ ] Commit: `feat(professores): inventory withdraw type saida_professor`

---

### Task 6: Mark paid + estorno (finance)

**Files:**
- Extend: `lib/server/professorClosingHandler.js` POST actions `mark-paid` | `reopen`
- Reuse create settled expense via `buildFinanceTxPayload` + `createDocumentResilient` on FINANCIAL_TX (padrão POST em `financeTxHandler`) with:
  - `type` / category label: `FINANCE_CATEGORIES.SALARIOS.label` (“Salários e encargos”)
  - `status: 'settled'`
  - `amount: financeExpenseAmountFromNet(net)`
  - description: `Fechamento professor — {name} — {YYYY-MM}`
  - metadata: `professor_closing_id`, `staff_ref`
- RBAC: only owner/admin for mark-paid / reopen
- Persist closing doc with snapshot; set `finance_tx_id`
- Reopen: `reverseSettledFinanceTx` or cancel pattern already used in finance + set status `aberto` and clear finance fields

**POST mark-paid body:**

```json
{
  "action": "mark-paid",
  "month": "2026-10",
  "staff_ref": "roster:x",
  "payment_method": "pix",
  "bank_account_id": "optional"
}
```

Server recalculates aggregate for that staff (ignore client net), confirms open status, writes snapshot, creates settled tx.

- [ ] Handler tests with mocked databases where harness pattern exists
- [ ] Commit: `feat(professores): mark monthly closing paid with settled expense`

---

### Task 7: UI — página `/professores`

**Files:**
- Create: `src/pages/Professores.jsx`
- Create: hub, sheet, config components under `src/components/professores/`
- Modify: `src/App.jsx` — lazy route `/professores`
- Modify: `src/lib/naviMenu.js` — add direct item “Professores” near Equipe (account/ops area — follow where Equipe link lives in header/user menu if not sidebar; if only `/equipe` is account menu, add sibling link in same menu component)
- Wire: month picker, table, navigate/query `?staff=&month=`
- Sheet: breakdown lists (lessons detail optional collapse), mark paid `ConfirmDialog`, link to finance tx when paid
- Config panel: role rates + discount % + per-staff overrides (owner/admin)
- Member: hide mark paid + config; show withdraw if `modules.inventory`

UI patterns: `useToast`, `ErrorBanner`, `ConfirmDialog`, DESIGN_SYSTEM tokens — mirror `Equipe` / Financeiro hub density.

- [ ] Commit: `feat(professores): closing hub page and navigation`

---

### Task 8: Modal retirada nos dois lugares + docs de fluxo

**Files:**
- Wire `ProfessorProductWithdrawModal` in `Professores.jsx` and `src/pages/Inventory.jsx` / moves panel
- Create: `docs/flows/operacao/professores-fechamento.md` from `_template.md`
- Update: `docs/flows/vendas/estoque-movimentacoes.md`, `docs/flows/config/equipe-colaboradores.md`, `docs/flows/financeiro/lancamentos-caixa.md` (origem), `docs/flows/README.md`
- Update: `docs/flows/VALIDATION.md` if checklist needed

- [ ] Manual checklist from spec §14
- [ ] Commit: `docs(professores): user flows for closing and withdraw`

---

## Self-review (plan vs spec)

| Spec | Task |
|------|------|
| G1 Hub mensal | 4, 7 |
| G2 Ficha breakdown | 7 |
| G3 Config global+override | 1, 3, 7 |
| G4 Débito % academia | 1, 5 |
| G5 Retirada dois atalhos | 5, 8 |
| G6 Mark paid liquidado | 6 |
| G7 Sem nova function | finance + agent routes |
| Non-goal rateio | Task 2 dedupe |
| Líquido negativo → despesa 0 | `financeExpenseAmountFromNet` |
| Fluxos docs | 8 |

No TBD left in task outcomes; persistence of closings collection and settings key are explicit.

---

## Execution notes

- Never create `api/professores.js` — Hobby 12/12.
- Reuse `encodeStaffRef` / `decodeStaffRef` / `buildLessonStaffPickerOptions` from `lib/staffRoster.js`.
- Experimental credits: only `attended_at` in month (not missed) — align with experimental professor report.
- After implementation, run:  
  `npm test -- professorCompensation professorClosing stockMoveFields professorCompensationStorage`
