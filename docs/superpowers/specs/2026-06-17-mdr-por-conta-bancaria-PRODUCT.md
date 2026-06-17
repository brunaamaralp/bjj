# Taxas da maquininha por conta bancária — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Proposta — aguardando aprovação  
**Nota:** “MDR” é termo interno (código/docs). **Nunca** aparece na interface para o usuário.
**TECH:** [2026-06-17-mdr-por-conta-bancaria-TECH.md](./2026-06-17-mdr-por-conta-bancaria-TECH.md)  
**Relacionado:**

- [bruto-taxa-liquido-modelo-financeiro](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md) (`acquirerFees` global, Fase 2)
- [config-inicial-financeiro](../../flows/financeiro/config-inicial-financeiro.md)
- [pagbank-conciliacao-integracao](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md) (conta PagBank como destino)

---

## 1. Problem Statement

Academias com **mais de uma maquininha** (ex.: Sicoob no cartão presencial, PagBank no PIX/link) pagam **taxas diferentes** em cada uma — o valor que cai na conta é menor que o cobrado do aluno. Hoje o Nave tem **uma única tabela de taxas da maquininha** por academia (`financeConfig.acquirerFees`).

**Consequência:** ao liquidar um pagamento na conta Sicoob, o sistema aplica a mesma taxa que usaria para PagBank — distorcendo **Taxa** e **Líquido** no Caixa, na previsão e no fechamento.

**Quem sofre:** owner e contador que comparam extrato bancário com o Nave; recepção que alterna entre terminais no mesmo dia.

**O que já funciona:** cadastro de várias contas em **Recebimento** e **conta padrão por método**. Falta ligar **conta escolhida → taxas daquela maquininha**.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Configurar taxas da maquininha **por conta** (Sicoob ≠ PagBank) | Owner edita taxas no cadastro da conta; zero jargão “MDR” na UI |
| G2 | Ao registrar pagamento, taxa segue a **conta selecionada** | Liquidação cartão 2% Sicoob vs 2,5% PagBank gera Taxa distinta no Caixa |
| G3 | Previsão usa taxa da conta **padrão do método** | PIX com padrão PagBank usa taxa PagBank; sem padrão → taxa global |
| G4 | Retrocompatível | Academias com só taxas globais continuam iguais |
| G5 | Não confundir com repasse ao aluno | `cardFees` permanece global; copy reforça diferença |
| G6 | Linguagem acessível | Nenhum rótulo, tooltip ou banner visível ao usuário contém “MDR” ou “adquirente” |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| `cardFees` (repasse ao aluno) por conta | Política comercial da academia, não custo da operadora |
| Import automático de taxas do PagBank/Stone | Escopo integração futura |
| Recalcular histórico em massa | Só novos lançamentos; ajuste manual no passado |
| Taxa por bandeira (Visa/Master/Elo) | Complexidade; v2 se demandado |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| Taxa de maquininha por conta em **dinheiro** / **transferência** | Métodos sem maquininha |

---

## 4. Terminologia na interface (obrigatório)

**Termo canônico aprovado:** **taxa da maquininha** (e variações: *taxas da maquininha*, *taxas padrão da maquininha*, *taxas desta maquininha*). Não usar “desconto da maquininha”, “taxa da operadora” ou “MDR” na UI.

O operador pensa em **maquininha**, **extrato** e **quanto cai na conta** — não em siglas de pagamentos.

### 4.1 O que o usuário vê vs o que fica no código

| Conceito | Na interface (usuário) | No código / spec técnica |
|----------|------------------------|---------------------------|
| Desconto da maquininha/banco | **Taxa da maquininha** | `acquirerFees`, MDR |
| Valor cobrado do aluno | **Bruto** | `gross` |
| Desconto antes de cair na conta | **Taxa** | `fee` |
| Valor no extrato | **Líquido** | `net` |
| Acréscimo na mensalidade | **Repasse ao aluno** | `cardFees` |

### 4.2 Rótulos aprovados (copy canônico)

| Contexto | Usar | Não usar |
|----------|------|----------|
| Título seção global (Taxas) | **Taxas padrão da maquininha** | Taxas da operadora (MDR), MDR |
| Título no modal da conta | **Taxas desta conta / maquininha** | MDR desta conta |
| Toggle no modal | **Usar as taxas padrão da academia** | Usar MDR global |
| Campos percentuais | **PIX — taxa (%)**, **Débito — taxa (%)**, etc. | PIX — MDR (%) |
| Parcelado | **Taxas no parcelado** / **3x — taxa (%)** | MDR parcelado |
| Antecipação | **Antecipação — taxa (%)** | (ok manter “antecipação”) |
| Política quem paga | **Quem paga a taxa da maquininha?** | Quem absorve o MDR? |
| Opção recomendada | **A academia paga a taxa da maquininha** | Academia absorve MDR |
| Opção repasse no preço | **Já está no preço cobrado do aluno** | Repasse no preço / MDR sobre base |
| Badge no card da conta | **Taxas próprias** | MDR próprio |
| Tooltip curto | *Percentual da taxa da maquininha (ou do banco) descontado antes do valor cair na sua conta.* | Qualquer menção a MDR/adquirente |

