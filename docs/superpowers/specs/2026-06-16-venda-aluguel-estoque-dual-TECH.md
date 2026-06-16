# Venda e aluguel com estoque dual — TECH Spec

**Data:** 2026-06-16  
**PRODUCT:** [2026-06-16-venda-aluguel-estoque-dual-PRODUCT.md](./2026-06-16-venda-aluguel-estoque-dual-PRODUCT.md)  
**Status:** Spec para implementação

---

## 1. Diagnóstico técnico

### 1.1 O que já existe (reutilizar)

| Peça | Local | Notas |
|------|-------|-------|
| PDV / carrinho | `SalesNewSaleTab.jsx`, `SalesCart.jsx` | Estender payload, não duplicar |
| Venda no aluno | `StudentProductSaleStep.jsx` | Mesmo contrato de API |
| Criação de venda | `lib/server/salesCreateHandler.js` | Branch por `line_kind` |
| Movimentos | `inventoryMoveHandler.js`, `quantityDeltaForMoveType` | `saida_aluguel`, `devolucao` já definidos |
| Tipo produto `rental` | `ProductFormModal.jsx`, `productCatalog.js` | Adicionar `both` |
| Categoria financeira | `FINANCE_CATEGORIES.ALUGUEL_RECEITA` | Existe; `type` hoje é `plan` — **corrigir para `rental`** |
| Espelho Caixa vendas | `lib/server/salesMirror.js` | Ramificar por linha |
| Movimento venda | `lib/server/stockMoveFields.js` → `buildSaleStockMovePayload` | `tipo: 'saida_venda'` fixo hoje |
| Legado `quantidade_alugada` | Schema Appwrite | **Não reativar**; usar `rental_out` explícito |

### 1.2 O que está quebrado / incompleto

```
Variante (PRODUCT_VARIANTS_COL)
  → só current_quantity (pool único)

salesCreateHandler
  → sempre current_quantity -= q
  → sempre saida_venda + VENDA_PRODUTO

salesCatalog.parentEligibleForSale
  → type rental entra no catálogo mas trata como venda

ALUGUEL_RECEITA
  → definido em financeCategories.js, nunca usado
```

---

## 2. Modelo de dados

### 2.1 `PRODUCTS_COL` (pai)

| Atributo | Tipo | Notas |
|----------|------|-------|
| `type` | string | `sale` \| `rental` \| `both` \| `supply` |
| `sale_price` | float | existente |
| `rental_price` | float | **novo**, opcional |
| `is_for_sale` | bool | `true` se `sale` ou `both` ou `rental` (locação na Loja) |

Validação servidor: `both` exige ambos preços ou fallback documentado.

### 2.2 `PRODUCT_VARIANTS_COL` (variante)

| Atributo | Tipo | Default | Notas |
|----------|------|---------|-------|
| `sale_quantity` | integer | 0 | Pool venda |
| `rental_available` | integer | 0 | Pool aluguel disponível |
| `rental_out` | integer | 0 | Emprestado |
| `current_quantity` | integer | derivado | **v1:** `sale_quantity + rental_available` (sync em write); leitura legada |

**Invariantes (servidor):**

```text
sale_quantity >= 0
rental_available >= 0
rental_out >= 0
```

Decremento atômico: rejeitar 409 se pool insuficiente (mesmo padrão `no_stock`).

### 2.3 `SALE_ITEMS_COL`

| Atributo | Tipo | Notas |
|----------|------|-------|
| `line_kind` | string | `sale` \| `rental` — default `sale` para legado |

### 2.4 `STOCK_MOVES_COL`

Sem mudança de schema. Usar:

- `saida_venda` + `movement_kind: 'sale'` (existente)
- `saida_aluguel` + `movement_kind: 'rental'` (novo valor em `movement_kind` se provisionado)
- `devolucao` na P1 devolução
- `reversao_venda` no cancelamento (sale); **novo** `reversao_aluguel` ou `devolucao` referenciando venda no cancel rental (decisão §2.6)

### 2.5 `FINANCE_CATEGORIES`

```js
ALUGUEL_RECEITA: {
  label: 'Aluguéis recebidos',
  type: 'rental',  // era 'plan' — migrar agregadores
  dreGroup: 'Receita Bruta',
  dreAccount: '4.1.1',
  operationalBucket: 'operational',
}
```

Adicionar `rental` em `REVENUE_TYPES` onde aplicável (`financeCategories.js`, DRE, exports).

### 2.6 Cancelamento de venda com linha `rental`

| Ação | Estoque | Caixa |
|------|---------|-------|
| Cancelar linha `sale` | `sale_quantity += q` | Estorno `VENDA_PRODUTO` (existente) |
| Cancelar linha `rental` | `rental_out -= q`, `rental_available += q` | Estorno `ALUGUEL_RECEITA` (novo path em `salesMirror`) |

Movimento: `devolucao` ou tipo dedicado com `referencia_id` = `sale_item_id`.

---

## 3. Migração

### 3.1 Script `scripts/migrate-dual-stock-pools.mjs`

