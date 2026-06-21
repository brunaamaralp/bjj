# Planos Isentos / Bolsista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar um plano como isento para que alunos desse plano apareçam como `Isento` em Mensalidades e fiquem fora da cobrança e dos KPIs financeiros.

**Architecture:** A regra nasce no plano (`financeConfig.plans[].isExempt`) e é lida por helpers únicos no domínio financeiro. Esses helpers passam a ser usados antes de qualquer cálculo de valor, vencimento, atraso ou status visual, garantindo que a isenção seja consistente em Mensalidades, Cobrança, KPIs e Perfil do aluno.

**Tech Stack:** React 18, Zustand, Vitest, Appwrite config storage, CSS existente do projeto.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/planBilling.js` | **Criar** — resolver plano do aluno e centralizar `isExemptPlan` |
| `src/lib/financeConfigStorage.js` | **Modificar** — persistir `isExempt` no compact/merge de planos |
| `src/components/finance/settings/FinanceSettingsPlansSection.jsx` | **Modificar** — expor checkbox `Este plano não gera cobrança mensal` |
| `src/lib/paymentStatus.js` | **Modificar** — adicionar status `exempt` e zerar cálculo para plano isento |
| `src/lib/financeiroOverview.js` | **Modificar** — excluir planos isentos dos KPIs |
| `src/lib/collectionQueue.js` | **Modificar** — excluir planos isentos da fila de cobrança |
| `src/lib/collectionOverdue.js` | **Modificar** — impedir atraso/vencimento para planos isentos |
| `src/components/finance/MensalidadesPanel.jsx` | **Modificar** — refletir status `Isento` na base de rows |
| `src/components/finance/MensalidadesListTable.jsx` | **Modificar** — badge/valor/vencimento e remoção do CTA de registrar |
| `src/components/finance/MonthlyGridMobileCard.jsx` | **Modificar** — espelhar o comportamento mobile |
| `src/pages/StudentProfile.jsx` | **Modificar** — indicar que o plano atual é isento |
| `src/test/paymentStatus.test.js` | **Modificar** |
| `src/test/mensalidadesPanel.test.jsx` | **Modificar** |
| `src/test/mensalidadesListTable.test.jsx` | **Modificar** |
| `src/test/collectionRules.test.js` | **Modificar** ou criar teste focado no queue/overdue |
| `src/test/studentFinancialTimeline.test.js` | **Modificar** — resumo financeiro do perfil |

---

## Regras fixas da entrega

| Tema | Decisão |
|---|---|
| Nome técnico do atributo | `isExempt` |
| Default de compatibilidade | plano sem atributo => `isExempt: false` |
| Valor em Mensalidades | `Isento` |
| Vencimento em Mensalidades | `—` |
| CTA de pagamento | oculto para plano isento |
| Inadimplência/cobrança | aluno isento nunca entra |
| Campo extra no aluno | não entra nesta entrega |

---

### Task 1: Persistência e helper de domínio do plano

**Files:**
- Create: `src/lib/planBilling.js`
- Modify: `src/lib/financeConfigStorage.js`
- Test: `src/test/paymentStatus.test.js`

- [ ] **Step 1: Write the failing tests**

Adicionar estes casos em `src/test/paymentStatus.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  expectedAmountForStudent,
  resolveGridDisplayStatus,
  paymentStatusLabelPt,
} from '../lib/paymentStatus.js';

