# Pagamentos do aluno ↔ Lançamentos (Caixa) — correção de espelhamento — TECH Spec

**Data:** 2026-06-25  
**PRODUCT:** [2026-06-25-student-payment-caixa-mirror-correction-PRODUCT.md](./2026-06-25-student-payment-caixa-mirror-correction-PRODUCT.md)  
**Status:** implementado (2026-06-25)

---

## 1. Diagnóstico técnico

### 1.1 Arquitetura atual

```
StudentProfile.jsx
  → apiCreateStudentPayment / apiUpdateStudentPayment (studentPaymentsApi.js)
  → POST/PATCH /api/student-payments (rewrite → api/finance.js?route=student-payments)
  → studentPaymentsHandler.js
       → writePaymentDocument (student_payments)
       → maybeMirrorPaymentToCaixa
            → mirrorStudentPaymentToFinancialTx (studentPaymentFinancialTxMirror.js)
                 → FINANCIAL_TX (origin_type: student_payment)
                 → mirrorStudentPaymentTroco (origin_type: student_payment_troco)
```

**Espelha quando:** `shouldMirrorPaymentToCaixa(status)` → `paid` | `partial` (`paymentStatus.js`).

**Não espelha (intencional):** `pending`, `awaiting`, `covered`, `frozen`, `cancelled`; bundle filhos (`skipMirror: i !== 0` em `createBundlePayment`).

### 1.2 Lacunas confirmadas

| # | Lacuna | Arquivo(s) | Impacto |
|---|--------|------------|---------|
| L1 | Reconcile só `isGridPayment` (plan/bundle) | `studentPaymentReconcileCore.js` | fee/other órfãos nunca reparados |
| L2 | DELETE cancela só `financial_tx_id` | `studentPaymentsHandler.js` `handleDeleteStudentPayment` | troco órfão; tx sem writeback permanece |
| L3 | PATCH `cancelled` espelha via mirror (cancela tx) mas log alerta manual | `handlePatchStudentPayment` | troco não cancelado explicitamente |
| L4 | `financial_tx_sync_pending` só client | `src/lib/studentPayments.js` | falha API sem flag persistida |
| L5 | fee/other espelham como `MENSALIDADE` | `studentPaymentFinancialTxMirror.js` | DRE incorreto |
| L6 | `updatePayment` forceLocal sem mirror | `src/lib/studentPayments.js` | edição offline desincroniza |
| L7 | Client delete local sem cancel tx | `deletePayment` fallback | idem L2 em dev/legacy |

### 1.3 Referências de código

```303:306:src/lib/paymentStatus.js
export function shouldMirrorPaymentToCaixa(status) {
  const s = String(status || '').toLowerCase();
  return s === 'paid' || s === 'partial';
}
```

```40:47:lib/server/studentPaymentReconcileCore.js
export async function paymentNeedsMirrorRepair(paymentDoc) {
  if (!paymentDoc || !isGridPayment(paymentDoc)) return false;
  ...
}
```

```883:896:lib/server/studentPaymentsHandler.js
    const txId = String(prev.financial_tx_id || '').trim();
    if (txId) {
      ...
      await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, txId, { status: 'cancelled' });
```

---

## 2. Design da correção

### 2.1 Helper central: `cancelFinancialTxMirrorsForPayment`

**Novo módulo:** `lib/server/studentPaymentMirrorCancel.js` (ou export em `studentPaymentFinancialTxMirror.js`).

```js
/**
 * Cancela todos os lançamentos espelhados de um pagamento de aluno.
 * @returns {{ cancelledIds: string[], errors: string[] }}
 */
export async function cancelFinancialTxMirrorsForPayment(paymentId, { explicitTxId = '' } = {}) {
  // 1) listDocuments origin_type=student_payment + origin_id=paymentId (limit 10)
  // 2) listDocuments origin_type=student_payment_troco + origin_id=paymentId (limit 5)
  // 3) incluir explicitTxId / financial_tx_id se não duplicado
  // 4) para cada id único: updateDocument status=cancelled (skip se já cancelled)
}
```

Reutilizar `findMainTxForPayment`, `findTrocoTxForPayment` já existentes em `studentPaymentFinancialTxMirror.js`.

**Chamar de:**

- `handleDeleteStudentPayment`
- `handlePatchStudentPayment` quando `isReverse` ou status final `cancelled`
- (opcional P1) client `deletePayment` fallback — preferir sempre API

Substituir bloco inline de DELETE que só usa `financial_tx_id`.

### 2.2 Ampliar elegibilidade de reconcile

**Arquivo:** `lib/server/studentPaymentReconcileCore.js`

Renomear/conceituar:

```js
function shouldReconcileMirrorForPayment(doc) {
  const st = String(doc?.status || '').toLowerCase();
  if (!shouldMirrorPaymentToCaixa(st)) return false;
  const cat = normalizePaymentCategory(doc?.payment_category);
  // plan | bundle | fee | other | legado sem category (= plan)
  return (
    cat === PAYMENT_CATEGORY.PLAN ||
    cat === PAYMENT_CATEGORY.BUNDLE ||
    cat === PAYMENT_CATEGORY.FEE ||
    cat === PAYMENT_CATEGORY.OTHER
  );
}
```

