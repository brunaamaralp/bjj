# Plano `durationDays` — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-plano-duration-days-fantasma-PRODUCT.md](./2026-06-15-plano-duration-days-fantasma-PRODUCT.md)  
**Status:** Implementado (2026-06-15)

---

## Mudanças

| Arquivo | Ação |
|---------|------|
| `FinanceSettingsPlansSection.jsx` | Remover campo; atualizar lead |
| `financeConfigStorage.js` | `compactPlanForStorage` sem `durationDays` |
| `useFinanceConfigState.js` | `addPlan` sem `durationDays` |
| `importFinanceHandler.js` | `sanitizePlans` sem `durationDays`; doc import |
| `ImportFinanceModal.jsx` | Remover coluna Duração no preview |
| `ConfigTab.jsx` | Remover campo (legado) |
| `financeConfigStorage.test.js` | Assert compact strip |

## Legado

- Planos já salvos podem conter `durationDays` até próximo save.
- Não renomear `duration_days` do NL `freeze_plan` (trancamento).
