# A pagar — contas fixas e despesas programadas

| Campo | Valor |
|---|---|
| **id** | `financeiro.a-pagar.contas-fixas` |
| **módulo** | Financeiro |
| **personas** | owner, admin |
| **rotas** | `/financeiro?tab=a-pagar`, `/financeiro?tab=a-pagar&section=contas-fixas`, `/financeiro?tab=a-pagar&section=vencidas`, `/financeiro?tab=a-pagar&new=1` |
| **pré-requisitos** | Módulo `finance`; conta bancária para liquidar pagamentos |
| **status** | revisado (código) |
| **última revisão** | 2026-07-22 |

**Spec:** [2026-06-16-contas-a-pagar-PRODUCT.md](../../superpowers/specs/2026-06-16-contas-a-pagar-PRODUCT.md)

**Arquivos-chave:** `src/components/finance/PayablesTab.jsx`, `src/components/finance/PayablesVisaoPanel.jsx`, `src/lib/payablesAggregate.js`, `lib/server/payablesHandler.js`, `src/lib/financeiroPayablesSections.js`

---

## Resumo

O gestor programa contas fixas (água, luz, telefone, aluguel), acompanha vencimentos e registra pagamentos sem navegar manualmente em Lançamentos. Recorrências usam o cron `finance-recurrence` existente.

---

## Mapa de telas

| # | Rota | Ação | Resultado |
|---|---|---|---|
| 1 | `?tab=a-pagar` | Abrir **A pagar** | Hub com Visão geral (resumo), Contas fixas (fila), Vencidas |
| 2 | `&section=visao` (padrão) | Visão geral | KPIs + métricas + próximos 8 vencimentos; sem busca/tabela completa |
| 3 | `&section=contas-fixas` | Ver fila operacional | Pendentes + templates recorrentes + busca/filtros/ações |
| 4 | Nova conta | Modal cadastro | Avulsa ou recorrente mensal |
| 5 | Pagar | Modal liquidação | TX `settled` + espelho contábil |
| 6 | `&section=vencidas` | Regularizar atrasos | Filtro overdue |
| 7 | Cancelar (template) | Confirmar cancelamento | Template desativado; pendentes gerados permanecem |

---

## Checklist (Seção A)

1. [ ] Owner/admin vê aba **A pagar**; member redireciona
2. [ ] **Visão geral** mostra resumo e próximos vencimentos — não duplica a tabela completa de Contas fixas
3. [ ] Cadastrar luz recorrente dia 10 → template na lista (Contas fixas)
4. [ ] Cron gera pending com `due_date` no dia configurado
5. [ ] Liquidar remove da fila; aparece em Lançamentos settled
6. [ ] Conta vencida aparece em **Vencidas**
7. [ ] Previsão mostra saída na semana correta
8. [ ] Sidebar **A pagar** linka para contas fixas

---

## Histórico

| Data | Mudança |
|---|---|
| 2026-07-22 | Visão geral distinta de Contas fixas (resumo vs fila operacional) |
| 2026-06-16 | Implementação Fase 1 (P0) |
