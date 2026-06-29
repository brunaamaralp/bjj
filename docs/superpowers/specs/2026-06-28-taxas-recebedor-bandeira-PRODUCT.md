# Taxas por recebedor e bandeira — PRODUCT Spec

**Data:** 2026-06-28  
**Status:** Aprovado para implementação  
**TECH:** [2026-06-28-taxas-recebedor-bandeira-TECH.md](./2026-06-28-taxas-recebedor-bandeira-TECH.md)  
**Plano:** [../plans/2026-06-28-taxas-recebedor-bandeira.md](../plans/2026-06-28-taxas-recebedor-bandeira.md)  
**Substitui / consolida:**

- [2026-06-17-mdr-por-conta-bancaria-PRODUCT.md](./2026-06-17-mdr-por-conta-bancaria-PRODUCT.md) (taxas por conta → recebedor)
- Trechos de taxas em [2026-06-17-formas-recebimento-meios-captura-PRODUCT.md](./2026-06-17-formas-recebimento-meios-captura-PRODUCT.md) (matriz no meio de captura)

**Relacionado:** [config-inicial-financeiro](../../flows/financeiro/config-inicial-financeiro.md), [pagbank-conciliacao-integracao](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md)

---

## 1. Problem Statement

Academias usam **vários recebedores** (PagBank, Asaas, Stone, maquininha do banco) com **taxas diferentes** — inclusive **por bandeira** (Visa ≠ Master ≠ Elo) no mesmo provedor. Hoje o Nave espalha a configuração em três telas (Contas bancárias, Formas de recebimento, Taxas de cartão) e **não modela bandeira**, gerando taxa errada no Caixa e frustração no setup.

**Quem sofre:** owner no onboarding financeiro; recepção ao registrar pagamento; contador na conciliação.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | **Uma tela** para taxas da maquininha | Matriz só em Taxas e recebedores; Recebimento e Formas sem grade de taxas |
| G2 | Taxas por **recebedor** (PagBank ≠ Asaas) | Cada recebedor com tabela própria |
| G3 | Taxas por **bandeira** quando necessário | Colunas Visa/Master/Elo/etc. na matriz |
| G4 | Bandeira **obrigatória só com divergência** | Se só linha Padrão preenchida → campo oculto; se ≥2 bandeiras com taxa distinta → obrigatório no pagamento |
| G5 | Retrocompatível | Migração automática de `acquirerFees` / conta / meio de captura |
| G6 | Repasse ao aluno inalterado | `cardFees` permanece global na aba Repasse |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| Import automático de tabela PagBank/Stone | Integração futura |
| Repasse ao aluno por recebedor | Política comercial da academia |
| Recalcular histórico `FINANCIAL_TX` | Só novos lançamentos |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| Taxa por bandeira no PIX | PIX não tem bandeira |

---

## 4. Terminologia (UI)

| Conceito | Na interface | Código |
|----------|--------------|--------|
| Recebedor | **Recebedor** / maquininha | `feeReceiver` |
| Taxa da maquininha | **Taxa da maquininha** | `acquirerFees` (legado) / `feeReceivers[].fees` |
| Bandeira | **Bandeira do cartão** | `card_brand` |
| Fallback | **Padrão** (coluna) | `default` |
| Repasse | **Repasse ao aluno** | `cardFees` |

**Nunca** exibir “MDR” ou “adquirente” ao usuário.

---

## 5. Comportamento esperado

### 5.1 Configuração — Minha Academia → Financeiro → **Taxas e recebedores**

Seção renomeada (slug `section=taxas` mantido).

**Aba 1 — Repasse ao aluno**  
Comportamento atual de `cardFees` (PIX, débito, crédito, parcelado). Sem mudança funcional.

**Aba 2 — Recebedores / maquininhas**

- Lista de recebedores: nome, provedor (opcional), conta destino, badge “Taxas próprias” ou “Usa padrão”.
- **Recebedor padrão da academia** — card fixo no topo (substitui “Taxas padrão da maquininha” global).
- Botão **Adicionar recebedor**.
- Modal/drawer de edição:
  - Nome, provedor (PagBank, Asaas, Stone, Cielo, Rede, Manual…), conta bancária destino
  - Toggle **Usar taxas do recebedor padrão**
  - Matriz: PIX; débito; crédito 1x; parcelado 2x–12x — colunas **Padrão | Visa | Master | Elo | Amex | Hipercard | Outros**
  - Ação **Copiar Padrão → todas as bandeiras**
  - Antecipação (%)

