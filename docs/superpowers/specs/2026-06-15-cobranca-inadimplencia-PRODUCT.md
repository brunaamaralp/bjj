# Tela de Cobrança (inadimplência acumulada) — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-cobranca-inadimplencia-TECH.md](./2026-06-15-cobranca-inadimplencia-TECH.md)

---

## 1. Problem Statement

O controle de inadimplentes está escondido dentro de **Mensalidades**: filtro “Em atraso”, painel colapsável com limite de 60 alunos e escopo **apenas do mês de referência**. Academias com alunos devendo 2+ meses não têm uma fila operacional única para cobrar, negociar e registrar pagamentos.

---

## 2. Goals

| # | Objetivo |
|---|----------|
| G1 | Sub-aba **Cobrança** em Financeiro → A receber |
| G2 | Visão **acumulada** (todos os meses em atraso, janela 12 meses) |
| G3 | Uma linha por aluno com detalhe expansível por mês |
| G4 | Ações rápidas: WhatsApp, negociar, adiar régua, registrar pagamento |
| G5 | Deep links legados (`filtro=overdue`) continuam funcionando |

---

## 3. Non-Goals (v1)

- WhatsApp em massa
- Exportação CSV
- Tarefas embutidas na tela (link para `/tarefas` permanece)

**Fora deste spec (épico separado):** bloqueio de catraca Control iD — ver [2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md](./2026-06-17-catraca-gaps-prioridade-alta-PRODUCT.md) (implementado 2026-06-17).

---

## 4. UX

### Sub-aba Cobrança

**KPIs:** total inadimplentes, valor em aberto, chips por etapa D+N (régua).

**Tabela:** Aluno | Meses em aberto | D+ (mais antigo) | Etapa | Total | Ações.

**Expandir linha:** lista meses (`2026-04 · R$ 200 · D+45`) com botão “Registrar pagamento” por mês.

**Filtros:** busca por nome, etapa da régua.

**Empty state:** “Nenhuma pendência em atraso” + link para configurar régua.

**Snooze:** indicador “Régua adiada” quando `collection_snooze_month` = mês atual.

---

## 5. Acceptance criteria

- [x] Sub-aba Cobrança visível em A receber para quem tem módulo financeiro
- [x] Aluno com 2+ meses em aberto aparece em uma linha agregada
- [x] Registrar pagamento de um mês remove esse mês após refresh
- [x] Dashboard e config régua linkam para `section=cobranca`
- [x] `filtro=overdue` redireciona para Cobrança
- [x] Badge `student.overdue` pode divergir da fila (fila = cálculo civil multi-mês; badge = cron)

---

## 6. User stories

- **US1:** Como recepcionista, quero ver todos os inadimplentes numa fila, sem abrir mês a mês.
- **US2:** Como equipe, quero cobrar via WhatsApp e criar tarefa de negociação na mesma tela.
- **US3:** Como gestor, quero ver quanto está em aberto e em qual etapa da régua cada aluno está.
