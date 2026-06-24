# Parcelamento de vendas de produtos

**Data:** 2026-06-23  
**Status:** rascunho - aguardando aprovacao  
**Origem:** investigacao do bug "nao estou conseguindo parcelar vendas" no fluxo de vendas de produtos.

**Specs relacionadas:**

- [2026-06-17-formas-recebimento-meios-captura-TECH.md](./2026-06-17-formas-recebimento-meios-captura-TECH.md)
- [2026-06-17-formas-recebimento-meios-captura-PRODUCT.md](./2026-06-17-formas-recebimento-meios-captura-PRODUCT.md)
- [2026-06-17-bruto-taxa-liquido-modelo-financeiro-TECH.md](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-TECH.md)
- [2026-06-15-mensalidades-parcelamento-taxas-TECH.md](./2026-06-15-mensalidades-parcelamento-taxas-TECH.md)

**Arquivos-chave hoje:**

- `src/components/sales/SalesNewSaleTab.jsx`
- `src/components/sales/SalesPaymentBlock.jsx`
- `src/components/student/StudentProductSaleStep.jsx`
- `src/lib/salePayments.js`
- `src/store/useSalesStore.js`
- `lib/server/salesCreateHandler.js`
- `lib/server/salesLiquidateHandler.js`
- `lib/server/salesMirror.js`
- `functions/salePayments.mjs`

---

## 1. Resumo executivo

Hoje o produto nao suporta parcelamento de vendas de ponta a ponta. O checkout de vendas nao coleta parcelas, o payload enviado pelo frontend nao contem `installments`, e o backend ativo de vendas ainda usa um normalizador legado que descarta campos extras como `installments` e `capture_method_id`.

Como consequencia:

- venda no ato com cartao parcelado nao pode ser registrada corretamente
- venda a prazo liquidada depois tambem cai como `1x`
- taxa, liquido e prazo de credito no Caixa tendem a ser calculados como se tudo fosse a vista
- o meio de captura escolhido na UI tambem nao fica confiavel no espelho financeiro

**Direcao desta spec:** criar um contrato canonico de pagamentos de venda e aplicá-lo no fluxo completo de vendas, cobrindo:

- checkout normal de venda concluida na hora
- liquidacao posterior de venda pendente
- espelho no Caixa com taxa, liquido e prazo corretos
- testes de regressao para evitar perda silenciosa de dados

---

## 2. Problema

### 2.1 UI sem conceito de parcelas

O checkout atual de vendas permite:

- escolher forma de pagamento
- dividir o total em ate 3 linhas
- informar troco em dinheiro
- selecionar meio de captura

Mas nao permite:

- informar numero de parcelas por linha de cartao de credito
- restringir parcelas ao metodo `cartao_credito`
- enxergar o efeito do parcelamento no resumo do pagamento

### 2.2 Contrato quebrado entre front e backend

No frontend, `serializePagamentosForApi()` gera um payload com:

- `forma`
- `valor`
- `troco`
- `forma_troco`
- `capture_method_id`

No backend, o fluxo de vendas usa `normalizePagamentosInput()` reexportado de `functions/salePayments.mjs`, que hoje preserva apenas:

- `forma`
- `valor`
- `troco`
- `forma_troco`

Ou seja, mesmo que o frontend passasse `installments` e `capture_method_id`, o servidor ativo de vendas os perderia antes de gravar a venda ou espelhar no Caixa.

### 2.3 Espelho financeiro preparado, mas alimentado com dados incompletos

`salesMirror.js` e `salesLiquidateHandler.js` ja tentam usar `installments` para:

- calcular taxa da adquirente
- calcular liquido
- calcular prazo de credito e `expected_settlement_at`

O problema e que esse campo nao chega normalizado. Na pratica, o espelho cai em `installments = 1`.

### 2.4 Regressao silenciosa e risco operacional

Esse bug e perigoso porque nao quebra com erro visivel. A venda pode concluir com sucesso, mas:

