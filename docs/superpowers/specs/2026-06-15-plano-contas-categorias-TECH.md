# Plano de Contas + Categorias — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-plano-contas-categorias-PRODUCT.md](./2026-06-15-plano-contas-categorias-PRODUCT.md)

---

## Arquivos novos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/financeDreGroups.js` | Lista DRE compartilhada client/server |
| `src/lib/financeAccountFormRules.js` | Validação drawer, herança, sugestões tipo |
| `src/lib/financeRecentCategories.js` | localStorage categorias recentes |
| `tests/unit/finance/financeAccountFormRules.test.js` | Unit validação/herança |
| `src/test/financeAccountsDrawer.test.jsx` | RTL drawer |
| `src/test/financeTxCategorySelect.test.jsx` | RTL chips/dedup |

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/lib/financeCategories.js` | Dedup, ordem grupos, `defaultCategoryForDirection` |
| `src/lib/financeAccountCategories.js` | Filtro protected dreAccount, label display |
| `src/components/finance/AccountsTab.jsx` | Drawer FieldError, DRE select, herança, filtros |
| `src/components/finance/TransacoesTab.jsx` | Chips, default saída, recentes |
| `src/components/shared/SearchableGroupedSelect.jsx` | Portal, keyboard, affordance |
| `src/components/shared/SearchableGroupedSelect.css` | Estilos combo/portal |
| `src/components/finance/finance.css` | Chips, colunas, hints |
| `src/lib/financeSettingsSections.js` | Hint onboarding |
| `lib/server/importFinanceHandler.js` | DRE de `financeDreGroups.js` |
| `src/components/finance/ImportFinanceModal.jsx` | Template enriquecido |
| `HARNESS.md` + `docs/harness/finance-plano-contas.md` | Comandos teste |

---

## Dedup categorias (v1)

```js
const PROTECTED_DRE_ACCOUNTS = new Set(
  Object.values(FINANCE_CATEGORIES).map((c) => c.dreAccount)
);
// Contas com code ∈ PROTECTED_DRE_ACCOUNTS omitidas do select
// resolveFinanceCategory('acct:4.1.1') mantido para txs legadas
```

---

## financeAccountFormRules

- `validateAccountForm(form, accounts, { mode, excludeId })`
- `inheritFromParentAccount(parent)`
- `suggestFieldsForType(type)`
- `isDuplicateCode`, `isProtectedCodeForCreate`
- `accountHasChildAccounts`, `formatDeleteAccountDescription`

---

## Espelho contábil

Sem mudança em `montarLancamento.js` v1. `acct:4.1.2` manual já suportado.

---

## Rollout

1. Fase 1 standalone
2. Fase 2 após dedup
3. Fase 3 paralelizável

**Migração:** nenhuma (dedup só UI).

---

## Testes

```bash
npm test -- financeAccountFormRules financeCategories financeAccountCategories financeAccountsDrawer financeTxCategorySelect
```
