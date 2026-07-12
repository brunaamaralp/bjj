# Relatório Financeiro — evolução UX/UI e funcionalidades — PRODUCT

**Data:** 2026-07-12  
**Status:** Fase 1 implementada (2026-07-12) · Fase 2 implementada (2026-07-12) · Fase 3 implementada (2026-07-12)  
**TECH:** [2026-07-12-relatorio-financeiro-ux-evolucao-TECH.md](./2026-07-12-relatorio-financeiro-ux-evolucao-TECH.md)  
**Rota:** `/reports?tab=financeiro`  
**Componente:** `ReportsFinancePanel.jsx`

**Fluxos relacionados:**

- [relatorios-indicadores.md](../../flows/analise/relatorios-indicadores.md)
- [lancamentos-caixa.md](../../flows/financeiro/lancamentos-caixa.md)
- [fechamento-mensal.md](../../flows/financeiro/fechamento-mensal.md)
- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md)

**Specs relacionadas:**

- [2026-07-02-visao-geral-mes-claro-PRODUCT.md](./2026-07-02-visao-geral-mes-claro-PRODUCT.md) — card que linka para esta aba
- [2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md) — gross/fee/net

**Mock Figma:** não disponível — wireframes ASCII e critérios visuais abaixo.

---

## 1. Inventário — estado atual (2026-07-12)

### O que a aba entrega hoje

| Elemento | Comportamento |
|----------|---------------|
| KPIs | Recebido, Despesas, Saldo do período, A receber |
| Regime | Toggle Caixa / Competência (gestores) |
| Detalhe | Lista "Recebimentos por forma de pagamento" |
| Atalho | Link "Abrir razão contábil →" |
| Export | CSV agregado via toolbar compartilhada |
| Metas RAG | Apenas no Saldo do período (`financeBalance`) |
| API | `GET /api/reports-light?type=finance&from=&to=&regime=` |
| Permissões | Gestores: visão completa; membros: `scope: basic` (KPIs sem breakdown/export) |

### Pontos fortes (manter)

- Período único compartilhado com outras abas de Relatórios
- Agregação alinhada ao fechamento mensal (`reportsFinanceParity.test.js`)
- Lazy load, empty/loading/error states, aviso de truncamento (>2.500 lançamentos)
- Gating por `modules.finance`

### Lacunas identificadas (auditoria UX 2026-07-12)

| # | Lacuna | Impacto |
|---|--------|---------|
| L1 | Card na Visão Geral promete **DRE**; aba não exibe DRE | Expectativa quebrada |
| L2 | KPI **"A receber"** usa mês de `to`, não o período selecionado | Interpretação errada |
| L3 | Membros veem visão `basic` **sem aviso** | Confusão / sensação de bug |
| L4 | KPIs sem tooltips de definição | Gestor não sabe o que conta |
| L5 | Sem comparação vs período anterior | Atrás da aba Alunos |
| L6 | Sem drill-down nos KPIs | Números sem ação |
| L7 | Empty state sem CTA para Lançamentos | Fricção desnecessária |
| L8 | Saldo sem destaque visual (+/−) | Leitura lenta |
| L9 | Breakdown por forma sem % do total | Atrás da aba Vendas |
| L10 | Sem atalhos para DRE, Fechamento, A receber | Navegação fragmentada |
| L11 | Sem refresh manual no header | Dados podem parecer stale |
| L12 | Gross/fee/net (MDR) não exposto | Informação já existe no backend |
| L13 | Export CSV raso (só totais) | Valor analítico limitado |

---

## 2. Problem Statement

A aba **Financeiro** em Relatórios entrega um resumo operacional de caixa, mas está **atrás das outras abas** (Alunos, Vendas) em profundidade analítica, contexto e navegação. Além disso, há **inconsistências de expectativa**: o card na Visão Geral promete DRE; o KPI "A receber" não segue o período da toolbar; membros da equipe veem dados resumidos sem explicação.

