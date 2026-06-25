# Student Payment Manual Amount Precedence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** garantir que valores manuais de mensalidade tenham precedencia total sobre o plano do aluno, inclusive quando forem `0`.

**Architecture:** a correcao atua em quatro pontos do fluxo: envio do valor pelo modal, montagem do payload no backend, upsert por competencia e leitura/exibicao do valor em aberto. A implementacao sera guiada por testes focados para distinguir claramente valor ausente de valor explicito.

**Tech Stack:** React, Vite, Vitest, Node server handlers, Appwrite.

**Spec:** `docs/superpowers/specs/2026-06-23-student-payment-manual-amount-precedence-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/components/student/StudentPaymentModal.jsx` | Modify | Garantir envio explicito de `amount` |
| `lib/server/studentPaymentsHandler.js` | Modify | Preservar `amount`/`expected_amount` explicitos e ajustar upsert |
| `src/lib/collectionOverdue.js` | Modify | Usar `payment.amount` sempre que o campo existir |
| `src/components/finance/MensalidadesPanel.jsx` | Modify | Respeitar `preset.amount` existente antes do fallback do plano |
| `src/test/studentPaymentsHandler.test.js` | Modify | Cobrir `amount`/`expected_amount` explicitos, inclusive `0`, e upsert |
| `src/test/mensalidadesPanel.test.jsx` | Modify | Cobrir respeito a valor existente na UI |
| `src/test/paymentStatus.test.js` | Modify | Cobrir `openAmountForStudent()` com `payment.amount = 0` |

---

### Task 1: Backend preserva valor explicito

**Files:**
- Modify: `lib/server/studentPaymentsHandler.js`
- Test: `src/test/studentPaymentsHandler.test.js`

- [ ] Escrever testes falhando para `amount: 0`, `expected_amount: 0` e upsert com valor novo explicito
- [ ] Rodar `npm test -- src/test/studentPaymentsHandler.test.js` e confirmar falha
- [ ] Implementar deteccao de campo ausente vs valor explicito em `buildPayload()`
- [ ] Ajustar `preserveExistingLaunchAmounts()` para nao sobrescrever valor novo explicito
- [ ] Rodar `npm test -- src/test/studentPaymentsHandler.test.js` e confirmar verde

### Task 2: UI respeita valor manual

**Files:**
- Modify: `src/components/student/StudentPaymentModal.jsx`
- Modify: `src/components/finance/MensalidadesPanel.jsx`
- Modify: `src/lib/collectionOverdue.js`
- Test: `src/test/mensalidadesPanel.test.jsx`
- Test: `src/test/paymentStatus.test.js`

- [ ] Escrever/ajustar testes para `payment.amount = 0` e `preset.amount = 0`
- [ ] Rodar `npm test -- src/test/mensalidadesPanel.test.jsx src/test/paymentStatus.test.js` e confirmar falha
- [ ] Garantir que modal e painel preservem `amount` quando o campo existir
- [ ] Ajustar helper de aberto para usar `payment.amount` inclusive quando for `0`
- [ ] Rodar `npm test -- src/test/mensalidadesPanel.test.jsx src/test/paymentStatus.test.js` e confirmar verde

### Task 3: Verificacao final

**Files:**
- Verify: `src/components/student/StudentPaymentModal.jsx`
- Verify: `lib/server/studentPaymentsHandler.js`
- Verify: `src/lib/collectionOverdue.js`
- Verify: `src/components/finance/MensalidadesPanel.jsx`

- [ ] Rodar `npm test -- src/test/studentPaymentsHandler.test.js src/test/mensalidadesPanel.test.jsx src/test/paymentStatus.test.js`
- [ ] Rodar diagnosticos dos arquivos alterados
- [ ] Confirmar que nenhum fallback do plano substitui valor manual explicito
