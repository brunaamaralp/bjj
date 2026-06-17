# Bruto / Taxa / Líquido — alinhamento do modelo financeiro — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Fase 1 implementada (2026-06-17) · Fase 2 pendente  
**TECH:** [2026-06-17-bruto-taxa-liquido-modelo-financeiro-TECH.md](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-TECH.md)  
**Relacionado:**
- [mensalidades-parcelamento-taxas](./2026-06-15-mensalidades-parcelamento-taxas-PRODUCT.md) (repasse `cardFees` + parcelas)
- [taxa-pix-config-ui-codigo](./2026-06-15-taxa-pix-config-ui-codigo-PRODUCT.md) (PIX no repasse)
- [taxas-cartao-metodos-canonicos](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md) (aliases de método)
- [financeiro-extrato-consolidacao](./2026-06-15-financeiro-extrato-consolidacao-PRODUCT.md) (caixa × extrato)
- [caixa-categorias-gerenciais](./2026-06-15-caixa-categorias-gerenciais-PRODUCT.md) (DRE / categorias)

---

## 1. Problem Statement

O Nave persiste `gross`, `fee` e `net` em `FINANCIAL_TX` (`normalizeTxAmounts` em `lib/server/financeTxFields.js`), mas **diferentes módulos usam bases distintas** sem deixar isso claro na interface:

| Superfície | O que mostra hoje | Base real |
|------------|-------------------|-----------|
| Mensalidades / KPIs | Valor cobrado do aluno (bruto com repasse) | `expected_amount` / `paid_amount` |
| Caixa (agregações) | Entradas liquidadas | **Σ net** (`financeTxAggregate`, saldos bancários) |
| Espelho mensalidade | `fee` = acréscimo repassado ao aluno | `gross − fee = net` ≈ preço do plano |
| Espelho venda | `fee: 0`, `net = gross` | Sem MDR da operadora |
| Previsão | Totais de mensalidades / parcelas | Bruto esperado do cliente |
| Configurações → Taxas | `cardFees` | **Repasse ao aluno**, não custo MDR |

**Quem sofre:** owner e contador que comparam Mensalidades, Fechamento, Previsão e Caixa e veem números “quase iguais” até o cartão/PIX — quando o líquido no banco só reflete MDR se houver lançamento manual ou conciliação.

**Custo de não resolver:** decisões de caixa erradas; DRE com receita = líquido mas faturamento = bruto sem rótulo; taxas da operadora invisíveis; previsão otimista vs extrato real.

**Evidência:** auditoria de bruto/líquido/taxas (jun/2026); `salesMirror.js` grava `fee: 0`; `studentPaymentFinancialTxMirror.js` trata `fee` como repasse, não MDR.

---

## 2. Visão do modelo alvo

### 2.1 Três conceitos separados

| Conceito | Definição | Onde vive |
|----------|-----------|-----------|
| **Faturamento (bruto)** | Valor cobrado do cliente | `gross` em TX; mensalidades `expected_amount` |
| **Repasse ao aluno** | Acréscimo no preço por método (`cardFees`) | Cálculo em `paymentStatus.js`; hoje infla `gross` e gera `fee` no espelho |
| **Custo financeiro (MDR)** | O que a operadora/adquirente retém | **Não modelado hoje** — alvo da Fase 2 (`acquirerFees` / `mdr`) |

### 2.2 Relação contábil desejada (Fase 2)

```
gross  = valor cobrado do cliente
fee    = MDR + taxas fixas + antecipação (custo da academia)
net    = gross − fee   → entrada no caixa / conciliação
```

Repasse ao aluno continua existindo, mas **não deve ser confundido** com MDR: ou embute no preço (`applyCardFee`) ou a academia absorve o MDR sobre a base do plano.

### 2.3 Relatórios unificados (Fase 2)

| Métrica | Fórmula | Regime |
|---------|---------|--------|
| Faturamento | Σ `gross` | Competência |
| Recebimentos no caixa | Σ `net` | Data de liquidação (`settledAt`) |
| Taxas financeiras | Σ `fee` (despesa explícita “Taxas de cartão” / PIX) | Competência ou caixa conforme lançamento |

---

## 3. Goals

