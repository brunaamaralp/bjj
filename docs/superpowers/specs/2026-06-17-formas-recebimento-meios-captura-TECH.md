# Formas de recebimento e meios de captura — TECH Spec

**Data:** 2026-06-17  
**PRODUCT:** [2026-06-17-formas-recebimento-meios-captura-PRODUCT.md](./2026-06-17-formas-recebimento-meios-captura-PRODUCT.md)  
**Status:** Fases 1–3 implementadas (2026-06-17); Fases 4–5 pendentes  

**Dependências já no código:**

- [mdr-por-conta-bancaria](./2026-06-17-mdr-por-conta-bancaria-TECH.md) — `resolveAcquirerFees.js`, taxas por `bankAccounts[]`
- [bruto-taxa-liquido](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-TECH.md) — `mirrorAmountsForPaymentWithAccount`
- [payment-methods-enum](./2026-06-15-payment-methods-enum-unificado-TECH.md) — `paymentMethods.js`

**Integração futura:** [pagbank-conciliacao](./2026-06-16-pagbank-conciliacao-integracao-TECH.md) (Fase 5)

---

## 1. Estado atual

| Peça | Arquivo | Comportamento |
|------|---------|---------------|
| Enum canônico | `src/lib/paymentMethods.js` | 6 formas fixas; sem `active` |
| Conta por método | `src/lib/paymentMethodBankDefaults.js` | `defaultAccountByMethod` |
| Taxa maquininha | `src/lib/resolveAcquirerFees.js` | meio → **conta** → global |
| Repasse | `financeConfig.cardFees` | Global; editado em Taxas |
| UI contas | `FinanceSettingsBanksSection.jsx` | Grid 6× select no final |
| UI taxas | `FinanceSettingsFeesSection.jsx` + `FinanceSettingsAcquirerFeesSection.jsx` | Separado |
| Espelho Caixa | `lib/server/studentPaymentFinancialTxMirror.js` | Sempre `status: 'settled'`, `settledAt: paid_at` |
| Previsão parcelas | `src/lib/installmentSchedule.js` | Cronograma aluno; sem `creditDays` |
| Persistência | `src/lib/financeConfigStorage.js` | JSON em `academies.financeConfig` (~2500 chars legado) |

**Gap (2026-06-17):** Fase 2 implementada — `captureMethods`, `paymentMethodSettings`, resolução meio → taxa/prazo. Fases 4–5 (boleto/cheque, PagBank) pendentes.

---

## 2. Decisões técnicas (PRODUCT open questions)

### 2.1 Q1 — Liquidação no Caixa vs data do crédito bancário

**Decisão:** modelo híbrido em duas camadas.

| Camada | Campo | Uso |
|--------|-------|-----|
| **Pagamento aluno** (`student_payments`) | `status` | `paid` quando `autoMarkReceived`; `pending` para boleto/cheque |
| **Lançamento Caixa** (`financial_tx`) | `status` + `settledAt` + `expected_settlement_at` | Ver tabela abaixo |

| `autoSettle` | `creditDays` | TX no espelho | Previsão |
|--------------|--------------|---------------|----------|
| `true` | `0` | `settled`, `settledAt = paid_at` | `paid_at` |
| `true` | `> 0` | `settled`, `settledAt = paid_at` *(receita reconhecida na venda)* | `paid_at + creditDays` *(fluxo bancário)* |
| `false` | `> 0` | `pending`, `expected_settlement_at = paid_at + creditDays` | mesma data |
| `false` | `0` | `pending` até liquidação manual/conciliação | `due_date` ou `paid_at` |

**Fase 3:** cron existente `api/cron/reset-usage.js?action=finance-settle-scheduled` (rewrite em `vercel.json`) promove `pending` → `settled` quando `expected_settlement_at <= hoje` (UTC). **Sem novo arquivo em `/api/`.**

**Não usar** `settledAt` futuro com `status: settled` — quebra agregações que assumem `settled` = dinheiro no caixa.

