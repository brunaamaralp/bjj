# A pagar — clareza de vencimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar óbvio na fila A pagar o que vence hoje, em breve, depois ou já atrasou — via status `due_today`, hints relativos, chips de filtro e helper único de rótulos.

**Architecture:** Estender `classifyPayableStatus` / `summarizePayables` em `payablesAggregate.js`; extrair display para `payablesStatusDisplay.js`; UI em `PayablesTab` + `PayablesVisaoPanel`. Sem mudança de API.

**Tech Stack:** React, Vitest, CSS existente (`filter-chip` / `finance-hub-filters__chips`).

**Spec:** [2026-09-22-a-pagar-clareza-vencimento-design.md](../specs/2026-09-22-a-pagar-clareza-vencimento-design.md)

---

## File map

| File | Role |
|------|------|
| `src/lib/payablesAggregate.js` | `due_today`; summary conta today+soon |
| `src/lib/payablesStatusDisplay.js` | **create** — labels, badge class, hint relativo |
| `src/lib/financePayableMatch.js` | score `due_today` ≥ `due_soon` |
| `src/components/finance/PayablesTab.jsx` | chips, hint, helper, empty filtrado |
| `src/components/finance/PayablesVisaoPanel.jsx` | helper + hint |
| `src/test/payablesAggregate.test.js` | classify + summary |
| `src/test/payablesStatusDisplay.test.js` | **create** — labels/hints |
| `docs/flows/financeiro/a-pagar-contas-fixas.md` | checklist + histórico |

---

### Task 1: classifyPayableStatus + summarizePayables (TDD)

**Files:**
- Modify: `src/lib/payablesAggregate.js`
- Test: `src/test/payablesAggregate.test.js`

- [ ] **Step 1: Expand failing tests**

Replace/extend the classify test and add summary-with-today:

```js
it('classifies overdue, due_today, due_soon, open', () => {
  expect(classifyPayableStatus('2026-06-01', '2026-06-16')).toBe('overdue');
  expect(classifyPayableStatus('2026-06-16', '2026-06-16')).toBe('due_today');
  expect(classifyPayableStatus('2026-06-20', '2026-06-16')).toBe('due_soon');
  expect(classifyPayableStatus('2026-07-01', '2026-06-16')).toBe('open');
});

it('summarizes dueSoonCount including due_today', () => {
  const items = mergePayableItems(
    buildPendingPayableItems(
      [
        { id: '1', status: 'pending', direction: 'out', gross: 100, due_date: '2026-06-16', planName: 'Hoje' },
        { id: '2', status: 'pending', direction: 'out', gross: 50, due_date: '2026-06-20', planName: 'Semana' },
        { id: '3', status: 'pending', direction: 'out', gross: 30, due_date: '2026-07-01', planName: 'Longe' },
      ],
      { today: '2026-06-16' }
    )
  );
  const summary = summarizePayables(items, { today: '2026-06-16' });
  expect(summary.dueSoonCount).toBe(2);
  expect(summary.dueSoonAmount).toBe(150);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/test/payablesAggregate.test.js
```

- [ ] **Step 3: Implement**

In `classifyPayableStatus`:

```js
if (due < today) return 'overdue';
if (due === today) return 'due_today';
if (due <= addDaysYmd(today, 7)) return 'due_soon';
return 'open';
```

In `summarizePayables`, treat `due_today` like `due_soon` for counts/amounts:

```js
} else if (it.status === 'due_soon' || it.status === 'due_today') {
```

(both loops — pending and template).

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/test/payablesAggregate.test.js
```

- [ ] **Step 5: Commit** (só se o usuário pedir commit neste PR)

---

### Task 2: payablesStatusDisplay helper (TDD)

**Files:**
- Create: `src/lib/payablesStatusDisplay.js`
- Create: `src/test/payablesStatusDisplay.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, expect, it } from 'vitest';
import {
  payableStatusLabel,
  payableStatusBadgeClass,
  payableDueRelativeHint,
} from '../lib/payablesStatusDisplay.js';

