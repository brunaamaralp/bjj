# Conciliação → Fechamento mensal (handoff pós-extrato)

**Data:** 2026-06-17  
**Status:** rascunho — aguardando implementação  
**Contexto:** a aba **Conferência do mês** repete dados de A receber e Lançamentos; o ritual de fechar o mês não está ligado ao fluxo natural do owner (conciliar extrato → conferir totais internos).  
**TECH:** [2026-06-17-conciliacao-fechamento-mensal-TECH.md](./2026-06-17-conciliacao-fechamento-mensal-TECH.md)

**Fluxos relacionados:**

- [conciliacao-bancaria.md](../../flows/financeiro/conciliacao-bancaria.md)
- [fechamento-mensal.md](../../flows/financeiro/fechamento-mensal.md)

**Specs relacionadas:**

- [2026-06-16-conciliacao-ux-evolucao-PRODUCT.md](./2026-06-16-conciliacao-ux-evolucao-PRODUCT.md)
- [2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md](./2026-06-17-bruto-taxa-liquido-PRODUCT.md) *(colunas bruto/taxa/líquido no fechamento — independente, mas reforça valor da revisão pós-conciliação)*

---

## Problema

Hoje existem **dois rituais de “conferência”** desconectados:

| Ritual | Onde | O que grava |
|--------|------|-------------|
| Conciliação bancária | `?tab=conciliacao` (owner) | Extrato ↔ lançamentos (`bank_statements.status`) |
| Conferência do mês | `?tab=fechamento` (admin/owner) | Snapshot interno (`cash_closing`) |

O owner costuma terminar o mês **na Conciliação** (“extrato bateu”). A aba **Conferência do mês** parece redundante porque mostra linhas que já existem em outras telas — e não há convite claro para fechar depois de conciliar.

**Quem é afetado:** owner (primário); admin que executa fechamento após o owner conciliar (secundário).

**Custo de não resolver:** mês anterior fica “aberto” (`runFinancePendingAlert` dispara todo dia); owner não entende por que existem duas abas; fechamento vira tarefa esquecida ou feita sem revisar o extrato.

---

## Goals

| # | Meta |
|---|------|
| G1 | Após **finalizar** um extrato, o owner vê o próximo passo natural: **revisar e conferir o(s) mês(es) civil(is)** cobertos pelo período |
| G2 | O handoff vive **na Conciliação** — não exige descobrir a aba Conferência do mês por acaso |
| G3 | Fechamento mensal **não é bloqueado** pela conciliação (sem extrato, extrato parcial ou academia sem importação) |
| G4 | Reduzir confusão com o botão **“Marcar como conferido”** manual da conciliação (TX sem linha no extrato) |
| G5 | Admin continua podendo fechar o mês mesmo sem acessar Conciliação |

---

## Non-Goals

- Tornar conciliação **obrigatória** antes de `recordCashClosing`.
- Remover a aba **Conferência do mês** nesta entrega (permanece como tela de revisão detalhada + export CSV + snapshot).
- Fundir `cash_closing` com `bank_statements` num único registro.
- Nova Serverless Function em `/api/` (rotas em `api/finance.js` / rewrite `bank-reconciliation`).
- Delegar Conciliação a admin/member.
- Substituir o cron `finance-pending-alert` — pode ser alinhado em copy, mas não removido.
- Card pesado na Visão Geral nesta fase (P2 opcional).

---

## Princípios de produto

1. **Conciliação = prova bancária; Fechamento = prova interna** — complementares, não duplicatas.
2. **Handoff suave** — sugestão e link, nunca modal bloqueante.
3. **Mês civil** — fechamento usa `YYYY-MM`; extrato usa `period_start` / `period_end`; a spec define o mapeamento.
4. **Owner conduz; admin fecha** — o CTA principal é na Conciliação (owner); admin vê status na aba Fechamento e pode concluir o snapshot.

---

## Personas e user stories

### Owner

**US-1**  
Como owner, após **Finalizar conciliação** de um extrato de março, quero ver *“Extrato de março ok — revisar fechamento do mês?”* com um botão, para não esquecer o passo seguinte.

**US-2**  
Como owner, se março **já estiver conferido**, quero ver confirmação discreta (*“Março conferido em 05/04”*) em vez de outro CTA.

**US-3**  
Como owner, se o extrato cobrir **dois meses** (ex.: 15/fev–14/mar), quero ver **um card por mês civil** afetado, cada um com seu status.

