# Loja — aba Aluguel e catálogo dedicado — PRODUCT Spec

**Data:** 2026-07-16  
**Status:** Fases 1–2 entregues (P2 futuro)  
**TECH:** [2026-07-16-loja-aba-aluguel-TECH.md](./2026-07-16-loja-aba-aluguel-TECH.md)  
**Relacionado:**

- [2026-06-16-venda-aluguel-estoque-dual-PRODUCT.md](./2026-06-16-venda-aluguel-estoque-dual-PRODUCT.md) — pools, PDV `line_kind`, financeiro
- [produtos-catalogo.md](../../flows/vendas/produtos-catalogo.md) — fluxo operacional Produtos
- `KimonoLoanPanel` (Recepção) — empréstimo gratuito / controle de devolução

**Nota de escopo:** A spec dual-stock (2026-06-16) listava *“Módulo / menu Aluguel separado”* como **non-goal v1**. Esta iniciativa **reverte** essa decisão: a aba **Aluguel** no hub Loja passa a ser o lugar canônico para cadastro e gestão de itens de locação, sem duplicar o PDV nem a Recepção.

---

## 1. Problem Statement

Academias de Jiu-Jitsu operam **dois catálogos mentais distintos**: produtos para **venda** (kimono novo, rashguard, suplementos) e **frota de aluguel** (kimonos do armário, equipamentos emprestados). Com estoque dual e PDV já suportando `line_kind: rental`, o cadastro continuava misturado na aba **Produtos**, gerando confusão: recepção cadastrava kimono de aluguel junto com itens de venda, e não havia um lugar óbvio para ver só a frota locável.

**Quem sofre:** gestor (setup e conferência de saldo), recepcionista (encontrar tamanho disponível para empréstimo), owner (auditar frota vs. vendas).

**Custo de não resolver:** itens `rental` perdidos na lista de produtos de venda; onboarding confuso; desconexão entre **Loja → Aluguel** (cadastro) e **Recepção → Kimonos** (operação).

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Aba **Aluguel** dedicada no hub Loja | `/loja?tab=aluguel` no `HubTabBar` (sem item na sidebar) |
| G2 | Separação visual do catálogo | `type=rental` só na aba Aluguel; `sale`/`supply` só em Produtos |
| G3 | `both` visível nas duas abas | Mesmo produto editável em qualquer aba; pools corretos no modal |
| G4 | Criação com defaults corretos | Novo item na aba Aluguel nasce `type=rental` com foco em `rental_price` |
| G5 | Paridade operacional | Itens cadastrados em Aluguel aparecem no PDV (linha Aluguel) e na Recepção |
| G6 | Zero regressão em Produtos / PDV | Vendas só-produto e catálogo de venda inalterados |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| Substituir Recepção → Kimonos | Empréstimo rápido sem cobrança permanece na Recepção |
| Substituir Loja → Vendas | Cobrança de aluguel continua no PDV |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| Caução, multa, contrato de locação | Escopo da spec dual-stock P2 |
| Aba Aluguel com PDV embutido | Catálogo apenas; venda na aba Vendas |
| Migração automática `sale` → `rental` | Academias revisam tipo manualmente |

---

## 4. Modelo de produto por aba

| `type` | Aba **Produtos** | Aba **Aluguel** | PDV |
|--------|------------------|-----------------|-----|
| `sale` | Sim | Não | Venda |
| `supply` | Sim | Não | Fora do catálogo |
| `rental` | Não | Sim | Aluguel |
| `both` | Sim | Sim | Vender **e** Alugar |

**Invariante:** um produto `rental` nunca aparece na listagem de Produtos após o filtro de escopo, mesmo que `is_for_sale=true` legado.

---

## 5. Comportamento esperado — UX

### 5.1 Hub Loja

- Nova aba **Aluguel** entre **Produtos** e **Estoque** (quando `modules.sales` ou `modules.inventory`).
- Subtítulo do hub: *“Cadastre itens de aluguel, preços e saldo do armário.”*
- Acesso: hub Loja (`HubTabBar`); **não** entra como item na sidebar (`naviMenu`).

### 5.2 Listagem (aba Aluguel)

- Reutiliza `Products.jsx` com escopo `catalogScope=aluguel`.
- Coluna **Preço aluguel** (não preço de venda).
- Colunas de estoque: **Aluguel** (disp.) e **Emprestado**; ocultar coluna **Venda** nesta aba.
- CTA: **Novo item de aluguel** (não “Novo produto”).
- Empty state orientado a kimono / empréstimo.

### 5.3 Cadastro (modal)

- Abrir criação na aba Aluguel → `defaultProductType=rental`.
- Tipos permitidos na aba Aluguel: `rental`, `both` (P1 — restringir select; hoje todos os tipos ainda aparecem).
- Variantes: saldo inicial no pool de aluguel quando `rental` ou `both`.

### 5.4 Integração com operação

| Ação do usuário | Tela |
|-----------------|------|
| Cadastrar frota | Loja → Aluguel |
| Emprestar grátis | Recepção → Kimonos |
| Cobrar aluguel | Loja → Vendas |
| Entrada de peças no armário | Loja → Estoque (destino “Para aluguel”) |
| Devolver peça | Recepção → Kimonos (P1: atalho desde detalhe da venda) |

### 5.5 Deep links e onboarding (P1)

