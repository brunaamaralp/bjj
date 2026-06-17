# Bruto / Taxa / Líquido — alinhamento do modelo financeiro — TECH Spec

**Data:** 2026-06-17  
**PRODUCT:** [2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md)  
**Status:** Fase 1 implementada (2026-06-17) · Fase 2 pendente

---

## 1. Diagnóstico técnico (estado atual)

### 1.1 Modelo `FINANCIAL_TX`

| Campo | Semântica hoje | Onde normaliza |
|-------|----------------|----------------|
| `gross` | Valor nominal da transação | `normalizeTxAmounts` (`lib/server/financeTxFields.js`) |
| `fee` | Desconto/taxa (entrada: reduz líquido) | Idem |
| `net` | Entrada/saída efetiva no caixa | Idem; agregações usam **net** |

Contabilidade (`src/components/finance/montarLancamento.js`):

- Receita = `net`
- Se `fee > 0` → despesa categoria “Taxas de cartão” (ou equivalente)

### 1.2 Repasse vs MDR (gap)

```
paymentStatus.expectedAmountWithCardFee()
  → infla valor cobrado (repasse cardFees)

studentPaymentFinancialTxMirror.js
  → gross = valor pago
  → fee = withFee - base   // repasse, NÃO MDR
  → net = gross - fee      // ≈ preço do plano

salesMirror.js
  → fee: 0, net: gross    // sempre
```

`cardFees` em `financeConfig` **nunca** representa MDR da operadora.

### 1.3 Previsão

- `src/lib/financeForecastInflows.js` — mensalidades e pagamentos pendentes em valores **brutos** (`expected_amount`, parcelas).
- `lib/server/financeForecastHandler.js` — agrega sem deduzir MDR.
- `ForecastTab.jsx` — KPIs sem distinção bruto/net.

### 1.4 Fechamento

- `src/lib/monthlyClosing.js` — `receivedAmountForPayment`, `expectedAmountForStudent`; **sem** leitura de `gross/fee/net` do TX.
- `MonthlyClosingTab.jsx` — colunas de recebimento único.

---

## 2. Fase 1 — Implementação (sem mudar modelo)

### 2.1 Configurações — copy

| Arquivo | Mudança |
|---------|---------|
| `FinanceSettingsFeesSection.jsx` | Expandir lead; adicionar `StatusBanner` info (ver PRODUCT §5.1) |
| `FinanceSettingsPlansSection.jsx` | Label `applyCardFee` → “Repasse taxas de pagamento ao aluno” |
| `src/lib/financeTermHints.js` | Novas chaves: `cardFeesRepasse`, `liquidoBancario` |
| `src/test/financeSettingsSections.test.js` | Assert textos |

**Sem** mudança em `paymentStatus.js` ou espelhos.

### 2.2 Fechamento — colunas Bruto / Taxa / Líquido

**Opção recomendada (OQ5):** enriquecer resposta da rota de fechamento no servidor.

```
GET /api/finance?route=monthly-closing&month=YYYY-MM
```

Fluxo:

1. `monthlyClosingHandler` (ou handler existente) já monta linhas via `buildClosingRows`.
2. Coletar `financial_tx_id` únicos das linhas `mensalidade` com status recebido/parcial.
3. Batch read `FINANCIAL_TX` (máx. N ids por request; reutilizar padrão de `financeTxBatch` se existir).
4. Anexar em cada linha:

```ts
mirrorAmounts?: { gross: number; fee: number; net: number } | null
```

5. UI: colunas condicionais — renderizar trio só se `mirrorAmounts != null`.

**Alternativa (menor backend):** cliente já tem `transactions` no hub — join por `financial_tx_id` em `MonthlyClosingTab` se TX estiver no cache local. **Rejeitar** se fechamento for usado sem carregar movimentações (payload incompleto).

**Arquivos:**

| Arquivo | Mudança |
|---------|---------|
| `src/lib/monthlyClosing.js` | `enrichClosingRowsWithMirrorAmounts(rows, txById)` |
| `lib/server/*closing*` handler | Batch load TX + enrich |
| `MonthlyClosingTab.jsx` | Colunas + rodapé opcional |
| `src/test/monthlyClosing.test.js` | Casos com/sem `financial_tx_id` |

**Paridade Caixa:** valores devem igualar `mapFinanceTxDoc` para o mesmo `tx_id`.

### 2.3 Previsão — legenda