- Remover dependência exclusiva de `isGridPayment` em `paymentNeedsMirrorRepair`.
- Manter filtro de listagem do cron: `status in [paid, partial]` — OK.
- **Não** incluir `covered` (não espelha).

**Testes:** estender `src/test/studentPaymentReconcileCore.test.js` com fee paid sem `financial_tx_id`.

### 2.3 Flag `financial_tx_sync_pending` no servidor

**Arquivo:** `lib/server/studentPaymentsHandler.js`

Extrair (espelhar client):

```js
async function markFinancialTxSyncPending(paymentId) { ... }

async function clearFinancialTxSyncPending(paymentId) {
  try {
    await databases.updateDocument(DB_ID, PAYMENTS_COL, paymentId, {
      financial_tx_sync_pending: false,
    });
  } catch { /* strip unknown attr */ }
}
```

Em `maybeMirrorPaymentToCaixa`:

```js
async function maybeMirrorPaymentToCaixa(paymentDoc, payload, financeConfig, studentDoc) {
  const paymentId = paymentDoc?.$id;
  try {
    const result = await mirrorStudentPaymentToFinancialTx({ ... });
    if (result.mirrorId && !result.warning) {
      await clearFinancialTxSyncPending(paymentId);
    } else if (shouldMirrorPaymentToCaixa(payload.status ?? paymentDoc.status)) {
      await markFinancialTxSyncPending(paymentId);
    }
    return result;
  } catch (e) {
    await markFinancialTxSyncPending(paymentId);
    ...
  }
}
```

**Reconcile success:** após `mirrorId` OK, flag false (dentro de `mirrorStudentPaymentToFinancialTx` ou reconcile loop).

### 2.4 Categoria do espelho por `payment_category` (P1)

**Arquivo:** `lib/server/studentPaymentFinancialTxMirror.js` (+ espelho client `syncFinancialTxMirror` se ainda usado)

```js
import { PAYMENT_CATEGORY, normalizePaymentCategory } from '../../src/lib/paymentCategories.js';

function resolveMirrorFinanceCategory(paymentCategory) {
  const cat = normalizePaymentCategory(paymentCategory);
  if (cat === PAYMENT_CATEGORY.FEE || cat === PAYMENT_CATEGORY.OTHER) {
    return FINANCE_CATEGORIES.OUTROS_RECEITA;
  }
  return FINANCE_CATEGORIES.MENSALIDADE;
}
```

Aplicar em `mirrorPayload.type` / `.category` e em `applyAccountingSideEffectsAutoServer`.

**Retrocompat:** txs antigas fee como Mensalidade — backfill **não** recategoriza automaticamente (somente novos writes + optional script).

### 2.5 Fix `updatePayment` local

**Arquivo:** `src/lib/studentPayments.js`

```js
export async function updatePayment(paymentId, data, opts = {}) {
  if (!opts.forceLocal && import.meta.env.VITE_USE_STUDENT_PAYMENTS_API !== 'false') {
    return apiUpdateStudentPayment(paymentId, data, opts);
  }
  ...
  return persistPaymentDocument({
    data,
    existingId: paymentId,
    permissions: buildPermissions(data),
    skipMirror: false,
    financeConfig: opts.financeConfig,
    student: opts.student,
  });
}
```

Garantir callers do fallback passem `financeConfig` / student quando disponível.

### 2.6 Alinhar client delete fallback (P0 mínimo)

Se `VITE_USE_STUDENT_PAYMENTS_API === 'false'`, documentar que delete local **não** cancela caixa — ou chamar helper client-side espelhando cancel por `origin_id` (duplicação). **Preferência:** manter API como caminho único em produção; adicionar comentário + teste que produção usa API.

---

## 3. Alterações por arquivo

| Arquivo | Mudança |
|---------|---------|
| `lib/server/studentPaymentMirrorCancel.js` | **Novo** — cancel mirrors by origin |
| `lib/server/studentPaymentFinancialTxMirror.js` | export find helpers; optional `resolveMirrorFinanceCategory` |
| `lib/server/studentPaymentsHandler.js` | DELETE/PATCH use cancel helper; sync pending flags |
| `lib/server/studentPaymentReconcileCore.js` | widen `paymentNeedsMirrorRepair` |
| `src/lib/studentPayments.js` | fix `updatePayment`; optional shared category helper import |
| `src/test/studentPaymentReconcileCore.test.js` | fee/other cases |
| `src/test/studentPaymentFinancialTxMirror.test.js` | category mapping; troco cancel |
| `src/test/studentPaymentsHandler.test.js` | DELETE cancels troco mock |
| `docs/flows/crm/aluno-perfil-presenca.md` | checklist espelho |
| `docs/flows/VALIDATION.md` | entrada pós-release |

