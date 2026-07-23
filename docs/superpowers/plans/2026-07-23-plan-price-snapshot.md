# Snapshot de preço do plano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Congelar o valor mensal acordado em `students.plan_price` na matrícula/troca de plano, para que editar o preço no catálogo (`financeConfig.plans`) não altere a cobrança de alunos já matriculados.

**Architecture:** Helpers em `planBilling.js` passam a preferir o snapshot do aluno sobre o preço vivo do catálogo; todas as vias de matrícula e o save de plano no perfil gravam/atualizam `plan_price`. Materialização e Mensalidades já consomem `resolveStudentPlanFinalPrice`, então herdam o comportamento. Backfill one-shot via script (sem nova function Hobby).

**Tech Stack:** React 19, Vite, Vitest, Appwrite, Node scripts, Vercel handlers existentes.

**Spec:** [docs/superpowers/specs/2026-07-23-plan-price-snapshot-design.md](../specs/2026-07-23-plan-price-snapshot-design.md)

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/planBilling.js` | Modify | `getStudentAgreedPlanPrice`, `snapshotPlanPriceFromCatalog`, base/final price com snapshot |
| `src/test/planBillingSnapshot.test.js` | Create | Testes do resolver snapshot vs catálogo |
| `src/test/paymentStatus.test.js` | Modify | Casos Mensalidades com `plan_price` ≠ catálogo |
| `src/test/studentPaymentMaterialization.test.js` | Modify | Materialização usa snapshot |
| `src/lib/mapAppwriteStudentDoc.js` | Modify | Mapear `plan_price` → `planPrice` |
| `src/lib/studentAppwritePatch.js` | Modify | Incluir `plan_price` em attrs opcionais |
| `src/store/useStudentStore.js` | Modify | Persistir `planPrice` → `plan_price` |
| `src/lib/leadStudentPayload.js` | Modify | Incluir `plan_price` no payload de students |
| `src/test/leadStudentPayload.test.js` | Modify | Cobrir persistência do snapshot |
| `src/lib/performEnrollment.js` | Modify | Gravar snapshot na conversão |
| `src/hooks/useStudentsCreateForm.js` | Modify | Passar `planPrice` no create/enrollment |
| `lib/server/publicEnrollmentEnroll.js` | Modify | Snapshot na inscrição pública |
| `src/lib/profileStudentFieldSave.js` | Modify | Troca de `plan` atualiza `plan_price` |
| `src/pages/StudentProfile.jsx` | Modify | Campo valor acordado + ConfirmDialog + validação desconto sobre snapshot |
| `src/components/finance/settings/FinanceSettingsPlansSection.jsx` | Modify | Copy de ajuda no preço |
| `scripts/verify-and-fix-schema-crm.mjs` | Modify | Provisionar `plan_price` float |
| `scripts/backfill-student-plan-price.mjs` | Create | Backfill dry-run/`--apply` |
| `docs/appwrite-setup.md` | Modify | Documentar atributo |
| `docs/flows/financeiro/config-inicial-financeiro.md` | Modify | Nota sobre preço de lista vs acordado |
| `docs/flows/financeiro/a-receber-mensalidades.md` | Modify | Valor esperado usa snapshot |
| `docs/flows/crm/funil-lead-matricula.md` | Modify | Matrícula grava `plan_price` |
| `docs/flows/crm/aluno-perfil-presenca.md` | Modify | Valor acordado no perfil |
| `docs/flows/VALIDATION.md` | Modify | Registrar alinhamento código↔fluxo |

---

## Phase 1 — Resolver + testes

### Task 1: Helpers de snapshot e `resolveStudentPlanFinalPrice`

**Files:**
- Create: `src/test/planBillingSnapshot.test.js`
- Modify: `src/lib/planBilling.js`
- Modify: `src/test/paymentStatus.test.js`
- Modify: `src/test/studentPaymentMaterialization.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// src/test/planBillingSnapshot.test.js
import { describe, it, expect } from 'vitest';
import {
  getStudentAgreedPlanPrice,
  snapshotPlanPriceFromCatalog,
  resolveStudentPlanBasePrice,
  resolveStudentPlanFinalPrice,
} from '../lib/planBilling.js';

