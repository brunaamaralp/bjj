# Parcelamento de vendas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** permitir parcelamento real em vendas de produtos no checkout, na liquidacao de vendas pendentes e no espelho financeiro do Caixa.

**Architecture:** alinhar frontend e backend em um contrato canonico de pagamentos de venda com `installments` e `capture_method_id`, depois propagar esse contrato para UI, criacao/liquidacao e espelho financeiro. A entrega e incremental para manter retrocompatibilidade com vendas antigas sem backfill.

**Tech Stack:** React, Zustand, Vite, Vitest, Node/Appwrite handlers, utilitarios financeiros compartilhados

---

### Task 1: Contrato de pagamentos

**Files:**
- Modify: `src/lib/salePayments.js`
- Modify: `functions/salePayments.mjs`
- Test: `src/test/salePayments.test.js`

- [ ] Escrever testes que exponham perda de `installments` e `capture_method_id`
- [ ] Rodar `npm test -- src/test/salePayments.test.js` e confirmar falha
- [ ] Implementar normalizacao e serializacao canonicas com `installments`
- [ ] Rodar `npm test -- src/test/salePayments.test.js` e confirmar verde

### Task 2: UI do checkout

**Files:**
- Modify: `src/components/sales/SalesPaymentBlock.jsx`
- Modify: `src/components/sales/SalesNewSaleTab.jsx`
- Modify: `src/components/student/StudentProductSaleStep.jsx`
- Modify: `src/components/sales/SaleDetailModal.jsx`
- Test: `src/test/salePayments.test.js` ou teste novo focado em UI se necessario

- [ ] Adicionar estado e seletor de parcelas para `cartao_credito`
- [ ] Respeitar limite do meio de captura quando existir
- [ ] Garantir reset para `1` fora de credito
- [ ] Exibir parcelas em detalhes da venda quando houver

### Task 3: Backend de criacao e liquidacao

**Files:**
- Modify: `lib/server/salesCreateHandler.js`
- Modify: `lib/server/salesLiquidateHandler.js`
- Modify: `src/store/useSalesStore.js`

- [ ] Fazer criacao e liquidacao consumirem o contrato canonico completo
- [ ] Preservar `installments` e `capture_method_id` em `pagamentos_json`
- [ ] Validar limite de parcelas por meio de captura

### Task 4: Espelho financeiro

**Files:**
- Modify: `lib/server/salesMirror.js`
- Modify: `lib/server/salesLiquidateHandler.js`
- Test: testes focados de pagamentos e espelho

- [ ] Propagar `installments` e `capture_method_id` ao espelho do Caixa
- [ ] Usar parcelas reais em taxa, liquido e previsao
- [ ] Verificar retrocompatibilidade para vendas antigas

### Task 5: Verificacao final

**Files:**
- Verify: `src/lib/salePayments.js`
- Verify: `src/components/sales/SalesPaymentBlock.jsx`
- Verify: `lib/server/salesCreateHandler.js`
- Verify: `lib/server/salesLiquidateHandler.js`
- Verify: `lib/server/salesMirror.js`

- [ ] Rodar testes focados
- [ ] Rodar diagnosticos dos arquivos alterados
- [ ] Validar que nao ha regressao obvia no fluxo antigo