**Quem sofre:** owner e admin que usam Relatórios para gestão; recepção/admin com acesso limitado que interpreta números incompletos como erro.

**Custo de não resolver:** gestor vê totais mas precisa sair da página para entender origem ou agir; tickets de "número errado"; baixa adoção da aba em favor de planilhas ou do hub Financeiro direto.

---

## 3. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | **Expectativa honesta** — copy e KPIs refletem o que a aba realmente mostra | Audit de strings: zero menção a DRE na aba sem link explícito; "A receber" rotulado com mês de referência |
| G2 | **Paridade mínima com Alunos/Vendas** — tooltips, CTAs, % no breakdown, erro amigável | Checklist Seção 7 P0 |
| G3 | **Ação após leitura** — drill ou atalho para lançamentos a partir de cada KPI principal | Task success: gestor abre lista filtrada em ≤2 cliques |
| G4 | **Visão limitada explícita** para membros (`scope: basic`) | Membro vê banner informativo, não acha que dados sumiram |
| G5 | **Comparação temporal** — variação vs período anterior nos KPIs de caixa | Trend visível em Recebido, Despesas e Saldo |
| G6 | **Zero regressão de API** — sem novo arquivo em `/api/` (Hobby 12/12) | Reutilizar `reports-light`, `finance`, rotas existentes |

---

## 4. Non-Goals

| Item | Motivo |
|------|--------|
| DRE/DFC completo **dentro** da aba Relatórios | Já existe em `/financeiro?tab=dre`; esta spec adiciona atalho e corrige copy, não duplica razão |
| Novo endpoint `/api/reports-finance.js` | Limite Hobby 12/12 |
| Relatório PDF financeiro | P2 futuro; CSV expandido cobre v1 analítica |
| Filtro por operador / conta bancária | Escopo da aba Vendas; financeiro é consolidado da academia |
| Edição de lançamentos na aba | Drill é somente leitura → handoff para Lançamentos |
| Metas KPI para `financeReceived` e `financeExpenses` | P2; v1 mantém meta só em Saldo |
| Gráfico time-series semanal | P2 fase 3 |
| Snapshot/cache indicator no header (como funil) | P2; v1 usa refresh manual |

---

## 5. Modelo mental (o que o usuário deve entender)

### 5.1 Pergunta que a aba responde

> **"Quanto entrou, quanto saiu e qual o saldo operacional no período que escolhi?"**

Não responde: DRE contábil completo, posição de todas as contas bancárias, nem fechamento mensal conferido.

### 5.2 Eixo temporal

| Conceito | Regra |
|----------|-------|
| Período da toolbar | `from` / `to` — presets (7d, 30d, mês) ou custom |
| KPIs Recebido / Despesas / Saldo | Movimentações **liquidadas** (`settled`) no intervalo, regime caixa ou competência conforme toggle |
| KPI A receber | **Snapshot do mês de referência** derivado de `to` (não do intervalo) — rotulado explicitamente |
| Comparação temporal | Período anterior de mesma duração (`previousPeriodRange`) |

### 5.3 Permissões

| Persona | Visão |
|---------|-------|
| Owner / admin | Completa: regime, breakdown, export, drill, MDR |
| Member (não gestor) | Básica: 3 KPIs de caixa + banner "Resumo básico" |
| Sem `modules.finance` | Empty state com CTA configuração |

---

## 6. User Stories

### Owner / admin

- Quero ver recebido, despesas e saldo do período com **definição clara** (tooltip) para confiar nos números.
- Quero saber se o saldo **subiu ou caiu** vs o período anterior.
- Quero **clicar em um KPI** e ver os lançamentos que compõem aquele número.
- Quero **exportar** breakdown por forma de pagamento e totais.
- Quero atalhos para **DRE**, **Fechamento** e **A receber** sem perder o contexto do período.
- Quero ver **faturamento bruto vs taxas (MDR)** quando houver cartão no período.

