# Visão Geral — correção mês único e UX clara — TECH

**Data:** 2026-07-02  
**PRODUCT:** [2026-07-02-visao-geral-mes-claro-PRODUCT.md](./2026-07-02-visao-geral-mes-claro-PRODUCT.md)

---

## 1. Resumo técnico

Unificar o eixo temporal da Visão Geral no **`referenceMonth`** do `FinanceMonthPicker`:

1. Calcular `{ from, to, asOf }` uma vez (SP) e propagar para overview API e UI.
2. Saldos bancários usam **`asOf = to`** (não “hoje” fixo).
3. Breakdown **Entradas/Saídas por conta** = movimentação **dentro de `[from, to]`**, não acumulado vitalício.
4. Corrigir cache no refresh manual, timezone no servidor e copy dinâmica.

**Endpoint:** `GET /api/finance?route=overview` (sem novo arquivo `/api/`).

---

## 2. Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `lib/server/financeOverviewHandler.js` | Derivar `asOf` do mês; expor `period` no payload |
| `lib/server/financeBankBalancesData.js` | Remover `todayYmdLocal` duplicado; import SP helper |
| `lib/server/financeTxQuery.js` | Bounds de data em SP (ou ISO explícito BRT) |
| `src/lib/bankAccountBalances.js` | `computeBankAccountBalances` — modo período vs acumulado |
| `src/lib/financeiroOverview.js` | `overviewPeriodContext(month)` helper |
| `src/lib/financeTermHints.js` | Hints novos (breakdown período, previsão) |
| `src/components/finance/VisaoGeralTab.jsx` | Banner período, refresh force, loading polish |
| `src/components/finance/BankBalancesOverview.jsx` | Copy `asOf`, breakdown labels |
| `src/components/finance/PeriodFlowMiniChart.jsx` | Hints / aria-label com período |
| `src/pages/Caixa.jsx` | Passar `periodContext` opcional (se centralizar banner no header) |
| `src/lib/financeTxApi.js` | `fetchFinanceOverviewCached` — param `force` no refresh |
| `src/test/financeOverview*.test.js` | Novos testes |
| `docs/flows/financeiro/visao-geral.md` | Novo fluxo (governança) |
| `docs/flows/VALIDATION.md` | Checklist atualizado |

---

## 3. Modelo de dados — período

### 3.1 Helper compartilhado (client + server)

```js
// src/lib/financeiroOverview.js

/**
 * @param {string} referenceMonth YYYY-MM
 * @returns {{ referenceMonth, from, to, asOf, isCurrentMonth, monthTitle, labelFromToBr }}
 */
export function overviewPeriodContext(referenceMonth) {
  const referenceMonthNorm = String(referenceMonth || currentMonthYm()).trim();
  const { from, to } = monthPeriodBounds(referenceMonthNorm);
  const today = todayYmdLocal(); // America/Sao_Paulo
  const isCurrentMonth = referenceMonthNorm === today.slice(0, 7);
  return {
    referenceMonth: referenceMonthNorm,
    from,
    to,
    asOf: to, // posição bancária = fim do intervalo visível
    isCurrentMonth,
    monthTitle: formatMonthTitleCapitalized(referenceMonthNorm),
    labelFromToBr: formatPeriodRangeBr(from, to, isCurrentMonth),
  };
}
```

`formatPeriodRangeBr`: ex. `01/07/2026 – 01/07/2026 (até hoje)` ou `01/07/2025 – 31/07/2025`.

### 3.2 Payload overview estendido

```json
{
  "ok": true,
  "referenceMonth": "2026-07",
  "period": {
    "from": "2026-07-01",
    "to": "2026-07-01",
    "asOf": "2026-07-01",
    "isCurrentMonth": true,
    "regime": "cash"
  },
  "summary": { "from", "to", "settledIn", "settledOut", "periodBalance", "truncated" },
  "bankBalances": {
    "asOf": "2026-07-01",
    "periodFrom": "2026-07-01",
    "periodTo": "2026-07-01",
    "accounts": [
      {
        "label": "Nubank",
        "balance": 1500,
        "openingBalance": 1000,
        "periodInflow": 800,
        "periodOutflow": 300,
        "movementCount": 12
      }
    ],
    "totalBalance": 1500
  },
  "bankBalancesCompare": { "asOf": "2026-06-30", "totalBalance": 1200 }
}
```