### 4.3 Textos de ajuda (exemplos)

**Modal da conta (bloco colapsável):**

> Se esta conta recebe por uma maquininha com taxas diferentes das outras (ex.: Sicoob no cartão, PagBank no PIX), informe as taxas aqui. Caso contrário, deixe ligado “Usar as taxas padrão da academia”.

**Seção Taxas — bloco padrão:**

> Taxa da maquininha: percentual descontado do valor recebido antes de cair na conta. Estas são as taxas padrão, usadas quando a conta do pagamento não tiver taxas próprias. Não confunda com o repasse ao aluno (acréscimo na mensalidade).

### 4.4 Refactor de copy existente (escopo desta feature)

A UI atual ainda exibe “MDR” em `FinanceSettingsAcquirerFeesSection` e `financeTermHints`. **Fase 1** inclui substituir esses textos pelo vocabulário acima, para consistência antes de adicionar taxas por conta.

---

## 5. Abordagens consideradas

### A — Taxas embutidas em cada `bankAccounts[]` (recomendada)

Cada conta pode ter `acquirerFees` opcional. Se ausente, usa o **padrão global** da academia.

| Prós | Contras |
|------|---------|
| Natural: “esta conta é a maquininha Sicoob, estas são as taxas dela” | Modal de conta fica um pouco maior |
| Taxas migram com a conta ao editar banco/PIX | JSON de `financeConfig` cresce (~300 B/conta) |
| Sem mapa paralelo por rótulo | |

### B — Mapa `acquirerFeesByAccountLabel`

Chave = rótulo `Sicoob · 12345`.

| Prós | Contras |
|------|---------|
| Não altera schema de `bankAccounts` | Quebra se usuário renomear conta |
| | Dois lugares na UI (Recebimento + Taxas) |

### C — ID estável + mapa separado

UUID em cada conta + `acquirerFeesByAccountId`.

| Prós | Contras |
|------|---------|
| Robusto a renomear rótulo | Mais migração e indireção |
| | Overkill para v1 (2–3 contas típicas) |

**Decisão:** **Abordagem A** — `bankAccounts[].acquirerFees` opcional + `financeConfig.acquirerFees` como **fallback padrão**.

---

## 6. Comportamento esperado

### 6.1 Configuração (Minha Academia → Financeiro)

#### Recebimento — editar conta

No modal **Nova conta / Editar conta**, bloco colapsável:

**“Taxas desta conta / maquininha”**

- Toggle: **Usar as taxas padrão da academia** (default **ligado**)
- Desligado → mesmos campos da seção Taxas (PIX, débito, crédito à vista, parcelado 2x–12x, antecipação %)
- Texto de ajuda: ver §4.3

#### Taxas — seção existente

- Bloco superior: **Repasse ao aluno** — sem mudança de título
- Bloco inferior (hoje “Taxas da operadora (MDR)”): renomear para **“Taxas padrão da maquininha”** + lead §4.3
- Lista resumo (opcional v1.1): contas com override — ex. *“Sicoob · 12345 — taxas próprias”*

**Repasse ao aluno** (`cardFees`): **sem mudança** — continua global.

### 6.2 Resolução da taxa no pagamento

Ordem de precedência:

```
1. Conta do lançamento (bank_account) tem acquirerFees próprio? → usar
2. Senão → financeConfig.acquirerFees (global)
3. Política acquirerFeePolicy (absorb / pass_through) → inalterada
```

**Gatilho:** sempre que o operador escolhe ou troca a **conta bancária** no modal de pagamento (Mensalidades, Vendas, Caixa, conciliação).

### 6.3 Previsão de caixa

Sem conta conhecida por parcela futura:

```
conta sugerida = defaultAccountByMethod[método] || primeira conta cadastrada
taxa = resolveAcquirerFees(conta sugerida) || global
```

Legenda **“Entrada líquida estimada no banco”** (sem “MDR”); passa a refletir a taxa da conta padrão do método.

### 6.4 Exemplo — Sicoob + PagBank

| Conta | Uso | Taxa débito | Taxa crédito | Taxa PIX |
|-------|-----|------------|-------------|---------|
| Sicoob · 12345 | Maquininha cartão | 1,49% | 2,49% | — (usa padrão 0%) |
| PagBank · PIX | Link / PIX | — (usa padrão) | — | 0,99% |
| **Padrão global** | Fallback | 0% | 0% | 0% |

**Recebimento — padrão por método:**

