# Relatório diário de vendas — PRODUCT

**Data:** 2026-07-01  
**Status:** Aprovado para implementação  
**Plan:** [2026-07-01-relatorio-vendas-dia.md](../plans/2026-07-01-relatorio-vendas-dia.md)  
**TECH:** [2026-07-01-relatorio-vendas-dia-TECH.md](./2026-07-01-relatorio-vendas-dia-TECH.md)

---

## 1. Problem Statement

A recepcionista vende produtos **pelo perfil do aluno**, quase não recebe dinheiro físico e **não usa** turno de caixa (abrir/fechar gaveta). No fim do dia precisa saber **o que vendeu** de forma prática — hoje só consegue filtrar o Histórico manualmente, sem resumo formatado nem exportação.

---

## 2. Goals

| # | Objetivo |
|---|----------|
| G1 | Ver vendas do **dia calendário** (não do turno PDV) |
| G2 | Incluir vendas de **qualquer origem** (aluno, Loja, modal) |
| G3 | **Copiar** resumo (WhatsApp/Notes) e **exportar CSV** |
| G4 | Totais por forma de pagamento coerentes com vendas concluídas |
| G5 | Independentemente de `requireCashShift` / `cash_shift_id` |

---

## 3. Non-Goals (v1)

- Turno de caixa, sangria/suprimento, sync gaveta ↔ financeiro
- Mensalidades no relatório
- PDF do relatório
- Snapshot imutável do dia
- Novo arquivo em `/api/`

---

## 4. User Stories

### Recepcionista

- Ao fechar o expediente, quero um **Resumo do dia** com lista de vendas e totais, acessível em **Loja → Histórico**.
- Quero **copiar** o texto e **baixar CSV** para arquivar ou enviar ao owner.
- Quero que vendas feitas **no perfil do aluno** apareçam no mesmo relatório.

### Owner / admin

- Quero conferir cancelamentos do dia em seção separada, sem distorcer o faturamento.

---

## 5. Acceptance Criteria

1. Botão **Resumo do dia** no Histórico abre modal com dados do dia selecionado (ou hoje).
2. Vendas `concluida` listadas com hora, cliente, itens, total, pagamento.
3. Totais por forma = soma das vendas concluídas do dia.
4. Canceladas e pendentes em seções próprias; não entram no total concluído.
5. Endpoint autenticado, escopo por `academy_id`.

---

## 6. UI (Fase 2 — referência)

- `SalesHistoryTab`: chip **Hoje**, botão **Resumo do dia**
- `SalesDailyReportModal`: preview, Copiar, CSV, Imprimir
