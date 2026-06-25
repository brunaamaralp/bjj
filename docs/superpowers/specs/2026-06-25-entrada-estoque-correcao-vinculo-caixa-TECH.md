# Entrada de estoque — correção e vínculo com Caixa — TECH Spec

**Data:** 2026-06-25  
**PRODUCT:** [2026-06-25-entrada-estoque-correcao-vinculo-caixa-PRODUCT.md](./2026-06-25-entrada-estoque-correcao-vinculo-caixa-PRODUCT.md)  
**Status:** Spec para implementação

---

## 1. Diagnóstico técnico

### 1.1 Estado atual

| Peça | Local | Comportamento hoje |
|------|-------|-------------------|
| Entrada + valor | `lib/server/inventoryMoveHandler.js` → `maybeCreateFinanceExpense` | Cria `financial_tx` `settled`, tipo `stock_purchase` |
| Resposta | `executeInventoryMove` | Retorna `financial_tx_id`; **não grava** no movimento |
| Origem Caixa | `financial_tx` | Sem `origin_type` / `origin_id` na compra de estoque |
| UI entrada | `InventoryEntryModal.jsx`, `InventoryMovesForm.jsx` | Toast de sucesso; sem histórico |
| Correção financeira | `financeTxHandler.js` | `settled` → PATCH bloqueado; usar `financeTxReverse.js` |
| Correção estoque | `executeInventoryAdjustment` | Ajuste append-only com motivo |
| Custo médio | `weightedAverageCost.js` | WAC na entrada; sem rollback na correção |
| API estoque | `api/leads.js?route=inventory` | `action=move`, `adjust`, etc. |
| Limite Vercel | 12/12 functions | Sem novo `api/*.js` |

### 1.2 Lacunas

```
entrada + purchase_price
  → stock_moves (sem financial_tx_id)
  → financial_tx (sem origin_type=stock_entry)
  → UI sem listagem de movimentos
  → correção manual em 2 módulos desconectados
```

---

## 2. Modelo de dados

### 2.1 `STOCK_MOVES_COL` — novos/atributos usados

| Atributo | Tipo | Obrigatório | Notas |
|----------|------|-------------|-------|
| `financial_tx_id` | string(64) | Não | **Novo** — despesa vigente no Caixa |
| `purchase_price` | float | Não | Já usado em entrada |
| `payment_method` | string | Não | Gravar na entrada (hoje só vai para `financial_tx`) |
| `quantity_before` | integer | Não | **P1** — snapshot para rollback WAC |
| `average_cost_before` | float | Não | **P1** — snapshot |
| `corrected_by_move_id` | string(64) | Não | **P1** — movimento compensatório |
| `supersedes_financial_tx_id` | string(64) | Não | **P1** — rastreio após correção financeira |

Índice sugerido: `idx_moves_academy_created` (`academy_id`, `$createdAt` desc) — se não existir.

Provision: estender `scripts/verify-and-fix-schema-crm.mjs` ou script dedicado `scripts/provision-stock-move-finance-link.mjs`.

### 2.2 `FINANCIAL_TX` — sem schema novo

Usar campos existentes:

```js
origin_type: 'stock_entry'
origin_id: '<stock_moves.$id>'
type: 'stock_purchase'  // FINANCE_CATEGORIES.CUSTO_ESTOQUE
category: 'Custo de estoque'
status: 'settled'        // v1 inalterado
```

Constante nova em `src/lib/financeOriginTypes.js` (ou `financeTxFields.js`):

```js
export const FINANCE_ORIGIN_STOCK_ENTRY = 'stock_entry';
```

### 2.3 Imutabilidade do movimento original

- `tipo`, `quantidade`, `purchase_price` do movimento **não são editados** após criação.
- Correções produzem:
  - **Financeira:** estorno da tx + nova tx (ou tx substituta) + atualização de `stock_moves.financial_tx_id`.
  - **Quantidade:** movimento `ajuste` via `executeInventoryAdjustment`.
  - **P1 quantidade com WAC:** movimento `entrada` negativa não existe — usar ajuste + opcional recompute (§6).

---

## 3. Alterações no write path (entrada)

### 3.1 `maybeCreateFinanceExpense` (`inventoryMoveHandler.js`)

Após `createDocument` da despesa:

```js
// patch financial_tx com origem
await databases.updateDocument(dbId, FINANCIAL_TX_COL, fin.$id, {
  origin_type: FINANCE_ORIGIN_STOCK_ENTRY,
  origin_id: move.$id,  // move já criado — reordenar: criar move antes ou patch após
});
```

**Ordem de operações (importante):**

1. Atualizar item (`current_quantity`, WAC).
2. Criar `stock_moves` (sem `financial_tx_id` ainda).
3. Criar `financial_tx` com `origin_type`, `origin_id`.
4. Patch `stock_moves.financial_tx_id`.

