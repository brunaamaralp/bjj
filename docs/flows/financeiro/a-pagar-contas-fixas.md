# A pagar — contas fixas e despesas programadas

| Campo | Valor |
|---|---|
| **id** | `financeiro.a-pagar.contas-fixas` |
| **módulo** | Financeiro |
| **personas** | owner, admin |
| **rotas** | `/financeiro?tab=a-pagar`, `/financeiro?tab=a-pagar&section=contas-fixas`, `/financeiro?tab=a-pagar&section=vencidas`, `/financeiro?tab=a-pagar&new=1` |
| **pré-requisitos** | Módulo `finance`; conta bancária para liquidar pagamentos |
| **status** | revisado (código) |
| **última revisão** | 2026-09-22 |

**Spec:** [2026-06-16-contas-a-pagar-PRODUCT.md](../../superpowers/specs/2026-06-16-contas-a-pagar-PRODUCT.md) · clareza de vencimento: [2026-09-22-a-pagar-clareza-vencimento-design.md](../../superpowers/specs/2026-09-22-a-pagar-clareza-vencimento-design.md) · lembretes na Recepção: [2026-09-22-recepcao-lembretes-financeiros-design.md](../../superpowers/specs/2026-09-22-recepcao-lembretes-financeiros-design.md)

**Arquivos-chave:** `src/components/finance/PayablesTab.jsx`, `src/components/finance/PayablesVisaoPanel.jsx`, `src/lib/payablesAggregate.js`, `src/lib/payablesStatusDisplay.js`, `lib/server/payablesHandler.js`, `src/lib/financeiroPayablesSections.js`

---

## Resumo

O gestor programa contas fixas (água, luz, telefone, aluguel), acompanha vencimentos e registra pagamentos sem navegar manualmente em Lançamentos. Recorrências usam o cron `finance-recurrence` existente.

---

## Mapa de telas

| # | Rota | Ação | Resultado |
|---|---|---|---|
| 1 | `?tab=a-pagar` | Abrir **A pagar** | Hub alinhado a A receber: KPI compacto + subnav (Visão / Contas fixas / Vencidas) + Importar / Nova / Atualizar |
| 2 | `&section=visao` (padrão) | Visão geral | KPI no shell; painel só com próximos ≤8 vencimentos + CTAs (sem métricas duplicadas) |
| 3 | `&section=contas-fixas` | Ver fila operacional | Pendentes + templates; busca/categoria; chips Todas / Vence em 7 dias / A vencer / Vencidas; badges + hint relativo na data |
| 4 | Nova conta | Modal cadastro | Avulsa ou recorrente mensal |
| 5 | Pagar | Modal liquidação | TX `settled` + espelho contábil |
| 6 | `&section=vencidas` | Regularizar atrasos | KPI só vencidas + filtro overdue; hint `há N dias` |
| 7 | Cancelar (template) | Confirmar cancelamento | Template desativado; pendentes gerados permanecem |

---

## Checklist (Seção A)

1. [ ] Owner/admin vê aba **A pagar**; member redireciona
2. [ ] **Visão geral** mostra próximos vencimentos no painel — KPIs só na faixa do shell (não duplica métricas nem a tabela completa de Contas fixas)
3. [ ] Cadastrar luz recorrente dia 10 → template na lista (Contas fixas)
4. [ ] Cron gera pending com `due_date` no dia configurado
5. [ ] Liquidar remove da fila; aparece em Lançamentos settled
6. [ ] Conta vencida aparece em **Vencidas**
7. [ ] Previsão mostra saída na semana correta
8. [ ] Sidebar **A pagar** linka para contas fixas
9. [ ] Recepção Comercial: **Lembretes financeiros** mostra contas do dia/semana/atrasadas **sem valor**; com módulo finance, clique abre A pagar
10. [ ] Conta com vencimento **hoje** mostra badge **Vence hoje**; hint relativo na coluna (hoje / em N dias / há N dias); chips de filtro na Contas fixas

---

## Histórico

| Data | Mudança |
|---|---|
| 2026-09-22 | Clareza de vencimento: `due_today`, chips, hints relativos |
| 2026-09-22 | Lembretes na Recepção (hero) ligados a A pagar |
| 2026-07-23 | Shell alinhado a A receber (KPI compacto único); Visão sem bloco de métricas duplicadas |
| 2026-07-22 | Visão geral distinta de Contas fixas (resumo vs fila operacional) |
| 2026-06-16 | Implementação Fase 1 (P0) |
