# Conciliação — Deduplicação automática de linhas entre extratos

**Data:** 2026-06-16  
**Status:** Implementado (P0)  
**Contexto:** extensão natural de [conciliação multi-conta](2026-06-15-conciliacao-multi-formato-PRODUCT.md)

---

## Problema

Quando uma academia importa extratos com períodos sobrepostos — cenário comum quando o usuário baixa "o mês inteiro" depois de já ter importado "a primeira quinzena" — as linhas bancárias do período em comum aparecem duplicadas no segundo extrato, cada uma como **"Sem correspondência"** e sem sugestão. O sistema já impede dupla conciliação do mesmo lançamento Nave, mas não detecta que a linha bancária já foi tratada. O resultado é trabalho manual: o usuário precisa ignorar as linhas duplicadas uma a uma antes de conseguir trabalhar nas linhas realmente novas.

**Quem é afetado:** qualquer gestor que usa a função de conciliação com frequência mensal (importa quinzena, depois o mês; ou reimporta após corrigir o arquivo).

**Custo de não resolver:** tempo desperdiçado ignorando duplicatas + risco de confusão ("por que essa linha não tem sugestão?") + possível abandono da feature.

---

## Goals

1. Zero cliques extras para linhas bancárias idênticas já tratadas em outro extrato do mesmo período.
2. O usuário consegue trabalhar no segundo extrato focando só nas linhas **novas** (dias 16–30), sem ruído da sobreposição.
3. A deduplicação é transparente: o sistema informa quantas linhas foram marcadas automaticamente, sem esconder dados.
4. Extratos legados (importados antes dessa feature) não são afetados retroativamente.

---

## Non-Goals

- **Merge de extratos:** não unimos dois arquivos em um único statement — cada importação continua sendo um statement separado.
- **Deduplicação por similaridade:** a detecção é por igualdade exata (data + valor + direção + conta), não por algoritmo fuzzy.
- **Editar ou deletar o statement anterior:** o usuário não pode "atualizar" um extrato já importado — isso é escopo de uma feature futura de "Substituir extrato".
- **Retroativa:** statements já importados não são reprocessados; a deduplicação só ocorre no momento da nova importação.
- **Múltiplas contas no mesmo arquivo:** non-goal já definido no spec multi-conta.

---

## User Stories

### Gestor que importa extratos com sobreposição de período

**US-1 (principal)**  
Como gestor, quando importo um extrato que cobre dias que já estão em outro extrato da mesma conta, quero que as linhas duplicadas sejam identificadas e marcadas automaticamente como ignoradas, para que eu só precise revisar as linhas realmente novas.

**US-2 (transparência)**  
Como gestor, quero ver na tela de revisão do import quantas linhas foram detectadas como duplicatas, para entender o que o sistema fez antes de confirmar.

**US-3 (fallback)**  
Como gestor, se o sistema marcou uma linha como duplicata incorretamente, quero poder reabrir o extrato e desiganorar a linha manualmente.

**US-4 (extrato sem conta)**  
Como gestor, se o extrato importado não tem conta bancária associada (extrato legado), quero que o sistema avise que a deduplicação por conta não foi possível e que apenas data/valor/direção foram usados como critério.

---

## Requisitos

### P0 — Mínimo viável

**R-1: Detecção no momento do import**  
Durante `handleImport`, antes de gravar os itens, consultar se já existem itens com o mesmo `(academy_id, date, amount, direction, bank_account)` em outros statements do mesmo período. Se sim, marcar o item com `status: 'duplicate'` em vez de `status: 'unmatched'`.

Critério de igualdade:
- `date` — exato (YYYY-MM-DD)
- `amount` — `Math.abs(round2(a) - round2(b)) < 0.02` (mesmo critério de `amountsEqual` no matcher)
- `direction` — `'credit'` ou `'debit'`
- `bank_account` — comparação case-insensitive após trim; se o novo extrato tem conta mas o existente não tem (ou vice-versa), **não** considera duplicata (ambiguidade)

**R-2: Campo `duplicate_of` (opcional, diagnóstico)**  
Se detectado, gravar `duplicate_of: <statement_item_id_original>` no novo item para rastreabilidade. Se o item original não for localizável (busca paginada), o campo fica vazio mas o status ainda é `'duplicate'`.

**R-3: `status: 'duplicate'` tratado como `'ignored'` na UX**  
No frontend (`ReconciliationTab`, `BankReconPairRow`, `grouped`), itens com `status: 'duplicate'` são agrupados junto com `'ignored'` — não aparecem nas seções "Sem correspondência" nem "Sugestões".

**R-4: Resumo no retorno do import**  
A resposta de `POST /api/finance?route=import-statement` inclui `duplicate_count: N`, exibido no toast de sucesso:  
`"Extrato importado: 45 linhas, 12 sugestões automáticas, 8 duplicatas ignoradas."`

**R-5: Contagem correta nos KPIs**  
`summary.pending_count` e `summary.pending_amount` no `handleDetail` excluem itens com `status: 'duplicate'` (mesmo tratamento de `'ignored'`).

### P1 — Nice-to-have

**R-6: Badge visual na lista de extratos**  
Na tabela de extratos (`ReconciliationTab` lista), exibir pequena tag `8 duplicatas` ao lado do status se `duplicate_count > 0`.

**R-7: Seção colapsada "Duplicatas detectadas" no workspace**  
No workspace do extrato, exibir seção colapsada (acordeão fechado por padrão) com as linhas `status: 'duplicate'`, permitindo que o gestor as reveja sem poluir o fluxo principal.