```
Para cada variante ativa:
  ler product.type do pai
  se type === 'sale':
    sale_quantity = resolveCurrentQuantity(variant)
    rental_available = 0; rental_out = 0
  se type === 'rental':
    rental_available = resolveCurrentQuantity(variant)
    sale_quantity = 0; rental_out = 0
  se type === 'supply': skip
  current_quantity = sale_quantity + rental_available  // sync
```

Flags: `--dry-run`, `--academy-id=`.

### 3.2 Provision `scripts/provision-dual-stock-pools.mjs`

Criar atributos integer em `PRODUCT_VARIANTS_COL`:

- `sale_quantity`, `rental_available`, `rental_out`

Criar em `PRODUCTS_COL`:

- `rental_price` (float, optional)

`npm run provision:dual-stock-pools` em `package.json`.

### 3.3 Compatibilidade leitura

`resolveCurrentQuantity` em `stockInventory.js` / `stockBalance.mjs`:

```js
// Preferir pools quando presentes
if (hasDualPoolFields(item)) {
  return saleQty(item) + rentalAvailable(item);
}
// fallback current_quantity / legado
```

`availableForSale(item)` → `sale_quantity`  
`availableForRental(item)` → `rental_available`

---

## 4. API — `sales_create`

### 4.1 Payload item (cliente)

```ts
{
  item_estoque_id: string,
  product_variant_id: string,
  quantidade: number,
  preco_unitario: number,
  line_kind: 'sale' | 'rental',  // default 'sale'
}
```

Validação:

- `line_kind === 'sale'` → `quantidade <= sale_quantity`
- `line_kind === 'rental'` → `quantidade <= rental_available`
- Produto pai `type === 'sale'` → rejeitar `rental`
- Produto pai `type === 'rental'` → rejeitar `sale`

### 4.2 Loop de persistência (`salesCreateHandler`)

Por linha:

```js
if (line_kind === 'rental') {
  patch = {
    rental_available: prevAvail - q,
    rental_out: prevOut + q,
    current_quantity: (prevSale + prevAvail - q) + (prevOut + q), // ou recompute
  };
  moveTipo = 'saida_aluguel';
  financeCategory = ALUGUEL_RECEITA;
} else {
  patch = { sale_quantity: prevSale - q, ... };
  moveTipo = 'saida_venda';
  financeCategory = VENDA_PRODUTO;
}
```

CMV: aplicar em `sale`; para `rental` v1 **sem CMV** (ativo permanece na academia) — documentar em PRODUCT.

### 4.3 Espelho financeiro

Opções (recomendada **B**):

| Opção | Descrição |
|-------|-----------|
| A | Uma `financial_tx` por venda com `note` misto | Ruim para DRE |
| **B** | Uma `financial_tx` por linha (ou por grupo de `line_kind`) | **Recomendado** |
| C | Uma tx com split JSON | Evitar |

Implementar em `salesMirror.js`: `mirrorSaleLines({ lines: [{ kind, gross, fee, net }] })`.

Pagamento único no PDV: dividir `pagamentos` proporcionalmente ao gross por linha ou repetir método em cada tx.

### 4.4 Idempotência

Inalterada (`idempotency_key` na venda). Rollback de pools em falha parcial — transação lógica: se falhar após baixar estoque, reverter snapshots (padrão existente `stockSnapshots`).

---

## 5. Cliente — catálogo e carrinho

### 5.1 `salesCatalog.js`

```js
export function availableQuantityForLine(parent, variant, lineKind) {
  if (lineKind === 'rental') return rentalAvailable(variant);
  return saleQuantity(variant);
}

export function parentEligibleForSale(parent) {
  // sale ou both com sale_quantity>0 em alguma variante
}

export function parentEligibleForRental(parent) {
  // rental ou both com rental_available>0
}
```

`enrichCatalogProduct`: expor `sale_quantity`, `rental_available`, `canSell`, `canRent`.

### 5.2 `SalesCatalogPicker.jsx`

- Card produto `both`: ações **Vender** / **Alugar** (dois botões ou menu).
- Badge estoque: `2 venda · 5 aluguel` quando aplicável.
- `suggestUnitPrice(product, lineKind)` → `sale_price` vs `rental_price`.

### 5.3 Carrinho (`SalesCart.jsx`)

- Exibir chip `Venda` / `Aluguel` por linha.
- `line_kind` imutável após adicionar (remover e readicionar para trocar).

### 5.4 `serialize` para API

`StudentProductSaleStep` e `SalesNewSaleTab`: incluir `line_kind` em cada item de `itens`.

---

## 6. Produtos — UI e API

### 6.1 `ProductFormModal.jsx`

- Opção tipo **Venda e aluguel** (`both`).
- Variantes: inputs separados `sale_quantity`, `rental_available` ( `rental_out` read-only, calculado).
- `rental_price` no passo 1 quando `rental` ou `both`.

### 6.2 `productsHandler.js`

- CRUD aceita novos campos.
- Agregação listagem: somar pools nas variantes para o pai.

### 6.3 `Products.jsx` / inventário

- Colunas: **Venda | Aluguel (disp.) | Emprestado | Total**.
- Status crítico: avaliar por pool que alimenta a operação (config: alertar `rental_available` baixo para frotas).

