# Desconto individual por matricula Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir desconto fixo individual por aluno, persistido em `students.discount_amount`, e fazer matricula, mensalidades, inadimplencia e projections usarem o valor liquido do plano.

**Architecture:** O desconto entra como atributo opcional do aluno em Appwrite e passa a ser resolvido por helpers centrais no dominio de cobranca (`planBilling` + `collectionOverdue` + `paymentStatus`). A UI da matricula salva e exibe o desconto, enquanto backend e relatórios reaproveitam o calculo central sem recalcular registros ja persistidos.

**Tech Stack:** React 19, Vite, Vitest, Appwrite, Node server handlers em Vercel.

**Spec:** `docs/superpowers/specs/2026-06-23-enrollment-discount-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/planBilling.js` | Modify | Helper `getStudentDiscountAmount`, `calcFinalPrice`, resolucao de valor final do plano |
| `src/lib/collectionOverdue.js` | Modify | `openAmountForStudent` passa a aplicar desconto |
| `src/lib/paymentStatus.js` | Modify | `expectedAmountForStudent` e dependentes continuam respeitando persistido antes do desconto |
| `src/lib/enrollmentPayment.js` | Modify | Pre-preenchimento da primeira cobranca com valor liquido |
| `src/components/MatriculaModal.jsx` | Modify | Estado, validacao e persistencia do desconto no fluxo de matricula |
| `src/components/MatriculaPaymentStep.jsx` | Modify | Preview de plano/desconto/valor final e sincronizacao do valor no form |
| `src/lib/leadStudentPayload.js` | Modify | Salvar `discount_amount` em `students` |
| `src/lib/mapAppwriteStudentDoc.js` | Modify | Mapear `discount_amount` para UI |
| `src/lib/studentAppwritePatch.js` | Modify | Permitir patch opcional de `discount_amount` |
| `src/store/useStudentStore.js` | Modify | Persistir atualizacao de `discountAmount` se o perfil editar este campo no futuro imediato |
| `lib/server/studentPaymentsHandler.js` | Modify | Fallback server-side de `expected_amount` com desconto |
| `src/pages/StudentProfile.jsx` | Modify | Exibir plano original, desconto e valor final no perfil |
| `src/test/paymentStatus.test.js` | Modify | Cobrir calculo liquido e precedencia de `expected_amount` |
| `src/test/leadStudentPayload.test.js` | Modify | Cobrir persistencia e mapeamento do novo campo |
| `src/test/matriculaPaymentStep.test.jsx` | Create | Cobrir preview e validacao visual do desconto |
| `scripts/verify-and-fix-schema-crm.mjs` | Modify | Provisionar `discount_amount` em `students` |
| `docs/appwrite-setup.md` | Modify | Documentar novo atributo |
| `docs/data-model.md` | Modify | Refletir o novo campo em `students` |
| `docs/flows/crm/funil-lead-matricula.md` | Modify | Atualizar jornada da matricula com desconto individual |
| `docs/flows/crm/aluno-perfil-presenca.md` | Modify | Atualizar detalhe do perfil exibindo desconto |
| `docs/flows/financeiro/a-receber-mensalidades.md` | Modify | Atualizar regra de valor esperado com desconto |
| `docs/flows/VALIDATION.md` | Modify | Registrar a divergencia corrigida entre codigo e fluxo |

---

## Phase 1 — Core pricing + tests

### Task 1: Centralizar o calculo do valor liquido

**Files:**
- Modify: `src/lib/planBilling.js`
- Modify: `src/lib/collectionOverdue.js`
- Modify: `src/lib/paymentStatus.js`
- Modify: `src/test/paymentStatus.test.js`

- [ ] **Step 1: Write failing tests for discount helpers and precedence**