### Fase 1 — Curto prazo (sem mudar modelo de dados)

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Operador entende que `cardFees` = repasse, não MDR | Copy em Configurações + tooltip; zero tickets “taxa não bate com extrato” por confusão de conceito |
| G2 | Fechamento / KPIs de mensalidades mostram bruto/taxa/líquido quando houver `financial_tx_id` | Colunas visíveis em linhas pagas com espelho |
| G3 | Previsão deixa claro “a receber do cliente” vs “entrada líquida estimada” | Legenda + KPIs rotulados na aba Previsão |
| G4 | Paridade visual com Caixa | Mesmos rótulos (`Bruto`, `Taxa`, `Líquido`) e formatação monetária |

### Fase 2 — Médio prazo (corrigir modelo)

| # | Objetivo | Como medir |
|---|----------|------------|
| G5 | MDR configurável por método/parcela | `acquirerFees` em `financeConfig` |
| G6 | Espelho automático com `fee` = MDR ao liquidar cartão/PIX | `studentPaymentFinancialTxMirror` + `salesMirror` |
| G7 | Parcelas com MDR por faixa | `installment_schedule_json` com `fee`/`net` por parcela |
| G8 | Antecipação registrada | TX filha ou tipo `fee` vinculado ao original |
| G9 | Previsão usa `net` estimado nas entradas; `gross` informativo | Gráfico de fluxo ≠ linha “faturamento” |
| G10 | DRE / relatórios seguem definições da §2.3 | Testes de paridade com `reportsFinanceParity` estendidos |

---

## 4. Non-Goals

| Item | Motivo |
|------|--------|
| Integração automática com adquirente (PagBank, Stone, etc.) para MDR real | Fase 3; Fase 2 usa config manual |
| Recalcular histórico em massa | Migração opcional; default = só novos lançamentos |
| Unificar `cardFees` e `acquirerFees` em um único objeto | Separação explícita de repasse vs custo |
| Novos arquivos em `/api/` | Limite Vercel Hobby 12/12 — rotas via `?route=` existentes |
| Mudar regime contábil padrão (caixa vs competência) | Fora de escopo |
| Taxa fixa em reais no repasse (`cardFees.*.fixed`) | Campo morto; documentar como não usado na Fase 1 |

---

## 5. Fase 1 — Comportamento esperado (curto prazo)

### 5.1 Documentação na UI — Configurações

**Onde:** Minha Academia → Financeiro → Taxas (`FinanceSettingsFeesSection.jsx`).

**Copy mínima (PT-BR):**

- Lead da seção: deixar explícito que percentuais são **repasse ao aluno** no valor da mensalidade, **não** a taxa que a operadora desconta no extrato.
- Nota de rodapé ou `StatusBanner` informativo (variante `info`):
  - *“O valor que cai na conta bancária (líquido) depende das taxas da sua operadora. Hoje isso é registrado em lançamentos manuais no Caixa ou na conciliação bancária, salvo quando você informar taxa no próprio lançamento.”*
- Plano: renomear label **“Aplica taxa de cartão”** → **“Repasse taxas de pagamento ao aluno”** (campo `applyCardFee` inalterado no banco).

**Critério:** owner consegue responder “por que o Caixa não bate com o extrato” só lendo a tela de configuração.

### 5.2 Fechamento e KPIs de mensalidades

**Onde:** `MonthlyClosingTab` / grade de fechamento; opcionalmente resumo em `MensalidadesPanel` para mês corrente.

**Regra:**

- Para cada linha com `financial_tx_id` resolvido (join com `FINANCIAL_TX` ou campos espelhados no payload do fechamento):
  - Exibir colunas **Bruto** (`gross`), **Taxa** (`fee`), **Líquido** (`net`).
- Sem `financial_tx_id`: manter coluna única “Recebido” / valor atual (sem inventar fee).
- Totais do fechamento: manter **recebido** alinhado ao que já soma hoje; adicionar sublinha ou colunas opcionais “Bruto / Taxa / Líquido” no rodapé quando ≥1 linha tiver espelho.

**Critério:** linha paga cartão 3x com repasse 4% mostra bruto R$ 208, taxa R$ 8, líquido R$ 200 — igual ao TX no Caixa.

### 5.3 Previsão — legenda e KPIs

**Onde:** `ForecastTab.jsx`, `FINANCE_TERM_HINTS`, KPI strip da previsão.

**Regra (Fase 1 — sem recalcular net):**

- Rotular totais de entrada como **“A receber do cliente (bruto)”** ou equivalente.
- Tooltip / legenda do gráfico:
  - *“Valores projetados são o que você espera cobrar dos alunos e clientes, antes das taxas da operadora. O saldo em conta pode ser menor.”*