---

## 7. Entrada de estoque

### 7.1 `InventoryMovesForm.jsx`

Entrada (`tipo === 'entrada'`):

```jsx
<select name="pool_dest">
  <option value="sale">Para venda</option>
  <option value="rental">Para aluguel</option>
</select>
```

### 7.2 `inventoryMoveHandler.js`

```js
if (tipo === 'entrada' && pool_dest === 'sale') {
  itemUpdates.sale_quantity = prevSale + q;
} else if (tipo === 'entrada' && pool_dest === 'rental') {
  itemUpdates.rental_available = prevAvail + q;
}
// recompute current_quantity
```

`ajuste`: especificar pool no payload (`pool: 'sale'|'rental'|'out'`) — P1; v1 só entrada.

---

## 8. Arquivos tocados (estimativa)

| Arquivo | Mudança |
|---------|---------|
| `scripts/provision-dual-stock-pools.mjs` | **novo** |
| `scripts/migrate-dual-stock-pools.mjs` | **novo** |
| `src/lib/stockInventory.js` | helpers dual pool |
| `src/lib/productCatalog.js` | map `both`, `rental_price` |
| `src/lib/salesCatalog.js` | elegibilidade + preço por kind |
| `lib/server/salesCreateHandler.js` | baixa pool, line_kind |
| `lib/server/salesCancelHandler.js` | reversão rental |
| `lib/server/salesMirror.js` | tx por categoria |
| `lib/server/stockMoveFields.js` | `buildRentalStockMovePayload` |
| `lib/server/productsHandler.js` | CRUD campos |
| `lib/server/inventoryMoveHandler.js` | entrada com pool |
| `src/lib/financeCategories.js` | `type: rental`, REVENUE_TYPES |
| `ProductFormModal.jsx`, `Products.jsx` | UI cadastro/listagem |
| `SalesCatalogPicker.jsx`, `SalesCart.jsx` | UX Vender/Alugar |
| `SalesNewSaleTab.jsx`, `StudentProductSaleStep.jsx` | payload |
| `InventoryMovesForm.jsx` | destino entrada |
| Testes | `dualStockPools.test.js`, `salesCreateRental.test.js`, `salesCatalog.test.js` |

**Sem** novo arquivo em `/api/` — rotas existentes `sales` via `api/finance.js` ou handler atual.

---

## 9. Testes

### 9.1 Unit

| Arquivo | Casos |
|---------|-------|
| `src/test/dualStockPools.test.js` | invariantes, `resolveCurrentQuantity`, available helpers |
| `src/test/salesCatalog.test.js` | `both` no catálogo, `canSell`/`canRent` |
| `tests/unit/finance/salesMirrorRental.test.js` | espelho ALUGUEL_RECEITA |

### 9.2 Integração (handler)

| Caso | Esperado |
|------|----------|
| Venda 1x sale | `sale_quantity -1`, tx product |
| Aluguel 1x rental | `rental_available -1`, `rental_out +1`, tx rental |
| Excede pool | 409 `no_stock` |
| `type=sale` + line_kind rental | 400 |
| Carrinho misto | 2 txs ou split correto |
| Cancel rental line | pools revertidos |

### 9.3 E2E manual (QA PRODUCT §11)

---

## 10. Ordem de implementação

```
1. provision + migrate + stockInventory helpers
2. productsHandler + ProductFormModal (cadastro)
3. salesCreateHandler + stock moves + salesMirror (rental)
4. salesCatalog + SalesCatalogPicker + carrinho
5. SalesNewSaleTab + StudentProductSaleStep
6. salesCancelHandler (rental)
7. inventory entrada com pool_dest
8. testes + docs appwrite-setup.md
```

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Race em estoque concorrente | Update com leitura prévia + 409; idealmente document version (futuro) |
| `current_quantity` dessincronizado | Recompute em todo write server-side |
| Histórico vendas sem `line_kind` | Default `sale` |
| DRE não reconhece `type: rental` | Atualizar agregadores em mesmo PR |
| CMV em aluguel | v1: `cmv = 0`; ativo não sai do patrimônio |

---

## 12. P1 — Devolução e transferência (resumo TECH)

**Devolução UI** → POST `?route=inventory-move` com `tipo: devolucao`, `referencia_id: sale_item_id`, validar `rental_out >= q`.

**Transferência** → `tipo: ajuste` com `pool_from` / `pool_to` ou handler dedicado `transfer_stock_pool` em `inventoryMoveHandler` (sem nova function Vercel).

---

## 13. Referências de código atuais

```177:194:src/lib/stockInventory.js
export function quantityDeltaForMoveType(tipo, quantidade) {
  // saida_venda e saida_aluguel: mesmo delta em current_quantity legado
}
```

```48:54:src/lib/financeCategories.js
  ALUGUEL_RECEITA: {
    label: 'Aluguéis recebidos',
    type: 'plan',  // → alterar para 'rental'
```

```470:494:lib/server/salesCreateHandler.js
        const movePayload = buildSaleStockMovePayload({
          // sempre saida_venda hoje
        });
```
