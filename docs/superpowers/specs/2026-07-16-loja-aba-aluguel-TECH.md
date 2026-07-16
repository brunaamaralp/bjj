# Loja — aba Aluguel e catálogo dedicado — TECH Spec

**Data:** 2026-07-16  
**PRODUCT:** [2026-07-16-loja-aba-aluguel-PRODUCT.md](./2026-07-16-loja-aba-aluguel-PRODUCT.md)  
**Status:** Fase 1 e Fase 2 implementadas  
**Harness:** `npm test -- lojaProductScope naviMenu productCatalog`

---

## 1. Diagnóstico técnico

### 1.1 O que já existe (reutilizar)

| Peça | Local | Notas |
|------|-------|-------|
| Hub Loja com tabs | `src/pages/Loja.jsx` | Padrão `resolveHubTab` + `HubTabBar` |
| Catálogo pai/variante | `src/pages/Products.jsx`, `productCatalog.js` | Um componente; escopo por prop |
| Tipos `sale`/`rental`/`both` | `dualStockPools.js`, `ProductFormModal.jsx` | Pools e preços já modelados |
| PDV aluguel | `SalesCatalogPicker.jsx`, `salesCreateHandler.js` | `line_kind`, `rental_price` |
| Empréstimo recepção | `KimonoLoanPanel.jsx`, `kimonoLoanHandler.js` | Usa variantes com `rental_available` |
| Nav sidebar | `src/lib/naviMenu.js` `buildLojaAccordion` | Children com `to` |

### 1.2 O que foi entregue (Fase 1)

```
src/lib/lojaProductScope.js          ← NOVO: escopo produtos vs aluguel
src/pages/Loja.jsx                   ← tab aluguel + Products catalogScope
src/pages/Products.jsx               ← prop catalogScope, UI condicional
src/components/products/ProductFormModal.jsx  ← defaultProductType
src/lib/naviMenu.js                  ← sem child Aluguel (só hub tabs)
src/test/lojaProductScope.test.js    ← NOVO
docs/flows/vendas/produtos-catalogo.md      ← rotas aba Aluguel
```

### 1.3 Lacunas (Fase 2+)

| Lacuna | Impacto |
|--------|---------|
| Modal permite `type=sale` na aba Aluguel | Usuário pode criar item que some da lista após salvar |
| `?edit=` não valida escopo vs aba | Deep link de produto `sale` em `tab=aluguel` confunde |
| `KimonoLoanPanel` sem link para cadastro | Dead-end quando frota vazia |
| Import não passa `defaultType` | Planilha na aba Aluguel pode criar `sale` por engano |
| Sem fluxo `docs/flows/vendas/aluguel-catalogo.md` | Governança incompleta |
| `Inventory.jsx` não distingue origem rental | Menor; estoque já usa pools |

---

## 2. Arquitetura

### 2.1 Escopo de catálogo (client)

```js
// src/lib/lojaProductScope.js
export const LOJA_PRODUCT_SCOPES = { PRODUCTS: 'produtos', RENTAL: 'aluguel' };

export function parentMatchesLojaCatalogScope(parent, scope) {
  const type = normalizeProductType(parent?.type);
  if (scope === LOJA_PRODUCT_SCOPES.RENTAL)
    return type === PRODUCT_TYPES.RENTAL || type === PRODUCT_TYPES.BOTH;
  return type === PRODUCT_TYPES.SALE || type === PRODUCT_TYPES.SUPPLY || type === PRODUCT_TYPES.BOTH;
}
```

**Ordem de filtro em `Products.jsx`:**

1. `scopedProducts = products.filter(parentMatchesLojaCatalogScope)`
2. `filterParentCatalog(scopedProducts, { search, category, status, typeFilter })`

Categorias e contagens derivam de `scopedProducts`, não do array completo.

### 2.2 Hub routing

| Query | Componente | Prop |
|-------|------------|------|
| `?tab=produtos` | `<Products catalogScope="produtos" />` | default |
| `?tab=aluguel` | `<Products catalogScope="aluguel" />` | rental UI |

`allowed` em `Loja.jsx` inclui `aluguel` quando `modules.sales || modules.inventory`.

### 2.3 UI condicional (`isRentalScope`)

| Elemento | `produtos` | `aluguel` |
|----------|------------|-----------|
| Coluna preço | `sale_price` | `rental_price` |
| Colunas estoque dual | Venda + Aluguel + Emprestado | Aluguel + Emprestado |
| CTA criar | Novo produto | Novo item de aluguel |
| `defaultProductType` | `sale` | `rental` |

---

## 3. Implementação Fase 2

### 3.1 Restringir tipos no modal (R8)

**Arquivo:** `ProductFormModal.jsx`

```jsx
// Nova prop
allowedProductTypes?: string[] | null; // null = todos

// Products.jsx
allowedProductTypes={
  isRentalScope ? ['rental', 'both'] : ['sale', 'both', 'supply']
}
```

No `<select>` de tipo, filtrar `option` pela lista. Se edição abrir tipo fora do escopo (ex.: `sale` via deep link errado), mostrar `StatusBanner` read-only + link “Abrir em Produtos”.

### 3.2 Deep links com validação de escopo (R9)

**Arquivo:** `Products.jsx` (effect existente de `?edit=` / `?duplicate=`)

```js
function resolveEditParent(products, id, catalogScope) {
  const parent = findParentByProductOrVariantId(products, id);
  if (!parent) return { parent: null, wrongScope: false };
  if (!parentMatchesLojaCatalogScope(parent, catalogScope))
    return { parent, wrongScope: true };
  return { parent, wrongScope: false };
}
```