- o parcelamento nao fica registrado
- a taxa aplicada fica errada
- a previsao de caixa fica otimista ou incorreta
- a conciliacao posterior fica mais dificil

---

## 3. Objetivo

### Goals

| ID | Meta |
|---|---|
| G1 | Permitir parcelamento de venda no checkout normal quando a forma for `cartao_credito` |
| G2 | Preservar `installments` e `capture_method_id` no contrato de pagamentos da venda |
| G3 | Fazer criacao e liquidacao de venda usarem o mesmo contrato canonico |
| G4 | Espelhar taxa, liquido e prazo de credito corretos no Caixa |
| G5 | Manter compatibilidade para metodos que nao usam parcelamento, forçando `installments = 1` |
| G6 | Cobrir o comportamento com testes de serializacao, normalizacao e espelho financeiro |

### Non-goals

| Item | Fora de escopo nesta spec |
|---|---|
| N1 | Parcelamento de mensalidades ou matriculas, que ja seguem fluxo proprio |
| N2 | Criar nova modelagem completa de cronograma explicito em `installment_schedule_json` para toda venda de cartao |
| N3 | Mudar a regra de venda a prazo sem pagamento imediato; ela continua sendo recebivel pendente |
| N4 | Criar novo arquivo em `/api/` |
| N5 | Recalcular historico antigo de vendas ja criadas sem parcelas |
| N6 | Permitir parcelamento para debito, pix, dinheiro, transferencia ou outros metodos |

---

## 4. Decisao de produto

### 4.1 Regra principal

Parcelamento de venda e um atributo por linha de pagamento e so pode existir quando a forma da linha for `cartao_credito`.

### 4.2 Regra por metodo

| Metodo | `installments` |
|---|---|
| `cartao_credito` | `1..12`, respeitando limite do meio de captura se houver |
| `cartao_debito` | sempre `1` |
| `pix` | sempre `1` |
| `dinheiro` | sempre `1` |
| `transferencia` | sempre `1` |
| `outro` | sempre `1` |

### 4.3 Regra para pagamentos mistos

Cada linha de pagamento continua independente. Exemplo valido:

- `pix` de R$ 100,00 com `installments = 1`
- `cartao_credito` de R$ 300,00 com `installments = 3`

O resumo textual da forma de pagamento continua derivado do conjunto das linhas, sem expor necessariamente a quantidade de parcelas no label principal da venda.

### 4.4 Regra para venda a prazo

Venda a prazo sem pagamento imediato continua igual:

- `deferred = true`
- sem `pagamentos` no momento da criacao
- espelho inicial como recebivel pendente

Quando essa venda for liquidada depois:

- o payload de liquidacao passa a aceitar `installments`
- a liquidacao usa o mesmo contrato canonico da venda no ato

---

## 5. Estado atual

### 5.1 Frontend

O fluxo principal de venda em `SalesNewSaleTab.jsx` e `StudentProductSaleStep.jsx`:

1. coleta itens do carrinho
2. serializa pagamentos com `serializePagamentosForApi()`
3. chama `createSale()` no store
4. envia o payload para `POST /api/sales`

O bloco `SalesPaymentBlock.jsx` nao possui campo de parcelas e, por isso, a informacao nunca entra no estado do formulario.

### 5.2 Backend

O backend ativo e `lib/server/salesCreateHandler.js`, nao a Appwrite Function legada.

Esse handler:

1. recebe `pagamentos`
2. chama `normalizePagamentosInput()`
3. valida o total
4. persiste `pagamentos_json`
5. chama `salesMirror.js`

O mesmo problema reaparece em `lib/server/salesLiquidateHandler.js`.

### 5.3 Divergencia de normalizadores

Hoje existem dois normalizadores de pagamentos de venda:

- `src/lib/salePayments.js` no frontend
- `functions/salePayments.mjs` reutilizado no backend