describe('plan price snapshot', () => {
  const financeConfig = {
    plans: [
      { name: 'Mensal', price: 250 },
      { name: 'Isento', price: 0, isExempt: true },
    ],
  };

  it('getStudentAgreedPlanPrice returns null when absent', () => {
    expect(getStudentAgreedPlanPrice({})).toBeNull();
    expect(getStudentAgreedPlanPrice({ plan_price: '' })).toBeNull();
    expect(getStudentAgreedPlanPrice({ planPrice: null })).toBeNull();
  });

  it('getStudentAgreedPlanPrice accepts zero', () => {
    expect(getStudentAgreedPlanPrice({ plan_price: 0 })).toBe(0);
  });

  it('snapshotPlanPriceFromCatalog copies catalog price', () => {
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Mensal')).toBe(250);
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Isento')).toBe(0);
    expect(snapshotPlanPriceFromCatalog(financeConfig, 'Fantasma')).toBeNull();
  });

  it('resolveStudentPlanFinalPrice prefers student snapshot over catalog', () => {
    const student = { plan: 'Mensal', plan_price: 200, discount_amount: 0 };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(200);
  });

  it('resolveStudentPlanFinalPrice applies discount on snapshot', () => {
    const student = {
      plan: 'Mensal',
      plan_price: 200,
      discount_type: 'fixed',
      discount_amount: 30,
    };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(170);
  });

  it('resolveStudentPlanFinalPrice falls back to catalog without snapshot', () => {
    const student = { plan: 'Mensal' };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(250);
  });

  it('resolveStudentPlanBasePrice returns snapshot when present', () => {
    expect(resolveStudentPlanBasePrice({ plan: 'Mensal', plan_price: 200 }, financeConfig)).toBe(200);
  });

  it('exempt plan final price is 0 even with snapshot', () => {
    const student = { plan: 'Isento', plan_price: 99 };
    expect(resolveStudentPlanFinalPrice(student, financeConfig)).toBe(0);
  });
});
```

Also add to `src/test/paymentStatus.test.js`:

```javascript
  it('openAmountForStudent prefers plan_price snapshot over catalog', () => {
    const discountedStudent = {
      plan: 'Mensal',
      plan_price: 180,
      discount_type: 'fixed',
      discount_amount: 0,
    };
    expect(openAmountForStudent(discountedStudent, null, financeConfig)).toBe(180);
  });
