# Venda e aluguel com estoque dual — PRODUCT Spec

**Data:** 2026-06-16  
**Status:** Spec para aprovação  
**TECH:** [2026-06-16-venda-aluguel-estoque-dual-TECH.md](./2026-06-16-venda-aluguel-estoque-dual-TECH.md)  
**Relacionado:** Loja → Vendas (`SalesNewSaleTab`, `StudentProductSaleStep`), Produtos (`ProductFormModal`), `financeCategories.js` (`ALUGUEL_RECEITA`)

---

## 1. Problem Statement

Academias alugam uniformes e equipamentos (kimono, rashguard, etc.) **e** vendem peças novas, com **estoques físicos separados**: X unidades no pool de venda, Y no pool de aluguel. Uma mesma unidade **não pode** ser vendida e alugada ao mesmo tempo.

Hoje o Nave só suporta **venda definitiva** com um saldo único (`current_quantity`). Produtos podem ser cadastrados como tipo `rental`, mas no PDV viram venda comum (`saida_venda`), sem controle de peças emprestadas nem categoria financeira de aluguel.

**Quem sofre:** recepção/owner que precisa registrar aluguel com cobrança, saber quantas peças estão no armário vs. com alunos, e ver receita de aluguel separada de venda de produto no financeiro.

**Custo de não resolver:** estoque incoerente, aluguel registrado como venda, impossibilidade de operar locação de uniforme dentro do fluxo que a equipe já usa (Loja → Vendas / perfil do aluno).

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Um produto, dois pools por variante | Kimono M mostra “2 venda · 8 aluguel disp. · 3 emprestados” |
| G2 | Alugar pelo fluxo de Vendas existente | PDV e perfil do aluno concluem locação com pagamento |
| G3 | Vender só consome pool de venda | Baixa `sale_quantity`; nunca mexe em `rental_*` |
| G4 | Alugar só consome pool de aluguel | Baixa `rental_available`, incrementa `rental_out`; movimento `saida_aluguel` |
| G5 | Caixa separado | Aluguel → **Aluguéis recebidos**; venda → **Vendas de produtos** |
| G6 | Unidade indivisível | Impossível vender e alugar a mesma unidade (pools distintos) |
| G7 | Zero regressão em venda pura | Produtos só-venda continuam iguais após migração |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Módulo / menu “Aluguel” separado | Escopo acordado: extensão de Vendas |
| Caução, multa por atraso, contrato de locação | Complexidade; fase futura |
| Aluguel recorrente (mensalidade de equipamento) | Diferente de taxa única na locação |
| Devolução guiada com 1 clique | **P1** desta iniciativa; v1 pode usar movimento manual de estoque |
| Transferência entre pools (venda ↔ aluguel) | **P1**; rebalancear estoque sem SKU duplicado |
| NL / agente “registrar aluguel” | P2 |
| Novos arquivos em `/api/` | Limite Vercel Hobby 12/12 |
| Dois SKUs para o mesmo kimono (abordagem B) | Rejeitada em favor da abordagem A |

---

## 4. Modelo de negócio

### 4.1 Pools por variante (tamanho/cor)

Cada variante mantém três contadores **mutuamente exclusivos** no sentido operacional:

| Campo | Significado |
|-------|-------------|
| `sale_quantity` | Unidades disponíveis para **venda definitiva** |
| `rental_available` | Unidades no armário, disponíveis para **alugar** |
| `rental_out` | Unidades **emprestadas** (com alunos) |

**Total físico da variante** = `sale_quantity + rental_available + rental_out`

Invariante: nenhuma operação move quantidade entre pools sem movimento explícito (entrada, venda, aluguel, devolução, transferência P1).

### 4.2 Tipo de produto (pai)

| `type` | Pools ativos | Uso |
|--------|--------------|-----|
| `sale` | só `sale_quantity` | Peças só vendidas (ex.: kimono novo) |
| `rental` | `rental_available` + `rental_out` | Frota só de aluguel |
| `both` | os três | Mesmo cadastro, estoques separados (caso principal) |
| `supply` | inalterado | Insumo interno; fora de Vendas |

### 4.3 Preços

| Campo | Uso |
|-------|-----|
| `sale_price` | Preço de venda (já existe) |
| `rental_price` | Preço da locação (taxa única por empréstimo em v1) — **novo**, opcional; fallback `sale_price` se vazio |