- `/loja?tab=aluguel&edit=<id>` — editar item de aluguel.
- `/loja?tab=aluguel&import=1` — import com default `type=rental`.
- Onboarding: passo opcional `first_rental_product` quando módulo loja ativo (P2).

---

## 6. User Stories

### Gestor

- **US1:** Como gestor, quero uma aba só de aluguel para cadastrar a frota sem misturar com produtos de venda.
- **US2:** Como gestor, quero ver de relance quantas peças estão no armário e quantas emprestadas.
- **US3:** Como gestor, quero que kimono `both` apareça em Produtos e Aluguel para gerenciar os dois pools.

### Recepcionista

- **US4:** Como recepcionista, quero que itens cadastrados em Aluguel apareçam ao emprestar na Recepção.
- **US5:** Como recepcionista, quero cobrar aluguel no PDV com o preço definido na aba Aluguel.

### Edge cases

- **US6:** Criar produto `rental` em Aluguel → não listar em Produtos.
- **US7:** Editar `both` em Produtos → ainda visível em Aluguel com pools intactos.
- **US8:** Academia só com `inventory` (sem `sales`) → aba Aluguel visível para cadastro de frota.
- **US9:** Trocar academia → catálogo isolado por tenant (sem mudança).

---

## 7. Requirements

### P0 — Must have (Fase 1)

| ID | Requisito | Critérios de aceite | Status |
|----|-----------|---------------------|--------|
| R1 | Aba no hub | `Loja.jsx` tab `aluguel`; redirect inválido para fallback | Feito |
| R2 | Filtro de escopo | `parentMatchesLojaCatalogScope` em `lojaProductScope.js` | Feito |
| R3 | UI dedicada | Preço aluguel, CTAs, empty state, colunas estoque | Feito |
| R4 | Default tipo rental | `ProductFormModal` `defaultProductType` na criação | Feito |
| R5 | Navegação | Aba no hub Loja; sem child na sidebar | Feito |
| R6 | Testes escopo | `lojaProductScope.test.js` | Feito |
| R7 | Fluxo documentado | `produtos-catalogo.md` + esta spec | Feito |

### P1 — Melhorias próximas

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R8 | Restringir tipo no modal | Na aba Aluguel, select só `rental` e `both`; em Produtos, ocultar `rental` puro | Feito |
| R9 | Deep link `edit`/`duplicate` | `?tab=aluguel&edit=` abre modal se item no escopo; senão toast + redirect | Feito |
| R10 | Link Recepção vazio | `KimonoLoanPanel` sem variantes → CTA “Cadastrar em Loja → Aluguel” | Feito |
| R11 | Import escopado | `ProductImportModal` recebe `defaultType` por escopo | Feito |
| R12 | Fluxo dedicado | `docs/flows/vendas/aluguel-catalogo.md` + entrada no README | Feito |
| R13 | Estoque contextual | Em Estoque, badge/link “cadastrado em Aluguel” para `type=rental` | Pendente P2 |
| R14 | Testes UI escopo | Vitest: `productsCatalogScope.test.js` | Feito |

### P2 — Futuro

| ID | Requisito |
|----|-----------|
| R15 | Onboarding `first_rental_product` |
| R16 | Relatórios Loja: KPI frota (disp. / emprestado / giro) |
| R17 | Atalho PDV `?line_kind=rental` ao vir de Aluguel |
| R18 | Devolução guiada unificada (Recepção + histórico venda) |

---

## 8. Success Metrics

| Métrica | Meta (30 dias pós Fase 1 completa) |
|---------|-------------------------------------|
| Academias com ≥1 produto `rental` cadastrado via aba Aluguel | > 70% das que usam empréstimo |
| Tickets “não acho kimono de aluguel no cadastro” | Redução vs. baseline |
| Produtos `rental` visíveis erroneamente em Produtos | 0 |
| Regressão testes `productCatalog` + `lojaProductScope` | CI verde |

---

## 9. Open Questions

| # | Pergunta | Dono |
|---|----------|------|
| Q1 | Item `both` deve abrir modal em qual aba por padrão ao clicar em Editar? | Produto |
| Q2 | Import CSV na aba Aluguel força `type=rental` ou respeita coluna? | Produto |
| Q3 | Renomear label do accordion sidebar “Vendas” → “Loja”? | UX |
| Q4 | Estoque lista `rental` em aba separada ou só filtro? | P2 |

---

## 10. QA checklist

**Fase 1 (entregue)**
- [x] `/loja?tab=aluguel` carrega listagem
- [x] Criar `rental` em Aluguel → não aparece em Produtos
- [x] `both` aparece nas duas abas
- [x] Preço exibido é `rental_price` na aba Aluguel
- [x] Aba Aluguel no hub Loja (`HubTabBar`); sem item na sidebar
- [x] `npm test -- lojaProductScope naviMenu` verde

**Fase 2 (P1 — entregue)**
- [x] Modal restringe tipos por aba
- [x] Deep link `edit` na aba correta
- [x] KimonoLoanPanel CTA quando catálogo vazio
- [x] Import com default rental
- [x] Fluxo `aluguel-catalogo.md` validado

---

## 11. Fases de entrega

| Fase | Entrega |
|------|---------|
| **Fase 1** | Aba hub + escopo catálogo + nav + defaults criação + testes unitários escopo |
| **Fase 2** | Restrição tipos modal, deep links, links Recepção, import escopado, fluxo docs |
| **Fase 3 (P2)** | Onboarding, relatórios frota, atalhos PDV |