**R-8: Ação "Reprocessar como pendente"**  
Dentro da seção colapsada, botão por linha para reverter `status: 'duplicate'` → `'unmatched'`, caso o gestor discorde da detecção.

### P2 — Considerações futuras

**R-9: Retroativo opcional**  
Ação administrativa "Verificar duplicatas em extratos anteriores" que roda a detecção nos statements já importados e sugere o que marcar.

**R-10: Substituição de extrato**  
Feature separada: importar um extrato novo para "substituir" um anterior, que seria arquivado. Soluciona a raiz do problema de sobreposição.

---

## Critérios de aceitação (P0)

### Import com sobreposição

- [ ] Dado que o extrato A (Jan 1–15) foi importado com a linha "PIX R$100 crédito 2026-01-10 Sicoob"
- [ ] Quando o gestor importa o extrato B (Jan 1–30) com a mesma linha
- [ ] Então a linha no extrato B tem `status: 'duplicate'`
- [ ] E a resposta do import inclui `duplicate_count: 1`
- [ ] E o toast de sucesso menciona "1 duplicata ignorada"

### Linha duplicata não aparece como pendente

- [ ] Dado que o extrato B foi importado com 1 duplicata
- [ ] Quando o gestor abre o workspace do extrato B
- [ ] Então a linha duplicada não aparece em "Sem correspondência" nem em "Sugestões"
- [ ] E `summary.pending_count` não inclui a linha duplicada

### Sem conta — não deduplica por conta errada

- [ ] Dado que o extrato A tem `bank_account: 'Sicoob'` e o extrato B não tem conta
- [ ] Quando o gestor importa o extrato B com uma linha de mesma data/valor/direção
- [ ] Então a linha no extrato B **não** é marcada como duplicata (ambiguidade de conta)
- [ ] E o toast avisa: "Deduplicação parcial — extrato sem conta não pôde verificar duplicatas por banco."

### Extrato sem sobreposição — não deduplica

- [ ] Dado que o extrato A cobre Jan 1–15 e o extrato B cobre Jan 16–31
- [ ] Quando o gestor importa o extrato B
- [ ] Então nenhuma linha é marcada como duplicata
- [ ] E `duplicate_count: 0` na resposta

---

## Métricas de sucesso

| Métrica | Linha de base | Alvo (30 dias pós-deploy) | Como medir |
|---------|--------------|--------------------------|------------|
| Linhas ignoradas manualmente por import | ~N (a medir) | redução ≥ 60% | média de `ignored` por import que têm sobreposição |
| Tempo médio de conclusão de um extrato sobreposto | ~N min | redução ≥ 40% | logs de `completeBankReconciliation` vs `import_date` |
| Taxa de erros "item_not_unmatched" em `confirmBankMatch` | baseline atual | sem regressão | logs de erro da API |

---

## Perguntas em aberto

| # | Pergunta | Dono | Bloqueante? |
|---|----------|------|-------------|
| Q1 | A busca de duplicatas deve varrer todos os 50 statements da listagem ou apenas os que têm período sobreposto? Escanear 50 × 500 itens por import pode adicionar latência. | Eng | Sim — define a query strategy |
| Q2 | Se o item original já foi `'matched'` (conciliado), a detecção ainda marca a cópia como `'duplicate'`? Ou só quando o original é `'unmatched'`/`'ignored'`? | Produto | Sim — impacta a lógica de filtro |
| Q3 | O campo `duplicate_of` deve ser indexado no Appwrite para suportar a feature retroativa (P2)? Ou adicionamos só quando precisar? | Eng | Não (P2) |
| Q4 | O banner "deduplicação parcial (sem conta)" deve aparecer no modal de import ou só no workspace? | Design/Produto | Não |

---

## Dependências e contexto técnico

- **Appwrite collection `BANK_STATEMENT_ITEMS_COL`**: precisará de query por `(statement_id IN [...], date, amount, direction)` — verificar se o índice composto existe ou precisa ser criado.
- **Limite de Vercel Hobby (12 functions)**: a lógica de deduplicação fica inteiramente em `handleImport` dentro de `api/finance.js` — sem nova function.
- **`bankReconciliationMatcher.js`**: a função `amountsEqual` já existe e pode ser reutilizada na comparação de valores.
- **Status `'duplicate'` novo**: requer que `grouped` em `ReconciliationTab` e os filtros de `handleDetail` sejam atualizados para tratar `'duplicate'` igual a `'ignored'`.
- **Spec multi-conta** ([conciliação multi-conta](../../flows/financeiro/conciliacao-bancaria.md)): a deduplicação por conta (`bank_account`) é pré-requisito — já implementado em Jun/2026.

---

## Estimativa de esforço

| Fase | Escopo | Estimativa |
|------|--------|-----------|
| Backend: detecção + status `duplicate` | `handleImport` + query Appwrite | ~3h |
| Backend: `handleDetail` filtros + summary | excluir `duplicate` de `pending_count` | ~30min |
| Frontend: agrupar `duplicate` com `ignored` | `ReconciliationTab` `grouped` | ~30min |
| Frontend: toast com `duplicate_count` | `onImported` callback | ~20min |
| Testes unitários + integração | handler + modal | ~2h |
| **Total P0** | | **~6h** |
| P1 (badge + seção colapsada + reprocessar) | | +3h |
