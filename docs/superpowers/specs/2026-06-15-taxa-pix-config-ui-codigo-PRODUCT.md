# Taxa PIX × configuração em Minha Academia — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-taxa-pix-config-ui-codigo-TECH.md](./2026-06-15-taxa-pix-config-ui-codigo-TECH.md)  
**Relacionado:** [taxas-cartao-metodos-canonicos](./2026-06-15-taxas-cartao-metodos-canonicos-PRODUCT.md) (v1 cartão); [mensalidades-parcelamento](./2026-06-15-mensalidades-parcelamento-taxas-PRODUCT.md) (parcelas)

---

## 1. Problem Statement

Em **Minha Academia → Financeiro → Taxas de cartão**, a academia configura um percentual **PIX (%)** e o texto da seção diz que os valores são aplicados em pagamentos com **cartão e PIX** na mensalidade. O resumo da sidebar também exibe `PIX X%` quando configurado.

Porém o cálculo em `paymentStatus.js` **nunca lê** `cardFees.pix.percent`. PIX, dinheiro e transferência retornam taxa **0%**, independentemente da configuração. Testes automatizados documentam esse comportamento como intencional (`não aplica taxa em pix`), em **contradição** com a UI.

**Quem sofre:** owner que configurou taxa PIX esperando repasse ao aluno (como no cartão); recepção que cobra valor base em PIX enquanto a academia acredita que a taxa está ativa.

**Custo de não resolver:** configuração “morta”, perda de confiança no módulo financeiro, possível subcobrança silenciosa quando `pix.percent > 0`.

**Evidência:** auditoria de gaps 2026-06-15, item **#3** da matriz de priorização (severidade **Alta**, esforço **baixo**).

---

## 2. Análise do gap (estado atual)

### 2.1 O que a UI promete

| Superfície | Evidência |
|------------|-----------|
| `FinanceSettingsFeesSection.jsx` | Campo **PIX (%)** + lead: *“Percentuais descontados em pagamentos com cartão e PIX na mensalidade.”* |
| `financeSettingsSections.js` | Resumo Taxas: `PIX ${pix}% · Déb. … · Créd. …` |
| `useFinanceConfigState` / `financeConfigStorage` | `cardFees.pix: { percent, fixed }` persistido no `financeConfig` |
| Import/planilha financeira | Estrutura `cardFees` inclui `pix` |

### 2.2 O que o código faz

| Camada | Comportamento |
|--------|----------------|
| `cardFeePercent()` | Retorna percentual só para `cartao_credito`, `cartao_debito`, parcelado; **demais métodos → 0** |
| `expectedAmountWithCardFee()` | Só aplica taxa se `isCardPaymentMethod(key)`; **PIX excluído** |
| `studentPaymentsHandler` / espelho Caixa | Usam `expectedAmountWithCardFee` → `fee = 0` em PIX |
| `MensalidadesPanel` | Chama `expectedAmountWithCardFee` no save → PIX sem acréscimo |

### 2.3 O que os testes dizem hoje

| Arquivo | Assertiva |
|---------|-----------|
| `deactivateStudentPolicy.test.js` | `não aplica taxa em pix` → base R$ 200 |
| `paymentStatusCardFees.test.js` | `não aplica taxa em pix, dinheiro ou transferência` |

Ou seja: há **duas “fontes de verdade”** — produto (UI) vs engenharia (testes).

### 2.4 Modelo de negócio já usado no cartão (referência)

1. Plano tem `applyCardFee !== false`.
2. Valor cobrado = `base × (1 + pct/100)` (repasse ao aluno).
3. Caixa: `gross` = valor pago; `fee` = acréscimo; `net` = `gross - fee`.

PIX deve seguir o **mesmo modelo** se implementado, não “desconto da academia”.

### 2.5 Escopo de fluxos afetados

