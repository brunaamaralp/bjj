# Caixa — categorias gerenciais (implementação técnica)

## Objetivo

Permitir que o fluxo gerencial de **Caixa + conciliação** classifique movimentos não operacionais (aportes, empréstimos, receitas financeiras e transferências) sem deturpar os relatórios de **saldo operacional**.

## Mudanças principais

### 1) Taxonomia

- `src/lib/financeCategories.js`
  - Introduz `operationalBucket` por categoria (`operational | financial | financing | neutral`).
  - Expande `FINANCE_CATEGORIES` com categorias fixas novas:
    - Entrada: `Receitas financeiras`, `Aporte de capital`, `Empréstimo recebido`, `Transferência recebida`
    - Saída: `Pagamento de empréstimo`, `Transferência enviada`
  - Implementa helpers:
    - `operationalBucketForCategory(...)`
    - `operationalBucketForTx(...)`
    - `isOperationalInflowTx(...)`

### 2) Contas do plano de contas

- `src/lib/financeAccountCategories.js`
  - Estende o mapeamento de contas do plano (`acct:CODE`) para categorias:
    - contas `passivo` e `pl` viram categorias com bucket `financing`
    - `accountToFinanceCategory` passa `operationalBucket` + `isBalanceSheetCategory`

### 3) Espelho contábil automático

- `src/components/finance/montarLancamento.js`
  - Atualiza `ACCOUNT_MAP` com rotas para os novos `type`s.
  - Faz o espelho lidar com:
    - `balance_sheet_in` / `balance_sheet_out`
    - `internal_transfer` (rota neutral)
  - Garante `cash` e `counterCode` consistentes com `1.1.1` (Caixa).

### 4) Seed e defaults

- `src/store/useAccountingStore.js`
  - Adiciona contas padrão para permitir as categorias novas:
    - `3.1.1` (Capital social / Aportes)
    - `7.1.2` (Receitas financeiras)
    - `1.1.9` (Transferências entre contas)

- `lib/server/financeJournalServer.js`
  - Mantém os mesmos defaults no servidor para consistência do diário.

### 5) Relatórios

- `lib/server/financeTxAggregate.js`
  - `aggregateOperationalSummary` passa a excluir buckets não-operacionais com base em `operationalBucketForTx(...)`.

- `lib/reportsMetricDefinitions.js`
  - Atualiza `tooltip` de `financeReceived` / `financeExpenses` para refletir a exclusão.

### 6) Conciliação

- `src/components/finance/ReconciliationTab.jsx`
  - Substitui o fluxo “Criar lançamento” com `ConfirmDialog` por um modal com `SearchableGroupedSelect` e seleção de categoria.

- `src/components/finance/BankReconCreateTxModal.jsx`
  - Novo modal para escolher categoria e validar antes de confirmar.

- `lib/server/bankReconciliationHandler.js`
  - `handleCreateTxFromItem`:
    - exige `category`
    - resolve categoria com `resolveFinanceCategory(...)`
    - deriva `type` e `direction` a partir da categoria (não via hardcode)

## Testes executados

- `tests/unit/finance/financeCategories.test.js`
- `tests/unit/finance/financeAccountCategories.test.js`
- `tests/unit/finance/financeTxAggregate.test.js`
- `src/test/financeTxCategorySelect.test.jsx`
- `src/test/financeTxJournalMirror.test.js`
- `src/test/bankReconIntegration.test.jsx`
- `npm run test:ci`

## Notas e riscos

1) Lançamentos antigos `other` já persistidos podem ainda inflar métricas anteriores; a estratégia atual foi não reclassificar retroativamente.
2) Transferências “neutral” são tratadas via bucket e devem ser monitoradas em relatórios consolidados (especialmente Visão Geral).