### 2.2 Q2 — Meio obrigatório quando N > 1

**Decisão:** sim, no save do pagamento. Se `countActiveCaptureMethods(method) > 1` e `capture_method_id` vazio → erro de validação (`capture_method_required`). Se N === 1 → preencher automaticamente no client e no handler.

### 2.3 Q3 — Boleto / cheque

**Decisão:** adicionar `boleto` e `cheque` ao enum canônico em `paymentMethods.js` (Fase 4). Aliases de storage: `boleto`, `cheque`. Inativos por default em `paymentMethodSettings`.

### 2.4 Q4 — Permissões admin

Admin (`canAccessEmpresaFinanceSettings` && !owner): edita `paymentMethodSettings` e `captureMethods` exceto `integration.*`. Owner edita tudo. Mesma regra de Recebimento/Taxas hoje.

### 2.5 Q5 — Renomear Recebimento

**Decisão TECH:** manter slug `recebimento`; label sidebar → **“Contas bancárias”** no mesmo PR da Fase 1. Formas de recebimento fica item separado.

---

## 3. Schema `financeConfig`

### 3.1 `paymentMethodSettings`

```ts
type PaymentMethodSettings = {
  active?: boolean;                    // default true se ausente (retrocompat)
  defaultBankAccountLabel?: string;    // rótulo formatBankAccountLabel
  autoSettle?: boolean;                // default por método — ver §3.5
  autoMarkReceived?: boolean;
  feesAcknowledged?: boolean;          // usuário marcou “sem taxa” explicitamente (OK configurada)
};

// financeConfig.paymentMethodSettings: Record<CanonicalPaymentMethod, PaymentMethodSettings>
```

### 3.2 `captureMethods[]`

```ts
type CaptureMethodChannel = 'presencial' | 'link' | 'integrado';

type CaptureInstallmentFee = {
  percent: number;
  fixed: number;
  creditDays: number;   // 0 = mesmo dia; default 30 crédito parcelado
};

type CaptureMethod = {
  id: string;                          // crypto.randomUUID() ou cap_${slug}
  name: string;                        // max 80 chars
  paymentMethod: 'cartao_credito' | 'cartao_debito';
  bankAccountLabel: string;
  channel: CaptureMethodChannel;
  online: boolean;
  maxInstallments: number;             // 1–12
  active: boolean;
  useDefaultFees: boolean;             // true → resolver via conta/global
  fees?: Record<string, CaptureInstallmentFee>; // keys '1'..'12'
  integration?: {
    provider: 'pagbank' | 'asaas' | 'stone' | 'manual';
    externalId?: string;
    connected?: boolean;
  };
};
```

### 3.3 Defaults por método (`paymentMethodSettings`)

| Método | `active` | `autoSettle` | `autoMarkReceived` |
|--------|----------|--------------|-------------------|
| `pix` | true | true | true |
| `dinheiro` | true | true | true |
| `cartao_debito` | true | true | true |
| `cartao_credito` | true | false* | true |
| `transferencia` | true | true | true |
| `boleto` | false | false | false |
| `cheque` | false | false | false |
| `outro` | true | true | true |

\* crédito: `autoSettle: false` quando existir `captureMethod` com `creditDays > 0` na parcela usada; senão `true`.

### 3.4 Campos em documentos operacionais

**`student_payments`** (Appwrite — provisionar atributos):

| Atributo | Tipo | Obrigatório |
|----------|------|-------------|
| `capture_method_id` | string(64) | não |
| `capture_method_name` | string(80) | não *(denormalizado para listas)* |

**`financial_tx`**:

| Atributo | Tipo | Obrigatório |
|----------|------|-------------|
| `capture_method_id` | string(64) | não |
| `expected_settlement_at` | datetime | não |

Handlers usam `financeTxDocumentWithOptionals` + `stripUnknownFinanceTxAttrs` (padrão existente).

### 3.5 Deprecação

