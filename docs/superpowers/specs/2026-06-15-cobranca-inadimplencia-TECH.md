# Tela de Cobrança (inadimplência acumulada) — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-cobranca-inadimplencia-PRODUCT.md](./2026-06-15-cobranca-inadimplencia-PRODUCT.md)

---

## 1. Arquitetura

```
GET /api/finance?route=collection-queue
  → collectionQueueHandler.js
  → listAcademyStudentsMapped + listOpenGridPayments + financeConfig
  → buildCollectionQueue (src/lib/collectionQueue.js)

ReceivablesTab → section=cobranca → CobrancaPanel.jsx
  → fetchCollectionQueue()
  → CobrancaRowActions.jsx (extraído de CollectionInadimplenciaPanel)
```

Sem novo arquivo em `/api/` — rota em `api/finance.js`.

---

## 2. `buildCollectionQueue`

**Arquivo:** `src/lib/collectionQueue.js`

**Entrada:** `{ students, paymentsByLeadMonth, financeConfig, collectionRules, today, lookbackMonths=12 }`

**Por aluno ativo com plano:**
1. Meses de `max(enrollment, today−12m)` até mês atual
2. Para cada mês: pagamento do mapa ou `null`; `getPaymentRowStatus` + `openMensalidadeAmount`
3. Incluir se `daysOverdue >= 1` e `amount >= 0.01`
4. Agregar: `openMonths[]`, `totalOpen`, `oldestDaysOverdue`, `stage` via `resolveCollectionStage`

**`paymentsByLeadMonth`:** `Map<`${leadId}|${ym}`, paymentDoc>`

**Snooze:** `isCollectionSnoozed(student, currentMonth)` no row.

---

## 3. API response

```json
{
  "ok": true,
  "summary": { "students": 8, "totalOpen": 3200, "byStage": { "1": 3, "7": 2 } },
  "rows": [{
    "studentId": "...",
    "name": "...",
    "phone": "...",
    "plan": "...",
    "totalOpen": 400,
    "oldestDaysOverdue": 45,
    "stage": { "day": 30, "label": "Escalar" },
    "snoozed": false,
    "openMonths": [{
      "referenceMonth": "2026-04",
      "amount": 200,
      "daysOverdue": 45,
      "dueDate": "2026-04-10",
      "paymentId": "..."
    }]
  }]
}
```

---

## 4. UI

| Arquivo | Papel |
|---------|-------|
| `RECEIVABLES_SECTIONS.COBRANCA` | `financeiroReceivablesSections.js` |
| `CobrancaPanel.jsx` | painel principal |
| `CobrancaRowActions.jsx` | WhatsApp / negociar / adiar |
| `ReceivablesTab.jsx` | 4ª sub-aba + badge count |
| `collectionQueueApi.js` | `fetchCollectionQueue` |

**Pagamento:** `CobrancaPanel` emite evento ou abre modal mínimo; v1 navega para Mensalidades com `search` + `reference_month` query ou reutiliza modal via props de MensalidadesPanel (extrair callback).

**MensalidadesPanel:** remover `<details>` da régua; chip “Em atraso” → `buildReceivablesPath({ section: COBRANCA })`.

---

## 5. Deep links

- `buildReceivablesPath({ section: 'cobranca' })`
- `filtro=overdue` → redirect `section=cobranca` (Caixa ou MensalidadesPanel effect)
- `naviMenu.js`: `section=cobranca` ativa item A receber

---

## 6. Testes

- `src/test/collectionQueue.test.js`
- `tests/unit/finance/collectionQueueHandler.test.js`
- `src/test/financeiroReceivablesSections.test.js` (extend)
- `src/test/cobrancaPanel.test.jsx`
