# Parcelamento no modal de Mensalidades — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-mensalidades-parcelamento-taxas-TECH.md](./2026-06-15-mensalidades-parcelamento-taxas-TECH.md)  
**Relacionado:** [taxas-cartao-metodos-canonicos](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md) (v1 — cálculo à vista + aliases; **esta spec é o v2**)

---

## 1. Problem Statement

Academias configuram **taxas de parcelamento** (2x–12x) em Minha Academia → Financeiro → Taxas de cartão. O operador registra mensalidades no modal de **Mensalidades** com método **Cartão crédito**, mas **não há campo de parcelas**. O sistema sempre aplica a taxa de **crédito à vista**, mesmo quando a maquininha foi parcelada e a academia tem percentuais maiores configurados para 3x, 6x, etc.

**Quem sofre:** recepção/owner que repassa taxa de parcelamento ao aluno e espera ver `fee` correto no Caixa.

**Custo de não resolver:** subcobrança silenciosa em pagamentos parcelados; tabela de taxas de parcelamento parece “decorativa”; divergência em relação ao fluxo de **Lançamentos** (`TransacoesTab`), que já tem select de parcelas para `cartão_crédito`.

**Evidência:** auditoria de gaps 2026-06-15 (item #2 da matriz de priorização); `expectedAmountWithCardFee` já suporta `installments >= 2`, mas `MensalidadesPanel` não expõe nem envia o valor.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Operador escolhe 1x–12x ao pagar com cartão crédito em Mensalidades | Select visível quando método = `cartão_crédito` |
| G2 | Taxa correta por faixa | Plano R$ 200, taxa 3x = 8% → valor R$ 216 ao salvar com 3x |
| G3 | 1x usa taxa à vista | Mesmo cenário com 1x → taxa `credito_avista`, não parcelada |
| G4 | Espelho Caixa coerente | `financial_tx` com `installments` e `fee` alinhados ao parcelamento |
| G5 | Paridade com Lançamentos | Mesma regra 1x = à vista, 2–12 = `credito_parcelado[n]` |
| G6 | Zero regressão | Débito, PIX, dinheiro, transferência inalterados |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Taxa PIX | Spec separada (#3 da auditoria) |
| Parcelas em `StudentPaymentModal` (perfil do aluno) | P1 desta spec ou follow-up; Mensalidades é fluxo principal |
| Simulação de parcelas na maquininha (juros do banco vs repasse academia) | Produto atual só repassa % configurado |
| Migrar pagamentos históricos | `installments` implícito 1; sem backfill obrigatório |
| Unificar `PAY_METHODS` / dialect acentuado | Já parcialmente resolvido em aliases; fora do escopo |
| Novos arquivos em `/api/` | Limite Vercel Hobby 12/12 |
| Campo parcelas para **cartão débito** | Débito não parcela no produto |
| Ocultar opções 2–12 sem taxa configurada | v1 mostra 1–12 como em Lançamentos; taxa 0% = sem acréscimo |

---

## 4. Comportamento esperado

### 4.1 Modelo de negócio (inalterado)

1. Base = preço do plano (`openAmountForStudent` / valor informado).
2. Se `applyCardFee !== false` e método é cartão:
   - **1x** (à vista): `cardFees.credito_avista.percent`
   - **2x–12x**: `cardFees.credito_parcelado[n].percent`
3. Valor cobrado = `base × (1 + pct/100)`, arredondado em centavos BRL.
4. Caixa: `gross` = valor pago; `fee` = acréscimo da taxa; `net` = `gross - fee`.

### 4.2 Quando o campo aparece

| Método no modal | Campo parcelas | Valor persistido |
|-----------------|----------------|------------------|
| `cartão_crédito` | Sim (1x–12x) | `installments` enviado na API |
| `cartão_débito`, PIX, dinheiro, transferência | Não | `installments = 1` (implícito) |

### 4.3 Troca de método

- Crédito → outro: reset `installments` para `1`.
- Outro → crédito: default `installments = 1` (à vista).

### 4.4 Bundle (plano anual)

- Parcelas permitidas se método = `cartão_crédito` (mesma UI).
- Cálculo de taxa sobre o valor total do bundle.

### 4.5 Exibição

- Recibos, espelho Caixa e listagens usam `formatPaymentMethod(method, installments)` → ex.: “Cartão de crédito 3x”.

---

## 5. User Stories

### Recepção

- **US1:** Como operador, ao registrar mensalidade com cartão crédito parcelado em 3x, quero escolher “3x” e ver o valor subir conforme a taxa da academia.
- **US2:** Como operador, ao mudar de crédito 6x para débito, quero que parcelas sumam e o valor recalcule para taxa de débito ou base.
- **US3:** Como operador, ao pagar à vista no crédito (1x), quero usar a taxa de crédito à vista, não a de 2x.

### Owner

- **US4:** Como owner, após configurar 10% em 6x, quero que mensalidades em 6x no Caixa mostrem `fee` proporcional a 10%.

### Edge cases

- **US5:** Taxa 6x configurada 0% → 6x permitido, valor = base (sem erro).
- **US6:** Plano com `applyCardFee: false` → parcelas visíveis mas sem acréscimo (consistência UX).
- **US7:** NL prefill de pagamento (`NL_PAYMENT_PREFILL_EVENT`) com `installments` opcional repassado ao modal.

---

## 6. Requirements

### P0 — Must have

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1 | UI parcelas em Mensalidades | Select 1x–12x quando `payForm.method === 'cartão_crédito'` |
| R2 | Estado inicial | `openPaymentModal` define `installments: 1` |
| R3 | Reset ao trocar método | Método ≠ crédito → `installments = 1` |
| R4 | Payload API | `createPayment` / `updatePayment` incluem `installments` normalizado 1–12 |
| R5 | Cálculo no save | `handleSavePayment` passa `payForm.installments` a `expectedAmountWithCardFee` (já wired) |
| R6 | Servidor | `buildPayload` em `studentPaymentsHandler` persiste `installments` no documento de pagamento quando atributo existir |
| R7 | Espelho | `studentPaymentFinancialTxMirror` grava `installments` e `fee` com parcelamento |
| R8 | Testes | `paymentStatusCardFees` + teste RTL/componente Mensalidades (parcelas no payload) |
| R9 | Paridade acentuado | `cartão_crédito` + 3x = mesmo valor que `cartao_credito` + 3x |

### P1 — Nice to have

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R10 | Preview de valor | Ao mudar parcelas ou método, sugerir valor mascarado com taxa (sem esperar salvar) |
| R11 | `StudentPaymentModal` | Mesmo select de parcelas no perfil do aluno |
| R12 | Hint na UI Taxas | Texto em Taxas de cartão: “Parcelamento aplica-se ao cartão crédito em Mensalidades” |

### P2 — Futuro

- Filtrar select só às faixas com taxa > 0%
- Backfill `installments: 1` em pagamentos antigos
- Unificar componente `PaymentInstallmentsSelect` compartilhado

---

## 7. Acceptance criteria (QA manual)

**Pré-condição:** Plano R$ 200, `applyCardFee: true`, crédito à vista 5%, parcelado 3x = 8%, 6x = 10%.

- [ ] Mensalidades → Cartão crédito → 1x → valor **R$ 210,00**
- [ ] Mesmo fluxo → 3x → **R$ 216,00**
- [ ] Mesmo fluxo → 6x → **R$ 220,00**
- [ ] Cartão débito → sem campo parcelas → taxa débito (ex. 2% → R$ 204)
- [ ] PIX → R$ 200,00
- [ ] Caixa → espelho da mensalidade 3x → método “Cartão de crédito 3x”, `fee` ≈ R$ 16
- [ ] Trocar crédito 6x → PIX → parcelas resetam; valor volta ao base

---

## 8. Success Metrics

**Leading:** testes P0 verdes; checklist QA 7/7.

**Lagging (30 dias):** pagamentos `cartão_crédito` com `installments > 1` e `fee > 0` quando taxa parcelada configurada.

---

## 9. Open Questions

| # | Pergunta | Dono | Default v1 |
|---|----------|------|------------|
| Q1 | Preview de valor ao mudar parcelas (antes de salvar)? | Produto | P1 — save já ajusta valor |
| Q2 | Incluir `StudentPaymentModal` no mesmo PR? | Engenharia | P1 — escopo separável |
| Q3 | Atributo `installments` em `student_payments` no Appwrite? | Engenharia | Provisionar se ausente; strip se unknown (padrão mirror) |
| Q4 | NL pode informar parcelas no prefill? | Produto | Aceitar `installments` no evento se presente |

---

## 10. Timeline

| Fase | Entrega | Esforço |
|------|---------|---------|
| **v1 (esta spec)** | UI Mensalidades + payload + server persist + testes | ~1 dia |
| P1 | Preview valor + StudentPaymentModal | ~0,5 dia |
| P2 | Componente compartilhado + filtros por taxa configurada | backlog |

**Dependências:** [taxas-cartao-metodos-canonicos](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md) implementado.

---

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Academias acostumadas com taxa à vista em parcelado | Comunicar alinhamento à config de Taxas; não retroativo |
| Schema sem `installments` em pagamentos | Persistir no espelho Caixa; provision script opcional |
| Duplicar UI de `TransacoesTab` | Extrair select mínimo ou copiar padrão existente (12 options) |
