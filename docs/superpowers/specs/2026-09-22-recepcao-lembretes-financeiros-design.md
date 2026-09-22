# Recepção — lembretes financeiros no hero

**Data:** 2026-09-22  
**Status:** Implementado  
**Persona:** recepcionista (toda a academia; não só owner/admin)  
**Fluxos:** [crm/hoje-dashboard.md](../../flows/crm/hoje-dashboard.md) · [financeiro/a-pagar-contas-fixas.md](../../flows/financeiro/a-pagar-contas-fixas.md) · [financeiro/a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)

---

## Problema

Na Recepção não há um lugar único que diga: contas a pagar do dia/semana, alunos a cobrar (mensalidade) e pacotes a renovar. Contas a pagar ficam só no hub Financeiro; mensalidade aparece em Mensalidades/sino; fim de cobertura de pacote quase não avisa.

## Goals

1. Bloco no hero Comercial: **Lembretes financeiros**, visível a qualquer membro da academia.
2. Três seções (só as não vazias): Contas a pagar · Cobrar alunos · Renovar pacote.
3. Contas **sem valor**; alunos/pacote **com valor**.
4. Conectar contas a `financial_tx` / A pagar; alunos a buckets de mensalidade; pacote a `coverageEndMonth`.

## Non-goals

- WhatsApp / cron novo / itens no sino (reuso futuro ok)
- KPI novo no hero
- Redesign do hub A pagar / Mensalidades
- Exibir valores de contas a pagar na Rede (nem no JSON da API de recepção)

## UI

- Componente: `DashboardFinancialRemindersBanner` (padrão visual próximo de `DashboardBirthdayBanner`).
- Posição: hero Comercial, junto ao banner de aniversários.
- Título: `Lembretes financeiros`.
- Até **3** linhas por seção + `+N`.
- Clique conta → `/financeiro?tab=a-pagar` se módulo finance; senão sem deep-link quebrado.
- Clique aluno → `/student/:id` (aba pagamentos se possível).
- Some se as três seções vazias.

### Copy (exemplos)

| Seção | Exemplo |
|-------|---------|
| Contas | `Hoje: Luz` · `Esta semana: Aluguel, Internet` · `2 contas atrasadas` |
| Cobrar | `Maria — mensalidade hoje · R$ 180` |
| Renovar | `João — cobertura até out/2026 · R$ 1.800` |

## Dados

### Contas

- `GET /api/finance?route=payables&view=reception&from=hoje&to=hoje+7` (+ overdue via section/catalog).
- Resposta **sem** `gross` / amounts: `{ id, vendor_label, due_date, bucket: 'today'|'week'|'overdue' }`.
- Auth: `ensureAuth` + `ensureAcademyAccess` (já usado em payables).

### Cobrar alunos

- `getReceptionDueBucket` → `due_today` | `due_week` | `overdue`.
- Valor: open amount / payment amount.
- Excluir isento e trancado ativo.

### Renovar pacote

- Âncora bundle paga → `endYm = coverageEndMonth(...)`.
- Incluir se `currentYm === endYm` ou mês imediatamente anterior a `endYm`.
- Excluir se mês seguinte já coberto/pago.
- Valor: âncora / `plan_price` / plano.

## Aceite

- [x] Banner some sem lembretes
- [x] Contas: nome + bucket, sem R$
- [x] Alunos: nome + valor + bucket mensalidade
- [x] Pacote: aviso no mês/mês anterior ao fim da cobertura
- [x] Recepção (member) vê o bloco; API reception não vaza valor de contas
- [x] Docs `hoje-dashboard` + checklist atualizados
- [x] `GET /api/finance?route=reception-reminders` + testes da lib
