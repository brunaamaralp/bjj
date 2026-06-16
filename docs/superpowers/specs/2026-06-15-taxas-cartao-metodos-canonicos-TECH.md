# Taxas de cartão × métodos de pagamento (Mensalidades) — TECH Spec

**Data:** 2026-06-15  
**PRODUCT:** [2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md)  
**Status:** Implementado (2026-06-15)

---

## 1. Diagnóstico técnico

### 1.1 Fluxo atual (quebrado)

```
MensalidadesPanel.openPaymentModal
  → payForm.method = 'cartão_crédito' | 'cartão_débito' | ...
  → handleSavePayment
      → expectedAmountWithCardFee(student, financeConfig, payForm.method, ...)
          → paymentStatus.js: isCard check FALHA (sem match acentuado)
          → retorna preço base (sem taxa)
  → createPayment / updatePayment
      → studentPayments.js (client mirror) — idem
      → studentPaymentsHandler.js (server) — idem
      → studentPaymentFinancialTxMirror.js — fee = 0
```

### 1.2 Fluxo que já funciona (referência)

`StudentPaymentModal` usa `PAYMENT_METHODS` de `paymentMethods.js` (`cartao_credito`, `cartao_debito`).  
`cardFeePercent` reconhece `cartao_credito` / `cartao_debito` e `isCard` inclui `m.startsWith('cartao')`.

### 1.3 Aliases já existentes (não reutilizados no cálculo)

`src/lib/paymentMethodBankDefaults.js` define `METHOD_ALIASES` e `canonicalPaymentMethodKey()` — usado para **conta bancária padrão**, não para taxas.

```8:17:src/lib/paymentMethodBankDefaults.js
const METHOD_ALIASES = {
  'cartão_crédito': 'cartao_credito',
  credito: 'cartao_credito',
  credit: 'cartao_credito',
  'cartão_débito': 'cartao_debito',
  debito: 'cartao_debito',
  debit: 'cartao_debito',
  transferência: 'transferencia',
  cash: 'dinheiro',
};
```

---

## 2. Solução proposta (v1)

**Princípio:** uma única normalização de método, compartilhada entre conta bancária e taxa de cartão.

### 2.1 Extrair canonicalização para módulo compartilhado

**Opção recomendada:** mover `METHOD_ALIASES` + `canonicalPaymentMethodKey` para `src/lib/paymentMethods.js` (já é a fonte de `PAYMENT_METHODS`) e reexportar de `paymentMethodBankDefaults.js` para não quebrar imports.

| Arquivo | Mudança |
|---------|---------|
| `src/lib/paymentMethods.js` | Adicionar `METHOD_ALIASES`, `canonicalPaymentMethodKey(method)`, `isCardPaymentMethod(canonical)` |
| `src/lib/paymentMethodBankDefaults.js` | Importar `canonicalPaymentMethodKey` de `paymentMethods.js`; remover duplicata local |
| `src/lib/paymentStatus.js` | Usar canonical + `isCardPaymentMethod` em `cardFeePercent` e `expectedAmountWithCardFee` |

**Alternativa rejeitada:** duplicar aliases só em `paymentStatus.js` — divergência futura garantida.

### 2.2 Nova lógica em `paymentStatus.js`

**Antes** (`cardFeePercent`): ramos com `m === 'credito'`, `m === 'debito'`, etc. sobre string raw.

**Depois:**