- Se existir linha “saldo projetado”, deixar claro que usa a mesma base bruta até Fase 2.

**Critério:** usuário não interpreta previsão como extrato bancário.

---

## 6. Fase 2 — Comportamento esperado (médio prazo)

### 6.1 Configurações separadas

| Chave | Propósito | Já existe? |
|-------|-----------|------------|
| `cardFees` | Repasse ao aluno (% por método/parcela) | Sim |
| `acquirerFees` ou `mdr` | Custo operadora: % por método/parcela, taxa fixa, antecipação | **Novo** |

**UI:** nova subseção “Taxas da operadora (MDR)” abaixo de repasse, com aviso de não confundir com repasse.

**Modo academia:**

| Modo | Comportamento |
|------|----------------|
| Academia absorve MDR | `gross` = valor cobrado; `fee` = MDR; `net` = gross − fee |
| Repassa MDR no preço | Preço ao aluno já inclui repasse (`cardFees`); MDR calculado sobre base do plano ou sobre gross — **decisão em Open Questions** |

### 6.2 Espelhamento automático (mensalidade + venda)

Ao liquidar com cartão ou PIX:

```
gross = valor cobrado do cliente
fee   = gross × mdr% (+ fixo se configurado)
net   = gross − fee
```

- Lançamento contábil: receita = `net`; despesa “Taxas de cartão” = `fee` quando `fee > 0` (padrão `montarLancamento.js`).
- Mensalidades: `studentPaymentFinancialTxMirror.js`.
- Vendas: `salesMirror.js` (hoje `fee: 0`).

### 6.3 Parcelas

Ao gerar `installment_schedule_json`:

- Cada parcela: `gross`, `fee` (MDR da faixa Nx), `net`, `due_date`.
- MDR parcelado pode variar por quantidade de parcelas (tabela em `acquirerFees.credito_parcelado[n]`).

### 6.4 Antecipação de recebíveis

- Novo tipo ou TX filha vinculada ao original (`parent_tx_id` ou `origin_type: 'anticipation_fee'`).
- Campos: valor do desconto, data da antecipação, redução do `net` efetivo no caixa.
- Previsão: parcelas antecipadas movem `net` para data antecipada.

### 6.5 Previsão (Fase 2)

- Fluxo de caixa projetado: **Σ net estimado** por data.
- Linha ou KPI separado: **Faturamento projetado (bruto)**.
- Legenda atualizada para refletir cálculo real.

### 6.6 Relatórios unificados

Documentar no hub Relatórios / DRE (e validar em testes):

- Faturamento = Σ gross (competência)
- Recebimentos caixa = Σ net (liquidação)
- Taxas financeiras = Σ fee (despesa)

---

## 7. User Stories

### Owner / contador

- **US1:** Como owner, quero ler em Configurações que taxas são repasse ao aluno, para não esperar que o extrato bata com o valor da mensalidade.
- **US2:** Como contador, no fechamento do mês quero ver bruto/taxa/líquido das mensalidades com espelho no Caixa.
- **US3:** Como owner, na previsão quero saber se o gráfico é “a receber do cliente” ou “entrada no banco”.
- **US4 (F2):** Como owner, quero cadastrar MDR da operadora separado do repasse ao aluno.
- **US5 (F2):** Como contador, quero que vendas em cartão gerem `fee` de MDR automaticamente no Caixa.
- **US6 (F2):** Como owner, quero registrar antecipação e ver o desconto no fluxo de caixa.

### Recepção

- **US7:** Como recepção, ao registrar mensalidade continuo vendo o valor que cobro do aluno; o líquido no Caixa fica para o financeiro.

---

## 8. Requirements

### Fase 1 — P0

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1.1 | Copy repasse vs MDR em Taxas | Lead + nota informativa em `FinanceSettingsFeesSection` |
| R1.2 | Label plano `applyCardFee` | Texto “Repasse taxas de pagamento ao aluno” em `FinanceSettingsPlansSection` |
| R1.3 | Colunas bruto/taxa/líquido no fechamento | Visíveis quando `financial_tx_id` presente; dados = TX espelho |
| R1.4 | Legenda previsão | `FINANCE_TERM_HINTS` + rótulos KPI/gráfico em `ForecastTab` |
| R1.5 | Testes | Unitários fechamento (colunas condicionais); snapshot copy em settings |
| R1.6 | Fluxo usuário | Atualizar `docs/flows/financeiro/` se rota/copy de fechamento ou previsão mudar |