### Recepção / member

- Quero ver um resumo do caixa do período sem acesso a detalhes sensíveis.
- Quero entender que estou vendo uma **visão resumida**, não um bug.

### Edge cases

- Período vazio: CTA "Ir para Lançamentos" com filtro do período.
- Truncamento (>2.500 TX): aviso + sugestão de reduzir intervalo (já existe; manter).
- Regime competência com CMV: nota alinhada ao `FinanceRegimeToggle`.
- Erro de rede: mensagem amigável + retry (paridade com aba Vendas).

---

## 7. Requisitos e critérios de aceite

### Fase 1 — P0 Correções e paridade mínima

#### R1. Corrigir copy do card na Visão Geral

- **Quando** owner vê o card "Relatórios financeiros" em `VisaoGeralTab`
- **Então** descrição = *"Resumo de caixa por período e breakdown por forma de pagamento"*
- **E** não menciona DRE

#### R2. KPI "A receber" com rótulo honesto

- Label: **"A receber ({mês/ano})"** onde mês/ano = `to` formatado (ex.: "jul/2026")
- Sublabel ou tooltip: *"Total em aberto no mês de referência da data final — não segue o intervalo da toolbar"*
- Link secundário: "Ver a receber →" → `/financeiro?tab=a-receber&month=YYYY-MM`

#### R3. Banner para visão `basic` (membros)

- **Dado** resposta com `scope: 'basic'` ou `limited: true`
- **Então** `StatusBanner` info: *"Resumo básico — detalhes, exportação e breakdown disponíveis para gestores"*
- **E** não exibir empty state `permissionDenied` (código morto para `type=finance`)

#### R4. Tooltips nos KPIs principais

- Recebido → `reportKpiTooltip('financeReceived')`
- Despesas → `reportKpiTooltip('financeExpenses')`
- Saldo → `reportKpiTooltip('financeBalance')`
- Paridade com `ReportsStudentsPanel`

#### R5. Destaque visual do saldo

- Saldo > 0 → `highlight="success"`
- Saldo < 0 → `highlight="danger"`
- Saldo = 0 → `highlight="default"`

#### R6. Empty state com CTA

- Botão primário: **"Ir para Lançamentos"** → `/financeiro?tab=movimentacoes` com `from`/`to` do período (query ou state)

#### R7. Erro amigável

- Usar `friendlyError(e, 'load')` como em `ReportsLojaPanel`

#### R8. Breakdown por forma com percentual

- Cada linha: `{label} · {pct}%` + valor formatado
- Ordenação por valor decrescente (já existe)

#### R9. Barra de atalhos operacionais

Abaixo dos KPIs, links inline (mesmo padrão `reports-inline-link`):

| Link | Destino |
|------|---------|
| Lançamentos | `/financeiro?tab=movimentacoes&from=&to=` |
| DRE e DFC | `/financeiro?tab=dre` |
| Fechamento | `/financeiro?tab=fechamento` |
| A receber | `/financeiro?tab=a-receber&month=` |

### Fase 2 — P1 Profundidade analítica

#### R10. Comparação vs período anterior

- Buscar resumo do período anterior via mesma API (`previousPeriodRange`)
- Exibir `trend` e `trendLabel` nos KPIs Recebido, Despesas e Saldo (padrão `ReportsStudentsPanel`)
- Se período anterior sem dados: omitir trend (não mostrar 0% enganoso)

#### R11. Drill-down nos KPIs

- Recebido e Despesas clicáveis (`report-kpi-card--clickable`)
- Abre drawer/modal somente leitura com lista de lançamentos do período filtrados por direção
- Linha: data, descrição, valor, forma de pagamento
- CTA no rodapé: "Abrir em Lançamentos" com filtros aplicados
- **Implementação:** reutilizar padrão `ReportsDrillDialog` ou `FinanceTxDetailDrawer` em modo lista

