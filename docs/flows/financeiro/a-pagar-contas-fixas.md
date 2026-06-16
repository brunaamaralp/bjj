# A pagar — contas fixas e despesas programadas

| Campo | Valor |
|---|---|
| **id** | `financeiro.a-pagar.contas-fixas` |
| **módulo** | Financeiro |
| **personas** | owner, admin |
| **rotas** | `/financeiro?tab=a-pagar`, `/financeiro?tab=a-pagar&section=contas-fixas`, `/financeiro?tab=a-pagar&section=vencidas`, `/financeiro?tab=a-pagar&new=1` |
| **pré-requisitos** | Módulo `finance`; conta bancária para liquidar pagamentos |
| **status** | revisado (código) |
| **última revisão** | 2026-06-16 |

**Spec:** [2026-06-16-contas-a-pagar-PRODUCT.md](../../superpowers/specs/2026-06-16-contas-a-pagar-PRODUCT.md)

**Arquivos-chave:** `src/components/finance/PayablesTab.jsx`, `src/lib/payablesAggregate.js`, `lib/server/payablesHandler.js`, `src/lib/financeiroPayablesSections.js`

---

## Resumo

O gestor programa contas fixas (água, luz, telefone, aluguel), acompanha vencimentos e registra pagamentos sem navegar manualmente em Lançamentos. Recorrências usam o cron `finance-recurrence` existente.

---

## Mapa de telas

| # | Rota | Ação | Resultado |
|---|---|---|---|
| 1 | `?tab=a-pagar` | Abrir **A pagar** | Hub com Visão geral, Contas fixas, Vencidas |
| 2 | `&section=contas-fixas` | Ver fila | Pendentes + templates recorrentes |
| 3 | Nova conta | Modal cadastro | Avulsa ou recorrente mensal |
| 4 | Pagar | Modal liquidação | TX `settled` + espelho contábil |
| 5 | `&section=vencidas` | Regularizar atrasos | Filtro overdue |
| 6 | Cancelar (template) | Cancelar recorrência | Template desativado |

---

## Checklist (Seção A)

1. [ ] Owner/admin vê aba **A pagar**; member redireciona
2. [ ] Cadastrar luz recorrente dia 10 → template na lista
3. [ ] Cron gera pending com `due_date` no dia configurado
4. [ ] Liquidar remove da fila; aparece em Lançamentos settled
5. [ ] Conta vencida aparece em **Vencidas**
6. [ ] Previsão mostra saída na semana correta
7. [ ] Sidebar **A pagar** linka para contas fixas

---

## Histórico

| Data | Mudança |
|---|---|
| 2026-06-16 | Implementação Fase 1 (P0) |
