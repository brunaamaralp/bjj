# Perfil — clareza venda a prazo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar óbvio no perfil (e alinhado à Loja) criar venda a prazo, ver em aberto (plano/produto) e receber saldo — só UI/copy/wiring, sem mudar API.

**Architecture:** Dois CTAs no hero (`Registrar pagamento` | `Nova venda`); modal em modo produto-only para venda; glossário único (`Venda a prazo`, `Em aberto em produtos`); rename de labels/toasts no perfil e Loja. Não renomear “Receber depois” do Caixa (`FinanceTxSettlementToggle`).

**Tech Stack:** React, Vitest, CSS existente do student-pay / sales.

**Spec:** [2026-10-14-perfil-venda-a-prazo-clareza-design.md](../specs/2026-10-14-perfil-venda-a-prazo-clareza-design.md)

## Files

| File | Responsibility |
|---|---|
| `src/lib/studentFinancialTimeline.js` | `productDebtLabel` → “Em aberto em produtos” |
| `src/components/student/StudentFinancialTimeline.jsx` | Dois CTAs; wiring `onRegisterPayment` / `onNewSale` |
| `src/pages/StudentProfile.jsx` (ou quem abre o modal) | Abrir modal payment vs product |
| `src/components/student/StudentPaymentModal.jsx` | Remover Produto do type list; modo `productOnly` / initial type |
| `src/components/student/StudentProductSaleStep.jsx` | Label + toast |
| `src/components/sales/SalesNewSaleTab.jsx` | Label toggle Loja |
| `src/lib/financeTermHints.js` | Hint que cita venda |
| `docs/flows/crm/aluno-perfil-presenca.md` | Checklist CTAs / a prazo |
| `docs/flows/vendas/pdv-nova-venda.md` | Label alinhado |
| Tests sob `src/test/` | Copy + wiring |

---

### Task 1: Copy `productDebtLabel`

**Files:**
- Modify: `src/lib/studentFinancialTimeline.js`
- Test: `src/test/studentFinancialTimeline.test.js`

- [x] **Step 1:** Atualizar teste para esperar `/Em aberto em produtos/` (falha no label antigo).
- [x] **Step 2:** Rodar `npm test -- studentFinancialTimeline` e confirmar falha.
- [x] **Step 3:** Trocar string `Dívida em produtos:` → `Em aberto em produtos:`.
- [x] **Step 4:** Rodar testes e passar.

---

### Task 2: Labels checkout perfil + Loja + hints

**Files:**
- Modify: `StudentProductSaleStep.jsx`, `SalesNewSaleTab.jsx`, `financeTermHints.js`
- Test: assert em teste existente do product step se houver; senão grep/smoke no teste de timeline ou criar assert mínimo no toast via unit se já mockado

- [ ] **Step 1:** Trocar “Receber depois” → “Venda a prazo” no perfil; toast → “Venda a prazo registrada”.
- [ ] **Step 2:** Loja: label **Venda a prazo** + apoio “sem pagamento agora”.
- [ ] **Step 3:** `financeTermHints`: referência à venda usa «Venda a prazo», não «Receber depois».
- [ ] **Step 4:** **Não** alterar `FinanceTxSettlementToggle` / `financeTxTabState` (Caixa).
- [ ] **Step 5:** Rodar testes afetados / grep residual em componentes de venda.

---

### Task 3: Modal — payment vs product entry

**Files:**
- Modify: `StudentPaymentModal.jsx`
- Test: `src/test/studentProfilePaymentFlow.test.jsx` (ou equivalente)

- [ ] **Step 1:** Aceitar prop `mode` / `initialPaymentType` / `productOnly` (escolher um padrão já usado no arquivo).
- [ ] **Step 2:** Em modo pagamento: `typeOptions` **sem** Produto.
- [ ] **Step 3:** Em modo nova venda: forçar produto, ocultar fieldset de tipo, título **Nova venda** ou **Venda de produto**.
- [ ] **Step 4:** Teste: abrir registrar pagamento não lista Produto; abrir nova venda mostra step de produto.

---

### Task 4: Hero — dois CTAs

**Files:**
- Modify: `StudentFinancialTimeline.jsx`, caller em `StudentProfile.jsx` (e props)
- CSS mínimo se necessário para stack mobile

- [ ] **Step 1:** `SituationHero` recebe `onRegisterPayment` + `onNewSale` (só se sales enabled).
- [ ] **Step 2:** Botões **+ Registrar pagamento** e **+ Nova venda** (lado a lado / stack).
- [ ] **Step 3:** Parent abre modal payment vs product.
- [ ] **Step 4:** Freeze: manter política atual (esconder CTAs se já escondia register).

---

### Task 5: Docs de fluxo

**Files:**
- Modify: `docs/flows/crm/aluno-perfil-presenca.md`, `docs/flows/vendas/pdv-nova-venda.md`

- [ ] **Step 1:** Checklist: dois CTAs; Nova venda; Venda a prazo; Em aberto em produtos.
- [ ] **Step 2:** PDV: rótulo **Venda a prazo**.

---

### Task 6: Verificação final

- [ ] **Step 1:** `npm test -- studentFinancialTimeline studentProfilePaymentFlow` (e sales se aplicável).
- [ ] **Step 2:** Grep `Receber depois` em `StudentProductSaleStep` / `SalesNewSaleTab` → zero.
- [ ] **Step 3:** Atualizar status da spec para implementado / pronto para review.