- Cartão débito/crédito → Sicoob · 12345  
- PIX → PagBank · PIX  

**Pagamento R$ 200 no débito Sicoob:** `fee = 2,98`, `net = 197,02`  
**Mesmo valor no PIX PagBank:** `fee = 1,98`, `net = 198,02`

---

## 7. User Stories

| ID | Como… | Quero… | Para… |
|----|-------|--------|-------|
| US1 | owner | cadastrar as taxas da maquininha Sicoob na conta Sicoob | o Caixa bater com o extrato |
| US2 | owner | deixar PagBank só com taxa de PIX diferente | cartão continuar usando padrão ou outra conta |
| US3 | recepção | ver o líquido correto ao trocar a conta no pagamento | não registrar taxa errada |
| US4 | contador | confiar que fechamento Bruto/Taxa/Líquido usam a taxa da conta do lançamento | fechar o mês sem planilha paralela |
| US5 | owner com uma maquininha | não configurar nada por conta | comportamento idêntico ao hoje (só global) |
| US6 | owner leigo | entender as telas sem perguntar o que é “MDR” | configurar sozinho |

---

## 8. UI / UX

### Estados da conta

| Estado | Exibição no card Recebimento |
|--------|------------------------------|
| Usa padrão | Subtítulo normal (agência/conta) |
| Taxas próprias | Badge ou subtítulo: *“Taxas próprias”* |

### Feedback no pagamento (v1 desejável)

Ao mudar conta ou método, se taxa > 0 e UI já mostra valores: atualizar preview **Bruto / Taxa / Líquido** (mesmos rótulos do Caixa — sem siglas).

### Erros / validação

- Percentuais ≥ 0, máx. razoável 100 (igual hoje)
- Conta incompleta: não impede salvar taxas da maquininha (salva junto quando conta válida)
- Save global: sem validação extra obrigatória (override é opcional)

---

## 9. Migração e compatibilidade

| Cenário | Comportamento |
|---------|---------------|
| Academia existente, só `acquirerFees` global | 100% igual |
| Nova conta sem `acquirerFees` | Herda global |
| Conta com override parcial (só débito preenchido) | **v1:** objeto completo normalizado como hoje; override substitui o global inteiro quando toggle desligado |
| Renomear banco/conta (rótulo muda) | Taxas permanecem no objeto da conta (Abordagem A) |

**Não** copiar automaticamente global → contas na migração.

---

## 10. Fases de entrega

### Fase 1 — Config + resolver (MVP)

- Schema + normalização + `resolveAcquirerFeesForAccount()`
- UI no modal de conta + copy na seção Taxas
- **Refactor copy:** remover “MDR” de `FinanceSettingsAcquirerFeesSection`, `FinanceSettingsFeesSection`, `financeTermHints`
- Testes unitários do resolver + assert de strings na UI (sem “MDR”)

### Fase 2 — Pagamentos e espelhos

- Mensalidades, vendas, `studentPaymentFinancialTxMirror`, `salesMirror`
- Antecipação: taxa da conta do lançamento original

### Fase 3 — Previsão e relatórios

- `financeForecastInflows`, `installmentSchedule`
- Verificar paridade fechamento / KPIs

---

## 11. Open Questions

| # | Pergunta | Proposta default |
|---|----------|------------------|
| OQ1 | Override parcial (só PIX) ou tabela completa obrigatória? | Tabela completa ao desligar toggle; evita merge campo a campo |
| OQ2 | Preview Bruto/Taxa/Líquido no modal de pagamento é P0 ou P1? | P1 (Fase 2); P0 é cálculo correto no save |
| OQ3 | `cardFees` por conta no futuro? | Fora de escopo; reavaliar se clientes pedirem |
| OQ4 | Limite `financeConfig` com 5+ contas customizadas? | Monitorar; offload já existe para plans/banks |

---

## 12. Critérios de aceite

- [ ] Owner cadastra Sicoob e PagBank com taxas distintas e salva
- [ ] Pagamento débito na conta Sicoob usa taxa Sicoob no `FINANCIAL_TX`
- [ ] Pagamento PIX na conta PagBank usa taxa PagBank
- [ ] Conta sem override usa taxas padrão da academia
- [ ] Academia sem override em nenhuma conta = comportamento atual
- [ ] Copy deixa claro: taxa da maquininha ≠ repasse ao aluno
- [ ] **Nenhuma string visível ao usuário contém “MDR”** (teste de snapshot ou grep em componentes de settings)
- [ ] `npm test -- acquirerFees resolveAcquirerFees` verde

---

## 13. Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Spec inicial (brainstorm owner: duas maquininhas Sicoob/PagBank) |
| 2026-06-17 | §4 Terminologia: zero “MDR” na UI; refactor copy existente na Fase 1 |
| 2026-06-17 | Termo canônico confirmado pelo owner: **taxa da maquininha** |