| Legado | Migração |
|--------|----------|
| `defaultAccountByMethod` | Ler em `readPaymentMethodSettings()`; gravar só `paymentMethodSettings` |
| `methodBankDefaults` | Alias legado — mesma migração |
| Grid em `FinanceSettingsBanksSection` | Remover na Fase 1; link para Formas |

---

## 4. Módulos novos / estendidos

### 4.1 `src/lib/paymentMethodSettings.js` *(novo)*

```js
import { PAYMENT_METHODS, canonicalPaymentMethodKey } from './paymentMethods.js';
import { listBankAccountLabels } from './bankAccounts.js';
import { readDefaultAccountByMethod } from './paymentMethodBankDefaults.js';

export const EXTENDED_PAYMENT_METHODS = [
  ...PAYMENT_METHODS,
  { value: 'boleto', label: 'Boleto' },
  { value: 'cheque', label: 'Cheque' },
];

export function defaultPaymentMethodSettings() { /* §3.3 */ }

export function readPaymentMethodSettings(financeConfig) {
  const raw = financeConfig?.paymentMethodSettings || {};
  const legacy = readDefaultAccountByMethod(financeConfig);
  const out = {};
  for (const { value } of EXTENDED_PAYMENT_METHODS) {
    const row = raw[value] || {};
    out[value] = {
      active: row.active !== false,
      defaultBankAccountLabel:
        String(row.defaultBankAccountLabel || legacy[value] || '').trim(),
      autoSettle: row.autoSettle ?? defaultAutoSettle(value),
      autoMarkReceived: row.autoMarkReceived ?? defaultAutoMarkReceived(value),
      feesAcknowledged: row.feesAcknowledged === true,
    };
  }
  return out;
}

export function normalizePaymentMethodSettings(raw, financeConfig) {
  const labels = new Set(listBankAccountLabels(financeConfig));
  // drop invalid account labels; clamp booleans
}

export function listActivePaymentMethods(financeConfig) {
  const settings = readPaymentMethodSettings(financeConfig);
  return EXTENDED_PAYMENT_METHODS.filter((m) => settings[m.value]?.active !== false);
}

export function isPaymentMethodConfigured(financeConfig, method) {
  const key = canonicalPaymentMethodKey(method);
  const s = readPaymentMethodSettings(financeConfig)[key];
  if (!s?.active) return false;
  if (!s.defaultBankAccountLabel) return false;
  if (key === 'cartao_credito' || key === 'cartao_debito') {
    return hasConfiguredCaptureForMethod(financeConfig, key);
  }
  return true;
}

export function paymentMethodsConfiguredCount(financeConfig) { /* para sidebar */ }
```

### 4.2 `src/lib/captureMethods.js` *(novo)*

```js
export function readCaptureMethods(financeConfig) {
  return (financeConfig?.captureMethods || []).map(normalizeCaptureMethod);
}

export function findCaptureMethodById(financeConfig, id) { /* */ }

export function listActiveCaptureMethods(financeConfig, paymentMethod) {
  const key = canonicalPaymentMethodKey(paymentMethod);
  return readCaptureMethods(financeConfig).filter(
    (c) => c.active && c.paymentMethod === key
  );
}

export function normalizeCaptureMethod(raw) {
  // clamp maxInstallments 1–12
  // sparse fees: omit keys with percent=0, fixed=0, creditDays=0
}

export function captureMethodFeesToAcquirerFees(captureFees) {
  // Converte matriz '1'..'12' → shape acquirerFees (credito_parcelado, credito_avista, debito)
}

export function resolveCreditDaysForInstallment(captureMethod, installments) {
  const n = String(Math.max(1, Math.min(12, installments)));
  return Number(captureMethod?.fees?.[n]?.creditDays ?? 0) || 0;
}

export function hasConfiguredCaptureForMethod(financeConfig, method) {
  const active = listActiveCaptureMethods(financeConfig, method);
  if (!active.length) return true; // sem meios = usa taxa conta/global (retrocompat)
  return active.some(
    (c) => c.useDefaultFees || hasFeesConfigured(c.fees) || c.feesAcknowledged
  );
}
```