### 4.4 Checkout (linha do carrinho)

Cada item no carrinho carrega `line_kind`:

- `sale` → consome `sale_quantity`, espelho **Vendas de produtos**
- `rental` → consome `rental_available`, incrementa `rental_out`, espelho **Aluguéis recebidos**

Produto `both`: ao adicionar no catálogo, operador escolhe **Vender** ou **Alugar** (ou duas ações no card).

### 4.5 Devolução (P1)

`devolucao`: `rental_out −1`, `rental_available +1`. Sem estorno financeiro automático em v1 (aluguel já foi recebido na locação).

---

## 5. Comportamento esperado — UX

### 5.1 Cadastro (Produtos)

- Tipo `both`: campos de estoque **Venda** e **Aluguel** na etapa de variantes.
- Tipo `sale` / `rental`: só os campos do pool relevante.
- Campo **Preço de aluguel** quando `type` é `rental` ou `both`.
- Listagem: colunas ou resumo `Venda | Aluguel disp. | Emprestado`.

### 5.2 Loja → Vendas (PDV)

- Catálogo: produtos com `sale_quantity > 0` ou `rental_available > 0` (conforme `type`).
- Produto `both`: botões/ações **Vender** e **Alugar**; esgotado em um pool ainda pode aparecer no outro.
- Carrinho: badge por linha (“Venda” / “Aluguel”); totais unificados; pagamento único.
- Validação: não permitir quantidade maior que o pool da linha.

### 5.3 Perfil do aluno

- Mesmo fluxo de venda de produto (`StudentProductSaleStep`) com suporte a `line_kind` e preço de aluguel.

### 5.4 Histórico de vendas

- Item de venda registra `line_kind` (exibir “Aluguel” vs “Venda” no detalhe).
- Cancelamento de venda com linha `rental`: reverter `rental_out` → `rental_available` (não para `sale_quantity`).

### 5.5 Entrada de estoque (v1 mínimo)

- Movimento **entrada** pergunta destino: **Para venda** ou **Para aluguel** (incrementa o pool correto).
- Insumo (`supply`): comportamento atual.

### 5.6 Relatórios (v1)

- Movimentos de estoque: `saida_aluguel` rotulado “Aluguel” (não “uso interno”).
- DRE / Caixa: receita em **Aluguéis recebidos** quando linha `rental`.

---

## 6. User Stories

### Recepção

- **US1:** Como recepcionista, quero alugar kimono M para um aluno pelo PDV, cobrar PIX e baixar só o estoque de aluguel.
- **US2:** Como recepcionista, quero vender kimono novo (pool venda) sem afetar a frota de aluguel do mesmo produto.
- **US3:** Como recepcionista, quero ver no catálogo que só restam 2 para alugar, mesmo tendo 5 para vender.

### Owner

- **US4:** Como owner, quero ver no Caixa aluguel de uniforme em **Aluguéis recebidos**, separado de vendas de produto.
- **US5:** Como owner, quero cadastrar um kimono com 3 unidades para venda e 10 para aluguel na mesma ficha de produto.

### Edge cases

- **US6:** Carrinho misto (1 venda + 1 aluguel) → um pagamento, dois movimentos de estoque e espelhos financeiros corretos por linha.
- **US7:** Tentar alugar 3 com `rental_available = 2` → erro claro antes de concluir.
- **US8:** Produto `rental` com `rental_out > 0` → listagem mostra emprestados; venda bloqueada (sem `sale_quantity`).
- **US9:** Cancelar venda que continha aluguel → peça volta para `rental_available`, não para venda.

---

## 7. Requirements