```

And in `src/test/studentPaymentMaterialization.test.js` (import `computeExpectedAmountForMaterialization` if needed):

```javascript
  it('computeExpectedAmountForMaterialization uses plan_price snapshot', () => {
    const student = { plan: 'Mensal', plan_price: 180, student_status: 'active' };
    const cfg = { plans: [{ name: 'Mensal', price: 250 }] };
    expect(computeExpectedAmountForMaterialization(student, cfg)).toBe(180);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- planBillingSnapshot paymentStatus studentPaymentMaterialization`

Expected: FAIL — helpers not exported; final price still uses catalog 250.

- [ ] **Step 3: Implement helpers in `planBilling.js`**

Replace `resolveStudentPlanFinalPrice` and add:

```javascript
/**
 * Snapshot acordado no aluno. null = ausente (usar catálogo).
 * Aceita 0 como valor válido.
 */
export function getStudentAgreedPlanPrice(student = {}) {
  const hasSnake = Object.prototype.hasOwnProperty.call(student || {}, 'plan_price');
  const hasCamel = Object.prototype.hasOwnProperty.call(student || {}, 'planPrice');
  if (!hasSnake && !hasCamel) return null;
  const raw = hasSnake ? student.plan_price : student.planPrice;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function snapshotPlanPriceFromCatalog(financeConfig, planName) {
  const plan = findPlanByName(financeConfig, planName);
  if (!plan) return null;
  if (plan.isExempt === true) return 0;
  const n = Number(plan.price);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Base mensal antes do desconto: snapshot ou catálogo. */
export function resolveStudentPlanBasePrice(student, financeConfig, payment = null) {
  const plan = resolveStudentPlan(student, financeConfig, payment);
  if (isExemptPlan(plan)) return 0;
  const snap = getStudentAgreedPlanPrice(student);
  if (snap != null) return snap;
  const n = Number(plan?.price);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function resolveStudentPlanFinalPrice(student, financeConfig, payment = null) {
  const plan = resolveStudentPlan(student, financeConfig, payment);
  if (isExemptPlan(plan)) return 0;
  const base = resolveStudentPlanBasePrice(student, financeConfig, payment);
  return calcFinalPrice(base, student);
}

/** Prefer lead snapshot, else catalog (matrícula). */
export function resolveEnrollmentPlanPrice(lead, financeConfig, planName) {
  const fromLead = getStudentAgreedPlanPrice(lead);
  if (fromLead != null) return fromLead;
  return snapshotPlanPriceFromCatalog(financeConfig, planName);
}

export function parsePlanPriceInput(value) {
  const raw = String(value ?? '').replace(',', '.').trim();
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- planBillingSnapshot paymentStatus studentPaymentMaterialization`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/planBilling.js src/test/planBillingSnapshot.test.js src/test/paymentStatus.test.js src/test/studentPaymentMaterialization.test.js
git commit -m "$(cat <<'EOF'
feat(billing): prefer student plan_price snapshot over catalog

EOF
)"
```

---

## Phase 2 — Schema, mapeamento e persistência

### Task 2: Appwrite schema + map + store + payload

**Files:**
- Modify: `scripts/verify-and-fix-schema-crm.mjs` (`STUDENTS_ATTRS`, após `plan`)
- Modify: `src/lib/mapAppwriteStudentDoc.js`
- Modify: `src/lib/studentAppwritePatch.js`
- Modify: `src/store/useStudentStore.js`
- Modify: `src/lib/leadStudentPayload.js`
- Modify: `src/test/leadStudentPayload.test.js`
- Modify: `docs/appwrite-setup.md`

- [ ] **Step 1: Write failing payload test**

In `src/test/leadStudentPayload.test.js`:

```javascript
  it('includes plan_price when provided', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      phone: '11999999999',
      academyId: 'a1',
      plan: 'Mensal',
      plan_price: 200,
    });
    expect(payload.plan_price).toBe(200);
  });

  it('includes plan_price from planPrice camelCase', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      phone: '11999999999',
      academyId: 'a1',
      plan: 'Mensal',
      planPrice: 180.5,
    });
    expect(payload.plan_price).toBe(180.5);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- leadStudentPayload`

Expected: FAIL — `plan_price` undefined

- [ ] **Step 3: Implement mapping and persistence**

1. In `scripts/verify-and-fix-schema-crm.mjs`, after `{ key: 'plan', type: 'string', size: 128 },`:

```javascript
  { key: 'plan_price', type: 'float' },
```

2. In `mapAppwriteStudentDoc.js`, after `plan: doc.plan || ''`:

```javascript
    planPrice: (() => {
      const raw = doc.plan_price ?? doc.planPrice;
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
    })(),
```

3. In `studentAppwritePatch.js`, add `'plan_price'` to `OPTIONAL_STUDENT_PATCH_ATTRS`.

4. In `useStudentStore.js`, after `u.plan` handling:

```javascript
  if (u.planPrice !== undefined || u.plan_price !== undefined) {
    const raw = u.planPrice !== undefined ? u.planPrice : u.plan_price;
    if (raw === 0 || raw === '0') {
      copyIf('plan_price', 0);
    } else if (raw != null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) {
        copyIf('plan_price', Math.round(n * 100) / 100);
      }
    }
  }
```

5. In `leadStudentPayload.js`, after setting `plan`:

```javascript
  const hasPlanPriceSnake = Object.prototype.hasOwnProperty.call(d, 'plan_price');
  const hasPlanPriceCamel = Object.prototype.hasOwnProperty.call(d, 'planPrice');
  if (hasPlanPriceSnake || hasPlanPriceCamel) {
    const raw = hasPlanPriceCamel ? d.planPrice : d.plan_price;
    if (raw === 0 || raw === '0') {
      payload.plan_price = 0;
    } else if (raw != null && raw !== '') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) {
        payload.plan_price = Math.round(n * 100) / 100;
      }
    }
  }
```

6. In `docs/appwrite-setup.md`, document **`plan_price`** (float — snapshot da mensalidade acordada) ao lado de `plan` / `discount_amount`.

- [ ] **Step 4: Run tests**

Run: `npm test -- leadStudentPayload planBillingSnapshot`

Expected: PASS

- [ ] **Step 5: Provision schema when credentials available**

```bash
node --env-file=.env --env-file=.env.local scripts/verify-and-fix-schema-crm.mjs
```

Expected: creates `plan_price` float on students if missing.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-and-fix-schema-crm.mjs src/lib/mapAppwriteStudentDoc.js src/lib/studentAppwritePatch.js src/store/useStudentStore.js src/lib/leadStudentPayload.js src/test/leadStudentPayload.test.js docs/appwrite-setup.md
git commit -m "$(cat <<'EOF'
feat(students): persist and map plan_price snapshot field

EOF
)"
```

---

## Phase 3 — Gravação na matrícula

### Task 3: Todas as vias de matrícula gravam snapshot

**Files:**
- Modify: `src/lib/performEnrollment.js`
- Modify: `src/hooks/useStudentsCreateForm.js`
- Modify: `lib/server/publicEnrollmentEnroll.js`
- Modify: `src/components/MatriculaModal.jsx`
- Modify: `src/test/planBillingSnapshot.test.js` (tests for `resolveEnrollmentPlanPrice`)

- [ ] **Step 1: Tests for `resolveEnrollmentPlanPrice`**

```javascript
  it('resolveEnrollmentPlanPrice prefers lead snapshot', () => {
    expect(
      resolveEnrollmentPlanPrice({ plan_price: 190 }, financeConfig, 'Mensal')
    ).toBe(190);
  });

  it('resolveEnrollmentPlanPrice falls back to catalog', () => {
    expect(resolveEnrollmentPlanPrice({}, financeConfig, 'Mensal')).toBe(250);
  });
```

- [ ] **Step 2: Extend `performEnrollment`**

1. Import `resolveEnrollmentPlanPrice` from `./planBilling.js`.
2. Add param `financeConfig = null`.
3. After resolving `planName`:

```javascript
  const planPrice = resolveEnrollmentPlanPrice(
    lead,
    financeConfig,
    planName || lead.plan
  );
```

4. Pass into `moveLeadToStudent` overrides:

```javascript
          ...(planPrice != null ? { planPrice } : {}),
```

5. On any path that only patches `plan` for an existing student, also set `planPrice` when currently missing (same helper).

- [ ] **Step 3: Wire callers**

- `MatriculaModal.jsx`: pass `financeConfig={resolvedFinanceConfig}` into `performEnrollment(...)`.
- `useStudentsCreateForm.js`: import `snapshotPlanPriceFromCatalog`; resolve `financeConfig` from the academy finance store for `academyId`; before `addStudent`:

```javascript
    const planPrice = snapshotPlanPriceFromCatalog(financeConfig, planName);
    const created = await addStudent({
      name,
      phone: cleanPhone,
      email: emailTrim,
      turma,
      type: profileTypeFromTurma(turma),
      origin: newStudent.origin || 'Cadastro manual',
      plan: planName,
      ...(planPrice != null ? { planPrice } : {}),
      dueDay: new Date().getDate(),
      enrollmentDate: formatLocalYmd(new Date()),
      studentStatus: STUDENT_STATUS.ACTIVE,
      ...(belt ? { belt } : {}),
    });
    await performEnrollment({
      lead: created,
      academyId,
      userId,
      plan: planName,
      source: 'direct',
      financeConfig,
      permissionContext: {
        teamId: acadDoc.teamId || '',
        userId: userId || '',
      },
      academySettingsRaw: acadDoc.settings,
      onToast: (msg) => addToast({ type: 'info', message: msg }),
    });
```

- [ ] **Step 4: Public enrollment**

In `lib/server/publicEnrollmentEnroll.js`:

1. Import `snapshotPlanPriceFromCatalog` from `../../src/lib/planBilling.js`.
2. Import `parseFinanceConfigRaw` from finance config storage (same path other server files use).
3. In `buildFormOverrides(form, customAnswersJson, academyDoc)`:

```javascript
  const financeConfig = parseFinanceConfigRaw(academyDoc?.financeConfig) || {};
  const snap = snapshotPlanPriceFromCatalog(financeConfig, overrides.plan);
  if (snap != null) overrides.plan_price = snap;
```

- [ ] **Step 5: Run tests**

Run: `npm test -- planBillingSnapshot leadStudentPayload`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/performEnrollment.js src/lib/planBilling.js src/hooks/useStudentsCreateForm.js lib/server/publicEnrollmentEnroll.js src/components/MatriculaModal.jsx src/test/planBillingSnapshot.test.js
git commit -m "$(cat <<'EOF'
feat(enrollment): snapshot plan_price on all enrollment paths

EOF
)"
```

---

## Phase 4 — Perfil do aluno

### Task 4: Valor acordado editável + troca de plano atualiza snapshot

**Files:**
- Modify: `src/lib/profileStudentFieldSave.js`
- Modify: `src/pages/StudentProfile.jsx`
- Create: `src/test/profileStudentFieldSave.test.js`

- [ ] **Step 1: Failing test for plan field save**

```javascript
// src/test/profileStudentFieldSave.test.js
import { describe, it, expect, vi } from 'vitest';
import { saveStudentProfileField } from '../lib/profileStudentFieldSave.js';

describe('saveStudentProfileField plan snapshot', () => {
  it('updates planPrice from catalog when plan changes', async () => {
    const updateStudent = vi.fn(async () => ({}));
    await saveStudentProfileField({
      fieldKey: 'plan',
      draftValue: 'Mensal',
      student: { plan: 'Antigo', planPrice: 150 },
      academyId: 'a1',
      studentId: 's1',
      updateStudent,
      financeConfig: { plans: [{ name: 'Mensal', price: 250 }] },
      actorUserId: 'u1',
    });
    expect(updateStudent).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ plan: 'Mensal', planPrice: 250 })
    );
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- profileStudentFieldSave`

Expected: FAIL — patch only has `plan`

- [ ] **Step 3: Update `profileStudentFieldSave.js`**

Static import at top:

```javascript
import { snapshotPlanPriceFromCatalog } from './planBilling.js';
```

Replace `case 'plan'`:

```javascript
    case 'plan': {
      const plan = String(draftValue || '').trim();
      const planPrice = snapshotPlanPriceFromCatalog(financeConfig, plan);
      patch = { plan };
      if (planPrice != null) patch.planPrice = planPrice;
      auditFrom = displayForAudit(key, prev(key), student);
      auditTo = planPrice != null ? `${plan} (${planPrice})` : plan;
      auditLabel = 'Plano';
      break;
    }
```

- [ ] **Step 4: StudentProfile UI**

1. Add `planPriceInput` to `dataForm` init/sync from `student.planPrice` (decimal string, e.g. `200` or `200,00` — match discount fixed input style via existing money helpers if already used nearby).

2. When plan `<select>` changes, set `planPriceInput` from `snapshotPlanPriceFromCatalog(financeConfig, newPlan)`.

3. Near discount fields, show:

```jsx
<div className="form-group">
  <label>Valor acordado (mensalidade)</label>
  <input
    className="form-input"
    inputMode="decimal"
    value={dataForm.planPriceInput}
    onChange={(e) => setDataForm((p) => ({ ...p, planPriceInput: e.target.value }))}
    disabled={!canViewFinance}
  />
  <p className="text-small text-muted">
    Valor cobrado deste aluno. Alterar o preço do plano na academia não muda este valor.
  </p>
</div>
```

4. On bulk `updateStudent`, include:

```javascript
...(isActiveStudent(student) && canViewFinance
  ? {
      discountType: dataForm.discountType,
      discountAmount: parseDiscountAmountInput(
        dataForm.discountAmountInput,
        dataForm.discountType
      ),
      ...(parsePlanPriceInput(dataForm.planPriceInput) != null
        ? { planPrice: parsePlanPriceInput(dataForm.planPriceInput) }
        : {}),
    }
  : {}),
```

5. Validate discount against agreed base:

```javascript
import {
  findPlanByName,
  // ...
  getStudentAgreedPlanPrice,
  parsePlanPriceInput,
  snapshotPlanPriceFromCatalog,
} from '../lib/planBilling.js';
// findPlanByName is in academyPlans — keep existing import

const agreed =
  parsePlanPriceInput(dataForm.planPriceInput) ??
  getStudentAgreedPlanPrice(student) ??
  Number(findPlanByName(financeConfig, dataForm.plan)?.price ?? 0);
```

Pass `planPrice={agreed}` into `EnrollmentDiscountFields`.

6. **ConfirmDialog** before bulk save when plan name or agreed price changed vs `student`:

Copy:

> O valor acordado deste aluno será atualizado. Mensalidades futuras usarão o novo valor. Continuar?

Pattern: `pendingSaveConfirm` state → dialog `onConfirm` calls the actual save.

7. Inline plan edit: before `saveStudentFieldInline('plan', ...)`, if catalog snap ≠ current `getStudentAgreedPlanPrice(student)`, show the same ConfirmDialog; on confirm proceed.

- [ ] **Step 5: Run tests**

Run: `npm test -- profileStudentFieldSave planBillingSnapshot`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/profileStudentFieldSave.js src/lib/planBilling.js src/pages/StudentProfile.jsx src/test/profileStudentFieldSave.test.js
git commit -m "$(cat <<'EOF'
feat(profile): edit agreed plan_price and refresh on plan change

EOF
)"
```

---

## Phase 5 — Copy em Planos + backfill

### Task 5: Aviso na config de planos

**Files:**
- Modify: `src/components/finance/settings/FinanceSettingsPlansSection.jsx`

- [ ] **Step 1: Add help text under Preço**

Below the price input block:

```jsx
<p className="text-small text-muted">
  Este é o preço de lista para novas matrículas. Alunos já matriculados mantêm o valor
  acordado no perfil; alterar aqui não reajusta a base antiga.
</p>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/settings/FinanceSettingsPlansSection.jsx
git commit -m "$(cat <<'EOF'
docs(ui): clarify plan catalog price does not reprice enrolled students

EOF
)"
```

### Task 6: Script de backfill

**Files:**
- Create: `lib/server/studentPlanPriceBackfill.js`
- Create: `lib/server/__tests__/studentPlanPriceBackfill.test.js`
- Create: `scripts/backfill-student-plan-price.mjs`

- [ ] **Step 1: Pure helper + failing test**

```javascript
// lib/server/studentPlanPriceBackfill.js
import {
  getStudentAgreedPlanPrice,
  snapshotPlanPriceFromCatalog,
} from '../../src/lib/planBilling.js';

export function resolvePlanPriceBackfillPatch(studentDoc, financeConfig) {
  if (getStudentAgreedPlanPrice(studentDoc) != null) {
    return { skip: true, reason: 'already_has_snapshot' };
  }
  const planName = String(studentDoc?.plan || '').trim();
  if (!planName) return { skip: true, reason: 'no_plan' };
  const snap = snapshotPlanPriceFromCatalog(financeConfig, planName);
  if (snap == null) return { skip: true, reason: 'plan_not_in_catalog' };
  return { skip: false, patch: { plan_price: snap } };
}
```

```javascript
// lib/server/__tests__/studentPlanPriceBackfill.test.js
import { describe, it, expect } from 'vitest';
import { resolvePlanPriceBackfillPatch } from '../studentPlanPriceBackfill.js';

describe('resolvePlanPriceBackfillPatch', () => {
  const cfg = { plans: [{ name: 'Mensal', price: 200 }] };

  it('skips when snapshot exists', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Mensal', plan_price: 180 }, cfg).skip).toBe(true);
  });

  it('patches from catalog', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Mensal' }, cfg)).toEqual({
      skip: false,
      patch: { plan_price: 200 },
    });
  });

  it('skips orphan plan', () => {
    expect(resolvePlanPriceBackfillPatch({ plan: 'Velho' }, cfg).reason).toBe('plan_not_in_catalog');
  });
});
```

- [ ] **Step 2: Run test, implement helper, pass**

Run: `npm test -- studentPlanPriceBackfill`

Expected: PASS after helper exists

- [ ] **Step 3: CLI script**

Follow `scripts/backfill-finance-tx-description.mjs` env/args pattern:

```javascript
/**
 * Preenche students.plan_price a partir do catálogo atual (financeConfig).
 *
 * Uso:
 *   node --env-file=.env --env-file=.env.local scripts/backfill-student-plan-price.mjs [--apply] [--academy-id=xxx]
 *
 * Padrão: dry-run (não grava).
 */
