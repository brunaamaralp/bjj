# Financeiro UI — Despoluir + Categorias = Plano de Contas

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Despoluir Visão Geral e A pagar (KPIs no padrão DRE/DFC, seções distintas, saldos mais limpos) e fazer categorias de A pagar serem **as mesmas** do select de saída dos Lançamentos — ou seja, `getCategoryOptionsByNature('out', chartAccounts)` (fixas do sistema + contas do plano, com dedupe).

**Architecture:** Reutilizar primitivos já canônicos (`finance-kpi-strip`, `SearchableGroupedSelect`, `useAccountingStore`, `compactLayout` de `BankBalancesOverview`). Diferenciar seções de A pagar no cliente via `selectPayablesItems` + UI específica para `visao`. Sem novas Serverless Functions.

**Tech Stack:** React 19, Vitest + Testing Library, CSS tokens em `styles/shell.css` / `receivables.css` / `bank-balances.css` / `overview.css`.

**Specs / fluxos:**
- [plano-contas-categorias.md](../../flows/financeiro/plano-contas-categorias.md)
- [a-pagar-contas-fixas.md](../../flows/financeiro/a-pagar-contas-fixas.md)
- Spec categorias: [2026-06-15-plano-contas-categorias-PRODUCT.md](../specs/2026-06-15-plano-contas-categorias-PRODUCT.md)

---

## Diagnóstico (baseline)

| Problema | Causa no código |
|----------|-----------------|
| KPIs A pagar “encolhidos” | `.payables-tab .finance-kpi-strip { width: fit-content; max 200px }` + `finance-kpi--compact` |
| Ícone de calendário na data | `<Calendar />` em cada linha (`PayablesTab.jsx`) |
| Categorias ≠ plano de contas | `categoryOptions` = utilidades + 4 extras; `<select>` simples; sem `chartAccounts` |
| Label `acct:…` cru na tabela | Render de `item.category` sem `resolveFinanceCategory` |
| Visão ≈ Contas fixas | Mesma tabela; `visao` = pending+proj; `contas-fixas` = pending+templates |
| Saldos poluídos | Overview usa cards full (breakdown sempre aberto) + intro duplicada + grid irregular |

### Regra de categorias (não negociável)