**Breaking change controlada (UI-only):** renomear campos expostos ao cliente:

| Antes | Depois | Notas |
|-------|--------|-------|
| `inflow` / `outflow` (vitalício no breakdown) | `periodInflow` / `periodOutflow` | Manter `inflow`/`outflow` deprecated 1 release se outros consumidores existirem |
| `bankBalances.asOf` (sempre hoje) | `asOf = period.to` | |

Grep consumidores: `BankBalancesOverview`, `FinanceForecastTab`, NL queries.

---

## 4. Backend

### 4.1 `financeOverviewHandler.js`

```js
const { from, to } = monthPeriodBounds(month);
const asOf = to;
const compareAsOf = monthEndYmd(previousMonthYm(month));

// Substituir bankCurrentAsOf = todayYmdLocal() fixo:
const bankDual = await computeDualBankBalancesPayload(
  academyId,
  asOf,
  compareAsOf,
  financeConfig,
  { periodFrom: from, periodTo: to }
);
```

Incluir no body:

```js
period: { from, to, asOf, isCurrentMonth: month === currentYmFinance(), regime },
```

`summary.from` / `summary.to` já existem — garantir alinhamento com `period`.

### 4.2 `financeBankBalancesData.js`

1. **Remover** função local `todayYmdLocal()` — importar de `../../src/lib/financeForecastCore.js`.
2. Estender `computeDualBankBalancesPayload(academyId, asOfYmd, compareAsOfYmd, financeConfig, opts)`:

```js
export async function computeDualBankBalancesPayload(
  academyId,
  asOfYmd,
  compareAsOfYmd,
  financeConfig,
  { periodFrom, periodTo } = {}
) {
  // Fetch settled docs até max(asOf, compareAsOf) — inalterado
  const current = computeBankBalancesPayloadFromSettledDocs(rawDocs, asOfYmd, financeConfig, {
    periodFrom,
    periodTo,
  });
  const compare = computeBankBalancesPayloadFromSettledDocs(rawDocs, compareAsOfYmd, financeConfig, {
    periodFrom: null, // compare snapshot: só balance, breakdown opcional omitido
    periodTo: compareAsOfYmd,
  });
  return { current, compare };
}
```

### 4.3 `computeBankAccountBalances` — modo período

```js
export function computeBankAccountBalances({
  accounts,
  transactions,
  asOfYmd,
  periodFrom = null,
  periodTo = null,
}) {
  // balance: acumulado até asOfYmd (inalterado)
  // periodInflow / periodOutflow: TX settled com settledYmd in [periodFrom, periodTo]
  //   e settledYmd <= asOfYmd
}
```

Regras:

- `balance` = saldo em **`asOfYmd`** (fim do período visível).
- `periodInflow` / `periodOutflow` = soma **apenas** TX com `settledYmd` entre `periodFrom` e `periodTo` (inclusive).
- `movementCount` no breakdown = count no período (não vitalício).

### 4.4 Timezone em `financeTxQuery.js`

Substituir:

```js
new Date(`${from}T00:00:00`)
```

Por helper SP (exemplo):

```js
import { startOfDayIsoFinance, endOfDayIsoFinance } from '../../src/lib/financeCompetence.js';
// ou novos exports em financeForecastCore que retornam ISO UTC correto para limites BRT
```

**Teste obrigatório:** TX liquidada `2026-07-01T02:00:00-03:00` entra em julho; TX `2026-06-30T22:00:00-03:00` não entra.

### 4.5 Cache servidor

Manter cache 45s; incluir `asOf` derivado do `month` na cache key (já implícito via `month` + `compareAsOf`). Invalidação inalterada.

---

## 5. Frontend

### 5.1 Banner de período (`VisaoGeralTab`)

Inserir abaixo de `FinanceTabShell` intro / acima do grid:

```jsx
<p className="financeiro-overview-period-banner" role="status">
  Referência: <strong>{period.monthTitle}</strong>
  · {period.labelFromToBr}
  · Régime {financeRegimeLabel(regime)}
</p>
```

