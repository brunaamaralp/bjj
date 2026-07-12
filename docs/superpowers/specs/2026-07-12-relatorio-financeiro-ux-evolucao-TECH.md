# Relatório Financeiro — evolução UX/UI — TECH

**Data:** 2026-07-12  
**PRODUCT:** [2026-07-12-relatorio-financeiro-ux-evolucao-PRODUCT.md](./2026-07-12-relatorio-financeiro-ux-evolucao-PRODUCT.md)

---

## 1. Resumo técnico

Elevar a aba `/reports?tab=financeiro` ao padrão das abas Alunos e Vendas, em duas fases:

1. **Fase 1 (P0):** correções de copy, permissões, tooltips, CTAs e breakdown — **somente frontend** + 1 string em `VisaoGeralTab`.
2. **Fase 2 (P1):** comparação temporal, drill-down, bloco MDR, refresh no header, export expandido — **extensão leve** do payload `GET /api/reports-light?type=finance` (sem novo arquivo `/api/`).

**Endpoints reutilizados:**

| Uso | Rota |
|-----|------|
| Resumo período | `GET /api/reports-light?type=finance&from=&to=&regime=` |
| Período anterior (trend) | Mesma rota com `from`/`to` de `previousPeriodRange` |
| A receber | `GET /api/finance?route=receivables&month=YYYY-MM` (já usado) |
| Drill lançamentos | `GET /api/finance?route=tx-list` ou query existente em `financeTxQuery` via hub `api/finance.js` |

---

## 2. Arquivos afetados

### Fase 1

| Arquivo | Mudança |
|---------|---------|
| `src/components/reports/ReportsFinancePanel.jsx` | Tooltips, banner basic, saldo highlight, % breakdown, atalhos, CTA empty, `friendlyError` |
| `src/components/finance/VisaoGeralTab.jsx` | Corrigir copy do card Relatórios |
| `src/lib/reportKpiTooltip.js` | (sem mudança — já suporta `financeReceived` etc.) |
| `lib/reportsMetricDefinitions.js` | (sem mudança — defs já existem) |
| `src/test/reportsFinancePanel.test.jsx` | **Novo** — testes de render condicional |

### Fase 2

| Arquivo | Mudança |
|---------|---------|
| `lib/server/reportsLightHandler.js` | Expor `revenueBreakdown` no `financeSummary` |
| `lib/server/financeTxAggregate.js` | (sem mudança — `aggregateRevenueBreakdown` já existe) |
| `src/lib/reportsLightApi.js` | Tipagem JSDoc do payload estendido |
| `src/components/reports/ReportsFinancePanel.jsx` | Trend fetch, bloco MDR, drill modal |
| `src/components/reports/ReportsFinanceDrillDialog.jsx` | **Novo** — lista read-only de TX |
| `src/pages/Reports.jsx` | Refresh no header para `activeTab === 'financeiro'` |
| `src/lib/reportsPeriod.js` | (sem mudança — `previousPeriodRange` já existe) |
| `src/lib/financeiroHubTabs.js` | Helper `buildFinanceiroLancamentosPath({ from, to })` se não existir |
| `docs/flows/analise/relatorios-indicadores.md` | Atualizar checklist Financeiro |
| `docs/flows/VALIDATION.md` | Registrar validação |

---

## 3. Fase 1 — implementação detalhada

### 3.1 Banner `scope: basic`

```jsx
// ReportsFinancePanel.jsx — após load, antes dos KPIs
{isLimited ? (
  <StatusBanner variant="info" className="mb-0">
    Resumo básico — detalhes, exportação e breakdown disponíveis para gestores da academia.
  </StatusBanner>
) : null}
```

Remover ou rebaixar branch `permissionDenied` — para `type=finance` a API retorna 200 com `scope: 'basic'`, não 403.

### 3.2 KPI A receber — label dinâmico

```js
function receivablesMonthLabel(toYmd) {
  if (!toYmd) return 'A receber';
  const [y, m] = String(toYmd).slice(0, 7).split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  const short = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  return `A receber (${short})`;
}
```

Tooltip via `reportKpiTooltip` não cobre este KPI — usar `tooltip` estático do copy deck ou nova entrada em `reportsMetricDefinitions.js`:

```js
financeReceivablesSnapshot: {
  id: 'financeReceivablesSnapshot',
  label: 'A receber (snapshot)',
  formula: 'Soma de mensalidades e cobranças em aberto no mês de referência',
  source: 'GET /api/finance?route=receivables&month=',
  tooltip: 'Total em aberto no mês da data final do período. Não segue o intervalo da toolbar.',
},
```

### 3.3 Tooltips e highlight

```jsx
<ReportKpiCard
  label="Recebido"
  value={fmt(totals.received)}
  tooltip={reportKpiTooltip('financeReceived', { preset })}
  ...
/>
<ReportKpiCard
  label="Saldo do período"
  value={fmt(totals.balance)}
  highlight={totals.balance > 0 ? 'success' : totals.balance < 0 ? 'danger' : 'default'}
  {...kpiRagProps('financeBalance', Number(totals.balance), kpiGoals)}
/>
```

