# Auditoria: saldo legado vs `current_quantity`

Data: 2026-05-18 (gerado antes da unificação).

## Modelos

| Modelo | Cálculo / campo |
|--------|------------------|
| Legado | `quantidade_total - quantidade_vendida - quantidade_alugada` |
| Novo | `current_quantity` (atualizado por movimentações) |

## Leituras dos campos legados

| Arquivo | Uso |
|---------|-----|
| `src/lib/stockInventory.js` | `legacyAvailable()` — fallback quando `current_quantity` ausente |
| `src/test/stockInventory.test.js` | Testes do fallback |
| `lib/server/inventoryMoveHandler.js` | `buildLegacyStockUpdates()` — validação e **escrita** duplicada |
| `functions/inventory_move/index.js` | Mesma lógica inline — validação e **escrita** |
| `functions/sales_create/index.js` | **Disponibilidade** e rollback via legado; patch parcial em `current_quantity` |
| `functions/sales_cancel/index.js` | Reverte só `quantidade_vendida` — **não** atualiza `current_quantity` |
| `docs/appwrite-setup.md` | Documentação de schema |

## Escritas nos campos legados

| Arquivo | Campos escritos | Observação |
|---------|-----------------|------------|
| `lib/server/inventoryMoveHandler.js` | `quantidade_total`, `quantidade_vendida`, `quantidade_alugada` | Em paralelo com `current_quantity` |
| `functions/inventory_move/index.js` | Idem | Idem |
| `functions/sales_create/index.js` | `quantidade_vendida` (+ `current_quantity` manual) | **Não** chama `inventory_move` |
| `functions/sales_cancel/index.js` | `quantidade_vendida` | Movimento `reversao_venda` sem ajustar saldo novo |
| `lib/server/stockProductMap.js` | Zera legado na criação de produto | Apenas create |

## `current_quantity` — quem atualiza

| Origem | Atualiza? |
|--------|-----------|
| `inventory_move` / `inventoryMoveHandler` | Sim, todos os tipos exceto `avulso` |
| `sales_create` | Sim, decremento manual (pode divergir do legado) |
| `sales_cancel` | **Não** |
| `productsHandler` (entrada inicial) | Via `executeInventoryMove` |

## Tipos de movimento (`inventory_move`)

| Tipo | Delta em `current_quantity` | Legado (antes da correção) |
|------|----------------------------|----------------------------|
| `entrada` | +q | +total |
| `ajuste` | +q | +total |
| `saida_venda` | −q | +vendida |
| `saida_aluguel` | −q | +alugada |
| `devolucao` | +q | −alugada |
| `reversao_venda` | +q | −vendida |
| `avulso` | — | status_par |

**Risco:** `sales_create` incrementava `quantidade_vendida` e ajustava `current_quantity` sem passar pelo mesmo caminho que `inventory_move`, gerando dupla fonte de verdade.

## Divergência GBLP (produção)

Comparar documentos reais com:

```bash
node scripts/migrate_stock_balance.js --audit --academy-id=<ID_GBLP>
```

(Requer `APPWRITE_*` e `DB_ID` no ambiente.) O script lista itens com `current_quantity` ≠ saldo legado e candidatos à migração.

## Ações desta entrega

1. `sales_create` / `sales_cancel` — só `current_quantity` + movimentos.
2. `inventory_move` / `inventoryMoveHandler` — parar de escrever campos legados.
3. `scripts/migrate_stock_balance.js` — migração idempotente com preview.
4. Frontend — `resolveCurrentQuantity` (já usado em Estoque/Vendas); exibição enriquecida em Vendas.
5. Campos legados permanecem no Appwrite (somente leitura de fallback em `resolveCurrentQuantity`).
