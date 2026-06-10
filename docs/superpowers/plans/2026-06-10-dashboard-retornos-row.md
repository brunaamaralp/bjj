# Dashboard retornos row — Implementation Plan

> Spec: [2026-06-10-dashboard-retornos-row-design.md](../specs/2026-06-10-dashboard-retornos-row-design.md)

## Tasks

1. ✅ Spec aprovado
2. ✅ Remover coluna `#birthdays`; grid 2 colunas
3. ✅ `DashboardBirthdayModal` + fluxos hero/prioridade
4. ✅ `FollowupHealthPanel` telemetria (pills, D+1, sem lista duplicada)
5. ✅ Hint IA colapsável + menu IA compacto
6. ✅ CSS editorial `fu-group__head`
7. ✅ Teste `dashboardDayBriefing` atualizado

## Verificação

```bash
npm run test:run -- src/test/dashboardDayBriefing.test.js
npx eslint src/pages/Dashboard.jsx src/components/dashboard/FollowupHealthPanel.jsx
```
