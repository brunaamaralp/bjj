# Plano: Visão Geral — mês único e UX clara

**Spec PRODUCT:** [2026-07-02-visao-geral-mes-claro-PRODUCT.md](../specs/2026-07-02-visao-geral-mes-claro-PRODUCT.md)  
**Spec TECH:** [2026-07-02-visao-geral-mes-claro-TECH.md](../specs/2026-07-02-visao-geral-mes-claro-TECH.md)

---

## Fase 0 — Preparação

- [ ] Grep consumidores de `bankBalances`, `inflow`, `outflow`
- [ ] Verificar se `MovimentacoesTab` aceita `?from=&to=` na URL
- [ ] Criar `docs/flows/financeiro/visao-geral.md` (template)

## Fase 1 — Período e TZ (backend)

- [ ] `overviewPeriodContext()` + testes
- [ ] Unificar `todayYmdLocal` servidor → `todayYmdFinance()`
- [ ] Bounds SP em `financeTxQuery.js`
- [ ] `computeBankAccountBalances` — `periodInflow` / `periodOutflow`
- [ ] `financeOverviewHandler` — `asOf = to`, payload `period`
- [ ] Testes handler mock

## Fase 2 — UI Visão Geral

- [ ] Banner “Referência: {mês} · {from – to}”
- [ ] Eyebrows dinâmicos (remover “mês atual” fixo)
- [ ] `BankBalancesOverview` — labels período + `periodInflow/Outflow`
- [ ] Fix refresh (`force: true` ou invalidate cache)
- [ ] Loading refresh (opacidade, não skeleton full page)
- [ ] Truncamento + link Lançamentos
- [ ] Hints `financeTermHints.js`

## Fase 3 — Drill-down e QA

- [ ] Links movimentações com `from`/`to`/`conta`
- [ ] Checklist manual PRODUCT §9
- [ ] `npm test -- financeOverview visaoGeral bankAccount`
- [ ] Atualizar `docs/flows/VALIDATION.md`

## Fase 4 — Polish (P1)

- [ ] Empty state mês futuro / sem movimentação
- [ ] Nota “A receber independe do mês” nos cards