| Fluxo | Usa cálculo? |
|-------|----------------|
| Mensalidades (`MensalidadesPanel`) | Sim |
| Perfil aluno (`StudentPaymentModal`) | Sim (mesma função) |
| Servidor (`studentPaymentsHandler`) | Sim |
| Espelho Caixa (`studentPaymentFinancialTxMirror`) | Sim |
| Vendas / PDV | **Não** (fora desta spec) |
| Lançamentos manuais (`TransacoesTab`) | **Não** (valor digitado) |

---

## 3. Decisão de produto (recomendada)

### Opção A — **Implementar taxa PIX** (escolhida para v1)

Alinhar código + testes à UI existente.

**Por quê:**

- Campo PIX já está na UI há tempo, com copy explícita.
- Academias com `pix.percent > 0` provavelmente configuraram de boa fé.
- Esforço técnico baixo (um ramo em `cardFeePercent` + ajuste de elegibilidade).
- Paridade com cartão no mesmo fluxo de mensalidade.

**Semântica de `applyCardFee` no plano:**

- v1: PIX usa o **mesmo gate** que cartão (`plan.applyCardFee !== false`).
- P1: renomear label do plano de “Aplica taxa de cartão” → **“Repasse taxas de pagamento ao aluno”** (ou similar), sem mudar o campo no banco.

### Opção B — Remover campo PIX da UI (rejeitada para v1)

Remover input, ajustar copy e resumo da sidebar.

**Por quê não agora:** apagaria configuração já salva; não resolve expectativa de quem preencheu PIX > 0; contradiz resumo que já mostra `PIX X%`.

Documentada como alternativa se produto revisar após deploy.

---

## 4. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | `pix.percent > 0` reflete no valor da mensalidade PIX | Plano R$ 200, PIX 3%, `applyCardFee: true` → R$ 206 |
| G2 | PIX 0% ou plano sem repasse → base inalterada | Regressão dos casos atuais |
| G3 | Dinheiro e transferência permanecem sem taxa | Sem mudança de comportamento |
| G4 | Espelho Caixa com `fee > 0` em PIX quando aplicável | Auditoria de `financial_tx` |
| G5 | UI, resumo e código alinhados | Copy + testes atualizados |

---

## 5. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Taxa PIX em vendas/PDV | Fluxo separado; sem `expectedAmountWithCardFee` |
| Taxa em lançamentos manuais | Valor informado pelo operador |
| `cardFees.pix.fixed` | Campo morto (como `fixed` do cartão) |
| Renomear `expectedAmountWithCardFee` | P2; manter export por compatibilidade |
| Migrar pagamentos históricos PIX | Prospectivo no cálculo |
| Novos endpoints `/api/` | Limite Vercel Hobby 12/12 |
| `ConfigTab.jsx` legado | Fora de rotas; não bloqueia |

---

## 6. Comportamento esperado (v1 — Opção A)

### 6.1 Tabela método → taxa

| Método | `cardFees` | Elegível se `applyCardFee` |
|--------|------------|----------------------------|
| `pix` | `pix.percent` | Sim |
| `cartão_crédito` / `cartao_credito` | `credito_avista` ou parcelado | Sim |
| `cartão_débito` / `cartao_debito` | `debito.percent` | Sim |
| `dinheiro`, `transferência`, `outro` | — | Não |

### 6.2 Invariantes

- Arredondamento: `Math.round(valor * 100) / 100` (centavos BRL).
- `pix.percent === 0` → sem acréscimo (equivalente ao comportamento atual).
- `applyCardFee === false` no plano → PIX e cartão sem acréscimo.

### 6.3 Copy (P1)

| Antes | Depois (sugerido) |
|-------|-------------------|
| “Percentuais descontados em pagamentos com cartão e PIX…” | “Percentuais **repassados ao aluno** em mensalidades pagas com cartão ou PIX.” |
| “Aplica taxa de cartão” (plano) | “Repasse taxas de pagamento ao aluno” |