| Arquivo | Mudança |
|---------|---------|
| `src/lib/financeTermHints.js` | `previsaoBrutoCliente`, `previsaoLiquidoEstimado` (Fase 1: só bruto ativo) |
| `ForecastTab.jsx` | `FinanceLabelWithHint` nos KPIs de entrada; legenda abaixo do gráfico |
| `src/test/financeForecast.test.js` | Opcional: snapshot strings |

**Sem** alterar `financeForecastHandler` na Fase 1.

### 2.4 Mensalidades — P1

| Arquivo | Mudança |
|---------|---------|
| `MensalidadesPanel.jsx` | Se pagamento `paid` + `financial_tx_id`, fetch lazy ou mapa TX do parent — colunas espelho |

Depende de Caixa já carregar TX ou endpoint leve `?route=tx&ids=`.

---

## 3. Fase 2 — Modelo de dados

### 3.1 `financeConfig.acquirerFees` (proposta)

```js
acquirerFees: {
  pix: { percent: 0, fixed: 0 },
  debito: { percent: 0.99, fixed: 0 },
  credito_avista: { percent: 2.99, fixed: 0 },
  credito_parcelado: {
    2: { percent: 3.49, fixed: 0 },
    // ... 12
  },
  antecipacao: { percent: 0, fixed: 0 }, // ou por dia — OQ4
}
```

- Persistência: mesmo blob `financeConfig` da academia (`academies` doc).
- UI: `FinanceSettingsAcquirerFeesSection.jsx` (novo componente).
- Import/export: estender `importFinanceHandler.js` e planilha modelo.

### 3.2 Função pura `computeAcquirerFee`

**Novo:** `src/lib/acquirerFees.js`

```js
export function computeAcquirerFee({
  gross,
  method,
  installments = 1,
  acquirerFees,
}) {
  // canonical method key (paymentMethods.js)
  // percent + fixed, round centavos BRL
  return { fee, net: gross - fee };
}
```

Testes: `src/test/acquirerFees.test.js` — paridade com casos da planilha contador.

### 3.3 Separar repasse e MDR no espelho (decisão OQ3)

**Opção A — `fee` único (MDR apenas):**

- Repasse continua só no valor cobrado (`expected_amount`).
- `gross` = valor pago pelo cliente.
- `fee` = MDR sobre base definida em OQ1.
- `net` = gross − fee.

**Opção B — campos adicionais (explícito):**

- `pass_through_fee` (repasse, informativo)
- `fee` (MDR, contabiliza despesa)

Recomendação TECH: **Opção A** na v1 Fase 2 para não migrar schema Appwrite; repasse não entra em `fee`.

### 3.4 `studentPaymentFinancialTxMirror.js`

Substituir bloco atual:

```js
// hoje: fee = withFee - base (repasse)
```

Por:

```js
import { computeAcquirerFee } from '../../src/lib/acquirerFees.js';

const gross = ...; // valor pago
const { fee, net } = computeAcquirerFee({
  gross,
  method: data.method,
  installments: data.installments,
  acquirerFees: financeConfig?.acquirerFees,
});
```

- Carregar `financeConfig` da academia no handler (padrão já usado em `studentPaymentsHandler`).
- Se `acquirerFees` ausente ou método sem MDR: `fee: 0`, `net: gross` (comportamento atual vendas).

### 3.5 `salesMirror.js`

Para cada pagamento em `sale.payments[]`:

```js
const { fee, net } = computeAcquirerFee({ gross, method, installments, acquirerFees });
// fee: 0 → net: gross  (dinheiro, etc.)
```

Manter troco e splits de categoria; só alterar cálculo fee/net.

### 3.6 Parcelas — `installment_schedule_json`

**Onde gerado:** buscar `installment_schedule` em student payments / vendas parceladas.

Ao criar schedule:

```js
schedule.push({
  due_date,
  gross: parcelGross,
  fee: computeAcquirerFee(...).fee,
  net: ...,
  installment_index: i,
});
```

Previsão (`financeForecastInflows.js`): somar `net` por data de vencimento da parcela; expor `gross` em campo `amount_gross` no item de forecast para UI.

### 3.7 Antecipação

**Schema TX (proposta):**

| Campo | Valor |
|-------|-------|
| `origin_type` | `anticipation_fee` |
| `origin_id` | id do TX parcela original |
| `direction` | `out` ou `fee` em entrada negativa |
| `gross` / `fee` / `net` | valor do desconto |

Handler: `api/finance.js?route=anticipate` **dentro** de `finance.js` existente (não criar arquivo `/api/`).

UI mínima: ação no detalhe do TX parcela no Caixa.

### 3.8 Previsão Fase 2

