# A pagar — fila operacional agrupada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em Contas fixas, separar visualmente “A pagar agora” (pending) de “Programadas” (templates).

**Architecture:** Helper puro `splitPayablesOperationalGroups` sobre a lista já filtrada; `PayablesTab` renderiza 0–2 blocos com tabela; Vencidas permanece lista única.

**Tech Stack:** React, Vitest.

**Spec:** [2026-09-22-a-pagar-fila-operacional-design.md](../specs/2026-09-22-a-pagar-fila-operacional-design.md)

---

## File map

| File | Role |
|------|------|
| `src/lib/payablesAggregate.js` | `splitPayablesOperationalGroups` |
| `src/test/payablesAggregate.test.js` | testes do split |
| `src/components/finance/PayablesTab.jsx` | UI agrupada + extrair row para não duplicar |
| `docs/flows/financeiro/a-pagar-contas-fixas.md` | fluxo |
| Spec status → Implementado | |

---

### Task 1: split helper (TDD)

- [ ] **Step 1: Failing test** in `payablesAggregate.test.js`:

```js
import { splitPayablesOperationalGroups, PAYABLE_SOURCE } from '../lib/payablesAggregate.js';

it('splits now vs scheduled by source', () => {
  const { now, scheduled } = splitPayablesOperationalGroups([
    { id: '1', source: PAYABLE_SOURCE.LANCAMENTO },
    { id: '2', source: PAYABLE_SOURCE.TEMPLATE },
    { id: '3', source: PAYABLE_SOURCE.RECORRENCIA },
  ]);
  expect(now.map((i) => i.id)).toEqual(['1', '3']);
  expect(scheduled.map((i) => i.id)).toEqual(['2']);
});

it('returns empty arrays for empty input', () => {
  expect(splitPayablesOperationalGroups([])).toEqual({ now: [], scheduled: [] });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
npx vitest run src/test/payablesAggregate.test.js
```

- [ ] **Step 3: Implement**

```js
export function splitPayablesOperationalGroups(items = []) {
  const now = [];
  const scheduled = [];
  for (const it of items) {
    if (it?.source === PAYABLE_SOURCE.TEMPLATE) scheduled.push(it);
    else now.push(it);
  }
  return { now, scheduled };
}
```

Note: unknown sources go to `now` (safe default for pending-like rows).

- [ ] **Step 4: Run — PASS**

---

### Task 2: PayablesTab UI

- [ ] **Step 1:** Import `splitPayablesOperationalGroups`.
- [ ] **Step 2:** `useMemo` groups when `resolvedSection === CONTAS_FIXAS` from `items`.
- [ ] **Step 3:** Extract row renderer (function `renderPayableRow(item)` inside component or inline map shared).
- [ ] **Step 4:** Contas fixas: for each non-empty group, heading + table with thead. Vencidas: flat table as today.
- [ ] **Step 5:** Headings: `A pagar agora (${now.length})`, `Programadas (${scheduled.length})`.

---

### Task 3: Docs

- Flow mapa + checklist + histórico
- Spec status Implementado + aceite checked

---

## Out of scope

Mobile, edit template, Visão/Vencidas grouping, URL params.