### P0 — Must have (v1)

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1 | Schema dual pool | Variantes com `sale_quantity`, `rental_available`, `rental_out`; migração a partir de `current_quantity` |
| R2 | Tipo `both` | Produto pai aceita `type: both`; UI de cadastro e listagem |
| R3 | `rental_price` | Campo no produto; usado no checkout de linhas `rental` |
| R4 | Carrinho `line_kind` | Payload de venda inclui `line_kind` por item; persistido em `sale_items` |
| R5 | Baixa de estoque correta | `sale` → `sale_quantity`; `rental` → `rental_available` + `rental_out` |
| R6 | Movimento estoque | `saida_venda` vs `saida_aluguel` conforme `line_kind` |
| R7 | Caixa | Linha `rental` → `ALUGUEL_RECEITA`; `sale` → `VENDA_PRODUTO` |
| R8 | Catálogo PDV | Respeita pools; produto `both` com escolha Vender/Alugar |
| R9 | Perfil aluno | `StudentProductSaleStep` paridade com PDV |
| R10 | Cancelamento | Reversão de estoque coerente com `line_kind` |
| R11 | Entrada com destino | Entrada incrementa `sale_quantity` ou `rental_available` |
| R12 | Testes | Unitários pools + integração `sales_create` sale vs rental |

### P1 — Nice to have

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R13 | Devolução na UI | Ação “Devolver” no histórico do aluno ou detalhe da venda |
| R14 | Transferência entre pools | Ajuste admin: mover N unidades venda ↔ aluguel |
| R15 | Badge emprestados | Widget “X itens emprestados” na Loja ou perfil |

### P2 — Futuro

| ID | Requisito |
|----|-----------|
| R16 | NL `register_rental` |
| R17 | Caução e estorno na devolução |
| R18 | Aluguel por período (diária/mensal) |

---

## 8. Migração de dados

| Situação atual | Ação |
|--------------|------|
| Variante com `type` pai = `sale` | `sale_quantity = current_quantity`; rental_* = 0 |
| Pai = `rental` | `rental_available = current_quantity`; sale_quantity = 0 |
| Pai = `both` (novo) | Manual pós-deploy ou script interativo — **não** adivinhar split |
| `current_quantity` | Mantido como campo derivado/read-only em v1 (`sale_quantity + rental_available`) para compatibilidade, ou deprecado na leitura |

Academias com produtos `rental` hoje tratados como venda: após migração, revisar split no cadastro.

---

## 9. Success Metrics

| Métrica | Meta (30 dias pós-release) |
|---------|----------------------------|
| Aluguéis registrados via PDV (não movimento manual) | > 80% dos aluguéis da academia piloto |
| Divergência estoque físico vs. sistema (auditoria) | 0 em piloto |
| Receita `Aluguéis recebidos` no Caixa | Visível e ≠ 0 onde há locação |
| Regressão vendas só-produto | 0 tickets de estoque negativo indevido |

---

## 10. Open Questions

| # | Pergunta | Dono |
|---|----------|------|
| Q1 | Carrinho misto gera **uma** ou **várias** `financial_tx`? (Recomendação TECH: uma por linha ou split por categoria) | Eng + produto |
| Q2 | `rental_price` é por empréstimo fixo ou por dia? (v1: fixo por locação) | Academia piloto |
| Q3 | Cancelar aluguel estorna Caixa automaticamente? (v1: sim, espelho estorno como venda) | Produto |
| Q4 | Produtos legado `type=rental` com histórico de “venda” no PDV — corrigir manualmente? | Suporte |

---

## 11. QA checklist (v1)

**Cadastro**
- [ ] Criar produto `both` com variantes e quantidades distintas
- [ ] Editar `rental_price` e ver no PDV

**PDV**
- [ ] Vender consome só `sale_quantity`
- [ ] Alugar consome `rental_available`, incrementa `rental_out`
- [ ] Carrinho misto conclui com pagamento único
- [ ] Erro ao exceder pool

**Financeiro**
- [ ] Caixa: linha aluguel em Aluguéis recebidos
- [ ] Caixa: linha venda em Vendas de produtos

**Estoque**
- [ ] Movimento `saida_aluguel` na venda de aluguel
- [ ] Entrada “para aluguel” incrementa pool certo
- [ ] Cancelamento reverte pool de aluguel

**Regressão**
- [ ] Produto só-venda inalterado
- [ ] Insumo (`supply`) fora do catálogo de vendas

---

## 12. Fases de entrega

| Fase | Entrega |
|------|---------|
| **Fase 1** | Schema + migração + cadastro/listagem produtos |
| **Fase 2** | API `sales_create` + pools + financeiro + movimentos |
| **Fase 3** | PDV + perfil aluno + histórico/cancelamento |
| **Fase 4 (P1)** | Devolução UI + transferência entre pools |