**Contas bancárias (Recebimento):** apenas select opcional “Recebedor de taxas” — **sem matriz**.

**Formas de recebimento → meio de captura:** select **Recebedor** (obrigatório se meio ativo) — **sem matriz**.

### 5.2 Divergência de bandeira (decisão confirmada)

**Bandeira obrigatória no pagamento somente quando o recebedor efetivo tem divergência** para o método e parcelas daquele pagamento.

Definição de **divergência:**

- Para o par `(método, parcelas)` resolvido no pagamento, existem **duas ou mais bandeiras** (incluindo `default` como bandeira efetiva) com `(percent, fixed)` **diferentes** após normalização.
- Se todas as bandeiras preenchidas forem idênticas, ou só a coluna **Padrão** tiver valor > 0, **não há divergência**.

| Situação | Campo bandeira no pagamento |
|----------|----------------------------|
| Sem divergência | **Oculto**; usa coluna Padrão |
| Com divergência | **Obrigatório** antes de salvar |
| Bandeira omitida + sem divergência | OK — taxa = Padrão |
| Bandeira omitida + com divergência | Bloqueio com mensagem: “Selecione a bandeira do cartão.” |

### 5.3 Resolução no pagamento

Ordem de precedência do recebedor:

1. `fee_receiver_id` gravado no pagamento (snapshot)
2. `captureMethod.feeReceiverId`
3. `bankAccount.feeReceiverId`
4. `paymentMethodSettings[method].defaultFeeReceiverId`
5. `financeConfig.defaultFeeReceiverId`
6. Legado (migração): resolver antigo `acquirerFees` por conta/meio

Ordem da taxa:

1. Linha da **bandeira** selecionada (se informada)
2. Senão coluna **Padrão**

### 5.4 Exemplo PagBank

Recebedor “PagBank PJ” — débito Visa 1,79%, Master 1,89%, Padrão 1,99%.

- Pagamento débito **sem** selecionar bandeira → **bloqueado** (divergência).
- Pagamento débito Visa → taxa 1,79%.
- Se owner copiar Padrão 1,99% para todas as colunas → bandeira **oculta**, taxa 1,99%.

---

## 6. User Stories

| ID | Como… | Quero… | Para… |
|----|-------|--------|-------|
| US1 | owner | cadastrar PagBank e Asaas com taxas distintas numa só tela | não perder tempo em 3 menus |
| US2 | owner | informar taxa Visa ≠ Master no PagBank | o Caixa bater com o extrato |
| US3 | recepção | não escolher bandeira quando todas são iguais | registrar rápido no balcão |
| US4 | recepção | ser obrigada a escolher bandeira só quando importa | não errar taxa sem fricção desnecessária |
| US5 | contador | ver líquido correto por recebedor | fechar o mês sem planilha paralela |

---

## 7. Migração

| Cenário | Comportamento |
|---------|---------------|
| Só `acquirerFees` global | Vira recebedor “Padrão academia” |
| Conta com taxas próprias | Vira recebedor vinculado à conta |
| Meio de captura com matriz | Vira recebedor ou reutiliza o da conta se idêntico |
| Histórico sem `card_brand` | Mantém taxa calculada na época; novos pagamentos seguem regra nova |

---

## 8. Critérios de aceite

- [ ] Matriz de taxas da maquininha existe **apenas** em Taxas e recebedores
- [ ] PagBank e Asaas como recebedores distintos com taxas distintas
- [ ] Bandeira oculta quando não há divergência; obrigatória quando há
- [ ] `FINANCIAL_TX` reflete taxa do recebedor + bandeira no save
- [ ] Migração automática sem perda de taxas legadas
- [ ] UI sem “MDR”
- [ ] Testes `feeReceivers` + `resolveFeeReceiver` verdes

---

## 9. Histórico

| Data | Mudança |
|------|---------|
| 2026-06-28 | Spec inicial — consolidação em recebedor + bandeira |
| 2026-06-28 | Decisão: bandeira obrigatória só com divergência (owner) |
