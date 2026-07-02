# Visão Geral — correção mês único e UX clara — PRODUCT

**Data:** 2026-07-02  
**Status:** Aprovado para implementação  
**TECH:** [2026-07-02-visao-geral-mes-claro-TECH.md](./2026-07-02-visao-geral-mes-claro-TECH.md)  
**Plan:** [2026-07-02-visao-geral-mes-claro.md](../plans/2026-07-02-visao-geral-mes-claro.md)  
**Rota:** `/financeiro?tab=visao-geral`  
**Componente:** `VisaoGeralTab`

---

## 1. Problem Statement

A aba **Visão Geral** do Financeiro agrega saldo, entradas, saídas, saldos bancários, mensalidades e alertas. Hoje os números **carregam**, mas a experiência é confusa:

- O seletor de **mês de referência** altera o card “Saldo e movimentações”, porém **Saldos por conta** mostram sempre a posição de **hoje**, ignorando o mês escolhido.
- Rótulos fixos (“Caixa · mês atual”) contradizem meses passados selecionados.
- **Entradas / Saídas** nos detalhes de cada conta bancária são **acumuladas desde o saldo inicial**, não do mês — o usuário interpreta como movimento do período.
- O botão **Atualizar** pode devolver cache de até 45s sem buscar dados novos.
- Há risco de **divergência de fuso** (Brasil vs UTC no servidor) perto da meia-noite.

**Quem sofre:** recepção, owner e admin que abrem a Visão Geral para conferir “como foi o mês” ou “como está fechando o mês corrente”.

**Decisão de produto (2026-07-02):** manter **tudo no eixo mês** — sem KPIs “do dia”. O mês de referência do header deve ser a **única régua temporal** da página (com exceções explicitamente rotuladas).

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | **Um mês, uma história** — todos os blocos de caixa/movimentação seguem o mês selecionado | Com julho/2025 selecionado, saldo bancário = posição em 31/07/2025; entradas/saídas por conta = julho/2025 |
| G2 | **Rótulos honestos** — nenhum texto implícito de “hoje” ou “mês atual” quando não for verdade | Audit de copy: eyebrow + subtítulo + hints batem com intervalo real |
| G3 | **Atualizar funciona** — clique manual sempre refetch | Teste: mutação → Atualizar → valor novo em &lt; 2s (sem esperar TTL) |
| G4 | **Consistência Brasil** — limites de mês e “hoje” em `America/Sao_Paulo` | Testes de bounds + smoke manual 23h–01h BRT |
| G5 | **UX impecável** — loading, erro parcial, truncamento e regime compreensíveis | Checklist Seção 6 + revisão com `FINANCE_TERM_HINTS` |
| G6 | **Zero regressão de escopo** | Sem novo arquivo em `/api/`; endpoint `route=overview` existente |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| KPIs **do dia** (saldo/entradas/saídas diárias) | Fora de escopo; fechamento diário fica em Loja → Resumo do dia |
| Gráfico time-series diário do mês | P2; esta entrega foca clareza + correção |
| Toggle regime na página | P1 opcional; v1 mantém badge + hint (localStorage) |
| Migrar previsão 30 dias para mês selecionado | Previsão é **prospectiva**; permanece “próximos 30 dias” com rótulo explícito |
| Novo endpoint `/api/` | Limite Hobby 12/12 |
| Redesign completo do hub Financeiro | Apenas Visão Geral + copy relacionada |

---

## 4. Modelo mental (o que o usuário deve entender)

### 4.1 Âncora única: mês de referência

O **FinanceMonthPicker** no header define `referenceMonth` (`YYYY-MM`). Toda a Visão Geral responde à pergunta:

> “**Como está o financeiro deste mês?**”

### 4.2 Intervalo do mês (regra única)

| Situação | Intervalo `[from, to]` | Label humano |
|----------|------------------------|--------------|
| Mês **corrente** (SP) | 1º dia do mês → **hoje** (SP) | “1–30 de julho de 2026 (até hoje)” |
| Mês **passado** | 1º → último dia do mês | “1–31 de julho de 2025” |
| Mês **futuro** | 1º → último dia (vazio esperado) | “Agosto de 2026 (mês ainda não iniciado)” |

Esta regra já existe em `monthPeriodBounds`; a correção é **aplicá-la também aos saldos bancários** e **alinhar copy**.

### 4.3 O que cada card significa (copy canônica)