Eles nao estao alinhados no contrato suportado. Essa divergencia e a raiz tecnica do problema.

---

## 6. Design

### 6.1 Contrato canonico de pagamento de venda

Criar e adotar um shape unico para pagamentos de venda:

```ts
type SalePaymentInput = {
  forma: string;
  valor: number;
  troco?: number;
  forma_troco?: string;
  capture_method_id?: string;
  installments?: number;
};
```

### 6.2 Regras do contrato

- `installments` e opcional na borda, mas sempre normalizado no dominio
- ausencia de `installments` vira `1`
- valor final normalizado deve sempre sair com `installments` explicito
- `capture_method_id` deve ser preservado quando informado
- `capture_method_id` vazio ou invalido nao deve quebrar a venda; segue a regra atual de validacao do formulario

Shape normalizado:

```ts
type NormalizedSalePayment = {
  forma: string;
  valor: number;
  troco?: number;
  forma_troco?: string;
  capture_method_id?: string;
  installments: number;
};
```

### 6.3 Unificacao de normalizacao

O sistema deve ter uma unica fonte de verdade para normalizar pagamentos de venda.

Direcao recomendada:

- elevar a logica compartilhada para um modulo comum sem dependencias de React
- fazer frontend e backend consumirem a mesma normalizacao sem duplicar regra

Se a extracao compartilhada nao for viavel no primeiro PR, a entrega minima ainda precisa garantir paridade exata entre:

- `src/lib/salePayments.js`
- `functions/salePayments.mjs`

Com testes espelhando o mesmo comportamento.

### 6.4 UI do checkout

Adicionar ao `SalesPaymentBlock.jsx` um seletor de parcelas por linha quando:

- `row.forma === 'cartao_credito'`

Comportamento:

- default `1x`
- opcoes `1x..12x`
- se houver meio de captura com `maxInstallments`, limitar opcoes a esse maximo
- ao trocar a forma para algo diferente de credito, resetar `installments` para `1`
- ao trocar para credito, manter valor anterior se valido; senao usar `1`

Exemplo:

```jsx
{row.forma === 'cartao_credito' ? (
  <div className="sales-payment-row__field">
    <span className="text-xs sales-payment-row__field-label">Parcelas</span>
    <select
      className="form-input"
      value={String(row.installments || 1)}
      onChange={(e) => updateRow(idx, { installments: Number(e.target.value) || 1 })}
    >
      {Array.from({ length: maxInstallments }, (_, i) => i + 1).map((n) => (
        <option key={n} value={String(n)}>{n}x</option>
      ))}
    </select>
  </div>
) : null}
```

### 6.5 Serializacao do frontend

`serializePagamentosForApi()` deve:

- continuar serializando `troco` e `forma_troco` quando necessario
- preservar `capture_method_id`
- incluir `installments` em linhas de `cartao_credito`
- forcar `installments = 1` para os demais metodos

### 6.6 Criacao de venda

`salesCreateHandler.js` deve:

1. normalizar `pagamentos` com o contrato novo
2. validar soma liquida contra o total da venda
3. persistir `pagamentos_json` com `installments` e `capture_method_id`
4. chamar `salesMirror.js` com esse payload completo

### 6.7 Liquidacao de venda pendente

`salesLiquidateHandler.js` deve:

1. aceitar o mesmo `SalePaymentInput[]`
2. normalizar com a mesma regra da criacao
3. atualizar `pagamentos_json` da venda
4. reaproveitar `installments` no recalc de taxa, liquido e prazo

### 6.8 Espelho no Caixa

`salesMirror.js` deve continuar usando `installments`, mas agora com dado confiavel.

Para cada linha:

- `gross = valor`
- `installments = linha.installments`
- `captureMethodId = linha.capture_method_id`
- `fee` e `net` via `mirrorAmountsForPaymentWithAccount()`
- `expected_settlement_at` via `financialTxSettlementFields()`

