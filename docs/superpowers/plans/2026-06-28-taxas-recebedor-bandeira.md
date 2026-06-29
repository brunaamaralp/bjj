# Taxas por recebedor e bandeira — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar taxas da maquininha em uma tela (Taxas e recebedores) com granularidade por recebedor (PagBank, Asaas…) e bandeira (Visa, Master, Elo…), exigindo bandeira no pagamento apenas quando há divergência entre bandeiras.

**Architecture:** Nova entidade `feeReceivers[]` com matriz `FeeByBrand`; resolver central `resolveFeeReceiver.js`; migração automática do modelo legado (`acquirerFees`, conta, meio de captura); UI única na aba Recebedores; validação condicional de `card_brand` via `hasBrandFeeDivergence`.

**Tech Stack:** React (Vite), Appwrite `financeConfig` + `settings` offload, Vitest, libs existentes `acquirerFees.js` / `resolveAcquirerFees.js` como adapter temporário.

**Specs:** [PRODUCT](../specs/2026-06-28-taxas-recebedor-bandeira-PRODUCT.md) · [TECH](../specs/2026-06-28-taxas-recebedor-bandeira-TECH.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/cardBrands.js` | Enum + labels + `normalizeCardBrand` |
| `src/lib/feeReceivers.js` | Schema, normalize, sparse, divergence, `pickFeeRow` |
| `src/lib/migrateFeeReceivers.js` | Read-path migration from legacy |
| `src/lib/resolveFeeReceiver.js` | Precedência recebedor + cálculo fee |
| `src/lib/financeConfigStorage.js` | Offload `financeFeeReceivers` |
| `src/components/finance/settings/FinanceSettingsFeeReceiversSection.jsx` | Lista + drawer |
| `src/components/finance/settings/FeeReceiverMatrix.jsx` | Grade bandeira × método |
| `src/components/finance/CardBrandSelect.jsx` | Select condicional |
| `src/lib/captureMethodPaymentForm.js` | Validação bandeira + recebedor |

---

## Fase 1 — Libs e migração

### Task 1: `cardBrands.js`

**Files:**
- Create: `src/lib/cardBrands.js`
- Test: `src/test/cardBrands.test.js`

- [ ] **Step 1: Write failing test**

```js
import { describe, it, expect } from 'vitest';
import { normalizeCardBrand, CARD_BRAND_UI_LABELS } from '../lib/cardBrands.js';

describe('cardBrands', () => {
  it('normaliza aliases', () => {
    expect(normalizeCardBrand('VISA')).toBe('visa');
    expect(normalizeCardBrand('master')).toBe('mastercard');
    expect(normalizeCardBrand('')).toBe('default');
  });

  it('tem label PT para visa', () => {
    expect(CARD_BRAND_UI_LABELS.visa).toBe('Visa');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- cardBrands.test.js`

- [ ] **Step 3: Implement**

```js
export const CARD_BRANDS = [
  'default', 'visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other',
];

export const CARD_BRAND_UI_LABELS = {
  default: 'Padrão',
  visa: 'Visa',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'Amex',
  hipercard: 'Hipercard',
  other: 'Outras',
};

const ALIASES = {
  visa: 'visa',
  master: 'mastercard',
  mastercard: 'mastercard',
  mc: 'mastercard',
  elo: 'elo',
  amex: 'amex',
  americanexpress: 'amex',
  hiper: 'hipercard',
  hipercard: 'hipercard',
  other: 'other',
  outras: 'other',
  default: 'default',
};

export function normalizeCardBrand(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!key) return 'default';
  return ALIASES[key] || (CARD_BRANDS.includes(key) ? key : 'other');
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `npm test -- cardBrands.test.js`

---

### Task 2: `feeReceivers.js` — schema e divergência

**Files:**
- Create: `src/lib/feeReceivers.js`
- Test: `src/test/feeReceivers.test.js`

- [ ] **Step 1: Write failing tests for divergence**

```js
import { describe, it, expect } from 'vitest';
import {
  hasBrandFeeDivergence,
  pickFeeRow,
  defaultFeeReceiver,
  normalizeFeeReceiver,
} from '../lib/feeReceivers.js';

const receiver = normalizeFeeReceiver({
  id: 'recv_1',
  name: 'PagBank',
  bankAccountLabel: 'Pagbank',
  active: true,
  useDefaultFees: false,
  fees: {
    pix: { percent: 0, fixed: 0 },
    debito: {
      default: { percent: 1.99, fixed: 0 },
      visa: { percent: 1.79, fixed: 0 },
      mastercard: { percent: 1.89, fixed: 0 },
    },
    credito_avista: { default: { percent: 0, fixed: 0 } },
    credito_parcelado: {},
    antecipacao: { percent: 0, fixed: 0 },
  },
});

describe('hasBrandFeeDivergence', () => {
  it('true quando visa != master', () => {
    expect(hasBrandFeeDivergence(receiver, 'cartao_debito', 1)).toBe(true);
  });

  it('false quando só default preenchido', () => {
    const r = normalizeFeeReceiver({
      ...receiver,
      fees: {
        ...receiver.fees,
        debito: { default: { percent: 2, fixed: 0 } },
      },
    });
    expect(hasBrandFeeDivergence(r, 'cartao_debito', 1)).toBe(false);
  });
});

describe('pickFeeRow', () => {
  it('usa visa quando informado', () => {
    const row = pickFeeRow(receiver.fees, 'cartao_debito', 1, 'visa');
    expect(row.percent).toBe(1.79);
  });

  it('fallback default', () => {
    const row = pickFeeRow(receiver.fees, 'cartao_debito', 1, '');
    expect(row.percent).toBe(1.99);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- feeReceivers.test.js`

- [ ] **Step 3: Implement `feeReceivers.js`** (normalize, `feeRowSignature`, `collectBrandRows`, `hasBrandFeeDivergence`, `pickFeeRow`, `newFeeReceiverId`, `defaultFeeReceiver`, `emptyFeeReceiverFeeTable`)

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- feeReceivers.test.js`

---

### Task 3: `migrateFeeReceivers.js`

**Files:**
- Create: `src/lib/migrateFeeReceivers.js`
- Modify: `src/lib/financeConfigStorage.js` (call migration in merge)
- Test: `src/test/migrateFeeReceivers.test.js`

- [ ] **Step 1: Test migração global + conta custom**

```js
import { describe, it, expect } from 'vitest';
import { migrateFinanceConfigToFeeReceivers } from '../lib/migrateFeeReceivers.js';

describe('migrateFeeReceivers', () => {
  it('cria recebedor padrão de acquirerFees global', () => {
    const cfg = migrateFinanceConfigToFeeReceivers({
      acquirerFees: { debito: { percent: 1.5, fixed: 0 }, /* ...defaults */ },
      bankAccounts: [],
    });
    expect(cfg.feeReceivers?.length).toBeGreaterThan(0);
    expect(cfg.defaultFeeReceiverId).toBeTruthy();
  });
});
```

- [ ] **Step 2: Implement migration** — map legacy `acquirerFees` shape → `FeeByBrand` with only `default` column

- [ ] **Step 3: Wire in `mergeFinanceConfigFromAcademyDoc`**

- [ ] **Step 4: Run tests**

Run: `npm test -- migrateFeeReceivers.test.js`

---

### Task 4: `resolveFeeReceiver.js`

**Files:**
- Create: `src/lib/resolveFeeReceiver.js`
- Modify: `src/lib/resolveAcquirerFees.js` (delegate to adapter)
- Test: `src/test/resolveFeeReceiver.test.js`

- [ ] **Step 1: Tests precedência + `requiresCardBrandForPayment`**

```js
it('requiresCardBrand false quando só default', () => {
  expect(requiresCardBrandForPayment(cfg, {
    method: 'cartao_debito', installments: 1, bankAccount: 'Pagbank',
  })).toBe(false);
});

it('requiresCardBrand true com divergência PagBank débito', () => {
  expect(requiresCardBrandForPayment(cfgPagbank, {
    method: 'cartao_debito', installments: 1, feeReceiverId: 'recv_pag',
  })).toBe(true);
});
```

- [ ] **Step 2: Implement resolver + `computeFeeReceiverFeeForPayment`**

- [ ] **Step 3: Adapter em `resolveAcquirerFees.js`**

- [ ] **Step 4: Run**

Run: `npm test -- resolveFeeReceiver.test.js resolveAcquirerFees.test.js`

---

### Task 5: Persistência offload

**Files:**
- Modify: `src/lib/financeConfigStorage.js`
- Modify: `src/hooks/useFinanceConfigState.js` (digest includes feeReceivers)

- [ ] **Step 1: Add `SETTINGS_FEE_RECEIVERS_KEY` + read/write/offload**

- [ ] **Step 2: `compactFinanceConfigForSave` strips legacy `acquirerFees` on accounts when migrated**

- [ ] **Step 3: Run existing finance config tests**

Run: `npm test -- financeConfigStorage bankAccounts`

---

## Fase 2 — UI única

### Task 6: `FeeReceiverMatrix.jsx`

**Files:**
- Create: `src/components/finance/settings/FeeReceiverMatrix.jsx`

- [ ] **Step 1: Componente com colunas Padrão + bandeiras; linhas PIX / débito / crédito 1x / parcelado expansível**

- [ ] **Step 2: Botão "Copiar Padrão → todas as bandeiras"**

- [ ] **Step 3: Props: `fees`, `onChange`, `idPrefix`**

---

### Task 7: `FinanceSettingsFeeReceiversSection.jsx`

**Files:**
- Create: `src/components/finance/settings/FinanceSettingsFeeReceiversSection.jsx`
- Modify: `src/components/finance/settings/FinanceSettingsFeesSection.jsx`

- [ ] **Step 1: Abas Repasse | Recebedores**

- [ ] **Step 2: Lista recebedores + drawer com `FeeReceiverMatrix`**

- [ ] **Step 3: Card recebedor padrão no topo**

- [ ] **Step 4: Remover `FinanceSettingsAcquirerFeesSection` da árvore (lógica absorvida)**

---

### Task 8: Limpar UI legada

**Files:**
- Modify: `src/components/finance/settings/FinanceSettingsBanksSection.jsx`
- Modify: `src/components/finance/settings/FinanceSettingsCaptureMethodPanel.jsx`
- Modify: `src/lib/financeSettingsSections.js`

- [ ] **Step 1: Banks — remover matriz; add `<select feeReceiverId>`**

- [ ] **Step 2: Capture — remover `CaptureMethodFeeMatrix`; add select recebedor obrigatório se ativo**

- [ ] **Step 3: Renomear label seção → "Taxas e recebedores"**

- [ ] **Step 4: Test**

Run: `npm test -- financeSettingsSections.test.js`

---

## Fase 3 — Pagamentos

### Task 9: `CardBrandSelect.jsx` + validação

**Files:**
- Create: `src/components/finance/CardBrandSelect.jsx`
- Modify: `src/lib/captureMethodPaymentForm.js`

- [ ] **Step 1: `CardBrandSelect` retorna `null` se `!requiresCardBrandForPayment(...)`**

- [ ] **Step 2: `validateCardBrandForSubmit` retorna erro só com divergência**

```js
export function validateCardBrandForSubmit(financeConfig, { method, installments, cardBrand, ...opts }) {
  if (!isCardPaymentMethod(method)) return null;
  if (!requiresCardBrandForPayment(financeConfig, { method, installments, ...opts })) return null;
  const brand = normalizeCardBrand(cardBrand);
  if (brand === 'default' || !brand) {
    return 'Selecione a bandeira do cartão.';
  }
  return null;
}
```

- [ ] **Step 3: Test `cardBrandPaymentValidation.test.js`**

---

### Task 10: Modais de pagamento

**Files:**
- Modify: `src/components/student/StudentPaymentModal.jsx`
- Modify: `src/components/sales/SalesPaymentBlock.jsx`
- Modify: `src/components/finance/BankReconRegisterPaymentModal.jsx`
- Modify: `lib/server/salePaymentRules.js`
- Modify: `lib/server/studentPaymentsHandler.js`

- [ ] **Step 1: Integrar `CardBrandSelect` + persistir `card_brand` e `fee_receiver_id`**

- [ ] **Step 2: Preview Bruto/Taxa/Líquido com `computeFeeReceiverFeeForPayment`**

- [ ] **Step 3: Validação server-side espelhando client**

---

### Task 11: Espelhos Caixa

**Files:**
- Modify: `lib/server/studentPaymentFinancialTxMirror.js`
- Modify: `lib/server/salesMirror.js`
- Modify: `src/lib/studentPayments.js`

- [ ] **Step 1: Substituir `computeAcquirerFeeForPayment` por `computeFeeReceiverFeeForPayment`**

- [ ] **Step 2: Test espelho com bandeira**

Run: `npm test -- studentPaymentFinancialTxMirror salePaymentRules`

---

## Fase 4 — Previsão e docs

### Task 12: Forecast + anticipation

**Files:**
- Modify: `src/lib/financeForecastInflows.js`
- Modify: `src/lib/installmentSchedule.js`
- Modify: `lib/server/financeAnticipationHandler.js`

- [ ] **Step 1: Usar recebedor padrão da forma; bandeira = default**

- [ ] **Step 2: Run forecast tests if any**

---

### Task 13: Documentação

**Files:**
- Modify: `docs/flows/financeiro/config-inicial-financeiro.md`

- [ ] **Step 1: Atualizar mapa de telas e checklist — taxas só em Taxas e recebedores**

- [ ] **Step 2: Linkar specs 2026-06-28**

---

## Verificação final

Run: `npm test -- feeReceivers resolveFeeReceiver migrateFeeReceivers cardBrands resolveAcquirerFees financeSettingsSections studentPaymentFinancialTxMirror salePaymentRules`

Manual:
1. Cadastrar recebedor PagBank com Visa ≠ Master no débito
2. Registrar pagamento débito — bandeira obrigatória
3. Copiar Padrão para todas — bandeira some
4. Confirmar líquido no Caixa

---

## Execution handoff

**Plan saved to:** `docs/superpowers/plans/2026-06-28-taxas-recebedor-bandeira.md`

**Execution options:**

1. **Subagent-Driven** — subagent por task, review entre tasks
2. **Inline Execution** — implementar nesta sessão com checkpoints

Qual abordagem prefere para começar a implementação?