```javascript
// src/test/paymentStatus.test.js
import { describe, it, expect } from 'vitest';
import { expectedAmountForStudent } from '../lib/paymentStatus.js';
import { openAmountForStudent } from '../lib/collectionOverdue.js';
import { calcFinalPrice, getStudentDiscountAmount } from '../lib/planBilling.js';

describe('student discount pricing', () => {
  const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };

  it('calcFinalPrice clamps at zero', () => {
    expect(calcFinalPrice(200, 30)).toBe(170);
    expect(calcFinalPrice(200, 250)).toBe(0);
  });

  it('getStudentDiscountAmount reads student field safely', () => {
    expect(getStudentDiscountAmount({ discount_amount: 30 })).toBe(30);
    expect(getStudentDiscountAmount({ discountAmount: 15 })).toBe(15);
    expect(getStudentDiscountAmount({ discount_amount: null })).toBe(0);
  });

  it('openAmountForStudent uses plan price minus discount', () => {
    const student = { plan: 'Mensal', discount_amount: 30 };
    expect(openAmountForStudent(student, null, financeConfig)).toBe(170);
  });

  it('expectedAmountForStudent keeps persisted expected_amount precedence', () => {
    const student = { plan: 'Mensal', discount_amount: 30 };
    expect(
      expectedAmountForStudent(student, financeConfig, { status: 'pending', expected_amount: 140 })
    ).toBe(140);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/test/paymentStatus.test.js
```

Expected: falhas indicando exports ausentes em `planBilling.js` e calculo ainda usando `plan.price` bruto.

- [ ] **Step 3: Implement minimal discount helpers**

```javascript
// src/lib/planBilling.js
import { findPlanByName } from './academyPlans.js';

export function getStudentDiscountAmount(student = {}) {
  const raw = Number(student?.discount_amount ?? student?.discountAmount ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

export function calcFinalPrice(planPrice, discountAmount = 0) {
  const price = Number(planPrice) || 0;
  const discount = Number(discountAmount) || 0;
  return Math.max(0, Math.round((price - discount) * 100) / 100);
}

export function resolveStudentPlan(student, financeConfig, payment = null) {
  const planName = String(student?.plan || payment?.plan_name || '').trim();
  if (!planName) return null;
  return findPlanByName(financeConfig, planName);
}

export function resolveStudentPlanFinalPrice(student, financeConfig, payment = null) {
  const plan = resolveStudentPlan(student, financeConfig, payment);
  return calcFinalPrice(plan?.price, getStudentDiscountAmount(student));
}
```

```javascript
// src/lib/collectionOverdue.js
import { isStudentOnExemptPlan, resolveStudentPlan, resolveStudentPlanFinalPrice } from './planBilling.js';

export function openAmountForStudent(student, payment, financeConfig) {
  if (isStudentOnExemptPlan(student, financeConfig, payment)) return 0;
  const payAmt = Number(payment?.amount);
  if (Number.isFinite(payAmt) && payAmt > 0) return payAmt;
  const expected = resolveStudentPlanFinalPrice(student, financeConfig, payment);
  if (expected > 0) return expected;
  const match = resolveStudentPlan(student, financeConfig, payment);
  const price = Number(match?.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}
```

```javascript
// src/lib/paymentStatus.js
export function expectedAmountForStudent(student, financeConfig, payment) {
  if (isStudentOnExemptPlan(student, financeConfig, payment)) return 0;
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return 0;
  const fromPayment = Number(payment?.expected_amount);
  if (Number.isFinite(fromPayment) && fromPayment >= 0) return fromPayment;
  return openAmountForStudent(student, payment, financeConfig);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- src/test/paymentStatus.test.js
```