**US-4**  
Como owner, quero **pular** o handoff e continuar na lista de extratos sem perder trabalho.

**US-5**  
Como owner, ao reabrir um extrato já finalizado, quero ver o **status de fechamento** dos meses daquele período sem refazer a conciliação.

### Admin

**US-6**  
Como admin, quero abrir **Conferência do mês** com o mês certo na URL (`?tab=fechamento&month=YYYY-MM`) quando o owner me pedir para fechar após conciliar.

**US-7**  
Como admin, **não** preciso da Conciliação para marcar o mês como conferido — o fluxo do owner é uma sugestão, não um gate.

---

## Fases e requisitos

### Fase P0 — Handoff pós-“Finalizar conciliação” (~1 PR)

#### R0-1 — Card de próximo passo

| Campo | Valor |
|-------|-------|
| Gatilho | `POST complete` retorna `ok` (status `reconciled` ou `partial`) |
| Posição | Abaixo do bloco “Finalizar conciliação” / substitui área de finalize quando `st.status` ∈ `reconciled` \| `partial` e `completed_at` preenchido |
| Conteúdo | Para cada mês civil derivado do extrato (ver TECH): título do mês, status conferido / pendente, totais resumidos opcionais |
| CTA pendente | **Revisar fechamento de {mês}** → `/financeiro?tab=fechamento&month=YYYY-MM` |
| CTA conferido | Texto informativo + link **Ver detalhes** (mesma rota) |
| Dispensar | Link **Agora não** — esconde o card nesta sessão (`sessionStorage` por `statement_id`) |
| Copy extrato parcial | Se `status === 'partial'`, prefixo: *“Conciliação finalizada com pendências no extrato. Você ainda pode revisar o fechamento interno do mês.”* |

**Aceite:**

- [ ] Owner finaliza extrato → card aparece sem reload manual.
- [ ] Link abre Fechamento com mês correto no picker.
- [ ] Mês já conferido → sem botão primário de “conferir de novo”.
- [ ] “Agora não” some o card até nova sessão do browser.

#### R0-2 — Deep link `month` no hub Financeiro

| Campo | Valor |
|-------|-------|
| URL | `/financeiro?tab=fechamento&month=YYYY-MM` |
| Comportamento | `Caixa.jsx` lê `month` válido e seta `referenceMonth` na montagem / mudança de query |
| Validação | `parseReferenceMonth`; inválido → ignora (mantém mês corrente) |

**Aceite:**

- [ ] Admin/owner abre link compartilhado → grade do mês certo.
- [ ] Member em `?tab=fechamento` continua redirecionado (comportamento atual).

#### R0-3 — Renomear copy confusa na conciliação

| Antes | Depois |
|-------|--------|
| Botão manual “Marcar como conferido” (TX sem linha no extrato) | **Vincular sem linha no extrato** ou **Conciliar manualmente** |
| Tooltip / hint | Deixar claro que isso **não** fecha o mês no caixa |

**Aceite:** nenhum botão na Conciliação usa o verbo “conferir o mês” fora do novo card de fechamento.

---

### Fase P1 — Status persistente no detalhe do extrato (~1 PR)

#### R1-1 — Banner no detalhe do extrato finalizado

| Campo | Valor |
|-------|-------|
| Gatilho | `statement.completed_at` presente |
| UI | `StatusBanner` ou card compacto no topo do detalhe |
| Dados | Mesmo payload `closingHints` do complete (ver TECH) |

**Aceite:** reabrir extrato finalizado mostra status de fechamento por mês sem depender de ter clicado “Finalizar” nesta sessão.

#### R1-2 — Indicador na lista de extratos

| Campo | Valor |
|-------|-------|
| Coluna / badge | Por extrato: *“Fechamento: pendente”* \| *“ok”* \| *“misto”* (vários meses) |
| Regra | `ok` se todos os meses derivados conferidos; `pendente` se nenhum; `misto` caso contrário |

**Aceite:** owner identifica extratos cujo fechamento interno ainda falta.

---

### Fase P2 — Visão Geral leve (opcional)

#### R2-1 — Alerta mês anterior não conferido

| Campo | Valor |
|-------|-------|
| Condição | `previousMonth` sem `cash_closing` e `navRole` ∈ admin, owner |
| Copy | *“{Mês anterior} ainda não foi conferido.”* |
| CTA primário | **Conciliar extrato** se owner e existir extrato do período não finalizado; senão **Revisar fechamento** |
| Prioridade | Secundário ao handoff na Conciliação |