Se `wrongScope`: toast + `setSearchParams({ tab: otherScope })` ou limpar query.

### 3.3 KimonoLoanPanel — CTA cadastro (R10)

**Arquivo:** `KimonoLoanPanel.jsx`

Quando `variants.length === 0` após load:

```jsx
<EmptyState
  primaryAction={{ label: 'Cadastrar em Loja → Aluguel', to: '/loja?tab=aluguel' }}
/>
```

Requer `modules.sales || modules.inventory`; senão mensagem “Ative o módulo Loja”.

### 3.4 Import escopado (R11)

**Arquivos:** `ProductImportModal.jsx`, `Products.jsx`

```jsx
<ProductImportModal defaultProductType={defaultCreateType} ... />
```

No mapeamento AI/CSV, quando `defaultProductType === 'rental'` e coluna `type` vazia → `rental`.

### 3.5 Fluxo de usuário (R12)

Criar `docs/flows/vendas/aluguel-catalogo.md` (copiar `_template.md`):

- Rotas: `/loja?tab=aluguel`, deep links
- Mapa gestor + recepcionista (referenciar canvas / diagramas)
- Checklist Seção A
- Indexar em `docs/flows/README.md`
- Registrar em `docs/flows/VALIDATION.md`

### 3.6 Testes (R14)

```js
// src/test/productsCatalogScope.test.jsx (novo)
// Mock useProductsStore com mix sale/rental/both
// render Products catalogScope=produtos → expect sem rental puro
// render Products catalogScope=aluguel → expect sem sale puro
```

---

## 4. Arquivos tocados por fase

### Fase 1 (concluída)

| Arquivo | Mudança |
|---------|---------|
| `src/lib/lojaProductScope.js` | **novo** |
| `src/pages/Loja.jsx` | tab + render |
| `src/pages/Products.jsx` | `catalogScope`, UI |
| `src/components/products/ProductFormModal.jsx` | `defaultProductType` |
| `src/lib/naviMenu.js` | sem child Aluguel (só hub) |
| `src/test/lojaProductScope.test.js` | **novo** |
| `src/test/naviMenu.test.js` | assert sem aluguel na sidebar |
| `docs/flows/vendas/produtos-catalogo.md` | rotas |

### Fase 2 (planejada)

| Arquivo | Mudança |
|---------|---------|
| `ProductFormModal.jsx` | `allowedProductTypes` |
| `Products.jsx` | deep link escopo, pass props import |
| `ProductImportModal.jsx` | `defaultProductType` |
| `KimonoLoanPanel.jsx` | empty CTA |
| `docs/flows/vendas/aluguel-catalogo.md` | **novo** |
| `docs/flows/README.md` | índice |
| `docs/flows/VALIDATION.md` | checklist |
| `src/test/productsCatalogScope.test.jsx` | **novo** |

### Fase 3 (P2 — fora do escopo imediato)

| Arquivo | Mudança |
|---------|---------|
| `src/lib/onboardingChecklist.js` | `first_rental_product` |
| `src/components/reports/ReportsLojaPanel.jsx` | KPIs frota |
| `Sales.jsx` / `lojaSalesTabs.js` | `?rental=1` prefetch catálogo |

---

## 5. Restrições Vercel Hobby

- **Nenhum** arquivo novo em `/api/`.
- Endpoints existentes (`/api/leads?route=products`) já suportam `type` e `rental_price`; sem mudança de schema para esta feature.

---

## 6. Compatibilidade e migração

| Cenário | Comportamento |
|---------|---------------|
| Produto `rental` legado em Produção | Passa a listar só em Aluguel (mudança visível esperada) |
| Produto `both` | Continua em ambas abas |
| Bookmark `/produtos` | Redirect legado → `?tab=produtos` (sem alias `/aluguel` legado em v1) |
| API GET catálogo | Retorna todos os tipos; filtro é **só client** |

**Risco:** usuários que cadastravam `rental` em Produtos precisam saber que o item “sumiu” de lá — mitigar com release note / tooltip única (P1).

---

## 7. Verificação

```bash
# Fase 1
npm test -- lojaProductScope naviMenu

# Após Fase 2
npm test -- lojaProductScope productsCatalogScope productCatalog
```

**Manual**

1. Criar kimono `rental` M/G em Aluguel → não listar em Produtos.
2. Criar rashguard `sale` em Produtos → não listar em Aluguel.
3. Criar `both` → ambas abas; PDV mostra Vender + Alugar.
4. Recepção empresta variante cadastrada em Aluguel.
5. PDV cobra aluguel com `rental_price` da aba Aluguel.

---

## 8. Ordem de implementação recomendada (Fase 2)

1. `allowedProductTypes` no modal (evita dados inválidos)
2. Deep link escopo (evita estados quebrados)
3. `KimonoLoanPanel` CTA (fecha loop operacional)
4. Import `defaultProductType`
5. Fluxo `aluguel-catalogo.md` + VALIDATION
6. Testes `productsCatalogScope.test.jsx`

Estimativa: **~200–350 LOC**, 1 PR revisável.

---

## 9. Referência — diagrama de módulos

```
                    ┌─────────────────┐
                    │  Loja → Aluguel │  cadastro frota (escopo rental/both)
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ Loja → Estoque │  │ Loja → Vendas  │  │ Recepção       │
│ pool rental    │  │ line_kind      │  │ KimonoLoan     │
└────────────────┘  └────────────────┘  └────────────────┘
         │                   │                   │
         └───────────────────┴───────────────────┘
                             ▼
                  PRODUCT_VARIANTS_COL
                  sale_quantity | rental_available | rental_out
```