| Card | Título | Significado | Hint (tooltip) |
|------|--------|-------------|----------------|
| **Saldo e movimentações** | Saldo do período | Entradas liquidadas − saídas liquidadas no intervalo | `FINANCE_TERM_HINTS` regime |
| | Entradas / Saídas | Totais liquidados no intervalo | Idem |
| **Saldos por conta** | Posição no fim do período | Saldo de cada conta em **`to`** do intervalo | `saldoAtualBancario` adaptado: “Posição em {data fim}” |
| | Detalhes → Entradas / Saídas | Movimentação **no intervalo**, não acumulada vitalícia | Novo hint: “Somente neste mês de referência” |
| **Mensalidades** | Referência {mês} | Grade de mensalidades do mês | Já correto |
| **A receber / A pagar** | Consolidado | Posição aberta (não é fluxo do mês) | Hint: “Valores em aberto, não filtrados pelo mês” |
| **Previsão · 30 dias** | Próximos 30 dias | Independente do mês selecionado | Eyebrow: “Projeção · não segue o mês acima” |

---

## 5. User Stories

### Recepção / operador

- Quero ver **entradas e saídas do mês** que estou conferindo, sem números de “hoje” misturados quando escolhi um mês passado.
- Quero entender **em qual data** cada saldo bancário está calculado.
- Quero clicar **Atualizar** depois de registrar um pagamento e ver o número novo na hora.

### Owner / admin

- Quero comparar **saldo do mês** com o **mês anterior** (badge de tendência) com confiança.
- Quero que **Saldos por conta** no mês passado mostrem a posição **no fim daquele mês**, para bater com extrato/fechamento.
- Quero saber se estou em **regime caixa ou competência** antes de interpretar entradas/saídas.

### Edge cases

- Mês com &gt; 2.500 lançamentos: aviso visível no topo **e** no card afetado.
- Falha parcial (ex.: mensalidades OK, bancos falhou): card com erro + retry local; resto da página útil.
- Academia sem contas bancárias: banner de setup (já existe) + empty state claro.
- Mês futuro selecionado: zeros + mensagem “Nenhuma movimentação neste período” (não parecer bug).

---

## 6. Requisitos e critérios de aceite

### P0 — Correção funcional

#### R1. Saldos bancários seguem o mês selecionado

- **Dado** mês passado `2025-07` selecionado  
- **Quando** a Visão Geral carrega  
- **Então** `bankBalances.asOf` = `2025-07-31` e saldos = posição naquela data  
- **E** delta “vs mês anterior” compara com `2025-06-30`

- **Dado** mês corrente selecionado  
- **Então** `asOf` = hoje (SP) e intervalo `[from, to]` = início do mês até hoje

#### R2. Entradas/saídas por conta = movimento do mês

- **Dado** conta com R$ 10.000 acumulados historicamente e R$ 500 movimentados em jul/2025  
- **Quando** jul/2025 selecionado  
- **Então** Detalhes mostram entradas/saídas **de jul/2025 apenas** (não R$ 10.000)

#### R3. Atualizar sempre refetch

- **Quando** usuário clica Atualizar  
- **Então** cache cliente ignorado (`force: true`)  
- **E** botão mostra estado busy; cards não “piscam” skeleton completo se já carregados uma vez (opacidade sutil)

#### R4. Timezone único (America/Sao_Paulo)

- Servidor usa `todayYmdFinance()` / helpers SP para: `monthPeriodBounds`, `bankCurrentAsOf`, bounds de query TX  
- Teste unitário: mock de data UTC perto da meia-noite BRT não desloca o dia

#### R5. Copy dinâmica do período

- Subtítulo global abaixo do header (ou barra sticky no tab):  
  **“Referência: {mês por extenso} · {from} – {to}”**  
- Card “Saldo e movimentações”: eyebrow **“Caixa · {mês por extenso}”** (nunca “mês atual” fixo)  
- Card “Saldos por conta”: **“Posição em {to formatado BR}”**  
- Remover ambiguidade “Saldos liquidados até hoje” quando `to` ≠ hoje

### P0 — UX impecável

#### R6. Hierarquia visual do período

- O intervalo de datas é **sempre visível** sem abrir modal (não escondido só no picker).  
- Regime (caixa/competência) permanece visível com `FinanceLabelWithHint`.

#### R7. Estados de loading e erro

| Estado | Comportamento |
|--------|----------------|
| Primeira carga | `PageSkeleton` (atual) |
| Refresh | Overlay/opacidade nos cards + `aria-busy` no botão; **não** substituir página inteira por skeleton |
| Erro total | `ErrorBanner` + retry (atual) |
| Erro por card | `CardLoadError` + retry **só daquele bloco** (stretch: retry refetch overview) |