**Sem novos arquivos em `/api/`** — reconcile já em `api/finance.js?route=student-payment-reconcile`.

---

## 4. Fluxos detalhados

### 4.1 Create / Update (sem mudança de contrato API)

Resposta continua:

```json
{
  "ok": true,
  "payment": { ... },
  "mirror_warning": "string | null"
}
```

Campo opcional novo (P1, backward compatible):

```json
"financial_tx_sync_pending": true
```

### 4.2 Delete

```
GET prev payment
→ cancelFinancialTxMirrorsForPayment(prev.$id, { explicitTxId: prev.financial_tx_id })
→ deleteDocument student_payments
→ audit log
```

Ordem: **cancelar txs antes** de apagar pagamento (permite reconcile futuro usar origin_id até delete).

### 4.3 Reverse (PATCH cancelled)

```
buildPayload → status cancelled
→ updateDocument payment
→ mirrorStudentPaymentToFinancialTx → shouldMirror false → cancel main tx (já existe)
→ ADICIONAR cancelFinancialTxMirrorsForPayment (garante troco)
```

Remover ou reduzir log `financial_tx_mirror_alert` “confira manualmente” quando cancel helper OK.

### 4.4 Reconcile manual + cron

Inalterado endpoint; ampliar universo:

`GET api/finance.js?route=student-payment-reconcile` → `studentPaymentReconcileHandler.js`

Cron: `GET /api/cron/reset-usage?action=student-payment-reconcile` (`runStudentPaymentReconcileCron.js`).

---

## 5. Testes

### 5.1 Unitários obrigatórios (P0)

| Caso | Assert |
|------|--------|
| fee paid, sem financial_tx_id | `paymentNeedsMirrorRepair` → true |
| covered bundle child | `paymentNeedsMirrorRepair` → false |
| DELETE com troco | `updateDocument` cancelled ×2 (main + troco) |
| DELETE sem financial_tx_id mas tx por origin | ambas canceladas |
| mirror fail server | `financial_tx_sync_pending: true` no payment |
| mirror success após pending | flag cleared |
| updatePayment forceLocal paid | `createDocument`/`updateDocument` FINANCIAL_TX chamado |

### 5.2 Unitários P1

| Caso | Assert |
|------|--------|
| mirror fee | `type`/`category` = OUTROS_RECEITA |
| mirror plan | MENSALIDADE inalterado |

### 5.3 Integração manual (checklist QA)

1. Perfil → taxa paga → Lançamentos (após P1 categoria correta).
2. Perfil → mensalidade pendente → **sem** lançamento.
3. Pacote 12m → 1 lançamento valor total.
4. Dinheiro + troco → 2 lançamentos; delete pagamento → ambos cancelled.
5. Simular falha env FINANCIAL_TX → flag pending + reconcile repara.
6. Conciliação → “Verificar espelhos” repara fee órfã.

---

## 6. Script backfill (P1)

`scripts/backfill-student-payment-mirrors.mjs`

```
--academy-id=XXX   # opcional
--dry-run          # default true
--limit=200
--categories=fee,other,plan,bundle  # default all mirrorable
```

Para cada pagamento paid/partial elegível:

1. Se `paymentNeedsMirrorRepair` → `mirrorStudentPaymentToFinancialTx`
2. Log `{ payment_id, action: repaired|skipped|failed }`

**Não** cancelar txs duplicadas automaticamente — log `duplicate_origin_ids` para revisão manual.

---

## 7. UI (P1)

**Arquivo candidato:** `src/components/student/StudentPaymentsList.jsx` ou `StudentFinancialTimeline.jsx`

- Se `payment.financial_tx_sync_pending`: badge warning “Caixa pendente”
- Se `payment.financial_tx_id`: link ` /financeiro?tab=movimentacoes&tx=${id}` (padrão já usado em estoque)

Permissão: `canViewStudentFinance` / módulo financeiro ativo.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Cancelar tx errada por origin_id colidido | `origin_id` = payment UUID; Query equal paymentId |
| Duplicar txs no reconcile | `findMainTxForPayment` + pick determinístico (já existe) |
| Recategorizar histórico DRE | Só novos writes; backfill opcional separado |
| Hobby function limit | Zero arquivos novos em `/api/` |

---

## 9. Ordem de implementação sugerida

1. `cancelFinancialTxMirrorsForPayment` + wire DELETE/PATCH + tests
2. Widen reconcile + tests
3. Server sync pending flags + tests
4. Fix `updatePayment` local
5. (P1) Category mapping + UI badge + backfill script
6. Docs flows + VALIDATION

---

## 10. Decisões técnicas fechadas (v1)

| Tópico | Decisão |
|--------|---------|
| Onde cancelar troco | Helper único server-side |
| Reconcile fee/other | Sim, P0 |
| Categoria fee/other | OUTROS_RECEITA (P1) |
| Novo endpoint | Não |
| Espelhar pending | Não |

---

## Histórico de revisão

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-25 | — | Criação a partir de auditoria técnica |