Se criação financeira falhar: movimento de estoque **permanece** (comportamento atual — log `finance expense skip`).

### 3.2 Alinhar legado

`functions/inventory_move/index.js` — mesma lógica ou delegar a `executeInventoryMove` (preferível consolidar).

### 3.3 Campos extras no movimento

```js
movePayload.payment_method = payment_method;
// P1:
movePayload.quantity_before = prevQty;
movePayload.average_cost_before = readAverageCost(item);
```

---

## 4. API — novas rotas (sem novo arquivo `/api/`)

Todas em `inventoryHandler.js` via `POST/GET api/leads?route=inventory`.

### 4.1 `action=list_moves` (GET)

| Param | Tipo | Notas |
|-------|------|-------|
| `item_estoque_id` | string | Opcional — filtro |
| `tipo` | string | Opcional — default todas |
| `limit` | number | Default 50, max 100 |
| `cursor` | string | `$createdAt` + `$id` cursor |

**Resposta:**

```json
{
  "ok": true,
  "moves": [
    {
      "id": "...",
      "item_estoque_id": "...",
      "item_label": "Kimono · M",
      "tipo": "entrada",
      "quantidade": 10,
      "purchase_price": 120,
      "payment_method": "pix",
      "financial_tx_id": "...",
      "financial_tx_status": "settled",
      "created_at": "2026-06-25T12:00:00.000Z",
      "can_correct": true
    }
  ],
  "cursor": "..."
}
```

Enriquecimento: batch-get `financial_tx` por IDs; validar `academy_id` em movimento e tx.

`can_correct`: `true` se `tipo===entrada'` e usuário admin; `false` para member.

### 4.2 `action=correct_entry` (POST)

Body:

```json
{
  "move_id": "...",
  "correction": "finance_only" | "quantity_only" | "both",
  "new_purchase_price": 150,
  "new_payment_method": "pix",
  "new_quantity": 8,
  "note": "opcional"
}
```

**RBAC:** `isAcademyOwnerOrAdminUser` — 403 para member.

**Fluxo `finance_only`:**

1. Carregar move + tx por `financial_tx_id` ou `origin_id`.
2. `reverseFinanceTx(txId)` — reutilizar `lib/server/financeTxReverse.js`.
3. Criar nova despesa via `maybeCreateFinanceExpense` (ou extrair `createStockPurchaseTx`).
4. Patch `stock_moves.financial_tx_id` = nova tx; opcional `supersedes_financial_tx_id` = tx antiga.
5. Audit: `recordFinancialAudit({ action: 'stock_entry_finance_correct', ... })`.

**Fluxo `quantity_only`:**

1. Calcular `delta = new_quantity - move.quantidade` **ou** aceitar `quantity_delta` explícito.
2. Chamar `executeInventoryAdjustment` com subtype `correcao_entrada` (adicionar em `inventoryAdjust.js` ALLOWED_SUBTYPES) ou `inventario` genérico.
3. Patch move: `corrected_by_move_id` = id do ajuste.
4. **v1:** não alterar WAC automaticamente (documentar). **P1:** §6.

**Fluxo `both`:** sequencial `finance_only` → `quantity_only`; opcional body `create_replacement_entry: true` para nova `entrada` com valores finais.

**Idempotência:** header ou body `idempotency_key`; cache em memória LRU por request ou campo `correction_id` único no move compensatório.

**Resposta:**

```json
{
  "ok": true,
  "move_id": "...",
  "financial_tx_id": "...",
  "adjustment_move_id": "...",
  "saldos": { "current_quantity": 18 }
}
```

### 4.3 Finance — detalhe enriquecido

Em `mapAndEnrichTx` ou handler GET existente: se `origin_type === 'stock_entry'`, anexar:

```js
stock_entry: {
  move_id: origin_id,
  item_estoque_id,
  item_label,
  loja_url: `/loja?tab=estoque&subtab=movimentos&move=${origin_id}`,
}
```

Query `stock_moves` por `$id`; validar `academy_id`.

---

## 5. Frontend

### 5.1 Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/components/inventory/InventoryMovesHistory.jsx` | **Novo** — tabela + filtros |
| `src/components/inventory/InventoryMovesPanel.jsx` | **Novo** — abas “Histórico” \| “Nova movimentação” |
| `src/pages/Inventory.jsx` | `subtab=movimentos` usa `InventoryMovesPanel` |
| `src/components/inventory/StockEntryCorrectionWizard.jsx` | **Novo** — modal multi-step |
| `src/store/useInventoryStore.js` | `listMoves`, `correctEntry` |
| `src/components/finance/FinanceTxDetailDrawer.jsx` | Bloco origem estoque |
| `src/lib/inventoryMovesApi.js` | **Novo** — fetch list/correct |

