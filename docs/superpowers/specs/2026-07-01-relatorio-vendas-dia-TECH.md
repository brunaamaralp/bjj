# Relatório diário de vendas — TECH

**Data:** 2026-07-01  
**PRODUCT:** [2026-07-01-relatorio-vendas-dia-PRODUCT.md](./2026-07-01-relatorio-vendas-dia-PRODUCT.md)

---

## 1. API

**Rota:** `GET /api/sales?action=daily_report&date=YYYY-MM-DD`  
**Hub:** `api/leads.js?hub=sales` (rewrite existente)

**Auth:** `ensureAuth` + `ensureAcademyAccess` (mesmo padrão `salesHistoryHandler`)

**Query:**

| Param | Obrigatório | Descrição |
|-------|-------------|-----------|
| `date` | Sim | `YYYY-MM-DD` |
| `action` | Sim | `daily_report` |

**Erros:**

| Status | code | Quando |
|--------|------|--------|
| 400 | `invalid_date` | Formato inválido |
| 503 | `sales_not_configured` | Coleções ausentes |

---

## 2. Response JSON

```json
{
  "ok": true,
  "date": "2026-07-01",
  "academy_name": "Academia X",
  "generated_at": "ISO8601",
  "summary": {
    "concluded_count": 12,
    "concluded_total": 2800,
    "ticket_medio": 233.33,
    "cancel_count": 1,
    "pending_count": 2,
    "pending_total": 450
  },
  "totals_by_payment": { "pix": 890, "dinheiro": 45 },
  "sales_concluded": [],
  "sales_cancelled": [],
  "sales_pending": [],
  "truncated": false
}
```

**`sales_*` items:** mesmo shape de `mapSaleDoc` + `operator_name` (`created_by_name`).

**Período:** `parsePeriodBounds(date, date)` — alinhado ao Histórico.

**Paginação interna:** até 20 páginas × 100 docs; `truncated: true` se cap atingido.

---

## 3. Agregação pagamentos

Reutilizar lógica de `cashShiftHandler.aggregateShiftSales`:

- `parsePagamentosJson` + `normalizePaymentForma`
- Troco debita forma de troco
- Legado: `forma_pagamento` + `total` se sem `pagamentos_json`
- **Somente** vendas `status === concluida`

---

## 4. Arquivos

| Arquivo | Papel |
|---------|-------|
| `lib/server/salePaymentTotals.js` | `aggregatePaymentTotalsFromSaleDocs` |
| `lib/server/salesDailyReportBuild.js` | `buildDailyReportPayload`, `parseReportDateYmd` |
| `lib/server/salesDailyReportHandler.js` | HTTP |
| `lib/server/salesHistoryHandler.js` | exports helpers compartilhados |
| `api/leads.js` | branch `daily_report` |

**Fase 2 (UI):**

| Arquivo | Papel |
|---------|-------|
| `src/lib/salesDailyReport.js` | texto + CSV rows |
| `src/lib/salesDailyReportApi.js` | fetch client |
| `src/components/sales/SalesDailyReportModal.jsx` | modal |

---

## 5. Testes

- `src/test/salesDailyReport.test.js` — build + aggregate + parse date
- `src/test/salesDailyReportHandler.test.js` — HTTP mock Appwrite

```bash
npm test -- salesDailyReport
```