**Aceite:** não duplica card grande; uma linha no bloco Alertas existente.

---

## Regras de negócio

### Mapeamento extrato → mês(es) de fechamento

- Entrada: `period_start`, `period_end` (YYYY-MM-DD) do extrato.
- Saída: lista ordenada de `YYYY-MM` civis que **intersectam** o intervalo fechado `[start, end]`.
- Ex.: `2026-02-15` … `2026-03-14` → `['2026-02', '2026-03']`.
- Extrato de um único dia em `2026-03-31` → `['2026-03']`.

### Quando sugerir fechamento

| Situação | Comportamento |
|----------|----------------|
| Mês não conferido | CTA **Revisar fechamento** |
| Mês conferido | Mensagem + data `closed_at` |
| Extrato `partial` | Sugerir fechamento com aviso de pendências no extrato |
| Nenhum mês derivado (dados inválidos) | Não mostrar card; log server |
| Academia sem `cash_closing` configurado | Card com `StatusBanner` warning + link para suporte/docs; sem CTA de conferir |

### Admin vs owner

| Papel | Conciliação | Vê handoff P0 | Pode `recordCashClosing` |
|-------|-------------|---------------|-------------------------|
| owner | Sim | Sim | Sim |
| admin | Não | Não | Sim |
| member | Não | Não | Não |

Admin recebe pedido do owner via link `?tab=fechamento&month=` — fora do escopo: notificação in-app para admin.

---

## Estados de erro e edge cases

| Situação | UX esperada |
|----------|-------------|
| Falha ao carregar `closingHints` | Card omitido; toast não bloqueante; conciliação já foi salva |
| `snapshot_mismatch` no fechamento | Comportamento atual da aba Fechamento |
| Owner fecha mês na outra aba enquanto card aberto | Card atualiza ao receber `CASH_CLOSING_UPDATED_EVENT` |
| Múltiplos extratos no mesmo mês | Cada extrato mostra o mesmo status de fechamento do mês (idempotente) |

---

## Success metrics

| Métrica | Tipo | Meta (90 dias pós-P0) |
|---------|------|------------------------|
| % academies com `cash_closing` no mês N−1 até dia 10 | Lagging | +30% vs baseline |
| Cliques handoff → abertura `?tab=fechamento` | Leading | ≥40% dos completes de extrato (owner) |
| Tickets “não sei quando fechar o mês” | Lagging | Queda qualitativa |
| Regressão: completes de conciliação | Guardrail | Sem queda |

---

## Validação

- Harness: `npm test -- bankRecon closingHandoff financeClosing`
- Atualizar no mesmo PR:
  - [conciliacao-bancaria.md](../../flows/financeiro/conciliacao-bancaria.md) — passos 9–10 + handoff
  - [fechamento-mensal.md](../../flows/financeiro/fechamento-mensal.md) — entrada via Conciliação
  - [VALIDATION.md](../../flows/VALIDATION.md) — checklist P0

### Checklist demo (owner)

1. Importar extrato de março → conciliar → Finalizar.
2. Ver card “Revisar fechamento de março”.
3. Clicar → Fechamento abre em março.
4. Marcar mês como conferido → voltar ao extrato → card mostra “conferido”.
5. Admin abre link `?tab=fechamento&month=2026-03` sem passar pela Conciliação.

---

## Open questions

| # | Pergunta | Dono | Default se não responder |
|---|----------|------|---------------------------|
| Q1 | Handoff também quando `status=partial`? | Produto | **Sim**, com aviso (R0-1) |
| Q2 | Mostrar totais resumidos no card (recebido/pendente)? | Produto | **Sim**, 1 linha por mês se payload já existir |
| Q3 | P2 Visão Geral entra no mesmo epic? | Produto | **Não** — PR separado |
| Q4 | Renomear aba “Conferência do mês” → “Fechamento mensal”? | Produto | **Fora do escopo**; só copy no handoff |

---

## Timeline sugerida

| Fase | Entrega | Dependências |
|------|---------|--------------|
| P0 | Handoff + `month` query + rename botão manual | TECH |
| P1 | Lista + detalhe persistente | P0 |
| P2 | Alerta Visão Geral | P0, métricas |