`preset` precisa ser passado como prop de `Reports.jsx` → `ReportsTabPanels` → `ReportsFinancePanel` (já disponível no parent via `useReportsPeriod`).

### 3.4 Breakdown com percentual

```js
const methodRows = (data.byMethod || [])
  .map((r) => ({ ...r, total: Number(r.total) || 0 }))
  .sort((a, b) => b.total - a.total);
const methodTotal = methodRows.reduce((s, r) => s + r.total, 0);
// render: `${formatPaymentMethod(method)} · ${pct}%`
const pct = methodTotal > 0 ? Math.round((total / methodTotal) * 100) : 0;
```

### 3.5 Atalhos operacionais

Componente inline ou bloco reutilizável:

```jsx
<nav className="reports-finance-links" aria-label="Atalhos financeiros">
  <Link to={buildLancamentosPath({ from, to })} className="reports-inline-link">Lançamentos</Link>
  <Link to="/financeiro?tab=dre" className="reports-inline-link">DRE e DFC</Link>
  <Link to="/financeiro?tab=fechamento" className="reports-inline-link">Fechamento</Link>
  <Link to={`/financeiro?tab=a-receber&month=${to.slice(0, 7)}`} className="reports-inline-link">A receber</Link>
</nav>
```

Verificar se `Caixa.jsx` / hub financeiro já aceita `from`/`to` em query para Lançamentos; se não, usar `navigate` com `state: { from, to }` (padrão `ReportsLojaPanel` empty CTA).

### 3.6 Empty state CTA

```jsx
primaryAction={{
  label: 'Ir para Lançamentos',
  onClick: () => navigate(buildLancamentosPath({ from, to })),
}}
```

### 3.7 Testes Fase 1

`src/test/reportsFinancePanel.test.jsx`:

- render `scope: 'basic'` → banner visível, sem `byMethod` section
- render dados completos → breakdown com `%`
- saldo negativo → classe `report-kpi-card--danger`
- empty → botão Lançamentos presente

---

## 4. Fase 2 — implementação detalhada

### 4.1 Extensão payload `financeSummary`

```js
// lib/server/reportsLightHandler.js — financeSummary()
import { aggregateOperationalSummary, aggregateRevenueBreakdown } from './financeTxAggregate.js';

export async function financeSummary(academyId, from, to, regime) {
  const { items: documents, truncated, totalInPeriod, maxCollect } =
    await listFinancialTxForPeriodWithMeta(academyId, { from, to, regime });
  const agg = aggregateOperationalSummary(documents);
  const revenue = aggregateRevenueBreakdown(documents);

  return {
    received: agg.received,
    expenses: agg.expenses,
    balance: agg.balance,
    receivedCount: agg.receivedCount,
    expenseCount: agg.expenseCount,
    truncated,
    totalLoaded: documents.length,
    totalInPeriod,
    maxCollect,
    regime,
    byMethod: Object.entries(agg.byMethod).map(([method, totalAmt]) => ({
      method,
      methodLabel: formatPaymentMethod(method),
      total: totalAmt,
    })),
    revenueBreakdown: {
      grossIn: revenue.grossIn,
      fees: revenue.fees,
      netIn: revenue.netIn,
      count: revenue.count,
    },
  };
}
```

`scope: basic` **não** inclui `revenueBreakdown` nem `byMethod` (comportamento atual preservado).

### 4.2 Comparação temporal (client)

```js
// ReportsFinancePanel.jsx
import { previousPeriodRange } from '../../lib/reportsPeriod.js';

const [prevTotals, setPrevTotals] = useState(null);

useEffect(() => {
  if (!academyId || !from || !to) return;
  const prev = previousPeriodRange(preset, { from, to });
  fetchReportsFinanceLightResult({ academyId, from: prev.from, to: prev.to, regime })
    .then((r) => r.ok && setPrevTotals(r.data))
    .catch(() => setPrevTotals(null));
}, [academyId, from, to, regime, preset]);

const pctVar = (cur, prev) => {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
};
```

Passar `trend`/`trendLabel` para `ReportKpiCard` quando `prevTotals` disponível.

### 4.3 Drill-down — opção recomendada

**Novo componente** `ReportsFinanceDrillDialog.jsx` (evita acoplar drawer de edição):

```jsx
// Props: open, onClose, academyId, from, to, regime, direction: 'in' | 'out'
// Fetch: GET /api/finance?route=tx-list&from=&to=&direction=&status=settled&limit=50
```

Se `route=tx-list` não existir com esses filtros, adicionar handler em `api/finance.js` (hub existente — **não** novo arquivo `/api/`).