```js
import { canonicalPaymentMethodKey, isCardPaymentMethod } from './paymentMethods.js';

function cardFeePercent(financeConfig, method, installments) {
  const key = canonicalPaymentMethodKey(method);
  const fees = financeConfig?.cardFees || {};

  // Parcelado: só quando método canônico é parcelado OU installments >= 2 com cartao_credito
  // v1 Mensalidades: installments sempre undefined → ramo à vista
  if (key === 'credito_parcelado' || (key === 'cartao_credito' && Number(installments) >= 2)) {
    const n = Math.max(2, Math.min(12, Math.trunc(Number(installments) || 2)));
    const parcelado = fees.credito_parcelado || {};
    return Number(parcelado[String(n)] ?? parcelado[n] ?? 0) || 0;
  }
  if (key === 'cartao_credito') {
    return Number(fees.credito_avista?.percent ?? 0) || 0;
  }
  if (key === 'cartao_debito') {
    return Number(fees.debito?.percent ?? 0) || 0;
  }
  return 0;
}

export function expectedAmountWithCardFee(student, financeConfig, method, installments, payment) {
  const base = expectedAmountForStudent(student, financeConfig, payment);
  if (!(base > 0)) return base;

  const planName = String(student?.plan || payment?.plan_name || '').trim();
  const plan = (financeConfig?.plans || []).find((p) => String(p?.name || '').trim() === planName);
  if (!plan?.applyCardFee) return base;

  const key = canonicalPaymentMethodKey(method);
  if (!isCardPaymentMethod(key, installments)) return base;

  const pct = cardFeePercent(financeConfig, method, installments);
  if (!(pct > 0)) return base;
  return Math.round(base * (1 + pct / 100) * 100) / 100;
}
```

### 2.3 `isCardPaymentMethod(canonical, installments?)`

```js
export function isCardPaymentMethod(canonical, installments) {
  if (canonical === 'cartao_debito') return true;
  if (canonical === 'credito_parcelado') return true;
  if (canonical === 'cartao_credito') return true;
  return false;
}
```

Substitui o bloco `isCard` com `includes('credit')` / `startsWith('cartao')` — frágil para acentos e falsos positivos.

### 2.4 Callers — sem mudança necessária

Todos passam `method` raw; a correção é centralizada:

| Arquivo | Função |
|---------|--------|
| `src/components/finance/MensalidadesPanel.jsx` | `handleSavePayment` L653 |
| `src/lib/studentPayments.js` | mirror client L197 |
| `lib/server/studentPaymentsHandler.js` | `buildPayload` L185 |
| `lib/server/studentPaymentFinancialTxMirror.js` | L215 |

**Não alterar** `MensalidadesPanel.PAY_METHODS` nesta spec — valores acentuados permanecem no banco.

---

## 3. Arquivos tocados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `src/lib/paymentMethods.js` | **alterar** | `canonicalPaymentMethodKey`, `isCardPaymentMethod`, aliases |
| `src/lib/paymentMethodBankDefaults.js` | **alterar** | importar canonical; remover duplicata |
| `src/lib/paymentStatus.js` | **alterar** | usar canonical em taxa |
| `src/test/paymentStatusCardFees.test.js` | **novo** | casos Mensalidades + paridade |
| `src/test/deactivateStudentPolicy.test.js` | **alterar** | acrescentar casos `cartão_*` ou mover para arquivo dedicado |
| `src/test/paymentMethodBankDefaults.test.js` | **alterar** | garantir canonical exportado de paymentMethods (se mover) |

**Não tocar (v1):** UI Mensalidades, `FinanceSettingsFeesSection`, schema Appwrite, `/api/`.

---

## 4. Plano de testes

### 4.1 Unit — `paymentStatus` / `expectedAmountWithCardFee`

Fixture comum:

```js
const financeConfig = {
  plans: [{ name: 'Mensal', price: 200, applyCardFee: true }],
  cardFees: {
    credito_avista: { percent: 5 },
    debito: { percent: 2 },
    credito_parcelado: { '3': 8 },
  },
};
const student = { plan: 'Mensal' };
```

| Caso | method | installments | esperado |
|------|--------|--------------|----------|
| Mensalidades crédito | `cartão_crédito` | undefined | 210 |
| Mensalidades débito | `cartão_débito` | undefined | 204 |
| Modal aluno | `cartao_credito` | undefined | 210 |
| Legado NL | `credito` | null | 210 |
| PIX | `pix` | — | 200 |
| Dinheiro | `dinheiro` | — | 200 |
| Transferência acentuada | `transferência` | — | 200 |
| Sem applyCardFee | `cartão_crédito` | — | 200 |
| Taxa 0% | `cartão_crédito` | — (fees 0) | 200 |
| Parcelado explícito | `credito_parcelado` | 3 | 216 (200 * 1.08) |