- **Fonte única:** `getCategoryOptionsByNature('out', chartAccounts)` — **igual** a Lançamentos (saída) e `BankReconCreateTxModal`.
- **UI:** `SearchableGroupedSelect` com `getOptionValue={(c) => c.value \|\| c.label}`.
- **Persistência:** gravar `value` (`acct:CODE` ou label fixo), nunca inventar subset de utilidades.
- **Exibição na lista/filtro:** `resolveFinanceCategory(raw, chartAccounts, { direction: 'out' })?.label \|\| raw`.
- **Default:** `FINANCE_CATEGORIES.OUTRAS_DESPESAS` (mesmo default de saída dos Lançamentos), não `LUZ`.
- **Não fazer:** select só com `getUtilityExpenseCategories()`; não criar lista paralela de categorias.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/components/finance/styles/receivables.css` | KPI strip A pagar full-width |
| `src/components/finance/PayablesTab.jsx` | KPIs, tabela, seções, select categorias |
| `src/lib/payablesAggregate.js` | (opcional) helpers de seção / limite visão |
| `src/lib/payablesCategoryDisplay.js` | **Criar** — label amigável + opções de filtro |
| `src/components/finance/PayablesVisaoPanel.jsx` | **Criar** — conteúdo distinto da seção Visão |
| `src/components/finance/BankBalancesOverview.jsx` | Compact na overview embutida |
| `src/components/finance/VisaoGeralTab.jsx` | Passar `compactLayout`; cortar intro redundante |
| `src/components/finance/styles/bank-balances.css` | Grid estável na overview |
| `src/components/finance/styles/overview.css` | Remover/ruído intro bancos |
| `src/lib/payablesImport.js` | Resolver categoria com `accounts` |
| `src/test/payablesCategoryDisplay.test.js` | **Criar** |
| `src/test/payablesAggregate.test.js` | Ajustar asserts de seção se mudar cortes |
| `docs/flows/financeiro/a-pagar-contas-fixas.md` | Atualizar mapa/checklist |
| `docs/flows/VALIDATION.md` | Registrar evidência |

**Não tocar:** `api/*` (Hobby 12/12), handlers de payables no servidor (apenas UI/cliente), DRE/DFC (já é o padrão de KPI).

---

## Estratégia de PRs

| PR | Escopo | Risco | Estimativa |
|----|--------|-------|------------|
| **PR-A** | KPIs full-width + remover Calendar da data | Baixo | ~40 LOC |
| **PR-B** | Categorias = plano/Lançamentos + labels na lista | Médio | ~150 LOC |
| **PR-C** | Visão ≠ Contas fixas (painel resumo vs lista) | Médio | ~200 LOC |
| **PR-D** | Saldos por conta compactos + grid | Baixo | ~80 LOC |

Cada PR: `npm test -- payablesAggregate payablesCategoryDisplay financeTxCategorySelect` (e testes tocados).

---

## PR-A — KPIs + limpar data

### Task 1: KPI strip full-width (padrão DRE)

**Files:**
- Modify: `src/components/finance/styles/receivables.css`
- Modify: `src/components/finance/PayablesTab.jsx` (classes dos KPIs)

- [ ] **Step 1: Ajustar CSS**

Substituir o bloco `.payables-tab .finance-kpi-strip` por:

```css
.payables-tab .finance-kpi-strip {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  width: 100%;
}

@media (max-width: 767px) {
  .payables-tab .finance-kpi-strip {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Remover `--compact` dos 3 KPIs (e do KPI de Vencidas)**

Em `PayablesTab.jsx`, trocar `finance-kpi finance-kpi--compact` por `finance-kpi`. Marcar o KPI principal (“Em aberto (90 dias)”) com `finance-kpi--hero` (como Resultado líquido no DRE). Em Vencidas, manter 1 KPI full-width (sem max-width de `.receivables-tab__total-kpi` quando dentro de payables) — sobrescrever:

```css
.payables-tab .receivables-tab__total-kpi {
  max-width: none;
}
```

- [ ] **Step 3: Smoke visual**

Abrir `/financeiro?tab=a-pagar` — 3 cards ocupam 100% da largura do painel; em mobile empilham.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/styles/receivables.css src/components/finance/PayablesTab.jsx
git commit -m "$(cat <<'EOF'
fix(finance): align A pagar KPIs with DRE full-width strip

EOF
)"
```

### Task 2: Remover ícone de calendário na coluna Vencimento

**Files:**
- Modify: `src/components/finance/PayablesTab.jsx`

- [ ] **Step 1: Simplificar célula de data**

De:

```jsx
<span className="finance-table__date">
  <Calendar size={14} aria-hidden />
  {fmtDateBr(item.due_date)}
</span>
```

Para:

```jsx
<span className="finance-table__date">{fmtDateBr(item.due_date)}</span>
```

Remover import `Calendar` se não for mais usado. Manter `Repeat` (recorrente) e `AlertCircle` (vencida) — são semântica, não decoração de data.

- [ ] **Step 2: Commit**

```bash
git add src/components/finance/PayablesTab.jsx
git commit -m "$(cat <<'EOF'
fix(finance): drop calendar icon from payables due date column

EOF
)"
```

---

## PR-B — Categorias = plano de contas (paridade Lançamentos)

### Task 3: Helper de display + filtro

**Files:**
- Create: `src/lib/payablesCategoryDisplay.js`
- Create: `src/test/payablesCategoryDisplay.test.js`

- [ ] **Step 1: Teste falhando**

```js
import { describe, it, expect } from 'vitest';
import { formatPayableCategoryLabel, payableCategoryFilterOptions } from '../lib/payablesCategoryDisplay.js';
import { getCategoryOptionsByNature } from '../lib/financeCategories.js';

const accounts = [
  { code: '3.1.1', name: 'Energia elétrica', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
  { code: '3.1.2', name: 'Água', type: 'despesa', dreGrupo: 'Despesas Operacionais', isActive: true },
];

describe('payablesCategoryDisplay', () => {
  it('resolve acct:CODE para label do plano', () => {
    expect(formatPayableCategoryLabel('acct:3.1.1', accounts)).toMatch(/Energia/i);
  });

  it('filtro lista as mesmas opções de saída dos lançamentos', () => {
    const groups = getCategoryOptionsByNature('out', accounts);
    const filter = payableCategoryFilterOptions(groups);
    const values = filter.map((o) => o.value);
    expect(values).toContain('acct:3.1.1');
    expect(values).toContain('Outras despesas');
  });
});
```

- [ ] **Step 2: Rodar e confirmar FAIL**

Run: `npm test -- payablesCategoryDisplay`

- [ ] **Step 3: Implementar**

```js
import { resolveFinanceCategory } from './financeCategories.js';

export function formatPayableCategoryLabel(raw, accounts = null) {
  const value = String(raw || '').trim();
  if (!value) return '—';
  const resolved = resolveFinanceCategory(value, accounts, { direction: 'out' });
  return resolved?.label || value;
}

/** Flatten SearchableGroupedSelect groups → opções de <select> filtro. */
export function payableCategoryFilterOptions(groups) {
  const out = [];
  const seen = new Set();
  const map = groups instanceof Map ? groups : new Map();
  for (const items of map.values()) {
    for (const c of items || []) {
      const value = c.value || c.label;
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push({ value, label: c.label });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
```

- [ ] **Step 4: Testes PASS + commit**

```bash
git add src/lib/payablesCategoryDisplay.js src/test/payablesCategoryDisplay.test.js
git commit -m "$(cat <<'EOF'
feat(finance): add payable category labels aligned to chart of accounts

EOF
)"
```

### Task 4: Wire PayablesTab no mesmo select dos Lançamentos

**Files:**
- Modify: `src/components/finance/PayablesTab.jsx`
- Modify: `src/lib/payablesImport.js` (passar `accounts` em `resolveFinanceCategory`)

- [ ] **Step 1: Carregar plano de contas**

```jsx
import { useAccountingStore } from '../../store/useAccountingStore';
import SearchableGroupedSelect from '../shared/SearchableGroupedSelect.jsx';
import {
  FINANCE_CATEGORIES,
  getCategoryOptionsByNature,
  resolveFinanceCategory,
} from '../../lib/financeCategories.js';
import {
  formatPayableCategoryLabel,
  payableCategoryFilterOptions,
} from '../../lib/payablesCategoryDisplay.js';

// no componente:
const chartAccounts = useAccountingStore((s) => s.accounts);
useEffect(() => {
  if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
}, [academyId]);

const categoryOptionGroups = useMemo(
  () => getCategoryOptionsByNature('out', chartAccounts),
  [chartAccounts]
);
const categoryFilterOptions = useMemo(
  () => payableCategoryFilterOptions(categoryOptionGroups),
  [categoryOptionGroups]
);
```

Remover o `useMemo` atual de `getUtilityExpenseCategories` + extras.

- [ ] **Step 2: Default do form**

```js
category: FINANCE_CATEGORIES.OUTRAS_DESPESAS.label,
```

- [ ] **Step 3: Modal — SearchableGroupedSelect**

Substituir o `<select id="payable-category">` por:

```jsx
<label htmlFor="payable-category">Categoria</label>
<SearchableGroupedSelect
  id="payable-category"
  value={form.category}
  groups={categoryOptionGroups}
  getOptionValue={(c) => c.value || c.label}
  getOptionLabel={(c) => c.label}
  getOptionTitle={(c) => c.title || ''}
  placeholder="Digite para buscar categoria…"
  emptyMessage="Nenhuma categoria encontrada para essa busca."
  onChange={(value) => setForm((f) => ({ ...f, category: value }))}
/>
```

Ao salvar, manter `form.category` como value (`acct:…` ou label). Ao derivar `type` do TX, usar:

```js
const cat = resolveFinanceCategory(form.category, chartAccounts, { direction: 'out' });
```

(espelhar o padrão de `TransacoesTab` / create payable payload existente — ajustar só a resolução).

- [ ] **Step 4: Filtro da lista**

```jsx
<option value="">Todas as categorias</option>
{categoryFilterOptions.map((c) => (
  <option key={c.value} value={c.value}>{c.label}</option>
))}
```

Filtro por igualdade de value **ou** label resolvido (itens antigos podem ter só label):

```js
if (categoryFilter) {
  rows = rows.filter((it) => {
    const raw = String(it.category || '').trim();
    if (raw === categoryFilter) return true;
    return formatPayableCategoryLabel(raw, chartAccounts) ===
      formatPayableCategoryLabel(categoryFilter, chartAccounts);
  });
}
```

- [ ] **Step 5: Célula Categoria na tabela**

```jsx
<td className="text-small">{formatPayableCategoryLabel(item.category, chartAccounts)}</td>
```

- [ ] **Step 6: Import CSV**

Em `payablesImport.js`, aceitar `accounts` opcional e:

```js
const cat = resolveFinanceCategory(categoryRaw, accounts, { direction: 'out' })
  || FINANCE_CATEGORIES.OUTRAS_DESPESAS;
```

Passar `chartAccounts` a partir do modal/caller.

- [ ] **Step 7: Testes**

Run: `npm test -- payablesCategoryDisplay financeTxCategorySelect payablesAggregate`

- [ ] **Step 8: Commit**

```bash
git add src/components/finance/PayablesTab.jsx src/lib/payablesImport.js src/components/finance/ImportPayablesModal.jsx
git commit -m "$(cat <<'EOF'
feat(finance): use chart-of-accounts categories in A pagar

EOF
)"
```

---

## PR-C — Visão geral ≠ Contas fixas

### Decisão de produto (travada)

| Seção | Conteúdo |
|-------|----------|
| **Visão geral** | KPIs (já no shell) + resumo (vencidas / vence em 7d / fixas ativas) + lista curta **próximos 8 vencimentos** (pending + projected, sem templates “órfãos”) + CTAs para Contas fixas / Vencidas / Previsão. **Sem** busca/filtro/tabela completa. |
| **Contas fixas** | Lista operacional completa: pending + templates (como hoje) + busca/filtro + ações. |
| **Vencidas** | Só overdue (inalterado). |

### Task 5: Painel Visão dedicado

**Files:**
- Create: `src/components/finance/PayablesVisaoPanel.jsx`
- Modify: `src/components/finance/PayablesTab.jsx`
- Modify: `src/lib/payablesAggregate.js` — exportar `selectPayablesVisaoPreview(catalog, limit = 8)` se preferir centralizar
- Modify: `src/test/payablesAggregate.test.js`
- Modify: `docs/flows/financeiro/a-pagar-contas-fixas.md`

- [ ] **Step 1: Teste de corte da visão**

```js
it('selectPayablesVisaoPreview returns at most N upcoming rows', () => {
  const preview = selectPayablesVisaoPreview(catalog, 8);
  expect(preview.length).toBeLessThanOrEqual(8);
  expect(preview.every((r) => r.source !== 'template' || true)).toBe(true);
});
```

Implementação sugerida:

```js
export function selectPayablesVisaoPreview(catalog, limit = 8) {
  const rows = mergePayableItems(catalog?.pending || [], catalog?.projected || []);
  return rows.slice(0, Math.max(0, Number(limit) || 8));
}
```

(`contas-fixas` continua `mergePayableItems(pending, templates)`.)

- [ ] **Step 2: `PayablesVisaoPanel`**

Componente presentacional:

- 3 metric rows (reusar classes `financeiro-overview-metric` ou `finance-kpi` compact interno — preferir metrics, KPIs já estão no shell)
- `<ul>` dos próximos itens (fornecedor · data · valor · status)
- Links: Contas fixas, Vencidas, Previsão
- EmptyState se zero itens

- [ ] **Step 3: Branch no `PayablesTab`**

```jsx
{resolvedSection === PAYABLES_SECTIONS.VISAO ? (
  <PayablesVisaoPanel
    summary={summary}
    items={selectPayablesVisaoPreview(data?.catalog, 8)}
    formatCategory={(raw) => formatPayableCategoryLabel(raw, chartAccounts)}
  />
) : (
  /* tabela atual + filtros (esconder filtros só se quiser; em Vencidas já esconde busca) */
)}
```

Não renderizar barra de busca/filtro na Visão.

- [ ] **Step 4: Atualizar fluxo**

Em `a-pagar-contas-fixas.md`: mapa — Visão = resumo; Contas fixas = fila; checklist “Visão não duplica a tabela completa”.

Registrar em `docs/flows/VALIDATION.md`.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(finance): differentiate A pagar overview from fixed bills list

EOF
)"
```

---

## PR-D — Saldos por conta (Visão Geral)

### Task 6: Compact + grid estável

**Files:**
- Modify: `src/components/finance/VisaoGeralTab.jsx`
- Modify: `src/components/finance/BankBalancesOverview.jsx` (só se precisar de prop `overviewDense`)
- Modify: `src/components/finance/styles/bank-balances.css`
- Modify: `src/components/finance/styles/overview.css`

- [ ] **Step 1: Usar modo compacto embutido**

Em `VisaoGeralTab`, no `BankBalancesOverview`:

```jsx
<BankBalancesOverview
  academyId={academyId}
  embedded
  compactLayout
  accountLinks
  ...
/>
```

Garantir que `compactLayout` + `accountLinks` coexistam: saldo em destaque, breakdown em `<details>`, link “Ver lançamentos” dentro do details ou abaixo do hero.

Se hoje `accountLinks` ignora compact, ajustar `BankBalanceCard` para:

- hero = nome + saldo (+ link opcional)
- details = `AccountBreakdown`

- [ ] **Step 2: Remover intro redundante**

Remover o bloco `.financeiro-overview-banks-intro` (ícone + parágrafo) do card “Saldos por conta” — o eyebrow do card + `as-of` do componente bastam.

- [ ] **Step 3: Grid**

```css
.finance-bank-balances--overview .finance-bank-balances__grid,
.finance-bank-balances--overview .finance-bank-balances__grid--quad {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
}

@media (min-width: 900px) {
  .finance-bank-balances--overview .finance-bank-balances__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

- [ ] **Step 4: Smoke** — Visão Geral com 1, 2 e 4 contas: cards alinhados; detalhes recolhidos por padrão.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(finance): compact bank balances grid on overview

EOF
)"
```

---

## Verificação final (após PR-D)

Run:

```bash
npm test -- payablesAggregate payablesCategoryDisplay financeTxCategorySelect payablesImport
```

Checklist manual:

1. `/financeiro?tab=a-pagar` — 3 KPIs full-width
2. Data sem ícone de calendário
3. Nova conta → categorias idênticas ao modal de Lançamento (saída), incluindo contas `acct:`
4. Linha com `acct:…` mostra nome do plano
5. Subaba Visão ≠ Contas fixas
6. Visão Geral → saldos compactos, grid regular

---

## Self-review

| Requisito do usuário | Task |
|---------------------|------|
| KPIs padrão DRE/DFC (3 full-width) | Task 1 |
| Tirar “emoji”/ícone da data | Task 2 |
| Categorias = plano de contas | Tasks 3–4 |
| Visão ≠ Contas fixas | Task 5 |
| Saldos menos poluídos + grid | Task 6 |

Sem placeholders TBD. Escopo não inclui redesign completo da Visão Geral (Mensalidades/Alertas/Previsão) — só saldos + o que afeta a percepção de poluição pedida.