describe('payablesStatusDisplay', () => {
  it('labels status', () => {
    expect(payableStatusLabel('overdue')).toBe('Vencida');
    expect(payableStatusLabel('due_today')).toBe('Vence hoje');
    expect(payableStatusLabel('due_soon')).toBe('Vence em breve');
    expect(payableStatusLabel('open')).toBe('A vencer');
  });

  it('badge classes', () => {
    expect(payableStatusBadgeClass('overdue')).toBe('finance-badge-atraso');
    expect(payableStatusBadgeClass('due_today')).toBe('finance-badge-aguardando');
    expect(payableStatusBadgeClass('due_soon')).toBe('finance-badge-aguardando');
    expect(payableStatusBadgeClass('open')).toBe('finance-badge-pendente');
  });

  it('relative hints', () => {
    expect(payableDueRelativeHint('2026-06-14', '2026-06-16')).toBe('há 2 dias');
    expect(payableDueRelativeHint('2026-06-15', '2026-06-16')).toBe('há 1 dia');
    expect(payableDueRelativeHint('2026-06-16', '2026-06-16')).toBe('hoje');
    expect(payableDueRelativeHint('2026-06-17', '2026-06-16')).toBe('em 1 dia');
    expect(payableDueRelativeHint('2026-06-20', '2026-06-16')).toBe('em 4 dias');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/test/payablesStatusDisplay.test.js
```

- [ ] **Step 3: Implement `payablesStatusDisplay.js`**

```js
import { todayYmdLocal } from './financeForecastCore.js';

function daysBetweenYmd(fromYmd, toYmd) {
  const a = String(fromYmd || '').slice(0, 10);
  const b = String(toYmd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const ms = Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

export function payableStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'Vencida';
  if (s === 'due_today') return 'Vence hoje';
  if (s === 'due_soon') return 'Vence em breve';
  if (s === 'open') return 'A vencer';
  return 'Programada';
}

export function payableStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'overdue') return 'finance-badge-atraso';
  if (s === 'due_today' || s === 'due_soon') return 'finance-badge-aguardando';
  return 'finance-badge-pendente';
}

export function payableDueRelativeHint(dueYmd, todayYmd = todayYmdLocal()) {
  const due = String(dueYmd || '').slice(0, 10);
  const today = String(todayYmd || '').slice(0, 10);
  const diff = daysBetweenYmd(today, due);
  if (diff == null) return '';
  if (diff === 0) return 'hoje';
  if (diff < 0) {
    const n = Math.abs(diff);
    return n === 1 ? 'há 1 dia' : `há ${n} dias`;
  }
  return diff === 1 ? 'em 1 dia' : `em ${diff} dias`;
}

/** Chip filter: week = due_today|due_soon */
export function payableMatchesStatusFilter(item, filter) {
  const f = String(filter || 'all').toLowerCase();
  if (f === 'all' || !f) return true;
  const st = String(item?.status || '').toLowerCase();
  if (f === 'week') return st === 'due_today' || st === 'due_soon';
  if (f === 'open') return st === 'open';
  if (f === 'overdue') return st === 'overdue';
  return true;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npx vitest run src/test/payablesStatusDisplay.test.js
```

---

### Task 3: Wire UI (PayablesTab + Visão)

**Files:**
- Modify: `src/components/finance/PayablesTab.jsx`
- Modify: `src/components/finance/PayablesVisaoPanel.jsx`
- Modify: `src/lib/financePayableMatch.js` (one line: `due_today` score)

- [ ] **Step 1: Remove local statusLabel/statusBadgeClass; import helpers**

In both components, import from `payablesStatusDisplay.js`.

- [ ] **Step 2: PayablesTab — status filter state + filter items**

```js
const [statusFilter, setStatusFilter] = useState('all'); // all | week | open | overdue
```

In `items` useMemo, after category filter:

```js
rows = rows.filter((it) => payableMatchesStatusFilter(it, statusFilter));
```

Reset or keep filter when leaving Contas fixas — keep local state; chips only render on Contas fixas.

- [ ] **Step 3: Chips UI** (inside filters bar, Contas fixas only)

Use `finance-hub-filters__chips` + `filter-chip` / `is-active` (padrão MonthlyClosingTab):

```jsx
<div className="finance-hub-filters__chips" role="group" aria-label="Filtrar por vencimento">
  {[
    { id: 'all', label: 'Todas' },
    { id: 'week', label: 'Vence em 7 dias' },
    { id: 'open', label: 'A vencer' },
    { id: 'overdue', label: 'Vencidas' },
  ].map((opt) => (
    <button
      key={opt.id}
      type="button"
      className={`filter-chip${statusFilter === opt.id ? ' is-active' : ''}`}
      aria-pressed={statusFilter === opt.id}
      onClick={() => setStatusFilter(opt.id)}
    >
      {opt.label}
    </button>
  ))}
</div>
```

Show chips + search/category only on Contas fixas (already gated). Optionally show chips above the bar.

- [ ] **Step 4: Empty state when filter empties list**

Track `hasCatalogRows` (items before status/search/category filters, or: `base.length > 0` while filtered `items.length === 0`):

```jsx
title: filteredEmpty ? 'Nenhum resultado' : ...
description: filteredEmpty ? 'Ajuste a busca ou os filtros de vencimento.' : ...
primaryAction: filteredEmpty
  ? { label: 'Limpar filtros', onClick: () => { setSearch(''); setCategoryFilter(''); setStatusFilter('all'); } }
  : { label: 'Nova conta', onClick: openNewForm }
```

- [ ] **Step 5: Due date cell + Visão meta**

```jsx
<span className="finance-table__date">{fmtDateBr(item.due_date)}</span>
{payableDueRelativeHint(item.due_date) ? (
  <span className="text-small text-muted d-block">{payableDueRelativeHint(item.due_date)}</span>
) : null}
```

Badge: use `payableStatusLabel` / `payableStatusBadgeClass`; keep AlertCircle for overdue (and optionally due_today).

Visão: append ` · {payableDueRelativeHint(item.due_date)}` in meta (or muted span).

- [ ] **Step 6: financePayableMatch**

```js
else if (item.status === 'due_soon' || item.status === 'due_today') score += 4;
```

Prefer `due_today` slightly higher optional: `due_today` += 6 — spec não exige; usar **mesmo 4** ou **6 para today**. Prefer: today += 6, soon += 4.

- [ ] **Step 7: Run unit tests**

```bash
npx vitest run src/test/payablesAggregate.test.js src/test/payablesStatusDisplay.test.js src/test/financePayableMatch.test.js
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/flows/financeiro/a-pagar-contas-fixas.md`
- Spec status → Implementado when done

- [ ] **Step 1: Flow updates**

- Link design spec in Spec line
- Mapa: Contas fixas → chips Todas / Vence em 7 dias / A vencer / Vencidas; badges Vence hoje / …
- Checklist item: badge **Vence hoje** quando `due === hoje`; hint relativo na coluna
- Histórico: `2026-09-22 | Clareza de vencimento (due_today, chips, hints)`

- [ ] **Step 2: Mark design status Implementado**

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| `due_today` classify | 1 |
| KPI dueSoon includes today | 1 |
| Labels / badge classes helper | 2 |
| Relative hints | 2–3 |
| Chips Contas fixas | 3 |
| Empty filtrado | 3 |
| Visão usa helper + hint | 3 |
| Flow doc | 4 |
| financePayableMatch due_today | 3 |

## Out of scope (do not implement)

Mobile cards, agrupar templates, editar template, rename KPI “Em aberto (90 dias)”.