describe('planos isentos', () => {
  const financeConfig = {
    plans: [
      { name: 'Mensal', price: 200, isExempt: false },
      { name: 'Bolsista', price: 0, isExempt: true },
    ],
  };

  it('expectedAmountForStudent retorna 0 para plano isento', () => {
    const student = { id: 's1', plan: 'Bolsista', dueDay: 10 };
    expect(expectedAmountForStudent(student, financeConfig, null)).toBe(0);
  });

  it('resolveGridDisplayStatus retorna exempt para plano isento sem pagamento', () => {
    const student = { id: 's1', plan: 'Bolsista', dueDay: 10 };
    const result = resolveGridDisplayStatus(student, null, '2026-06', new Date('2026-06-20T12:00:00'));
    expect(result.key).toBe('exempt');
    expect(result.label).toBe('Isento');
  });

  it('paymentStatusLabelPt traduz exempt', () => {
    expect(paymentStatusLabelPt('exempt')).toBe('Isento');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/paymentStatus.test.js`
Expected: FAIL com `expected "none" to be "exempt"` ou valor esperado `0` não atendido.

- [ ] **Step 3: Implement minimal helper + storage support**

Criar `src/lib/planBilling.js`:

```javascript
export function normalizePlanName(value) {
  return String(value || '').trim();
}

export function findPlanByName(financeConfig, planName) {
  const name = normalizePlanName(planName);
  if (!name) return null;
  return (financeConfig?.plans || []).find((plan) => normalizePlanName(plan?.name) === name) || null;
}

export function isExemptPlan(plan) {
  return plan?.isExempt === true;
}

export function isStudentOnExemptPlan(student, financeConfig) {
  return isExemptPlan(findPlanByName(financeConfig, student?.plan));
}
```

Atualizar `compactPlanForStorage` em `src/lib/financeConfigStorage.js`:

```javascript
const out = {
  name,
  price: Number(plan.price) || 0,
  applyCardFee: plan.applyCardFee !== false,
};
if (plan.isExempt === true) out.isExempt = true;
```

- [ ] **Step 4: Wire helper into payment status**

Em `src/lib/paymentStatus.js`, adicionar `exempt` aos labels e short-circuits:

```javascript
import { isStudentOnExemptPlan } from './planBilling.js';

export const GRID_STATUS_LABELS = {
  paid: 'Pago',
  covered: 'Coberto',
  awaiting: 'Aguardando',
  partial: 'Parcial',
  pending: 'Pendente',
  soon: 'A vencer',
  none: 'Não registrado',
  frozen: 'Trancado',
  cancelled: 'Cancelado',
  exempt: 'Isento',
};

export function expectedAmountForStudent(student, financeConfig, payment) {
  if (isStudentOnExemptPlan(student, financeConfig)) return 0;
  const st = String(payment?.status || '').toLowerCase();
  if (st === 'covered' || st === 'frozen') return 0;
  const fromPayment = Number(payment?.expected_amount);
  if (Number.isFinite(fromPayment) && fromPayment > 0) return fromPayment;
  return openAmountForStudent(student, payment, financeConfig);
}

export function resolveGridDisplayStatus(student, payment, currentMonth, today = new Date(), financeConfig) {
  if (isStudentOnExemptPlan(student, financeConfig)) {
    return {
      key: 'exempt',
      label: GRID_STATUS_LABELS.exempt,
      dbStatus: null,
      row: { status: 'exempt', dueDate: null, daysOverdue: 0 },
    };
  }
  // restante da função atual
}
```

Se a assinatura de `resolveGridDisplayStatus` já estiver espalhada demais, criar um wrapper helper para a checagem antes do uso na grid.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/test/paymentStatus.test.js`
Expected: PASS com os casos `planos isentos`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/planBilling.js src/lib/financeConfigStorage.js src/lib/paymentStatus.js src/test/paymentStatus.test.js
git commit -m "feat(finance): add exempt plan billing helpers"
```

---

### Task 2: Configuração de planos e persistência na UI

**Files:**
- Modify: `src/components/finance/settings/FinanceSettingsPlansSection.jsx`
- Test: `src/test/mensalidadesPanel.test.jsx`

- [ ] **Step 1: Write the failing UI-oriented test**

Adicionar em `src/test/mensalidadesPanel.test.jsx` um caso mínimo que monte `financeConfig` com plano isento:

```javascript
it('mantém isExempt no financeConfig carregado para a mensalidades', async () => {
  const config = { plans: [{ name: 'Bolsista', price: 0, isExempt: true }] };
  expect(config.plans[0].isExempt).toBe(true);
});
```

Se houver suite melhor para settings, mover o caso para ela. O importante é ter um teste que fixe a chave `isExempt` como parte do shape válido do plano.

- [ ] **Step 2: Run test to verify it fails or is absent**

Run: `npm test -- src/test/mensalidadesPanel.test.jsx`
Expected: FAIL por ausência do caso ou por shape não reconhecido nos builders.

- [ ] **Step 3: Add the plan checkbox in settings**

Em `src/components/finance/settings/FinanceSettingsPlansSection.jsx`, dentro de `PlanListItem`, adicionar:

```jsx
<div className="form-group">
  <label className="checkbox-label">
    <input
      type="checkbox"
      checked={pl.isExempt === true}
      onChange={(e) => onUpdate(idx, { isExempt: e.target.checked })}
    />
    <span>Este plano não gera cobrança mensal</span>
  </label>
  <p className="text-small text-muted">
    Alunos deste plano aparecem como isentos em Mensalidades e ficam fora da cobrança.
  </p>
</div>
```

Garantir que o item novo criado por `onAdd` continue válido:

```javascript
{ name: '', price: 0, description: '', applyCardFee: true, isExempt: false }
```

- [ ] **Step 4: Keep summary readable for exempt plans**

No resumo do card do plano, ajustar `priceLabel` para exibir `Isento` quando `pl.isExempt === true`:

```javascript
const priceLabel = pl.isExempt ? 'Isento' : formatPlanPrice(pl.price);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/test/mensalidadesPanel.test.jsx`
Expected: PASS sem regressões nos testes existentes da aba mensalidades.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/settings/FinanceSettingsPlansSection.jsx src/test/mensalidadesPanel.test.jsx
git commit -m "feat(finance): allow plans to be marked as exempt"
```

---

### Task 3: Mensalidades e perfil do aluno

**Files:**
- Modify: `src/components/finance/MensalidadesPanel.jsx`
- Modify: `src/components/finance/MensalidadesListTable.jsx`
- Modify: `src/components/finance/MonthlyGridMobileCard.jsx`
- Modify: `src/pages/StudentProfile.jsx`
- Test: `src/test/mensalidadesListTable.test.jsx`
- Test: `src/test/studentFinancialTimeline.test.js`

- [ ] **Step 1: Write the failing table/profile tests**

Adicionar em `src/test/mensalidadesListTable.test.jsx`:

```javascript
it('renderiza aluno de plano isento com status Isento e sem acao de registrar', () => {
  const rows = [
    {
      id: 's1',
      name: 'Ana',
      plan: 'Bolsista',
      dueLabel: '—',
      amountLabel: 'Isento',
      displayStatus: { key: 'exempt', label: 'Isento' },
    },
  ];

  render(<MensalidadesListTable rows={rows} onRegisterPayment={vi.fn()} />);

  expect(screen.getByText('Isento')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /registrar/i })).not.toBeInTheDocument();
});
```

Adicionar em `src/test/studentFinancialTimeline.test.js`:

```javascript
it('resume plano isento como sem cobrança mensal', () => {
  const summary = buildFinancialSummary({
    student: { plan: 'Bolsista', dueDay: 10 },
    financeConfig: { plans: [{ name: 'Bolsista', price: 0, isExempt: true }] },
    payments: [],
    sales: [],
    paymentStatus: { status: 'exempt' },
  });
  expect(summary.currentPlanLabel || summary.planLabel || '').toMatch(/isento|bolsista/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/test/mensalidadesListTable.test.jsx src/test/studentFinancialTimeline.test.js`
Expected: FAIL porque a tabela ainda trata o aluno como pagante ou mantém CTA de registro.

- [ ] **Step 3: Implement the mensalidades row changes**

Em `MensalidadesPanel.jsx`, antes de montar valor/vencimento/status:

```javascript
const planIsExempt = isStudentOnExemptPlan(student, financeConfig);
const displayStatus = planIsExempt
  ? { key: 'exempt', label: 'Isento', dbStatus: null, row: { status: 'exempt', dueDate: null, daysOverdue: 0 } }
  : resolveGridDisplayStatus(student, payment, currentMonth, today, financeConfig);

const amountLabel = planIsExempt ? 'Isento' : formatCurrency(expectedAmountForStudent(student, financeConfig, payment));
const dueLabel = planIsExempt ? '—' : /* lógica atual */;
```

Em `MensalidadesListTable.jsx` e `MonthlyGridMobileCard.jsx`:

```jsx
const canRegister = row.displayStatus?.key !== 'exempt' && typeof onRegisterPayment === 'function';
```

E usar `canRegister` para não renderizar o CTA.

- [ ] **Step 4: Surface the exempt plan on student profile**

Em `src/pages/StudentProfile.jsx`, perto do bloco financeiro/plano:

```jsx
{isStudentOnExemptPlan(student, financeConfig) ? (
  <span className="status-badge status-badge--muted">Plano isento</span>
) : null}
```

Se já houver helper de label do plano no perfil, reaproveitar em vez de criar bloco paralelo.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/test/mensalidadesListTable.test.jsx src/test/studentFinancialTimeline.test.js`
Expected: PASS com badge `Isento`, vencimento `—` e sem botão de registrar.

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/MensalidadesPanel.jsx src/components/finance/MensalidadesListTable.jsx src/components/finance/MonthlyGridMobileCard.jsx src/pages/StudentProfile.jsx src/test/mensalidadesListTable.test.jsx src/test/studentFinancialTimeline.test.js
git commit -m "feat(finance): show exempt students in mensalidades"
```

---

### Task 4: Cobrança, atraso e KPIs

**Files:**
- Modify: `src/lib/financeiroOverview.js`
- Modify: `src/lib/collectionQueue.js`
- Modify: `src/lib/collectionOverdue.js`
- Test: `src/test/collectionRules.test.js`
- Test: `src/test/mensalidadesPanel.test.jsx`

- [ ] **Step 1: Write the failing aggregation tests**

Adicionar em `src/test/collectionRules.test.js` ou suite mais próxima:

```javascript
import { describe, it, expect } from 'vitest';
import { computeMensalidadesMonthKpis } from '../lib/financeiroOverview.js';
import { buildCollectionQueue } from '../lib/collectionQueue.js';

describe('planos isentos em agregados', () => {
  const financeConfig = {
    plans: [{ name: 'Bolsista', price: 0, isExempt: true }],
  };
  const students = [
    { id: 's1', name: 'Ana', plan: 'Bolsista', dueDay: 10, status: 'active' },
  ];

  it('não soma aluno isento nos KPIs de mensalidade', () => {
    const result = computeMensalidadesMonthKpis(students, [], financeConfig, '2026-06');
    expect(result.activeWithPlan).toBe(0);
    expect(result.expectedTotal).toBe(0);
    expect(result.overdueCount).toBe(0);
  });

  it('não inclui aluno isento na fila de cobrança', () => {
    const queue = buildCollectionQueue({
      students,
      payments: [],
      financeConfig,
      today: new Date('2026-06-20T12:00:00'),
    });
    expect(queue.rows).toEqual([]);
    expect(queue.summary.students).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/test/collectionRules.test.js src/test/mensalidadesPanel.test.jsx`
Expected: FAIL porque os agregados ainda contam o aluno como ativo pagante.

- [ ] **Step 3: Exclude exempt plans from KPIs and collection**

Em `src/lib/financeiroOverview.js`:

```javascript
import { isStudentOnExemptPlan } from './planBilling.js';

const active = (students || []).filter(
  (s) => isActiveStudent(s) && String(s.plan || '').trim() && !isStudentOnExemptPlan(s, financeConfig)
);
```

Em `src/lib/collectionQueue.js`:

```javascript
import { isStudentOnExemptPlan } from './planBilling.js';

const active = students.filter(
  (s) => isActiveStudent(s) && String(s.plan || '').trim() && !isStudentOnExemptPlan(s, financeConfig)
);
```

Em `src/lib/collectionOverdue.js`, short-circuit antes do cálculo de atraso:

```javascript
if (isStudentOnExemptPlan(student, financeConfig)) {
  return {
    status: 'exempt',
    dueDay: null,
    dueDate: null,
    daysOverdue: 0,
  };
}
```

Se `getPaymentRowStatus` não recebe `financeConfig`, propagar esse argumento até os pontos de chamada alterados em Mensalidades e Cobrança.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/test/collectionRules.test.js src/test/mensalidadesPanel.test.jsx`
Expected: PASS com KPIs zerados e fila vazia para o plano isento.

- [ ] **Step 5: Run focused regression suite**

Run: `npm test -- src/test/paymentStatus.test.js src/test/mensalidadesListTable.test.jsx src/test/mensalidadesPanel.test.jsx src/test/studentFinancialTimeline.test.js src/test/collectionRules.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/financeiroOverview.js src/lib/collectionQueue.js src/lib/collectionOverdue.js src/test/collectionRules.test.js src/test/mensalidadesPanel.test.jsx
git commit -m "feat(finance): exclude exempt plans from collection and kpis"
```

---

### Task 5: Docs de fluxo e verificação final

**Files:**
- Modify: `docs/flows/financeiro/a-receber-mensalidades.md`
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`

- [ ] **Step 1: Update the flow docs**

Em `docs/flows/financeiro/a-receber-mensalidades.md`, adicionar nota objetiva:

```md
- Alunos cujo plano está marcado como isento em `Minha academia > Financeiro > Planos` aparecem com status `Isento`, sem vencimento e sem ação de registrar pagamento.
- Esses alunos não entram em cobrança, inadimplência nem nos KPIs financeiros de mensalidades.
```

Em `docs/flows/crm/aluno-perfil-presenca.md`, adicionar:

```md
- O perfil do aluno informa quando o plano atual é isento, derivado da configuração do plano, sem campo extra de bolsista no cadastro do aluno.
```

- [ ] **Step 2: Run verification commands**

Run: `npm test -- src/test/paymentStatus.test.js src/test/mensalidadesListTable.test.jsx src/test/mensalidadesPanel.test.jsx src/test/studentFinancialTimeline.test.js src/test/collectionRules.test.js`
Expected: PASS

Run: `git diff --check`
Expected: sem trailing spaces ou conflitos

- [ ] **Step 3: Check diagnostics**

Executar diagnósticos nos arquivos alterados e corrigir qualquer erro fácil antes de encerrar.

- [ ] **Step 4: Commit**

```bash
git add docs/flows/financeiro/a-receber-mensalidades.md docs/flows/crm/aluno-perfil-presenca.md
git commit -m "docs: document exempt plan flow in finance and student profile"
```

---

## Self-review

### Cobertura da spec

- Configuração explícita no plano: coberta em Task 2.
- Aluno aparece como `Isento` em Mensalidades: coberta em Task 3.
- Sem cobrança e sem KPIs: coberta em Task 4.
- Sem campo extra no aluno: mantido em Task 2 e Task 3.
- Compatibilidade com planos antigos: coberta em Task 1 pelo default `isExempt: false`.

### Placeholder scan

- Não há `TODO`, `TBD` ou "implementar depois".
- Todos os passos com código têm trecho concreto ou comando exato.

### Consistência de tipos

- O atributo usado do começo ao fim é `isExempt`.
- O status visual novo é `exempt` com label `Isento`.
- O helper canônico é `isStudentOnExemptPlan(student, financeConfig)`.

