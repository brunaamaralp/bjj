# Taxas de cartão × métodos de pagamento (Mensalidades) — PRODUCT Spec

**Data:** 2026-06-15  
**Status:** Implementado (2026-06-15)  
**TECH:** [2026-06-15-taxas-cartao-metodos-canonicos-TECH.md](./2026-06-15-taxas-cartao-metodos-canonicos-TECH.md)  
**Escopo v1:** Corrigir cálculo de taxa quando o método salvo usa variantes legadas (`cartão_crédito`, `cartão_débito`) — sem mudar UI de Mensalidades nem migrar dados históricos.

---

## 1. Problem Statement

Academias configuram **Taxas de cartão** em Minha Academia → Financeiro (débito, crédito à vista, parcelamento). Ao registrar uma mensalidade paga no modal de **Mensalidades**, o operador escolhe “Cartão crédito” ou “Cartão débito”. O valor gravado no pagamento, o `expected_amount` no servidor e o espelho no Caixa (`fee` / `net`) **ignoram as taxas configuradas**, porque o cálculo só reconhece métodos sem acento (`credito`, `cartao_credito`), enquanto Mensalidades persiste `cartão_crédito` / `cartão_débito`.

**Quem sofre:** recepção/owner que configurou taxa e espera repasse ao aluno + dedução correta no Caixa.

**Custo de não resolver:** subcobrança de mensalidade, DRE com `fee = 0` em pagamentos com cartão, perda de confiança nas configurações financeiras. O problema é silencioso — não há erro na tela.

**Evidência:** auditoria 2026-06-15; testes atuais usam `'credito'`/`'debito'`, não os valores do modal de Mensalidades.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Taxa configurada reflete no valor ao salvar mensalidade com cartão (modal Mensalidades) | Dado plano R$ 200 + 5% crédito + `applyCardFee`, método `cartão_crédito` → valor esperado R$ 210 |
| G2 | Mesmo comportamento no servidor e no espelho Caixa | `studentPaymentsHandler` e `studentPaymentFinancialTxMirror` produzem `expected_amount` e `fee` coerentes |
| G3 | Paridade entre todas as variantes de método já usadas no produto | `cartão_crédito`, `cartao_credito`, `credito` etc. produzem o mesmo resultado |
| G4 | Zero regressão em PIX, dinheiro, transferência | Métodos não-cartão continuam sem taxa (v1 não implementa taxa PIX) |
| G5 | Cobertura de testes com valores reais do UI | Testes automatizados usam strings persistidas por Mensalidades |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Taxa PIX | Decisão de produto separada; UI mostra campo mas código nunca aplicou — fora deste fix |
| Campo de parcelas no modal Mensalidades | Escopo próprio; taxas 2x–12x continuam sem efeito em Mensalidades até spec futura |
| Unificar enum de métodos em todo o codebase | Desejável, mas amplo; v1 corrige só o **cálculo**, não migra `PAY_METHODS` vs `paymentMethods.js` |
| Migrar pagamentos históricos | Registros antigos permanecem; correção é prospectiva no cálculo |
| Alterar copy “descontados” vs “repasse ao aluno” | UX/copy; não bloqueia o bug |
| Novos endpoints `/api/` | Limite Vercel Hobby 12/12 |
| Taxa fixa (`cardFees.*.fixed`) | Campo morto; não usado em nenhum fluxo |

---

## 4. Comportamento esperado (invariantes)

### 4.1 Modelo de negócio (inalterado)

1. Plano tem preço base (`financeConfig.plans[].price`).
2. Se `applyCardFee !== false` **e** método é cartão, o **valor cobrado do aluno** aumenta pelo percentual configurado.
3. No Caixa, `gross` = valor pago; `fee` = diferença entre valor com taxa e base; `net` = `gross - fee`.
4. PIX, dinheiro, transferência, outro: **sem** acréscimo de taxa (v1).

### 4.2 Tabela de métodos → taxa (após normalização)

| Método persistido (exemplos) | Chave canônica | Taxa aplicada |
|------------------------------|----------------|---------------|
| `cartão_crédito`, `cartao_credito`, `credito` | `cartao_credito` | `cardFees.credito_avista.percent` |
| `cartão_débito`, `cartao_debito`, `debito` | `cartao_debito` | `cardFees.debito.percent` |
| `pix`, `dinheiro`, `transferência`, `transferencia`, `outro` | (não cartão) | nenhuma |
| `credito_parcelado` (se existir legado) | `credito_parcelado` | tabela `credito_parcelado[n]` |

**Nota v1:** Mensalidades não envia `installments`; crédito no modal usa sempre taxa **à vista**, mesmo que a academia tenha taxas de parcelamento configuradas.

### 4.3 Arredondamento

- Mesma regra atual: `Math.round(valor * 100) / 100` (centavos BRL).

---

## 5. User Stories

### Recepção / operador

- **US1:** Como operador, ao registrar mensalidade paga com cartão de crédito no modal de Mensalidades, quero que o valor sugerido já inclua a taxa do plano, para não cobrar menos que o combinado com a academia.
- **US2:** Como operador, ao trocar de PIX para cartão débito no mesmo modal, quero que o sistema recalcule o valor com a taxa de débito (se o plano aplicar taxa).

### Owner / gestor

- **US3:** Como owner, após configurar 3% no débito em Minha Academia, quero ver no Caixa o campo `fee` refletindo essa taxa nos pagamentos de mensalidade com débito registrados em Mensalidades.