### 4.3 `src/lib/resolveAcquirerFees.js` *(estender)*

**Nova precedência:**

```
1. capture_method_id → captureMethods[].fees (se useDefaultFees === false)
2. bank_account → bankAccounts[].acquirerFees (se useDefaultAcquirerFees === false)
3. financeConfig.acquirerFees (global)
```

```js
export function resolveAcquirerFeesForCaptureMethod(financeConfig, captureMethodId = '') {
  const cap = findCaptureMethodById(financeConfig, captureMethodId);
  if (!cap || cap.useDefaultFees !== false) {
    return resolveAcquirerFeesForAccount(financeConfig, cap?.bankAccountLabel || '');
  }
  return captureMethodFeesToAcquirerFees(cap.fees);
}

export function resolveAcquirerFeesForPayment(financeConfig, {
  bankAccount = '',
  method = '',
  captureMethodId = '',
} = {}) {
  if (captureMethodId) {
    return resolveAcquirerFeesForCaptureMethod(financeConfig, captureMethodId);
  }
  // ... comportamento atual
}

export function resolveBankAccountForCaptureMethod(financeConfig, captureMethodId) {
  const cap = findCaptureMethodById(financeConfig, captureMethodId);
  return cap?.bankAccountLabel || '';
}
```

### 4.4 `src/lib/paymentMethodBankDefaults.js` *(estender)*

`readDefaultAccountByMethod` passa a delegar:

```js
export function readDefaultAccountByMethod(financeConfig) {
  const settings = readPaymentMethodSettings(financeConfig);
  const out = {};
  for (const [method, row] of Object.entries(settings)) {
    if (row.defaultBankAccountLabel) out[method] = row.defaultBankAccountLabel;
  }
  return out;
}
```

Mantém leitura de `defaultAccountByMethod` legado dentro de `readPaymentMethodSettings` (uma vez).

---

## 5. Persistência e limites

### 5.1 `financeConfigStorage.js`

Em `mergeFinanceConfigFromAcademyDoc`:

```js
merged.paymentMethodSettings = normalizePaymentMethodSettings(
  merged.paymentMethodSettings,
  merged
);
merged.captureMethods = readCaptureMethods(merged).map(normalizeCaptureMethod);
```

Em `compactFinanceConfigForStorage`:

- Omitir `captureMethods[].fees['n']` quando `percent`, `fixed`, `creditDays` todos zero.
- Omitir `captureMethods` inteiro se `[]`.
- Omitir `paymentMethodSettings[method]` quando igual ao default implícito (opcional v1.1).
- **Não** duplicar `defaultAccountByMethod` no save (só leitura legado).

### 5.2 Tamanho JSON

Estimativa por academia típica (2 meios × 12 parcelas): ~1,2 KB adicional.

Se `fitsFinanceConfigLimit` falhar:

1. Toast existente `FinanceConfigTooLargeError`
2. Sugerir reduzir meios inativos ou usar `useDefaultFees: true`

**Sem** novo atributo Appwrite na v1 — tudo em `financeConfig`. Se crescer: offload `captureMethods` para `academy.settings.captureMethods` (mesmo padrão de `collectionRules` offload).

### 5.3 Digest / dirty state

`useFinanceConfigState.js`:

```js
digestPaymentMethods: JSON.stringify(normalizePaymentMethodSettings(financeConfig, financeConfig)),
digestCaptureMethods: JSON.stringify(readCaptureMethods(financeConfig)),
```

Incluir em `dirty` e `savedDigests`.

---

## 6. UI (Fase 1–2)

### 6.1 Arquivos novos