```

Logic:

1. List academies (or `--academy-id`).
2. `parseFinanceConfigRaw(doc.financeConfig)`.
3. Query students by `academyId` (paginated).
4. `resolvePlanPriceBackfillPatch(doc, cfg)`.
5. If `--apply` and not skip → `updateDocument` with patch.
6. Print stats: scanned, skipped_*, updated, errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-student-plan-price.mjs lib/server/studentPlanPriceBackfill.js lib/server/__tests__/studentPlanPriceBackfill.test.js
git commit -m "$(cat <<'EOF'
chore(scripts): backfill student plan_price from catalog

EOF
)"
```

---

## Phase 6 — Docs de fluxo

### Task 7: Atualizar flows + VALIDATION

**Files:**
- Modify: `docs/flows/financeiro/config-inicial-financeiro.md`
- Modify: `docs/flows/financeiro/a-receber-mensalidades.md`
- Modify: `docs/flows/crm/funil-lead-matricula.md`
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`
- Modify: `docs/flows/VALIDATION.md`
- Modify: `docs/superpowers/specs/2026-07-23-plan-price-snapshot-design.md` (status → aprovado)

- [ ] **Step 1: Config financeiro**

- Link spec em Specs relacionadas.
- Na seção Planos: preço = lista para novas matrículas; alunos usam `plan_price` no perfil.
- `última revisão`: `2026-07-23`.

- [ ] **Step 2: Mensalidades**

Atualizar resumo:

> Quando o aluno possui `plan_price`, o valor esperado usa esse snapshot menos o desconto; senão, cai no preço do catálogo.

- [ ] **Step 3: Funil / perfil**

- Funil: matrícula grava `plan_price` a partir do plano escolhido.
- Perfil: campo **Valor acordado**; troca de plano atualiza snapshot com confirmação.

- [ ] **Step 4: VALIDATION.md**

Registrar alinhamento código↔fluxo em 2026-07-23 (plan price snapshot).

- [ ] **Step 5: Commit**

```bash
git add docs/flows/financeiro/config-inicial-financeiro.md docs/flows/financeiro/a-receber-mensalidades.md docs/flows/crm/funil-lead-matricula.md docs/flows/crm/aluno-perfil-presenca.md docs/flows/VALIDATION.md docs/superpowers/specs/2026-07-23-plan-price-snapshot-design.md
git commit -m "$(cat <<'EOF'
docs(flows): document plan_price snapshot billing behavior