#### R12. Bloco MDR (quando aplicável)

- Se `fees > 0` no período: linha extra ou mini-seção
  - Faturamento bruto
  - Taxas (MDR)
  - Recebido líquido
- Dados de `aggregateRevenueBreakdown` expostos no payload `reports-light` (ver TECH)
- Tooltip referenciando spec bruto/taxa/líquido

#### R13. Refresh manual na aba financeiro

- Header de Relatórios exibe botão Atualizar quando `activeTab === 'financeiro'`
- Clique refetch da aba (ignora cache cliente se houver)
- Estado busy no botão durante load

#### R14. Export CSV expandido

- Incluir: totais, MDR (se houver), breakdown por forma com %, metadados (período, regime)
- Nome: `relatorio-financeiro-{from}_{to}.csv`

### Fase 3 — P2 Futuro

#### R15. Gráfico de evolução

- Linha ou barras: recebido vs despesas por semana dentro do período
- Reutilizar `ReportsChart` + recharts (padrão Alunos)

#### R16. Metas KPI para Recebido e Despesas

- Estender `REPORT_KPI_GOAL_KEYS` e UI de metas em Empresa

#### R17. Filtro por conta bancária

- Só se demanda recorrente; requer parâmetro extra na API

---

## 8. Wireframes ASCII (referência)

### Layout alvo — Fase 1+2

```
┌─ Relatórios › Financeiro ─────────────────────────────────────┐
│ [Toolbar período: 7d | 30d | mês | custom]     [Exportar CSV] │
├───────────────────────────────────────────────────────────────┤
│ ℹ Resumo básico — ... (só membros)                            │
├───────────────────────────────────────────────────────────────┤
│ Resumo financeiro · 01/07 — 12/07/2026                        │
│ [Caixa | Competência]                                         │
│ Movimentações liquidadas · regime caixa                       │
│                                                               │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────────┐   │
│ │Recebido │ │Despesas │ │ Saldo   │ │ A receber (jul/26)│   │
│ │ R$ X    │ │ R$ Y    │ │ R$ Z ↑5%│ │ R$ W              │   │
│ │ 12 lanç.│ │ 8 lanç. │ │ meta ✓  │ │ snapshot mês    │   │
│ └─────────┘ └─────────┘ └─────────┘ └──────────────────┘   │
│                                                               │
│ Lançamentos · DRE · Fechamento · A receber                    │
├───────────────────────────────────────────────────────────────┤
│ Recebimentos por forma de pagamento                           │
│ PIX ····················· 62% · R$ 3.100                      │
│ Cartão crédito ·········· 28% · R$ 1.400                      │
├───────────────────────────────────────────────────────────────┤
│ Faturamento e taxas (se MDR > 0)                              │
│ Bruto R$ 4.600 · Taxas R$ 100 · Líquido R$ 4.500             │
└───────────────────────────────────────────────────────────────┘
```

### Drill-down (clique em Recebido)

```
┌─ Recebimentos no período ─────────────────────── [×] ─┐
│ 12 lançamentos · R$ 4.500 total                       │
├───────────────────────────────────────────────────────┤
│ 10/07  Mensalidade João Silva    PIX      R$ 200      │
│ 09/07  Kimono venda              Cartão   R$ 350      │
│ ...                                                   │
├───────────────────────────────────────────────────────┤
│              [Abrir em Lançamentos →]                 │
└───────────────────────────────────────────────────────┘
```

---

## 9. Copy deck (strings canônicas)