Expected: `PASS` para o arquivo com os casos novos de desconto.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planBilling.js src/lib/collectionOverdue.js src/lib/paymentStatus.js src/test/paymentStatus.test.js
git commit -m "feat(finance): centralize student discount pricing"
```

---

## Phase 2 — Persistence + schema

### Task 2: Persistir `discount_amount` em students e mapear para UI

**Files:**
- Modify: `src/lib/leadStudentPayload.js`
- Modify: `src/lib/mapAppwriteStudentDoc.js`
- Modify: `src/lib/studentAppwritePatch.js`
- Modify: `src/store/useStudentStore.js`
- Modify: `src/test/leadStudentPayload.test.js`
- Modify: `scripts/verify-and-fix-schema-crm.mjs`
- Modify: `docs/appwrite-setup.md`
- Modify: `docs/data-model.md`

- [ ] **Step 1: Extend failing payload tests**

```javascript
// src/test/leadStudentPayload.test.js
import { describe, it, expect } from 'vitest';
import { buildStudentPayloadFromDoc } from '../lib/leadStudentPayload.js';
import { mapAppwriteDocToStudent } from '../lib/mapAppwriteStudentDoc.js';

describe('student discount payload', () => {
  it('persists discount_amount when provided', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      academyId: 'a1',
      plan: 'Mensal',
      discount_amount: 30,
    });
    expect(payload.discount_amount).toBe(30);
  });

  it('maps discount_amount from Appwrite doc to UI object', () => {
    const student = mapAppwriteDocToStudent({
      $id: 's1',
      name: 'Ana',
      phone: '11999999999',
      plan: 'Mensal',
      discount_amount: 25,
    });
    expect(student.discountAmount).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/test/leadStudentPayload.test.js
```

Expected: falhas porque `discount_amount` ainda nao e salvo nem mapeado.

- [ ] **Step 3: Implement student payload + mapping + patch support**

```javascript
// src/lib/leadStudentPayload.js
const discountRaw = Number(d.discount_amount ?? d.discountAmount ?? 0);
const discountAmount =
  Number.isFinite(discountRaw) && discountRaw >= 0 ? Math.round(discountRaw * 100) / 100 : 0;

if (discountAmount > 0) payload.discount_amount = discountAmount;
```

```javascript
// src/lib/mapAppwriteStudentDoc.js
const discountRaw = Number(doc.discount_amount ?? doc.discountAmount ?? 0);
const discountAmount =
  Number.isFinite(discountRaw) && discountRaw >= 0 ? Math.round(discountRaw * 100) / 100 : 0;

return {
  // ...
  discountAmount,
};
```

```javascript
// src/lib/studentAppwritePatch.js
export const OPTIONAL_STUDENT_PATCH_ATTRS = [
  // ...
  'discount_amount',
];
```

```javascript
// src/store/useStudentStore.js
if (u.discountAmount !== undefined) {
  const n = Number(u.discountAmount);
  copyIf('discount_amount', Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0);
}
```

- [ ] **Step 4: Add schema provisioning**

```javascript
// scripts/verify-and-fix-schema-crm.mjs
const STUDENTS_ATTRS = [
  // ...
  { key: 'discount_amount', type: 'float', required: false },
];
```

```markdown
<!-- docs/appwrite-setup.md -->
- `students.discount_amount` (`float`, opcional): desconto fixo individual em reais aplicado ao preco do plano.
```

```markdown
<!-- docs/data-model.md -->
| `discount_amount` | float | Desconto individual recorrente do aluno, em reais |
```

- [ ] **Step 5: Run tests and schema check**

```bash
npm test -- src/test/leadStudentPayload.test.js
npm run verify-and-fix-schema-crm
```

Expected: testes `PASS`; script registra `students.discount_amount` como `já existe` ou `created`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leadStudentPayload.js src/lib/mapAppwriteStudentDoc.js src/lib/studentAppwritePatch.js src/store/useStudentStore.js src/test/leadStudentPayload.test.js scripts/verify-and-fix-schema-crm.mjs docs/appwrite-setup.md docs/data-model.md
git commit -m "feat(students): persist individual discount amount"
```

---

## Phase 3 — Enrollment UI + first charge

### Task 3: Adicionar desconto e preview na matricula

**Files:**
- Modify: `src/components/MatriculaModal.jsx`
- Modify: `src/components/MatriculaPaymentStep.jsx`
- Modify: `src/lib/enrollmentPayment.js`
- Create: `src/test/matriculaPaymentStep.test.jsx`

- [ ] **Step 1: Write failing component tests for preview and validation**

```javascript
// src/test/matriculaPaymentStep.test.jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import MatriculaPaymentStep from '../components/MatriculaPaymentStep.jsx';

describe('MatriculaPaymentStep discount preview', () => {
  const financeConfig = { plans: [{ name: 'Mensal', price: 150 }] };

  it('shows final price preview when discount changes', async () => {
    const user = userEvent.setup();
    const setPayForm = vi.fn();
    render(
      <MatriculaPaymentStep
        payForm={{ payment_type: 'plan', status: 'paid', amount: '150,00', method: 'pix', reference_month: '2026-06' }}
        setPayForm={setPayForm}
        financeConfig={financeConfig}
        enrollmentPlan="Mensal"
        discountAmount={30}
        onDiscountChange={vi.fn()}
      />
    );
    expect(screen.getByText('Valor cobrado')).toBeInTheDocument();
    expect(screen.getByText('R$ 120,00')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Desconto (R$)'));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/test/matriculaPaymentStep.test.jsx
```

Expected: falha porque `discountAmount`, `onDiscountChange` e o preview ainda nao existem.

- [ ] **Step 3: Implement enrollment pricing helpers**

```javascript
// src/lib/enrollmentPayment.js
import { findPlanByName } from './academyPlans.js';
import { calcFinalPrice, getStudentDiscountAmount } from './planBilling.js';

function priceToAmountString(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(2).replace('.', ',');
}

export function enrollmentPlanPricing(financeConfig, planName, source = {}) {
  const plan = findPlanByName(financeConfig, planName);
  const planPrice = Number(plan?.price ?? 0) || 0;
  const discountAmount = getStudentDiscountAmount(source);
  const finalPrice = calcFinalPrice(planPrice, discountAmount);
  return { plan, planPrice, discountAmount, finalPrice };
}

export function buildPayFormForEnrollment(lead, financeConfig, enrollmentDateYmd, planName) {
  const refMonth = referenceMonthFromEnrollmentDate(enrollmentDateYmd);
  const { finalPrice } = enrollmentPlanPricing(financeConfig, planName, lead);
  // ...
  return {
    // ...
    amount: priceToAmountString(finalPrice),
  };
}
```

- [ ] **Step 4: Implement modal state, validation and preview**

```javascript
// src/components/MatriculaModal.jsx
const [discountAmount, setDiscountAmount] = useState('');

useEffect(() => {
  const defaultDiscount = String(lead?.discountAmount ?? lead?.discount_amount ?? '').trim();
  setDiscountAmount(defaultDiscount);
}, [isOpen, lead]);

await onEnroll({
  plan: planName,
  enrollmentDate,
  discountAmount,
  answers,
  mode,
});

const validation = validatePaymentForm();
const discountNum = centsToNumber(parseMaskToCents(discountAmount));
const selectedPlan = findPlanByName(resolvedFinanceConfig, enrollmentPlan);
if (selectedPlan && discountNum > Number(selectedPlan.price || 0)) {
  return 'O desconto não pode ser maior que o valor do plano.';
}
```

```jsx
// src/components/MatriculaPaymentStep.jsx
<div className="form-group">
  <label className="form-label">Desconto (R$)</label>
  <input
    className="form-input"
    inputMode="decimal"
    placeholder="0,00"
    value={discountAmount}
    disabled={disabled || planPrice <= 0}
    onChange={(e) => onDiscountChange?.(e.target.value)}
  />
</div>

<div className="text-small text-muted">
  <div>Valor do plano: {formatBRL(planPrice)}</div>
  <div>Desconto: {formatBRL(discountValue)}</div>
  <div>Valor cobrado: {formatBRL(finalPrice)}</div>
</div>
```

Important: ao trocar plano, atualizar `payForm.amount` com o novo valor liquido, nao com o bruto.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- src/test/matriculaPaymentStep.test.jsx src/test/paymentStatus.test.js
```

Expected: `PASS` com preview e valor inicial da matricula usando desconto.

- [ ] **Step 6: Commit**

```bash
git add src/components/MatriculaModal.jsx src/components/MatriculaPaymentStep.jsx src/lib/enrollmentPayment.js src/test/matriculaPaymentStep.test.jsx
git commit -m "feat(enrollment): add individual discount to enrollment flow"
```

---

## Phase 4 — Backend fallback + downstream consumers

### Task 4: Garantir que backend e projections respeitem o desconto

**Files:**
- Modify: `lib/server/studentPaymentsHandler.js`
- Modify: `src/lib/studentPayments.js`
- Modify: `src/lib/financeiroOverview.js`
- Modify: `src/lib/financeForecastInflows.js`
- Modify: `src/lib/studentFinancialTimeline.js`

- [ ] **Step 1: Write failing assertions around backend fallback path**

```javascript
// Extend src/test/paymentStatus.test.js or add a small focused test
it('expectedAmountForStudent falls back to discounted plan when payment has no explicit amount', () => {
  const financeConfig = { plans: [{ name: 'Mensal', price: 200 }] };
  const student = { plan: 'Mensal', discount_amount: 50 };
  expect(expectedAmountForStudent(student, financeConfig, { status: 'pending' })).toBe(150);
});
```

- [ ] **Step 2: Run tests — expect FAIL if any downstream still assumes gross plan**

```bash
npm test -- src/test/paymentStatus.test.js
```

- [ ] **Step 3: Wire server and client fallbacks to central helper**

```javascript
// lib/server/studentPaymentsHandler.js
let expected = Number(data.expected_amount);
if (!Number.isFinite(expected) || expected < 0) {
  expected = expectedAmountForStudent(studentDoc, financeConfig, data);
}
if (Number.isFinite(expected) && expected >= 0) payload.expected_amount = expected;
```

```javascript
// src/lib/studentPayments.js
const planBase = expectedAmountForStudent(student, financeConfig, data);
if (!Number.isFinite(expected) || expected < 0) {
  payload.expected_amount = planBase;
}
```

```javascript
// src/lib/studentFinancialTimeline.js
const expected = openAmountForStudent(student, null, financeConfig);
```

Important: revisar manualmente `MensalidadesPanel`, `financeiroOverview`, `financeForecastInflows` e `monthlyClosing` apenas para confirmar que todos ja consomem `openAmountForStudent` / `expectedAmountForStudent`; se algum ponto ainda usa `planPriceToPayAmountString(plan)` para valor esperado, trocar pelo helper central.

- [ ] **Step 4: Run focused financial regression suite**

```bash
npm test -- src/test/paymentStatus.test.js src/test/financeForecastInflows.test.js src/test/receivablesAggregate.test.js src/test/monthlyClosing.test.js
```

Expected: `PASS`, sem regressao em aberto, forecast e fechamento.

- [ ] **Step 5: Commit**

```bash
git add lib/server/studentPaymentsHandler.js src/lib/studentPayments.js src/lib/financeiroOverview.js src/lib/financeForecastInflows.js src/lib/studentFinancialTimeline.js src/test/paymentStatus.test.js
git commit -m "fix(finance): respect student discount in recurring payment fallbacks"
```

---

## Phase 5 — Student profile + docs + verification

### Task 5: Exibir desconto no perfil e atualizar fluxos/documentacao

**Files:**
- Modify: `src/pages/StudentProfile.jsx`
- Modify: `docs/flows/crm/funil-lead-matricula.md`
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`
- Modify: `docs/flows/financeiro/a-receber-mensalidades.md`
- Modify: `docs/flows/VALIDATION.md`

- [ ] **Step 1: Add profile summary block**

```jsx
// src/pages/StudentProfile.jsx
const currentPlan = useMemo(
  () => (academyDoc?.financeConfig?.plans || []).find((p) => String(p?.name || '').trim() === String(student?.plan || '').trim()),
  [academyDoc, student?.plan]
);
const planPrice = Number(currentPlan?.price ?? 0) || 0;
const discountAmount = Number(student?.discountAmount ?? student?.discount_amount ?? 0) || 0;
const finalAmount = calcFinalPrice(planPrice, discountAmount);

{discountAmount > 0 ? (
  <div className="student-profile-finance-summary">
    <div>Plano original: {formatBRLFromCents(Math.round(planPrice * 100))}</div>
    <div>Desconto: {formatBRLFromCents(Math.round(discountAmount * 100))}</div>
    <div>Valor final: {formatBRLFromCents(Math.round(finalAmount * 100))}</div>
  </div>
) : null}
```

- [ ] **Step 2: Update flows docs in the same change**

```markdown
<!-- docs/flows/crm/funil-lead-matricula.md -->
- O modal de matricula agora aceita `Desconto (R$)` individual abaixo do plano e mostra preview do valor final cobrado.
```

```markdown
<!-- docs/flows/crm/aluno-perfil-presenca.md -->
- Quando o aluno tem `discount_amount > 0`, o perfil exibe plano original, desconto e valor final.
```

```markdown
<!-- docs/flows/financeiro/a-receber-mensalidades.md -->
- O valor esperado da mensalidade deriva de `plan.price - students.discount_amount`, respeitando `expected_amount` persistido quando existir.
```

```markdown
<!-- docs/flows/VALIDATION.md -->
- 2026-06-23: alinhado fluxo de matricula/perfil/mensalidades com desconto individual recorrente em `students.discount_amount`.
```

- [ ] **Step 3: Run verification + diagnostics**

```bash
npm test -- src/test/leadStudentPayload.test.js src/test/matriculaPaymentStep.test.jsx src/test/paymentStatus.test.js src/test/financeForecastInflows.test.js src/test/receivablesAggregate.test.js src/test/monthlyClosing.test.js
npm run lint
```

Expected: suite focada `PASS`; lint sem erros introduzidos pelos arquivos alterados.

- [ ] **Step 4: Check editor diagnostics**

Use `GetDiagnostics` for:
- `src/components/MatriculaModal.jsx`
- `src/components/MatriculaPaymentStep.jsx`
- `src/lib/enrollmentPayment.js`
- `src/lib/planBilling.js`
- `src/pages/StudentProfile.jsx`

- [ ] **Step 5: Commit**

```bash
git add src/pages/StudentProfile.jsx docs/flows/crm/funil-lead-matricula.md docs/flows/crm/aluno-perfil-presenca.md docs/flows/financeiro/a-receber-mensalidades.md docs/flows/VALIDATION.md
git commit -m "feat(profile): surface student discount details"
```

---

## Self-review

### Spec coverage

- `students.discount_amount`: coberto em **Task 2**
- helper central `calcFinalPrice`: coberto em **Task 1**
- primeira cobranca da matricula: coberto em **Task 3**
- mensalidades futuras / inadimplencia / projections: coberto em **Tasks 1 e 4**
- exibicao no perfil: coberto em **Task 5**
- documentacao e fluxos: coberto em **Tasks 2 e 5**

### Placeholder scan

- Nenhum `TODO`, `TBD` ou “similar ao task anterior”
- Todos os passos de codigo incluem snippet ou comando concreto

### Type consistency

- Campo persistido: `discount_amount`
- Campo UI: `discountAmount`
- Helper central: `calcFinalPrice(planPrice, discountAmount)`
- Leitura segura: `getStudentDiscountAmount(student)`

---

## Notes

- Nao criar novo arquivo em `/api/`.
- Nao recalcular `student_payments` ou `financial_tx` existentes.
- Se `discount_amount` nao existir no schema ainda, rodar `npm run verify-and-fix-schema-crm` antes de validar a matricula.