| Arquivo | Mudança |
|---------|---------|
| `financeForecastInflows.js` | `amount` = net estimado; `amount_gross` opcional |
| `financeForecastHandler.js` | KPIs `totalInflowNet`, `totalInflowGross` |
| `ForecastTab.jsx` | Dois KPIs + legenda atualizada |

### 3.9 Relatórios

| Relatório | Entrada | Campo |
|-----------|---------|-------|
| Faturamento competência | `reports.js` / overview | Σ `gross` filtrado competência |
| Caixa realizado | `financeTxAggregate.js` | Σ `net` por `settledAt` |
| Taxas | DRE / journal | Σ `fee` + linhas despesa taxas |

Estender `src/test/reportsFinanceParity.test.js` com caso MDR.

---

## 4. API e limites Vercel

| Rota | Uso |
|------|-----|
| `GET /api/finance?route=payables` | Sem mudança Fase 1 |
| `GET /api/finance?route=monthly-closing` | Enrich mirror Fase 1 |
| `GET /api/finance?route=forecast` | Campos net/gross Fase 2 |
| `POST /api/finance?route=anticipate` | Fase 2 P1 |

**Proibido:** novo arquivo em `/api/*.js` (12/12).

---

## 5. Migração e compatibilidade

| Cenário | Comportamento |
|---------|---------------|
| Academias sem `acquirerFees` | `fee: 0`; idêntico ao hoje em vendas |
| TX históricas com `fee` = repasse | Não alterar; flag `fee_kind: 'pass_through'` só em TX novos se Opção B |
| `cardFees` | Inalterado; continua só repasse no preço |
| Conciliação bancária | MDR automático reduz necessidade de lançamento manual; conciliação ainda valida `net` |

Script opcional P2: `scripts/backfill-acquirer-fee.mjs` — recalcula últimos 90 dias com dry-run.

---

## 6. Testes obrigatórios

### Fase 1

| Arquivo | Caso |
|---------|------|
| `monthlyClosing.test.js` | `enrichClosingRowsWithMirrorAmounts` |
| `financeSettingsSections.test.js` | Copy repasse |
| `payablesHandler.test.js` | Sem regressão |

### Fase 2

| Arquivo | Caso |
|---------|------|
| `acquirerFees.test.js` | MDR à vista, 3x, PIX, fixed |
| `studentPaymentFinancialTxMirror` (unit) | fee = MDR, não repasse |
| `salesMirror` (unit) | cartão com fee > 0 |
| `financeForecastInflows.test.js` | parcela net na data certa |
| `reportsFinanceParity.test.js` | faturamento vs caixa |

---

## 7. Ordem de implementação sugerida

```
Fase 1
  1. financeTermHints + FinanceSettingsFeesSection copy
  2. FinanceSettingsPlansSection label
  3. monthlyClosing enrich + MonthlyClosingTab colunas
  4. ForecastTab legenda
  5. Testes + docs/flows/financeiro/fechamento.md (se existir)

Fase 2a (após OQ1–OQ3)
  1. acquirerFees.js + config UI + storage
  2. studentPaymentFinancialTxMirror
  3. salesMirror

Fase 2b
  4. installment_schedule_json
  5. financeForecastInflows + handler + ForecastTab

Fase 2c
  6. anticipation route
  7. reports parity
```

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Dupla contagem de taxa (repasse + MDR no mesmo `fee`) | Opção A: fee só MDR; testes de regressão mensalidades |
| Schema Appwrite sem atributos novos | `financeTxDocumentWithOptionals` + strip unknown (padrão existente) |
| Performance fechamento (batch TX) | Limite 200 ids; paginar |
| Previsão mais pessimista (net) | Comunicação PRODUCT; KPI bruto paralelo |

---

## 9. Referências de código

| Tópico | Arquivo |
|--------|---------|
| Normalização TX | `lib/server/financeTxFields.js` → `normalizeTxAmounts` |
| Repasse | `src/lib/paymentStatus.js` → `expectedAmountWithCardFee` |
| Espelho mensalidade | `lib/server/studentPaymentFinancialTxMirror.js` |
| Espelho venda | `lib/server/salesMirror.js` |
| Agregação caixa | `src/lib/financeTxAggregate.js`, `src/lib/bankAccountBalances.js` |
| Journal | `src/components/finance/montarLancamento.js` |
| Previsão | `lib/server/financeForecastHandler.js`, `src/lib/financeForecastInflows.js` |
| Fechamento | `src/lib/monthlyClosing.js`, `MonthlyClosingTab.jsx` |
| Config taxas UI | `FinanceSettingsFeesSection.jsx` |