#### R8. Truncamento

- Banner warning no topo se `summary.truncated` **ou** `bankBalances.truncated`  
- Texto: quantos lançamentos afetados + link “Ver Lançamentos” com filtro do período

#### R9. Links de drill-down coerentes

- “Ver lançamentos” no card saldo → `/financeiro?tab=movimentacoes` com `from`/`to` do intervalo  
- Link por conta → movimentações filtradas por conta **e** período do mês

### P1 — Polish

- Chip “Mês conferido” no picker reflete `isMonthConferred` (já existe) — reforçar tooltip  
- Empty state mês futuro / sem movimentação: ilustração compacta + CTA Lançamentos  
- `FinanceLabelWithHint` nos labels Entradas/Saídas do mini-chart e do breakdown bancário

### P2 — Futuro

- Toggle regime inline na Visão Geral  
- Mini gráfico entradas vs saídas por semana **dentro do mês**

---

## 7. Copy deck (strings canônicas)

| Chave | PT-BR |
|-------|-------|
| `overview.periodBanner` | Referência: **{monthTitle}** · **{fromBr} – {toBr}** |
| `overview.card.flow.eyebrow` | Caixa · {monthTitle} |
| `overview.card.flow.saldoLabel` | Saldo do período |
| `overview.card.flow.inLabel` | Entradas (liquidadas) |
| `overview.card.flow.outLabel` | Saídas (liquidadas) |
| `overview.card.banks.eyebrow` | Caixa · posição em {toBr} |
| `overview.card.banks.asOf` | Saldos calculados em **{toBr}** |
| `overview.card.banks.breakdown.in` | Entradas no período |
| `overview.card.banks.breakdown.out` | Saídas no período |
| `overview.card.forecast.eyebrow` | Projeção · próximos 30 dias |
| `overview.card.forecast.note` | Não segue o mês de referência acima |
| `overview.card.receivables.note` | Valores em aberto (independe do mês selecionado) |
| `overview.refresh.success` | Resumo atualizado |

---

## 8. Success Metrics

| Métrica | Alvo (30 dias pós-ship) |
|---------|-------------------------|
| Tickets/confusão “número errado Visão Geral” | Redução ≥ 50% vs baseline informal |
| Task success (owner: conferir mês passado) | 5/5 usuários internos acertam saldo bancário = fim do mês |
| Refresh percebido | 0 relatos de “Atualizar não mudou” em QA |

---

## 9. Validação

### Manual (checklist)

- [ ] Mês corrente: saldo período = Lançamentos (mesmo filtro `from`/`to`)
- [ ] Mês passado: saldos bancários batem com `bank-balances?asOf=último-dia`
- [ ] Detalhes conta: entradas/saídas = soma TX do mês na conta (amostra 3 contas)
- [ ] Atualizar após liquidar lançamento: valor muda sem F5
- [ ] Copy sem “mês atual” fixo em mês passado
- [ ] Previsão 30d rotulada como independente
- [ ] Mobile: banner de período legível, cards empilhados

### Automatizado

- `npm test -- financeOverview` (novos testes bounds, bank asOf, breakdown mensal)
- `npm test -- visaoGeral` (copy helpers, refresh force)

### Governança docs

- Atualizar `docs/flows/VALIDATION.md` checklist Visão Geral  
- Criar ou estender fluxo `docs/flows/financeiro/visao-geral.md` (Seção A)

---

## 10. Open Questions

| # | Pergunta | Dono | Bloqueante? |
|---|----------|------|-------------|
| Q1 | Mês futuro: bloquear seleção no picker ou permitir com empty state? | Produto | Não — default: permitir + empty |
| Q2 | “A receber” deve filtrar pelo mês ou permanecer snapshot global? | Produto | **Resolvido:** global, com nota |
| Q3 | Comparativo bancário “vs mês anterior” usa fim do mês anterior ou mesmo `to` relativo? | Eng | **Resolvido:** fim do mês anterior (`monthEndYmd(prev)`) |

---

## 11. Fases de entrega

| Fase | Escopo | Entregável |
|------|--------|------------|
| **0** | Spec + testes falhando | Este doc + TECH |
| **1** | Backend: asOf alinhado, breakdown mensal por conta, TZ | Handler + data layer |
| **2** | Frontend: copy, banner período, refresh, loading | `VisaoGeralTab`, `BankBalancesOverview` |
| **3** | QA + docs flows | Checklist VALIDATION verde |