v1 pode shippar só o cálculo; copy em P1 do mesmo PR se trivial.

---

## 7. User Stories

- **US1:** Como owner com PIX 2%, quero que mensalidade paga em PIX já inclua o repasse, como no cartão.
- **US2:** Como operador, ao registrar PIX no modal Mensalidades, quero o valor sugerido igual ao do cartão à vista quando as taxas forem equivalentes.
- **US3:** Como gestor, quero ver `fee` no Caixa em pagamentos PIX com taxa configurada.
- **US4:** Como owner com plano sem repasse (`applyCardFee: false`), PIX deve cobrar só o preço base.
- **US5:** Dinheiro e transferência nunca recebem acréscimo automático.

---

## 8. Requirements

### P0 — Must have

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1 | `cardFeePercent` lê `pix.percent` | `method='pix'`, `pix.percent=3` → retorna `3` |
| R2 | `expectedAmountWithCardFee` aplica PIX | Plano R$ 200, `applyCardFee: true`, PIX 3% → **206** |
| R3 | Gate do plano | `applyCardFee: false` + PIX 5% → **200** |
| R4 | Não-cartão inerte | `dinheiro`, `transferência` → base |
| R5 | Mensalidades | Save com PIX aplica valor com taxa quando configurado |
| R6 | Servidor + espelho | `fee > 0` no mirror quando PIX com taxa |
| R7 | Testes | Atualizar `paymentStatusCardFees` + `deactivateStudentPolicy`; CI verde |

### P1 — Nice to have

| ID | Requisito |
|----|-----------|
| R8 | Ajustar copy Taxas + label `applyCardFee` no plano |
| R9 | Hint no campo PIX: “Usado em mensalidades quando o plano repassa taxas.” |
| R10 | Teste espelho server com método `pix` |

### P2 — Futuro

- Renomear função para `expectedAmountWithPaymentFee`
- Taxa PIX em outros módulos se produto exigir

---

## 9. Acceptance criteria (QA manual)

**Pré:** Plano “Mensal” R$ 200, **Repasse taxas = Sim**, PIX 2%, crédito à vista 5%.

- [ ] Mensalidades → PIX → valor final **R$ 204,00**
- [ ] Mensalidades → Cartão crédito 1x → **R$ 210,00**
- [ ] Mensalidades → Dinheiro → **R$ 200,00**
- [ ] Plano com repasse **Não** → PIX → **R$ 200,00**
- [ ] PIX 0% na config → **R$ 200,00**
- [ ] Caixa → espelho PIX → `fee` ≈ R$ 4, método “PIX”

---

## 10. Success Metrics

**Leading:** testes P0 verdes; checklist QA 6/6.

**Lagging:** pagamentos `method=pix` com `fee > 0` quando `pix.percent > 0` (amostra interna).

---

## 11. Open Questions

| # | Pergunta | Default v1 |
|---|----------|------------|
| Q1 | PIX obedece `applyCardFee` ou taxa independente do plano? | **Mesmo gate** que cartão |
| Q2 | Implementar vs remover UI? | **Implementar** (Opção A) |
| Q3 | Corrigir copy “descontados” neste PR? | P1 no mesmo PR se possível |

---

## 12. Timeline

| Fase | Entrega | Esforço |
|------|---------|---------|
| **v1** | Cálculo PIX + testes | ~0,5 dia |
| P1 | Copy + label plano | ~1 h |

**Dependências:** specs de cartão e parcelamento já implementadas.

---

## 13. Riscos

| Risco | Mitigação |
|-------|-----------|
| Academias que cobravam base em PIX “de propósito” | Só afeta quem tem `pix.percent > 0`; default 0% |
| Nome `applyCardFee` confunde com PIX | P1 rename label; campo JSON inalterado |
| Testes antigos quebram | Atualizar asserts; manter casos dinheiro/transferência |
