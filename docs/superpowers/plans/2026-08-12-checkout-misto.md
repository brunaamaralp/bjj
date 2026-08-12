# Checkout misto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um checkout único (PDV/Nova venda + perfil do aluno) que mistura produto/aluguel + mensalidade/pacote/taxa, cobrando um total na máquina e gravando `sale` + `student_payment`(s) com totais coerentes.

**Architecture:** Libs puras (`mixedCheckout.js`, `mixedCheckoutSubmit.js`) orquestram `createSale` + `createPayment` existentes; UI estende `SalesNewSaleTab` com linhas de cobrança e o modal do aluno passa a usar o mesmo fluxo misto quando há produto + cobrança.

**Tech Stack:** React (Vite), Vitest, stores `useSalesStore` / `createPayment`, APIs `/api/sales` + `/api/student-payments` (sem nova function).

**Spec:** [2026-08-12-checkout-misto-design.md](../specs/2026-08-12-checkout-misto-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/mixedCheckout.js` | Tipos de linha, totais, validação, alocação de pagamentos, build de payloads |
| `src/lib/mixedCheckoutSubmit.js` | Submit ordenado + compensação `cancelSale` |
| `src/test/mixedCheckout.test.js` | Unit tests da lib |
| `src/test/mixedCheckoutSubmit.test.js` | Unit tests do orquestrador (mocks) |
| `src/components/sales/SalesNewSaleTab.jsx` | Carrinho + cobranças + submit misto |
| `src/components/sales/MixedCheckoutChargeForm.jsx` | Form compacto para adicionar mensalidade/pacote/taxa |
| `src/components/student/StudentPaymentModal.jsx` | Permitir cobrancas + produto no mesmo fluxo (ou handoff para PDV misto) |
| `docs/flows/vendas/pdv-nova-venda.md` | Checklist/jornada atualizada |

---

### Task 1: Lib `mixedCheckout` — totais, validação, alocação

**Files:**
- Create: `src/lib/mixedCheckout.js`
- Create: `src/test/mixedCheckout.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect } from 'vitest';
import {
  MIXED_LINE_KINDS,
  sumMixedCartCents,
  validateMixedCart,
  allocatePaymentsForMixedCheckout,
  buildSalePayloadFromMixed,
  buildStudentPaymentPayloadsFromMixed,
} from '../lib/mixedCheckout.js';