EOF
)"
```

---

## Phase 7 — Verificação final

### Task 8: Harness + aceite manual

- [ ] **Step 1: Run focused suite**

```bash
npm test -- planBillingSnapshot paymentStatus studentPaymentMaterialization leadStudentPayload profileStudentFieldSave studentPlanPriceBackfill
```

Expected: all PASS

- [ ] **Step 2: Manual checklist (staging)**

1. Provision `plan_price` via schema script.
2. Dry-run then `--apply` backfill for one academy.
3. Aluno com snapshot 200; catálogo Mensal → 250; Mensalidades mostra 200.
4. Nova matrícula grava 250.
5. Editar catálogo 250 → 300; aluno antigo permanece 200.
6. Trocar plano no perfil → ConfirmDialog → novo snapshot.
7. Editar valor acordado no perfil → próxima cobrança aberta reflete.
8. Plano isento → 0 / Isento.

- [ ] **Step 3: Optional Autentique**

Search contract create for embedded plan price. If it only reads catalog, pass `getStudentAgreedPlanPrice(student) ?? catalog` at document creation. If no price var, skip (non-goal).

---

## Spec coverage self-check

| Spec item | Task |
|-----------|------|
| G1 catálogo não reajusta antigos | 1, 3, 5, 6 |
| G2 cobrança usa snapshot | 1 |
| G3 matrícula grava | 3 |
| G4 troca de plano + confirmação | 4 |
| G5 edição no perfil | 4 |
| G6 backfill | 6 |
| G7 copy Planos | 5 |
| G8 sem nova `/api/` | all (script only) |
| Schema `plan_price` | 2 |
| Docs flows | 7 |
| Non-goal Autentique rewrite | 8 optional |

**Placeholder scan:** none.  
**Naming:** `getStudentAgreedPlanPrice`, `snapshotPlanPriceFromCatalog`, `resolveStudentPlanBasePrice`, `resolveStudentPlanFinalPrice`, `resolveEnrollmentPlanPrice`, `plan_price` / `planPrice` consistent.