| Arquivo | Fase | Responsabilidade |
|---------|------|------------------|
| `FinanceSettingsPaymentMethodsSection.jsx` | 1 | Master-detail formas |
| `FinanceSettingsCaptureMethodPanel.jsx` | 2 | CRUD meio + matriz taxas |
| `CaptureMethodFeeMatrix.jsx` | 2 | Grid 1x–12x; copiar/preencher igual |
| `PaymentMethodStatusIcon.jsx` | 1 | ✓/○ ativa/configurada |
| `FinancePaymentMethodsWizard.jsx` | 4 | Modal multi-step pós-conta |

### 6.2 `financeSettingsSections.js`

```js
export const FINANCE_SETTINGS_SECTIONS = {
  // ...
  FORMAS: 'formas-recebimento',
};

// Grupo essencial — após RECEBIMENTO:
{
  id: FINANCE_SETTINGS_SECTIONS.FORMAS,
  label: 'Formas de recebimento',
  hint: 'PIX, cartão, boleto — conta padrão e maquininhas',
},
```

`buildFinanceSettingsSummaries`:

```js
[FINANCE_SETTINGS_SECTIONS.FORMAS]: {
  done: paymentMethodsConfiguredCount(cfg).configured === paymentMethodsConfiguredCount(cfg).total,
  summary: `${configured}/${total} configuradas`,
},
```

### 6.3 `FinanceiroConfigTab.jsx`

```jsx
case FINANCE_SETTINGS_SECTIONS.FORMAS:
  return (
    <FinanceSettingsPaymentMethodsSection
      financeConfig={state.financeConfig}
      setFinanceConfig={state.setFinanceConfig}
    />
  );
```

### 6.4 `FinanceSettingsBanksSection.jsx`

- Remover bloco `finance-settings-method-accounts` (grid).
- Adicionar link: *“Definir conta por forma de pagamento →”* → `goSection(FORMAS)`.

### 6.5 Modais operacionais (Fase 2)

**Arquivos:** `MensalidadesPanel.jsx`, `StudentPaymentModal.jsx`, `MatriculaPaymentStep.jsx`, `BankReconRegisterPaymentModal.jsx`, `SalesPaymentBlock.jsx`

```jsx
const captureOptions = listActiveCaptureMethods(financeConfig, payForm.method);
const showCaptureSelect = captureOptions.length > 1;

// onChange method:
setPayForm((f) => ({
  ...f,
  method,
  capture_method_id: singleCapture?.id || '',
  account:
    resolveBankAccountForCaptureMethod(financeConfig, singleCapture?.id) ||
    accountWhenPaymentMethodChanges(financeConfig, method) ||
    f.account,
}));
```

`orderedPayMethodsForModal` / `PAYMENT_METHODS` → `listActivePaymentMethods(financeConfig)`.

---

## 7. Servidor e espelho Caixa

### 7.1 `studentPaymentsHandler.js`

Validações no POST/PATCH pagamento:

```js
const method = canonicalPaymentMethodKey(body.method);
const settings = readPaymentMethodSettings(financeConfig)[method];
if (!settings?.active) return 400 payment_method_disabled;

const captures = listActiveCaptureMethods(financeConfig, method);
if (captures.length > 1 && !body.capture_method_id) return 400 capture_method_required;

const autoMark = settings.autoMarkReceived !== false;
const paymentStatus = autoMark ? 'paid' : 'pending';
```

### 7.2 `studentPaymentFinancialTxMirror.js`

Substituir bloco fixo `status: 'settled'`:

```js
import { readPaymentMethodSettings } from '../../src/lib/paymentMethodSettings.js';
import { findCaptureMethodById, resolveCreditDaysForInstallment } from '../../src/lib/captureMethods.js';

const methodKey = canonicalPaymentMethodKey(data.method);
const pmSettings = readPaymentMethodSettings(financeConfig)[methodKey] || {};
const capture = findCaptureMethodById(financeConfig, data.capture_method_id);
const creditDays = capture
  ? resolveCreditDaysForInstallment(capture, installments)
  : 0;

const autoSettle = pmSettings.autoSettle !== false && !(creditDays > 0 && pmSettings.autoSettle === false);
const paidAt = data.paid_at || now;
const expectedSettlement = creditDays > 0
  ? addDaysYmd(paidAt.slice(0, 10), creditDays)
  : paidAt.slice(0, 10);

const txStatus = autoSettle ? 'settled' : 'pending';
const settledAt = autoSettle ? paidAt : null;

const mirrorPayload = {
  // ...
  status: txStatus,
  settledAt,
  expected_settlement_at: creditDays > 0 ? isoEndOfDay(expectedSettlement) : null,
  capture_method_id: capture?.id || '',
  bank_account: capture?.bankAccountLabel || bankAccount,
};

const { fee, net } = mirrorAmountsForPaymentWithAccount({
  financeConfig,
  bankAccount: mirrorPayload.bank_account,
  captureMethodId: capture?.id || '',
  // ...
});
```

`shouldMirrorPaymentToCaixa(status)` — incluir `pending` com `autoSettle: false` **somente** quando for criar TX pendente (não cancelar).

### 7.3 Cron liquidação agendada (Fase 3)

**Rewrite** `vercel.json`:

```json
{ "source": "/api/cron/finance-settle-scheduled", "destination": "/api/cron/reset-usage.js?action=finance-settle-scheduled" }
```

**Handler** em `lib/server/runFinanceSettleScheduledCron.js`:

```js
// Query FINANCIAL_TX: status=pending, expected_settlement_at <= now
// PATCH status=settled, settledAt=now
// Limite 200/academia/invocação; idempotente
```

Schedule sugerido: `0 6 * * *` UTC (03:00 BRT).

### 7.4 `salesMirror.js`

Mesma resolução de `capture_method_id` / `expected_settlement_at` para vendas com cartão.

---

## 8. Previsão de caixa (Fase 3)

### 8.1 `installmentSchedule.js`

Ao enriquecer cronograma com taxas (`enrichInstallmentScheduleWithAcquirerFees`):

```js
row.expected_settlement_date = addDaysYmd(row.due_date, creditDays);
row.net = /* após acquirer fee */;
```

`creditDays` de `resolveCreditDaysForInstallment(capture, row.installment_number)`.

### 8.2 `buildForecastInstallmentItems`

Usar `expected_settlement_date` em vez de `due_date` quando `kind === 'liquidacao'`.

### 8.3 `ForecastTab.jsx`

Legenda: *“Datas de cartão consideram dias para cair na conta configurados em Formas de recebimento.”*

---

## 9. Wizard (Fase 4)

**Gatilho:** `FinanceSettingsBanksSection` após primeiro `onSaveBank` com sucesso **ou** flag onboarding `setup_finance_methods_wizard_done` ausente.

**Componente:** `FinancePaymentMethodsWizard.jsx` — modal não bloqueante; persiste via `setFinanceConfig` + `persistAll` no fim.

**Saída mínima:**

```js
{
  paymentMethodSettings: { pix: { active: true, defaultBankAccountLabel }, ... },
  captureMethods: [
    { id, name: 'Maquininha', paymentMethod: 'cartao_credito', channel: 'presencial', ... },
  ],
}
```

Marca `sessionStorage.setItem('paymentMethodsWizardDone:${academyId}', '1')`.

---

## 10. NL / API agent

`lib/server/nlActionHandler.js` — `register_payment`:

- Validar método ativo.
- Inferir `capture_method_id` se único meio ativo para o método.

---

## 11. Testes

| Arquivo | Casos |
|---------|-------|
| `src/test/paymentMethodSettings.test.js` | defaults, migração legado, `listActive`, `isConfigured` |
| `src/test/captureMethods.test.js` | normalize, `feesToAcquirerFees`, creditDays |
| `src/test/resolveAcquirerFees.test.js` | precedência meio → conta → global |
| `src/test/paymentMethodBankDefaults.test.js` | delegação para settings |
| `tests/unit/finance/studentPaymentMirrorSettlement.test.js` | autoSettle pending/settled, expected_settlement_at |
| `src/test/financeSettingsSections.test.js` | slug formas, summary, sem MDR na UI |
| `src/test/financeConfigValidation.test.js` | conta inválida em `defaultBankAccountLabel` |