describe('mixedCheckout', () => {
  it('soma produtos e cobranças', () => {
    expect(
      sumMixedCartCents({
        productLines: [{ quantidade: 1, preco_unitario: 200 }],
        chargeLines: [{ amount: 150 }, { amount: 50 }],
      })
    ).toBe(40000);
  });

  it('exige aluno quando há cobrança', () => {
    const r = validateMixedCart({
      alunoId: '',
      productLines: [{ quantidade: 1, preco_unitario: 10 }],
      chargeLines: [{ kind: 'fee', amount: 20, note: 'Taxa' }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('aluno_required');
  });

  it('aloca pagamento único proporcionalmente', () => {
    const alloc = allocatePaymentsForMixedCheckout(
      [{ forma: 'cartao_credito', valor: 350, installments: 3 }],
      { saleGross: 200, charges: [{ id: 'c1', amount: 150 }] }
    );
    expect(alloc.salePagamentos[0].valor).toBe(200);
    expect(alloc.charges[0].amount).toBe(150);
    expect(alloc.charges[0].method).toBe('cartao_credito');
    expect(alloc.charges[0].installments).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`mixedCheckout` missing)

```bash
npm test -- mixedCheckout
```

- [ ] **Step 3: Implement `src/lib/mixedCheckout.js`**
  - `MIXED_LINE_KINDS`: `sale` | `rental` (produtos) + `plan` | `bundle` | `fee`
  - `sumMixedCartCents`, `validateMixedCart`
  - `allocatePaymentsForMixedCheckout` via `splitPagamentosByGrossShares` + método dominante por cobrança
  - `buildSalePayloadFromMixed` / `buildStudentPaymentPayloadsFromMixed` (shapes iguais aos call sites atuais)
  - Fee exige `note`; plan exige `reference_month`; bundle exige `bundle_months` + `coverage_start_month`

- [ ] **Step 4: Run tests — expect PASS**

---

### Task 2: Orquestrador `mixedCheckoutSubmit`

**Files:**
- Create: `src/lib/mixedCheckoutSubmit.js`
- Create: `src/test/mixedCheckoutSubmit.test.js`

- [ ] **Step 1: Failing test** — sucesso cria sale + payments; falha no payment cancela a sale

```js
it('compensa venda se createPayment falhar', async () => {
  const createSale = vi.fn(async () => ({ $id: 'sale1' }));
  const createPayment = vi.fn(async () => { throw new Error('dup'); });
  const cancelSale = vi.fn(async () => ({ ok: true }));
  const r = await submitMixedCheckout({
    deps: { createSale, createPayment, cancelSale },
    salePayload: { itens: [{}], pagamentos: [], idempotency_key: 'k1' },
    paymentPayloads: [{ lead_id: 'L', academy_id: 'A', amount: 10 }],
  });
  expect(r.ok).toBe(false);
  expect(cancelSale).toHaveBeenCalledWith(
    expect.objectContaining({ venda_id: 'sale1' })
  );
});
```

- [ ] **Step 2: Implement** — se só sale → `createSale`; só payments → `createPayment` em série; misto → sale → payments → compensate on failure com motivo fixo `Checkout misto: falha ao registrar cobrança`

- [ ] **Step 3: Tests PASS**

---

### Task 3: UI — adicionar cobrança no `SalesNewSaleTab`

**Files:**
- Create: `src/components/sales/MixedCheckoutChargeForm.jsx`
- Modify: `src/components/sales/SalesNewSaleTab.jsx`
- Test: `src/test/salesNewSaleTab.test.jsx` (estender smoke) e/ou teste do form

- [ ] **Step 1:** Form para adicionar linha `plan` | `bundle` | `fee` (amount, note/mês/cobertura) — desabilitado sem `alunoId`
- [ ] **Step 2:** Estado `chargeLines` no tab; lista no carrinho com badge; total = produtos + cobranças; `SalesPaymentBlock` usa total combinado
- [ ] **Step 3:** `submit`: se `chargeLines.length === 0` → path atual; senão → `submitMixedCheckout` com payloads da lib + `createSale` do store + `createPayment` + `cancelSale`
- [ ] **Step 4:** Resumo pré-submit e toast pós-sucesso listando origens
- [ ] **Step 5:** Venda a prazo (`deferred`) **não** misturada com cobranças na v1 — validar e bloquear com mensagem clara

---

### Task 4: Perfil do aluno — mesmo fluxo

**Files:**
- Modify: `src/components/student/StudentPaymentModal.jsx`
- Modify: `src/components/student/StudentProductSaleStep.jsx` (se necessário) ou abrir Nova venda com aluno + charge

- [ ] **Step 1:** Com `salesEnabled`, permitir adicionar produto **sem** sair do tipo mensalidade/taxa: checkbox/ação “Incluir produtos no mesmo pagamento” que embute `StudentProductSaleStep` + mantém campos da cobrança
- [ ] **Step 2:** Save do perfil: se há itens de produto + cobrança → `submitMixedCheckout`; senão paths atuais
- Alternativa aceitável se mais limpa: botão no modal “Abrir checkout completo” → `NovaVendaModal` com `alunoId` pré-preenchido e painel de cobrança (reusa Task 3)

---

### Task 5: Docs de fluxo

**Files:**
- Modify: `docs/flows/vendas/pdv-nova-venda.md`
- Modify: `docs/flows/financeiro/a-receber-mensalidades.md` (nota de handoff)
- Link spec no fluxo

- [ ] Atualizar mapa de telas / checklist Seção A com checkout misto
- [ ] Registrar em `docs/flows/VALIDATION.md` se checklist mudou

---

### Task 6: Verificação

```bash
npm test -- mixedCheckout
npm test -- salesNewSaleTab salePayments
```

Confirmar lint nos arquivos tocados.