Alternativa sem API nova: passar `documents` do último fetch se o servidor retornar lista no drill endpoint dedicado `reports-light?type=finance&drill=in` — **evitar** payload pesado no GET principal; preferir fetch sob demanda no modal.

**Query sugerida no hub finance:**

```
GET /api/finance?route=tx-list&from=2026-07-01&to=2026-07-12&direction=in&status=settled&limit=50&regime=cash
```

Reutilizar `listFinancialTxForPeriodWithMeta` + filtro direção no handler existente.

### 4.4 Refresh no header

```jsx
// Reports.jsx — PageHeader actions
const isFinanceTab = activeTab === 'financeiro';
const showRefresh = needsFunnelReport || needsStudentMetrics || isFinanceTab;

// Ref imperativo ou callback via context:
// ReportsFinancePanel expõe load() via useImperativeHandle + ref
// OU estado lift: financeRefreshKey incrementado no clique
```

Padrão mais simples: `financeRefreshNonce` state em `Reports.jsx`, passado como prop; `useEffect` em `ReportsFinancePanel` depende de `refreshNonce`.

### 4.5 Export CSV expandido

```js
const rows = [
  { metrica: 'Período', valor: `${from} — ${to}` },
  { metrica: 'Regime', valor: financeRegimeLabel(regime) },
  { metrica: 'Recebido', valor: totals.received },
  { metrica: 'Despesas', valor: totals.expenses },
  { metrica: 'Saldo', valor: totals.balance },
  ...(revenue?.fees > 0 ? [
    { metrica: 'Faturamento bruto', valor: revenue.grossIn },
    { metrica: 'Taxas (MDR)', valor: revenue.fees },
    { metrica: 'Recebido líquido', valor: revenue.netIn },
  ] : []),
  ...methodRows.map((r) => ({
    metrica: `Forma — ${formatPaymentMethod(r.method)}`,
    valor: r.total,
    percentual: `${r.pct}%`,
  })),
];
```

### 4.6 Testes Fase 2

- `lib/server/financeTxAggregate.test.js` — já cobre MDR; adicionar teste de integração handler
- `src/test/reportsFinanceParity.test.js` — assert `revenueBreakdown` no mock handler
- `src/test/reportsFinancePanel.test.jsx` — trend render, MDR section quando `fees > 0`
- `src/test/reportsFinanceDrill.test.jsx` — modal abre com direction correta

---

## 5. CSS

Reutilizar classes existentes em `reports.css`:

- `reports-inline-link` — atalhos
- `reports-kv-row` — breakdown (adicionar span para `%` se necessário)
- `reports-finance-links` — **novo** flex wrap gap, mobile stack

```css
.reports-finance-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.25rem;
  margin-top: 0.5rem;
}
@media (max-width: 639px) {
  .reports-finance-links {
    flex-direction: column;
    gap: 0.5rem;
  }
}
```

Sem inline styles; seguir tokens em `DESIGN_SYSTEM.md`.

---

## 6. Permissões e segurança

| Cenário | Comportamento |
|---------|---------------|
| `type=finance`, member | `scope: basic` — KPIs agregados apenas |
| Drill / lista TX | Mesma regra que Lançamentos — `canViewStudentFinance` / owner-admin |
| Export | Desabilitado em `scope: basic` (já implementado via `useRegisterReportsExport`) |
| `academyId` | Header `x-academy-id` + validação em `ensureAcademyAccess` |

Drill **não** deve expor PII além do que Lançamentos já mostra (nome do aluno na descrição).

---

## 7. Performance

| Risco | Mitigação |
|-------|-----------|
| Duplo fetch (período + anterior) | Paralelizar com `Promise.all`; cache `reports-light` TTL existente |
| Drill com período grande | `limit=50` + CTA "ver todos" |
| Re-render em toggle regime | Já refetch em `useEffect` — OK |

---

## 8. Rollout

1. Ship Fase 1 independente (baixo risco).
2. Ship Fase 2 com feature flag opcional `revenueBreakdown` no payload (sempre on para gestores).
3. Atualizar docs no mesmo PR.

**Rollback:** Fase 1 é puramente aditiva de UI; Fase 2 ignora campos novos se ausentes (`revenueBreakdown?.fees`).

---

## 9. Checklist de implementação

### Fase 1

- [ ] Copy `VisaoGeralTab` card
- [ ] Banner `basic`
- [ ] Tooltips KPIs
- [ ] Saldo highlight
- [ ] % breakdown
- [ ] Atalhos + empty CTA
- [ ] `friendlyError`
- [ ] Testes panel
- [ ] Docs fluxo

### Fase 2

- [ ] `revenueBreakdown` no handler
- [ ] Bloco MDR condicional
- [ ] Trend período anterior
- [ ] `ReportsFinanceDrillDialog`
- [ ] `route=tx-list` filtros (se necessário)
- [ ] Refresh header
- [ ] Export expandido
- [ ] Testes handler + panel + drill
