# Financeiro nav non-owner — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-financeiro-nav-non-owner-PRODUCT.md](./2026-06-15-financeiro-nav-non-owner-PRODUCT.md)  
**Status:** Implementado (2026-06-15)

---

## Mudanças

| Arquivo | Ação |
|---------|------|
| `financeSettingsSections.js` | `ownerOnly` em planos/régua; helpers nav + default section |
| `FinanceiroConfigTab.jsx` | Usar helpers; default section por papel |
| `AcademySettings.jsx` | Admin pode abrir aba financeiro |
| `financeSettingsSections.test.js` | Cobertura nav/admin |

## Helpers exportados

- `canAccessEmpresaFinanceSettings(role)`
- `getFinanceDefaultSection(isOwner)`
- `buildFinanceSettingsNavItems(isOwner)`