### 6.9 Compatibilidade retroativa

Vendas antigas continuam validas.

Ao ler `pagamentos_json` antigo:

- se a linha nao tiver `installments`, assumir `1`
- se a linha nao tiver `capture_method_id`, assumir string vazia

Assim, o codigo novo nao depende de backfill para operar.

---

## 7. Requisitos

### P0 - Must ship

#### R1 - Seletor de parcelas no checkout de vendas

**Aceite:**

- [ ] `SalesPaymentBlock.jsx` mostra campo de parcelas apenas para `cartao_credito`
- [ ] o campo aceita `1..12` ou o maximo do meio de captura
- [ ] trocar a forma para nao-credito reseta `installments` para `1`

#### R2 - Contrato canonico de pagamentos de venda

**Aceite:**

- [ ] `serializePagamentosForApi()` inclui `installments`
- [ ] `normalizePagamentosInput()` preserva `capture_method_id`
- [ ] `normalizePagamentosInput()` sempre retorna `installments` explicito
- [ ] pagamentos nao credito saem com `installments = 1`

#### R3 - Criacao de venda suporta parcelamento

**Aceite:**

- [ ] `POST /api/sales` persiste `pagamentos_json` com `installments`
- [ ] `POST /api/sales` persiste `capture_method_id` quando informado
- [ ] o resumo da venda continua funcionando para pagamentos mistos

#### R4 - Liquidacao de venda pendente suporta parcelamento

**Aceite:**

- [ ] `PATCH /api/sales?action=liquidar` aceita `installments`
- [ ] a venda liquidada grava `pagamentos_json` com `installments`
- [ ] o espelho financeiro da liquidacao usa o numero real de parcelas

#### R5 - Espelho financeiro coerente

**Aceite:**

- [ ] `salesMirror.js` usa `installments` real ao calcular `fee`
- [ ] `salesMirror.js` usa `installments` real ao calcular `net`
- [ ] `salesMirror.js` usa `installments` real ao calcular `expected_settlement_at`
- [ ] `capture_method_id` chega ao espelho quando presente

#### R6 - Leitura retrocompativel

**Aceite:**

- [ ] vendas antigas sem `installments` continuam abrindo e sendo espelhadas como `1x`
- [ ] o parser nao quebra ao ler `pagamentos_json` legado

### P1 - Should ship no mesmo esforco se simples

#### R7 - Limite de parcelas por meio de captura

**Aceite:**

- [ ] se o meio de captura tiver `maxInstallments`, a UI limita opcoes
- [ ] o backend valida `installments` acima do maximo e recusa com erro de negocio claro

#### R8 - Exibicao de parcelas em detalhes da venda

**Aceite:**

- [ ] `SaleDetailModal.jsx` ou equivalente mostra `3x`, `4x` etc. quando houver cartao parcelado
- [ ] pagamentos a vista continuam com exibicao atual

---

## 8. Fluxos

### 8.1 Venda concluida na hora com cartao parcelado

1. Operador adiciona itens ao carrinho
2. Seleciona `cartao_credito`
3. Escolhe `3x`
4. Opcionalmente escolhe o meio de captura
5. Front serializa linha com `installments: 3`
6. Backend normaliza e grava `pagamentos_json`
7. Espelho no Caixa calcula taxa e previsao com `3x`

### 8.2 Venda com pagamento misto

1. Operador divide o pagamento entre `pix` e `cartao_credito`
2. Linha de `pix` sai com `installments: 1`
3. Linha de `cartao_credito` sai com `installments: N`
4. Backend valida soma liquida total como hoje
5. Espelho cria uma TX por linha com comportamento proprio

### 8.3 Venda a prazo liquidada depois com cartao parcelado

1. Venda nasce como `pendente` com `deferred = true`
2. Mais tarde o operador clica em liquidar
3. Informa `cartao_credito` e `5x`
4. Backend normaliza com o mesmo contrato da venda imediata
5. Atualiza `pagamentos_json`
6. Converte ou substitui o espelho pendente usando `5x`