### Fase 1 — P1

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1.7 | Mensalidades — colunas opcionais | Mesmas três colunas na grade quando pago + `financial_tx_id` |
| R1.8 | Link “Ver no Caixa” | Da linha do fechamento para TX quando `financial_tx_id` |

### Fase 2 — P0

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R2.1 | Schema `acquirerFees` | Persistido em `financeConfig`; UI de edição |
| R2.2 | `computeAcquirerFee({ gross, method, installments })` | Função pura testada; usada nos espelhos |
| R2.3 | Espelho mensalidade com MDR | `fee` = MDR; repasse não duplica como `fee` |
| R2.4 | Espelho venda com MDR | `salesMirror` deixa de forçar `fee: 0` quando método elegível |
| R2.5 | Parcelas no schedule | Cada item com gross/fee/net |
| R2.6 | Previsão em net | KPI fluxo usa net; KPI bruto separado |
| R2.7 | Relatórios | DRE/overview usam definições §2.3; testes de paridade |

### Fase 2 — P1

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R2.8 | Antecipação | TX vinculada + UI mínima no Caixa |
| R2.9 | Modo absorver vs repassar MDR | Toggle academia; documentado no TECH |
| R2.10 | Migração opcional | Script ou flag para recalcular TX recentes |

---

## 9. Success Metrics

| Indicador | Tipo | Meta Fase 1 | Meta Fase 2 |
|-----------|------|-------------|-------------|
| Tickets “número não bate” (financeiro) | Lagging | −30% em 60 dias | −60% |
| Linhas fechamento com breakdown | Leading | 100% quando espelho existe | — |
| TX espelhadas com `fee` > 0 em cartão (vendas) | Leading | — | >90% novas vendas cartão |
| Paridade previsão net × caixa projetado | Lagging | N/A | ±5% em demo academy |

---

## 10. Open Questions

| # | Pergunta | Dono | Bloqueia |
|---|----------|------|----------|
| OQ1 | MDR sobre `gross` (valor cobrado) ou sobre base do plano quando há repasse? | Produto + contador | Fase 2 espelho |
| OQ2 | PIX tem MDR configurável ou só cartão na v1 Fase 2? | Produto | UI `acquirerFees` |
| OQ3 | Repasse (`cardFees`) e MDR coexistem: `fee` único ou `pass_through_fee` + `acquirer_fee`? | Engenharia | Schema TX |
| OQ4 | Antecipação: TX filha vs campo no mesmo TX? | Engenharia | Fase 2 P1 |
| OQ5 | Fechamento: buscar TX no cliente ou enriquecer API `monthly-closing`? | Engenharia | R1.3 |
| OQ6 | Vendas PDV: mesmo MDR que mensalidades ou tabela separada? | Produto | R2.4 |

---

## 11. Timeline e fases

| Fase | Escopo | Esforço estimado | Dependências |
|------|--------|------------------|--------------|
| **1** | UI + legenda + colunas fechamento | 2–4 dias | Nenhuma |
| **2a** | `acquirerFees` + espelhos mensalidade/venda | 5–8 dias | Decisão OQ1–OQ3 |
| **2b** | Parcelas + previsão net | 4–6 dias | 2a |
| **2c** | Antecipação + relatórios | 5–7 dias | 2b |

**Ordem recomendada:** Fase 1 pode ir a produção independentemente. Fase 2 exige TECH spec aprovada e respostas OQ1–OQ3 antes de implementar espelhos.

---

## 12. Checklist de validação (demo)

### Fase 1

- [ ] Configurações → Taxas exibe repasse vs extrato bancário
- [ ] Plano mostra label de repasse ao aluno
- [ ] Fechamento: mensalidade paga cartão com espelho mostra Bruto/Taxa/Líquido
- [ ] Fechamento: pendente sem espelho — sem colunas vazias enganosas
- [ ] Previsão: KPI e legenda dizem “a receber do cliente”

### Fase 2

- [ ] MDR 3,5% cartão crédito → venda R$ 100 gera net R$ 96,50 e despesa taxa R$ 3,50
- [ ] Mensalidade com repasse 4% + MDR 3%: números batem com planilha acordada (caso de teste documentado)
- [ ] Previsão: fluxo semanal usa net; faturamento bruto visível
- [ ] DRE: faturamento ≠ recebimentos quando há taxa