| Chave | PT-BR |
|-------|-------|
| `reports.finance.section.title` | Resumo financeiro |
| `reports.finance.section.subtitle` | Movimentações liquidadas · {from} — {to} |
| `reports.finance.basicScope.banner` | Resumo básico — detalhes, exportação e breakdown disponíveis para gestores da academia. |
| `reports.finance.kpi.receivables` | A receber ({monthShort}) |
| `reports.finance.kpi.receivables.hint` | Total em aberto no mês de referência da data final. Não segue o intervalo selecionado acima. |
| `reports.finance.empty.title` | Nenhuma movimentação liquidada no período |
| `reports.finance.empty.cta` | Ir para Lançamentos |
| `reports.finance.links.lancamentos` | Lançamentos |
| `reports.finance.links.dre` | DRE e DFC |
| `reports.finance.links.fechamento` | Fechamento |
| `reports.finance.links.receivables` | A receber |
| `reports.finance.mdr.title` | Faturamento e taxas |
| `reports.finance.mdr.gross` | Faturamento bruto |
| `reports.finance.mdr.fees` | Taxas (MDR) |
| `reports.finance.mdr.net` | Recebido líquido |
| `overview.reportsCard.desc` | Resumo de caixa por período e breakdown por forma de pagamento |

---

## 10. Success Metrics

| Métrica | Alvo (30 dias pós-ship) |
|---------|-------------------------|
| Cliques drill → Lançamentos | ≥ 20% das sessões com dados no período |
| Tickets "relatório financeiro confuso" | Redução ≥ 50% vs baseline informal |
| Uso da aba vs atalho direto ao Financeiro | Estável ou ↑ (não cannibalizar negativamente) |
| Task success (owner: explicar saldo) | 5/5 usuários internos identificam período e regime corretamente |

---

## 11. Validação

### Manual

- [ ] Card Visão Geral sem menção a DRE
- [ ] Preset 7d: "A receber" mostra mês de `to`, não soma dos 7 dias
- [ ] Member: banner básico + KPIs sem breakdown
- [ ] Owner: tooltips nos 3 KPIs principais
- [ ] Saldo negativo em vermelho
- [ ] Empty state → Lançamentos com período
- [ ] Breakdown com % somando ~100%
- [ ] Drill abre lista coerente com total do KPI
- [ ] MDR visível quando há taxa de cartão no período
- [ ] Atualizar no header recarrega aba financeiro
- [ ] Mobile: grade KPI 2×2, links empilhados

### Automatizado

- `npm test -- reportsFinanceParity reportsLight reportsFinancePanel`
- Novos testes: copy helpers, % breakdown, basic scope banner, drill payload

### Governança docs

- Atualizar `docs/flows/analise/relatorios-indicadores.md` (Seção Financeiro)
- Registrar em `docs/flows/VALIDATION.md`

---

## 12. Open Questions

| # | Pergunta | Dono | Bloqueante? |
|---|----------|------|-------------|
| Q1 | Drill usa modal novo ou reutiliza `FinanceTxDetailDrawer` em lista? | Eng | Não — default: modal lista dedicado |
| Q2 | Lista de lançamentos no drill: limite (50?) + "ver todos"? | Produto | Não — default: 50 + CTA Lançamentos |
| Q3 | Remover KPI "A receber" e deixar só link? | Produto | Não — default: manter com rótulo honesto |
| Q4 | Member deve ver KPI "A receber"? | Produto | Não — default: sim, é operacional |
| Q5 | Incluir despesas por categoria no P1? | Produto | Não — P2 |

---

## 13. Fases de entrega

| Fase | Escopo | Entregável |
|------|--------|------------|
| **1** | P0 — copy, tooltips, banner basic, CTA, %, atalhos, saldo colorido | PR focado em `ReportsFinancePanel` + `VisaoGeralTab` |
| **2** | P1 — trend, drill, MDR, refresh header, export expandido | PR + extensão payload `reports-light` |
| **3** | P2 — gráfico, metas extras, filtro conta | Spec futura se Fase 2 validar adoção |

**Estimativa:** Fase 1 ≈ 1 PR (~300 LOC); Fase 2 ≈ 1–2 PRs (~600 LOC).