### Contador / DRE

- **US4:** Como gestor financeiro, quero que o lançamento espelhado de mensalidade com cartão tenha `net` = receita líquida após taxa da maquininha, para a DRE não superestimar receita.

### Edge cases

- **US5:** Plano com `applyCardFee: false` → nenhuma variante de cartão aplica taxa.
- **US6:** Taxa configurada 0% → valor permanece o preço do plano (não erro).
- **US7:** Pagamento já salvo com método acentuado legado → novos cálculos (ex.: reedição, espelho) usam taxa corretamente sem alterar string `method` no banco.
- **US8:** `StudentPaymentModal` (usa `cartao_credito`) e Mensalidades (usa `cartão_crédito`) produzem **o mesmo valor** para mesma config.

---

## 6. Requirements

### P0 — Must have

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R1 | Normalizar método antes de calcular taxa | Dado `financeConfig` com crédito 5% e plano R$ 200 `applyCardFee: true`, quando `expectedAmountWithCardFee(..., 'cartão_crédito', ...)` então retorna **210** |
| R2 | Débito acentuado | Mesmo cenário com débito 2% e `'cartão_débito'` → **204** |
| R3 | Paridade canônica | `'cartao_credito'` e `'credito'` produzem mesmo resultado que `'cartão_crédito'` |
| R4 | Não-cartão inalterado | `'pix'`, `'dinheiro'`, `'transferência'` → preço base sem taxa |
| R5 | `applyCardFee` respeitado | Plano sem taxa → cartão retorna base |
| R6 | Espelho Caixa | Com método `cartão_crédito`, mirror calcula `fee > 0` e `net = gross - fee` quando taxa > 0 |
| R7 | Testes de regressão | Suite `paymentStatus` / `expectedAmountWithCardFee` inclui casos Mensalidades; CI verde |

### P1 — Nice to have (mesmo PR se trivial)

| ID | Requisito | Critérios de aceite |
|----|-----------|---------------------|
| R8 | Exportar helper de “é cartão?” | Função reutilizável documentada para futuros fluxos (vendas, fechamento) |
| R9 | Teste espelho server | Unit em `studentPaymentFinancialTxMirror` ou handler com método acentuado |

### P2 — Futuro (specs separadas)

- Parcelas no modal Mensalidades + taxa `credito_parcelado[n]`
- Taxa PIX ou remoção do campo na UI
- Consolidação única de `PAYMENT_METHODS` em `paymentMethods.js`

---

## 7. Acceptance criteria (checklist QA manual)

**Pré-condição:** Academia com plano “Mensal” R$ 200, `Aplica taxa de cartão = Sim`, taxas débito 2%, crédito à vista 5%.

- [ ] Mensalidades → registrar pagamento → Cartão crédito → valor final **R$ 210,00** (ou auto-ajuste ao salvar)
- [ ] Mesmo fluxo → Cartão débito → **R$ 204,00**
- [ ] Mesmo fluxo → PIX → **R$ 200,00**
- [ ] Caixa → lançamento espelhado da mensalidade crédito → `fee` ≈ R$ 10, `net` ≈ R$ 200
- [ ] Plano com taxa desligada → cartão crédito → **R$ 200,00**
- [ ] Perfil do aluno → modal de pagamento com `cartao_credito` → mesmo valor que Mensalidades

---

## 8. Success Metrics

**Leading (pós-deploy):**

- 100% dos testes P0 verdes em CI
- QA checklist manual 7/7 em staging

**Lagging (30 dias):**

- Redução de suporte do tipo “configurei taxa e não aplicou” (baseline qualitativo)
- Amostra de pagamentos `cartão_crédito` com `fee > 0` no espelho quando taxa configurada (query auditoria interna)

---

## 9. Open Questions

| # | Pergunta | Dono | Bloqueante? |
|---|----------|------|-------------|
| Q1 | Ao corrigir, devemos **exibir** preview do valor com taxa no modal antes de salvar (hoje só ajusta no save)? | Produto | Não — melhoria UX opcional P1 |
| Q2 | Crédito no modal deve usar taxa à vista mesmo com parcelamento configurado na academia? | Produto | Não — comportamento atual documentado em 4.2 |
| Q3 | Renomear métodos no save para canônico (`cartao_credito`) em v2? | Engenharia | Não |

**Decisão v1 (default):** corrigir só o cálculo; não alterar strings persistidas; não adicionar UI de parcelas.

---

## 10. Timeline e fases

| Fase | Entrega | Esforço estimado |
|------|---------|------------------|
| **v1 (esta spec)** | Canonicalização no cálculo + testes | ~0,5–1 dia |
| v2 | UI parcelas Mensalidades | spec futura |
| v3 | Unificação enum métodos | spec futura |

**Dependências:** nenhuma migration de banco; deploy frontend + serverless que já importam `paymentStatus.js`.

---

## 11. Riscos

| Risco | Mitigação |
|-------|-----------|
| Academias que “se acostumaram” com valor sem taxa em Mensalidades | Comunicar que correção alinha ao que já funcionava em outros modais; não retroativo |
| Duplicar lógica de aliases | Reutilizar `canonicalPaymentMethodKey` existente em `paymentMethodBankDefaults.js` |
| Regressão em `credito` legado NL | Testes de paridade para todas as variantes |
