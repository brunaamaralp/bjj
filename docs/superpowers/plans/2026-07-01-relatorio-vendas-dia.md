# Relatório diário de vendas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um mini-relatório **por dia calendário** (não por turno de caixa) com tudo que foi vendido — visível, copiável e exportável em CSV — acessível de forma prática no fluxo da recepcionista (Histórico de vendas / Loja).

**Architecture:** Novo endpoint `GET /api/sales?action=daily_report&date=YYYY-MM-DD` no hub `sales` existente (`api/leads.js`), agregando **todas** as vendas da academia naquele dia (Loja, perfil do aluno, modal Nova venda). Lib compartilhada formata texto WhatsApp + linhas CSV; modal de preview na UI reutiliza padrões de `SalesReceiptPanel` e `ReportsLojaPanel`.

**Tech Stack:** React (Vite), Appwrite (`sales`, `sale_items`), Vitest, `downloadCsv` (`reportsExport.js`), handler em `lib/server/` (sem novo arquivo em `/api/` — limite Hobby 12/12).

**Fora de escopo (v1):** turno de caixa (`cash_shifts`), mensalidades, snapshot imutável, PDF do relatório (só CSV + copiar + imprimir HTML).

**Specs (criar antes de implementar):**
- [ ] `docs/superpowers/specs/2026-07-01-relatorio-vendas-dia-PRODUCT.md`
- [ ] `docs/superpowers/specs/2026-07-01-relatorio-vendas-dia-TECH.md`

---

## Contexto e decisões de produto

### Problema

A recepcionista vende **pelo perfil do aluno**, quase não usa dinheiro físico e **não** deve depender de abrir/fechar turno. Hoje:

- `SalesHistoryTab` mostra lista + totais, mas **sem exportar** e sem resumo formatado.
- `ReportsLojaPanel` exporta CSV, mas exige ir em Relatórios e é agregado por **período**, não ritual de fim de dia.
- Turno PDV não reflete o uso real.

### Princípios

| Decisão | Escolha |
|---------|---------|
| Unidade | **Dia calendário** (`YYYY-MM-DD`), default **hoje** |
| Escopo de vendas | Todas com `$createdAt` no dia; **inclui** perfil aluno, Loja, modal |
| Filtro `cash_shift_id` | **Ignorar** — relatório independente de turno |
| Receita | Somar `status === concluida` |
| A receber | Seção separada (`pendente` / `deferred`) |
| Canceladas | Seção separada (contagem + lista resumida) |
| Mensalidades | **Fora** do v1 (módulo/pagamentos distinto) |
| Timezone | Mesmo critério de `parsePeriodBounds` / Histórico (consistência); issue futura se servidor UTC deslocar borda |

### Conteúdo do mini-relatório (v1)

**Cabeçalho:** academia, data, gerado em.

**Resumo:**
- Vendas concluídas (qtd + total R$)
- Ticket médio
- Cancelamentos (qtd)
- Vendas a receber (qtd + total, se houver)

**Por forma de pagamento** (só concluídas): PIX, débito, crédito, dinheiro, split — reutilizar `normalizePaymentForma` / `parsePagamentosJson`.

**Por origem (opcional v1, baixo custo):**
- Com aluno (`aluno_id` preenchido) vs cliente avulso

**Lista de vendas concluídas** (ordenada por hora):
- Hora · `#ID` · Cliente · Itens (resumo ou expandido) · Total · Pagamento · Operador (`created_by_name` se existir)

