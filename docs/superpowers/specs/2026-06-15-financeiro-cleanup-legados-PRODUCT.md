# Financeiro cleanup (#8–10) — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-financeiro-cleanup-legados-TECH.md](./2026-06-15-financeiro-cleanup-legados-TECH.md)  
**Origem:** auditoria gaps Financeiro #8, #9, #10

---

## #8 — Código morto

Remover `ConfigTab.jsx` (~900 linhas) e `FinanceSettingsHub.jsx` — substituídos por `FinanceiroConfigTab` + `AcademyTabSettingsLayout`, sem imports no projeto.

## #9 — Progress/summary enganoso

Corrigir `buildFinanceSettingsSummaries` / helpers:

| Seção | Antes | Depois |
|-------|-------|--------|
| Taxas | `done: true` sempre | `done` só com percent > 0 |
| Régua | `done` com 4 etapas default | `done` só se salvo ou etiqueta custom |
| Exceções | `done: true` sempre | `done` só com rótulos alterados |

## #10 — Campos legados

Documentar na UI (sem remover persistência):

- `cardFees.*.fixed` — só percentual entra no cálculo
- `plan.description` — nota interna opcional
- `bankAccounts[].isDefault` — legado; padrão é `defaultAccountByMethod`

---

## Acceptance criteria

- [x] Arquivos mortos removidos
- [x] CSS órfão do hub removido
- [x] Summaries com `done` honesto
- [x] Copy de legados nas seções afetadas