**Harness:** `npm test -- paymentMethodSettings captureMethods resolveAcquirerFees studentPaymentMirrorSettlement financeSettingsSections`

---

## 12. Plano de implementação por PR

### PR-1 — Fase 1 (fundação)

1. `paymentMethodSettings.js` + testes + migração leitura legado  
2. `financeSettingsSections.js` + `FinanceSettingsPaymentMethodsSection.jsx`  
3. `FinanceiroConfigTab` + dirty digests  
4. `listActivePaymentMethods` nos modais de pagamento  
5. Remover grid de `FinanceSettingsBanksSection`; renomear label Recebimento  
6. Docs: `config-inicial-financeiro.md`, `VALIDATION.md`

### PR-2 — Fase 2 (meios de captura)

1. `captureMethods.js` + extend `resolveAcquirerFees.js`  
2. `FinanceSettingsCaptureMethodPanel.jsx` + matriz  
3. `capture_method_id` em forms + handler + mirror (taxa por meio)  
4. Provisionar attrs Appwrite (`scripts/verify-schema.mjs`)  
5. Testes integração mirror + resolve

### PR-3 — Fase 3 (dias crédito + cron)

1. `creditDays` na matriz (UI já preparada PR-2 com default 0)  
2. `expected_settlement_at` no mirror  
3. `runFinanceSettleScheduledCron.js` + rewrite vercel  
4. `installmentSchedule` + `ForecastTab`  
5. Nota em `MonthlyClosingTab` (banner info)

### PR-4 — Fase 4 (boleto/cheque + wizard)

1. Enum `boleto`/`cheque` + aliases storage  
2. Fluxo `pending` pagamento + espelho condicional  
3. `FinancePaymentMethodsWizard.jsx`  
4. Taxa fixa R$ na forma simples (`acquirerFees` por método via settings override — opcional P2)

### PR-5 — Fase 5 (PagBank)

Conforme [pagbank TECH](./2026-06-16-pagbank-conciliacao-integracao-TECH.md): `channel: 'integrado'`, webhook preenche `capture_method_id` e liquida na data real.

---

## 13. Rollback / feature flag

Opcional em `financeConfig.features`:

```js
{ paymentMethodsV2: true }
```

Quando `false` ou ausente:

- UI antiga (grid em Recebimento) — manter código atrás de flag **uma release**, depois remover.

Default após deploy: `true` para academias novas; migradas no `mergeFinanceConfigFromAcademyDoc` implicitamente.

---

## 14. Riscos técnicos

| Risco | Mitigação |
|-------|-----------|
| Regressão `expectedAmountWithCardFee` | Não tocar `cardFees`; testes parity mensalidades |
| TX `pending` no saldo Caixa | Agregações já filtram `settled`; documentar que pendente não entra no saldo |
| `financeConfig` > 2500 chars | compact sparse; wizard não grava 12 parcelas se “configurar depois” |
| Attr desconhecido Appwrite | `stripUnknownFinanceTxAttrs` |
| Parcela > `maxInstallments` do meio | Validar no handler: `installments_exceeds_capture_max` |

---

## 15. Checklist de conclusão

- [x] Seção Formas na sidebar + deep link `?section=formas-recebimento`  
- [x] `paymentMethodSettings` persiste e migra legado  
- [x] `captureMethods` com taxas e resolução meio → conta → global  
- [x] Modais só mostram formas ativas  
- [x] “Recebido via” quando N meios > 1  
- [x] `creditDays` na previsão (Fase 3)  
- [x] Cron liquidação sem novo `/api/*.js`  
- [x] Testes verdes no harness §11  
- [x] Fluxos `docs/flows/financeiro/*` atualizados por fase  
- [ ] Boleto/cheque + wizard (Fase 4)  
- [ ] PagBank integrado (Fase 5)  