**Ações UI:** Copiar texto · Exportar CSV · Imprimir (`window.print()`)

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/server/salesDailyReportHandler.js` | Lista vendas do dia, enriquece itens, agrega totais |
| `lib/server/salesHistoryHandler.js` | Roteia `action=daily_report` (ou import handler) |
| `api/leads.js` | Branch `action === 'daily_report'` antes do GET list |
| `src/lib/salesDailyReport.js` | Tipos leves, `buildDailyReportText`, `buildDailyReportCsvRows` |
| `src/lib/salesDailyReportApi.js` | `fetchSalesDailyReport(date)` |
| `src/components/sales/SalesDailyReportModal.jsx` | Preview + copiar / CSV / imprimir |
| `src/components/sales/SalesHistoryTab.jsx` | Botão "Resumo do dia", atalho "Hoje" |
| `src/test/salesDailyReport.test.js` | Agregação, texto, CSV |
| `src/test/salesDailyReportHandler.test.js` | Handler (mock DB) |
| `docs/flows/vendas/pdv-nova-venda.md` | Nota: relatório diário no Histórico |

---

## Fase 0 — Specs (PRODUCT + TECH)

### Task 0: Escrever specs

**Files:**
- Create: `docs/superpowers/specs/2026-07-01-relatorio-vendas-dia-PRODUCT.md`
- Create: `docs/superpowers/specs/2026-07-01-relatorio-vendas-dia-TECH.md`

- [ ] **Step 1:** PRODUCT — persona (recepcionista), jornada fim de dia, critérios de aceite, fora de escopo
- [ ] **Step 2:** TECH — contrato JSON do endpoint, colunas CSV, limites (max vendas/dia paginadas no server)
- [ ] **Step 3:** Revisão rápida alinhada a este plano

---

## Fase 1 — Backend: `daily_report`

### Task 1: Extrair listagem completa do dia

**Files:**
- Create: `lib/server/salesDailyReportHandler.js`
- Reuse: `listSaleItems`, `enrichSaleItems`, `loadLeadNames`, `mapSaleDoc` de `salesHistoryHandler.js`

- [ ] **Step 1: Write failing test** — `salesDailyReportHandler.test.js`: dia com 2 vendas concluídas retorna `summary.concluded_count === 2`

- [ ] **Step 2:** Implementar `listAllAcademySalesForDay(academyId, dateYmd)` — loop paginado (limit 100, max 20 páginas = 2000 vendas/dia safety cap)

- [ ] **Step 3:** Filtrar por academy; bounds via `parsePeriodBounds(dateYmd, dateYmd)`

- [ ] **Step 4:** Run tests — `npm test -- salesDailyReportHandler`

### Task 2: Agregação por forma de pagamento

**Files:**
- Modify: `lib/server/salesDailyReportHandler.js`
- Reuse: `aggregateShiftSales` logic from `cashShiftHandler.js` → extrair helper compartilhado `lib/server/salePaymentTotals.js` (opcional, YAGNI: copiar loop inline primeiro)

- [ ] **Step 1: Write failing test** — venda split PIX+R$ gera totais corretos por forma

- [ ] **Step 2:** `aggregatePaymentTotals(salesDocs)` — só `concluida`, tratar troco como em `aggregateShiftSales`

- [ ] **Step 3:** Run tests

### Task 3: Payload de resposta

**Files:**
- Modify: `lib/server/salesDailyReportHandler.js`

Contrato sugerido:

```json
{
  "ok": true,
  "date": "2026-07-01",
  "academy_name": "Academia X",
  "generated_at": "2026-07-01T22:15:00.000Z",
  "summary": {
    "concluded_count": 12,
    "concluded_total": 2800,
    "ticket_medio": 233.33,
    "cancel_count": 1,
    "pending_count": 2,
    "pending_total": 450
  },
  "totals_by_payment": { "pix": 890, "dinheiro": 45, "debito": 320 },
  "sales_concluded": [ /* mapSaleDoc + items[] */ ],
  "sales_cancelled": [ /* resumo curto */ ],
  "sales_pending": [ /* resumo curto */ ]
}
```

- [ ] **Step 1:** Montar payload com academy name de `ACADEMIES_COL`
- [ ] **Step 2:** Validar `date` obrigatório `YYYY-MM-DD`; 400 se inválido
- [ ] **Step 3:** Testes de contrato mínimo

### Task 4: Rota no hub sales

**Files:**
- Modify: `api/leads.js` (~linha 254)
- Modify: `lib/server/salesHistoryHandler.js` **ou** export default from daily handler called from leads

- [ ] **Step 1:** `if (action === 'daily_report' && req.method === 'GET') return salesDailyReportHandler(req, res);`
- [ ] **Step 2:** Manual smoke: `GET /api/sales?action=daily_report&date=2026-07-01` com JWT

---

## Fase 2 — Lib cliente: texto + CSV

### Task 5: `salesDailyReport.js`

**Files:**
- Create: `src/lib/salesDailyReport.js`
- Test: `src/test/salesDailyReport.test.js`

- [ ] **Step 1: Write failing test** — `buildDailyReportText` inclui total e lista de vendas

- [ ] **Step 2:** `buildDailyReportText(report)` — formato monospace/WhatsApp (sem markdown pesado)

- [ ] **Step 3:** `buildDailyReportCsvRows(report)` — bloco resumo + linhas detalhe:
  - Colunas: `tipo`, `hora`, `venda_id`, `cliente`, `itens`, `total`, `pagamento`, `status`
  - Linha `tipo=resumo` para métricas agregadas

- [ ] **Step 4:** `dailyReportFilename(date)` → `vendas-dia-YYYY-MM-DD.csv`

- [ ] **Step 5:** Run `npm test -- salesDailyReport`

### Task 6: API client

**Files:**
- Create: `src/lib/salesDailyReportApi.js`

- [ ] **Step 1:** `fetchSalesDailyReport(dateYmd)` → `salesFetch('/api/sales?action=daily_report&date=' + dateYmd)`

---

## Fase 3 — UI: modal + Histórico

### Task 7: `SalesDailyReportModal`

**Files:**
- Create: `src/components/sales/SalesDailyReportModal.jsx`
- Reuse: `ModalShell`, `downloadCsv`, `useUiStore` toasts, padrão copy de `SalesHistoryTab.copyReceipt`

- [ ] **Step 1:** Props: `open`, `onClose`, `dateYmd`, `academyName`
- [ ] **Step 2:** Loading / Error (`ErrorBanner` + retry)
- [ ] **Step 3:** Preview `<pre>` ou layout estruturado com seções
- [ ] **Step 4:** Botões: **Copiar resumo**, **Exportar CSV**, **Imprimir**
- [ ] **Step 5:** CSS print `@media print` — esconder chrome do modal

### Task 8: Integrar em `SalesHistoryTab`

**Files:**
- Modify: `src/components/sales/SalesHistoryTab.jsx`

- [ ] **Step 1:** Chip/botão **Hoje** — seta `period.from` e `period.to` para `toDateInput(new Date())`

- [ ] **Step 2:** Botão **Resumo do dia** na toolbar (ao lado dos filtros):
  - Se `period.from === period.to` → usa essa data
  - Senão → usa **hoje** (com hint tooltip)

- [ ] **Step 3:** Abre `SalesDailyReportModal`

- [ ] **Step 4:** Empty state: relatório com zeros + mensagem amigável (não erro)

### Task 9: CSS

**Files:**
- Modify: `src/styles/sales.css` ou `finance-shell.css` (seguir padrão existente)

- [ ] **Step 1:** Classes `sales-daily-report__*` — preview, toolbar, print layout

---

## Fase 4 — Testes e docs

### Task 10: Testes integração leve

- [ ] **Step 1:** Handler test com mocks Appwrite (padrão `financeClosingHandler.test.js`)
- [ ] **Step 2:** `npm test -- salesDailyReport` verde

### Task 11: Documentação de fluxo

**Files:**
- Modify: `docs/flows/vendas/pdv-nova-venda.md`

- [ ] **Step 1:** Seção "Fechamento operacional do dia" — Histórico → Resumo do dia → copiar/CSV
- [ ] **Step 2:** Nota: independente de turno de caixa; inclui vendas pelo perfil do aluno
- [ ] **Step 3:** Atualizar checklist Seção A (1 item)

---

## Fase 5 — Melhorias sugeridas no chat (backlog pós-v1)

Priorizar **depois** do MVP validado em produção:

| # | Melhoria | Esforço | Notas |
|---|----------|---------|-------|
| B1 | Atalho global sidebar "Resumo de vendas de hoje" | P | `naviMenu.js` action ou link `/loja?tab=vendas&subtab=history&day=today&report=1` |
| B2 | Top produtos do dia (qtd + R$) | P | Agregar `sale_items` no handler |
| B3 | Exportar só concluídas vs completo | P | Toggle no modal |
| B4 | Deep link `?report=1&date=` | P | Abrir modal ao carregar Histórico |
| B5 | PDF do relatório | M | Reuse `generateSaleReceiptPdf` patterns / pdf skill |
| B6 | Snapshot diário opcional | M | Nova coleção ou blob — só se precisar auditoria imutável |
| B7 | Indicador turno aberto (sidebar) | M | **Separado** — só se voltar a usar turno |
| B8 | Alinhar timezone academy | M | Spec própria; afeta Histórico também |
| B9 | Incluir mensalidades recebidas no balcão | G | Escopo "fechamento completo recepção" |

**Explicitamente não fazer agora:** relatório por turno (`shift_report`), integração sangria/suprimento, sync turno ↔ financeiro.

---

## Critérios de aceite (v1)

1. Recepcionista abre **Loja → Vendas → Histórico**, clica **Resumo do dia** e vê vendas de **hoje** (incl. perfil aluno).
2. **Copiar** cola texto legível no WhatsApp/Notes.
3. **Exportar CSV** baixa arquivo `vendas-dia-YYYY-MM-DD.csv` com resumo + linhas.
4. **Imprimir** gera página limpa para arquivo físico.
5. Totais por forma batem com soma manual de vendas concluídas do dia.
6. Vendas canceladas aparecem em seção própria, **não** entram no total concluído.
7. Sem novo arquivo em `/api/` (Hobby).

---

## Ordem de implementação recomendada

```
Fase 0 (specs) → Fase 1 (backend) → Fase 2 (lib) → Fase 3 (UI) → Fase 4 (tests/docs)
```

Estimativa: **1 PR focado** (MVP completo) ou **2 PRs** (PR1 backend+lib+tests, PR2 UI+docs).

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Dia com >2000 vendas | Cap + log warning; paginação no relatório v2 |
| N+1 queries (itens por venda) | Aceitável v1 (<100 vendas/dia típico); batch `sale_items` v2 |
| UTC no server | Documentar; usar mesma data que Histórico já usa |
| Relatório "ao vivo" muda após cancelamento | Esperado v1; mencionar na UI "dados em tempo real" |

---

## Test plan manual

1. Registrar 2 vendas concluídas (1 pelo aluno PIX, 1 avulsa cartão) + 1 cancelada.
2. Abrir Resumo do dia → conferir 2 concluídas, totais PIX/cartão, 1 cancelada listada.
3. Copiar → colar e validar legibilidade.
4. CSV → abrir no Excel/Sheets, conferir colunas.
5. Imprimir → preview sem botões.
6. Filtrar Histórico ontem → Resumo do dia usa data do filtro (from=to).