### 4.2 Unit — `canonicalPaymentMethodKey`

| input | output |
|-------|--------|
| `cartão_crédito` | `cartao_credito` |
| `Cartão Crédito` (trim) | `cartao_credito` |
| `cartao_debito` | `cartao_debito` |
| `''` | `''` |
| `pix` | `pix` |

### 4.3 Unit — espelho (P1)

Mock mínimo em `studentPaymentFinancialTxMirror` ou teste puro da lógica `fee = withFee - base` com `method: 'cartão_crédito'`.

### 4.4 Comando CI

```bash
npm test -- paymentStatus paymentMethodBankDefaults deactivateStudentPolicy
```

---

## 5. Implementação passo a passo

1. **Extrair canonical** para `paymentMethods.js`; exportar funções; atualizar `paymentMethodBankDefaults.js`.
2. **Refatorar** `paymentStatus.js` conforme §2.2–2.3.
3. **Criar** `src/test/paymentStatusCardFees.test.js` com tabela §4.1 (não depender só de `deactivateStudentPolicy.test.js` — nome enganoso).
4. **Rodar** suite financeira existente.
5. **QA manual** checklist PRODUCT §7.

**Ordem de merge sugerida:** testes novos falhando → implementação → verde.

---

## 6. Compatibilidade e rollout

| Aspecto | Decisão |
|---------|---------|
| Dados existentes | `method` em pagamentos antigos permanece `cartão_crédito`; recálculo em edição/espelho usa taxa correta |
| Server + client | Mesmo módulo `paymentStatus.js` importado em `lib/server/*` — deploy único |
| Breaking change | Academias que cobravam valor base em Mensalidades passarão a cobrar com taxa — **comportamento intencional** |
| Feature flag | Não necessário — correção de bug |

---

## 7. Diagrama pós-fix

```
payForm.method (qualquer variante)
        │
        ▼
canonicalPaymentMethodKey()
        │
        ├─ cartao_credito / cartao_debito ──► isCardPaymentMethod? ──► cardFeePercent
        │                                              │
        └─ pix / dinheiro / transferencia ──► skip taxa │
                                                       ▼
                                            expectedAmountWithCardFee
                                                       │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
              MensalidadesPanel              studentPaymentsHandler          financialTxMirror
```

---

## 8. Riscos técnicos

| Risco | Mitigação |
|-------|-----------|
| Import circular `paymentMethods` ↔ `paymentStatus` | `paymentMethods.js` não importa `paymentStatus` |
| Server bundle não resolver novo export | `paymentStatus` já usado no server; smoke `npm run build` |
| `credito_parcelado` + installments em TransacoesTab | Manter ramo installments >= 2 para `cartao_credito` (benefício colateral, coberto em teste) |

---

## 9. Fora de escopo (referência para specs futuras)

Documentar dependências não resolvidas neste PR:

1. **Parcelas UI Mensalidades** — `credito_parcelado[n]` inacessível sem campo `installments`.
2. **Taxa PIX** — `cardFees.pix` ignorado; teste atual afirma “não aplica em pix”.
3. **Unificação** `MensalidadesPanel.PAY_METHODS` → `paymentMethods.js`.

---

## 10. Definition of Done

- [ ] `canonicalPaymentMethodKey` exportado de `paymentMethods.js`
- [ ] `paymentStatus.js` usa canonical para taxa e detecção de cartão
- [ ] Testes §4.1 verdes incluindo `cartão_crédito` e `cartão_débito`
- [ ] `paymentMethodBankDefaults.test.js` verde (sem regressão de conta padrão)
- [ ] PRODUCT checklist §7 validado manualmente em dev
- [ ] Nenhum arquivo novo em `/api/`