### 5.2 Deep links

| URL | Comportamento |
|-----|---------------|
| `/loja?tab=estoque&subtab=movimentos&move=<id>` | Abre histórico, highlight + scroll |
| `/financeiro?tab=movimentacoes&tx=<id>` | Já existe |

### 5.3 `InventoryEntryModal`

P1: `Hint` abaixo do bloco financeiro (copy do PRODUCT §7.3).

---

## 6. Custo médio (WAC) — P1

### 6.1 Problema

Entrada com `purchase_price` altera `average_cost` via `computeWeightedAverageCost`. Ajuste de quantidade **não** reverte WAC.

### 6.2 Opção A (recomendada P1) — Snapshot

Na entrada, gravar `quantity_before` + `average_cost_before`.

No wizard `quantity_only` ou `both`, após ajuste que desfaz a entrada:

```js
// Se saldo após ajuste == quantity_before e única entrada desde então:
patch average_cost = average_cost_before
```

Heurística conservadora: só auto-reverter WAC se nenhuma outra `entrada` no item após `move.$createdAt`.

### 6.3 Opção B — Replay

`scripts/recompute-variant-wac.mjs`: percorrer `stock_moves` tipo `entrada` cronológico; recalcular. Usar em correção manual ou cron de auditoria.

---

## 7. Backfill histórico

### `scripts/backfill-stock-entry-financial-links.mjs`

```
Para cada stock_moves onde tipo=entrada AND purchase_price>0 AND financial_tx_id vazio:
  Buscar financial_tx mesma academyId onde:
    type=stock_purchase
    note matches "Compra de estoque: {itemName}"
    gross ≈ purchase_price
    $createdAt within ±5 min of move.$createdAt
    origin_id vazio
  Se match único:
    patch move.financial_tx_id
    patch tx.origin_type=stock_entry, origin_id=move.$id
```

Flags: `--dry-run`, `--academy-id=`, `--limit=`.

Log: `stock_entry_link_backfill` JSON por doc.

---

## 8. Testes

| Arquivo | Cobertura |
|---------|-----------|
| `src/test/inventoryMoveFinanceLink.test.js` | Write path grava vínculo bidirecional |
| `src/test/stockEntryCorrection.test.js` | `correct_entry` finance / quantity / RBAC |
| `src/test/inventoryMovesHistory.test.js` | `list_moves` paginação + tenant |
| `src/test/lojaInventoryTabs.test.js` | Atualizar se subtab mudar estrutura |

Casos obrigatórios:

- Entrada sem `purchase_price` → sem `financial_tx_id`
- Finance falha → move existe, sem tx
- `correct_entry` finance em tx já estornada → erro `already_reversed`
- Member → 403
- Cross-academy move_id → 403

---

## 9. Observabilidade

Logs estruturados (`console.warn` / JSON):

| Evento | Campos |
|--------|--------|
| `stock_entry_finance_linked` | `academy_id`, `move_id`, `financial_tx_id` |
| `stock_entry_correction_start` | `move_id`, `correction`, `user_id` |
| `stock_entry_correction_done` | `move_id`, `new_financial_tx_id`, `adjustment_move_id` |
| `stock_entry_correction_failed` | `move_id`, `error`, `step` |

---

## 10. Migração e rollout

1. Provision schema `financial_tx_id` (+ P1 snapshots).
2. Deploy write path (novas entradas vinculadas).
3. Deploy UI histórico + links Caixa.
4. Deploy wizard correção.
5. Rodar backfill em produção (`--dry-run` primeiro).
6. Atualizar fluxo `docs/flows/vendas/estoque-movimentacoes.md`.

**Feature flag (opcional):** `academy.settings.inventory_entry_correction_v1` — default `true` para academias com `modules.inventory`.

---

## 11. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| Estorno OK, ajuste falha | Resposta parcial `{ partial: true, steps_completed: [...] }` + banner inconsistência (P1 R9) |
| Duplo estorno | `reverseEligibilityError` + checagem `already_reversed` |
| WAC incorreto após correção | Documentar v1; P1 snapshot |
| Backfill match errado | Janela temporal + match único; senão skip + log manual |
| Performance `list_moves` | Índice `academy_id`; limit 50 |

---

## 12. Fora de escopo técnico v1

- Transação Appwrite multi-document atômica (não disponível) — ordem §3.1 + compensação manual.
- Integração A pagar (`status=pending`) — spec futura.
- Alterar `functions/inventory_move` Appwrite Function se ainda em uso paralelo — verificar tráfego e deprecar.

---

## Histórico de revisão

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-25 | — | Criação |
