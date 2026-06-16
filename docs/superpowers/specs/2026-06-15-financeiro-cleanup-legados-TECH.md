# Financeiro cleanup (#8–10) — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-financeiro-cleanup-legados-PRODUCT.md](./2026-06-15-financeiro-cleanup-legados-PRODUCT.md)  
**Status:** Implementado (2026-06-15)

---

## Deletados

- `src/components/finance/ConfigTab.jsx`
- `src/components/finance/settings/FinanceSettingsHub.jsx`

## `financeSettingsSections.js`

Exportados para testes e reuso:

- `feesConfigured(cardFees)`
- `collectionRulesConfigured(collectionRules, financeConfig)`
- `exceptionLabelsCustomized(financeConfig)`

## CSS

Removidos estilos do hub (`finance-settings-hub`, progress, row). Mantido `finance-settings-group__sep`.