---

## 9. Validacoes e resiliencia

### 9.1 Validacoes de dominio

- `installments` deve ser inteiro entre `1` e `12`
- se `forma !== cartao_credito`, `installments` sempre vira `1`
- se `forma === cartao_credito` e `capture_method_id` limitar parcelas, validar teto
- `troco` continua permitido apenas no fluxo que ja suporta dinheiro

### 9.2 Fallback seguro

Se uma linha vier sem `installments`:

- nao falhar
- normalizar para `1`

Se o `pagamentos_json` persistido vier de schema antigo:

- manter leitura com default `1`

### 9.3 Erros de negocio esperados

Adicionar codigos claros, por exemplo:

- `invalid_installments`
- `installments_exceeds_capture_max`

Esses erros devem ser diferenciados de:

- `invalid_pagamentos`
- `pagamentos_total_mismatch`
- falhas tecnicas de persistencia

---

## 10. Testes

Adicionar ou ajustar cobertura para:

- `src/test/salePayments.test.js`
  - serializa `cartao_credito` com `installments`
  - preserva `capture_method_id`
  - normaliza pagamento nao credito para `installments = 1`
- testes do backend de vendas
  - criacao de venda com `cartao_credito 3x`
  - liquidacao de venda pendente com `cartao_credito 5x`
  - rejeicao quando `installments` excede `maxInstallments`
- testes de espelho financeiro
  - `salesMirror` recebe `installments`
  - taxa e liquido mudam conforme o numero de parcelas
  - `expected_settlement_at` usa o numero de parcelas correto

Tambem validar manualmente:

- venda no ato em `1x`, `2x` e `3x`
- venda mista `pix + credito`
- venda a prazo liquidada em `2x+`
- leitura de venda antiga sem parcelas

---

## 11. Plano de rollout

### PR-1 - Contrato e checkout

1. adicionar `installments` ao estado da UI de vendas
2. renderizar seletor de parcelas
3. atualizar serializacao do frontend
4. adicionar testes do modulo `salePayments`

### PR-2 - Backend de criacao e liquidacao

1. alinhar `normalizePagamentosInput()` no backend
2. preservar `capture_method_id`
3. persistir `installments` em `pagamentos_json`
4. validar limites

### PR-3 - Espelho financeiro

1. propagar `installments` e `capture_method_id` ao `salesMirror`
2. ajustar liquidacao de venda pendente
3. adicionar testes de espelho e regressao

### PR-4 - UX complementar

1. exibir parcelas no detalhe da venda
2. revisar mensagens de erro amigaveis
3. validar consistencia com previsao de caixa

---

## 12. Riscos e mitigacoes

| Risco | Impacto | Mitigacao |
|---|---|---|
| UI envia `installments`, mas backend antigo ainda descarta | falsa percepcao de correcao | alinhar contrato no backend no mesmo esforco do front |
| Divergencia volta no futuro entre frontend e backend | regressao silenciosa | centralizar normalizacao ou manter testes de paridade |
| Parcelamento quebra pagamentos mistos | erro operacional no caixa | manter validacao de soma atual e ampliar cobertura de testes |
| Vendas antigas sem campo novo quebram parser | erro em historico | default `installments = 1` na leitura |
| Meio de captura com maximo menor que 12 fica inconsistente | taxa e previsao erradas | limitar UI e validar backend |

---

## 13. Resultado esperado

Depois da entrega:

- venda de produto com cartao parcelado passa a existir de verdade no sistema
- criacao e liquidacao de venda usam o mesmo contrato de pagamento
- o Caixa recebe `fee`, `net` e `expected_settlement_at` corretos para cada parcela
- pagamentos antigos continuam funcionando como `1x`
- a regressao deixa de ser silenciosa porque o comportamento fica coberto por testes