Fonte: `overview.period` da API (fallback client `overviewPeriodContext(ym)` enquanto loading).

### 5.2 Copy dos cards

| Elemento | Implementação |
|----------|----------------|
| Card flow eyebrow | `Caixa · ${period.monthTitle}` |
| Card banks eyebrow | `Caixa · posição em ${fmtDateBr(period.asOf)}` |
| `BankBalancesOverview` as-of line | `Saldos calculados em ${fmtDateBr(data.asOf)}` |
| Breakdown dt | `Entradas no período` / `Saídas no período` |
| Forecast eyebrow | `Projeção · próximos 30 dias` + nota muted |

### 5.3 Refresh fix

```jsx
// VisaoGeralTab — botão Atualizar
onClick={() => {
  setRefreshToken((t) => t + 1);
  void load({ force: true });
}}

// load aceita opts
const overview = await fetchFinanceOverviewCached({
  ...
  force: opts?.force || refreshToken > 0,
});
```

Alternativa mínima: `invalidateFinanceHubCache(academyId)` antes do fetch no click.

### 5.4 Loading polish

```jsx
const [refreshing, setRefreshing] = useState(false);
// finally: setRefreshing(false)
<div className={refreshing ? 'financeiro-overview--refreshing' : ''}>
```

CSS:

```css
.financeiro-overview--refreshing .financeiro-overview-card {
  opacity: 0.72;
  pointer-events: none;
}
```

Manter skeleton só em `loading && !loadedOnce`.

### 5.5 Drill-down links

```js
function buildMovimentacoesPeriodPath({ from, to, conta }) {
  const p = new URLSearchParams({ tab: 'movimentacoes', from, to });
  if (conta) p.set('conta', conta);
  return `/financeiro?${p}`;
}
```

Verificar se `MovimentacoesTab` já lê `from`/`to` da URL — se não, P0 inclui suporte mínimo.

### 5.6 Truncamento

Se `summary.truncated || bankBalances.truncated`:

```jsx
<StatusBanner variant="warning">
  Mais de 2.500 lançamentos neste período — totais podem estar incompletos.{' '}
  <Link to={buildMovimentacoesPeriodPath(period)}>Ver lançamentos</Link>
</StatusBanner>
```

---

## 6. Testes

### 6.1 Unitários (vitest)

| Arquivo | Casos |
|---------|-------|
| `overviewPeriodContext.test.js` | mês corrente → to=hoje SP; passado → to=último dia |
| `bankAccountBalances.test.js` | periodInflow/outflow só no intervalo; balance em asOf |
| `financeOverviewHandler.test.js` | mock: month passado → bank asOf = monthEnd |
| `visaoGeralCopy.test.js` | strings não contêm “mês atual” quando `isCurrentMonth=false` |

### 6.2 Integração manual

Script QA em TECH plan: comparar 3 números com Lançamentos filtrados (saldo, entradas, saídas).

---

## 7. Migração / compatibilidade

1. Grep `bankBalances`, `inflow`, `outflow` fora da Visão Geral.
2. Se `route=bank-balances` standalone usado em outro lugar: manter acumulado como default; opt-in `periodFrom`/`periodTo` query params.
3. Deprecate copy “Saldos liquidados até hoje” — substituir por data explícita.

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Performance: recalcular breakdown mensal | Reutilizar docs já carregados em overview; sem query extra |
| Regressão forecast / payables | Não alterar escopo temporal deles; só copy |
| Mês corrente “até hoje” vs extrato bancário fim de mês | Copy “até hoje” explícito |
| MovimentacoesTab sem query `from`/`to` | Implementar leitura URL na mesma PR (P0 link útil) |

---

## 9. Ordem de implementação

1. `overviewPeriodContext` + testes  
2. `computeBankAccountBalances` period mode + testes  
3. Server handler + TZ bounds  
4. Payload `period` + campos `periodInflow`/`periodOutflow`  
5. UI copy + banner + refresh fix  
6. Links movimentações + truncamento  
7. Flow doc + VALIDATION  

---

## 10. Fora de escopo técnico (confirmado)

- Novo `api/*.js`
- KPIs diários
- Alterar lógica de `buildFinanceForecast` para seguir `referenceMonth`
