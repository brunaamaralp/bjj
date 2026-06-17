# MDR por conta bancária (maquininha) — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Proposta — aguardando aprovação  
**TECH:** [2026-06-17-mdr-por-conta-bancaria-TECH.md](./2026-06-17-mdr-por-conta-bancaria-TECH.md)  
**Relacionado:**

- [bruto-taxa-liquido-modelo-financeiro](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md) (`acquirerFees` global, Fase 2)
- [config-inicial-financeiro](../../flows/financeiro/config-inicial-financeiro.md)
- [pagbank-conciliacao-integracao](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md) (conta PagBank como destino)

---

## 1. Problem Statement

Academias com **mais de uma maquininha ou adquirente** (ex.: Sicoob no cartão presencial, PagBank no PIX/link) pagam **MDR diferente** em cada uma. Hoje o Nave tem **uma única tabela** `financeConfig.acquirerFees` por academia.

**Consequência:** ao liquidar um pagamento na conta Sicoob, o sistema aplica a mesma taxa que usaria para PagBank — distorcendo `fee`/`net` no Caixa, na previsão e no fechamento.

**Quem sofre:** owner e contador que comparam extrato bancário com o Nave; recepção que alterna entre terminais no mesmo dia.

**O que já funciona:** cadastro de várias contas em **Recebimento** e **conta padrão por método** (`defaultAccountByMethod`). Falta ligar **conta escolhida → MDR daquela maquininha**.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | Configurar MDR **por conta** (Sicoob ≠ PagBank) | Owner edita taxas no cadastro da conta ou vê override na seção Taxas |
| G2 | Ao registrar pagamento, MDR segue a **conta selecionada** | Liquidação cartão 2% Sicoob vs 2,5% PagBank gera `fee` distinto no espelho Caixa |
| G3 | Previsão usa MDR da conta **padrão do método** | PIX com padrão PagBank usa MDR PagBank; sem padrão → taxa global |
| G4 | Retrocompatível | Academias com só `acquirerFees` global continuam iguais |
| G5 | Não confundir com repasse ao aluno | `cardFees` permanece global; copy reforça diferença |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| `cardFees` (repasse ao aluno) por conta | Política comercial da academia, não custo da operadora |
| Import automático de MDR do PagBank/Stone | Escopo integração futura |
| Recalcular histórico em massa | Só novos lançamentos; ajuste manual no passado |
| Taxa por bandeira (Visa/Master/Elo) | Complexidade; v2 se demandado |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| MDR por conta em **dinheiro** / **transferência** | Métodos sem operadora |

---

## 4. Abordagens consideradas

### A — MDR embutido em cada `bankAccounts[]` (recomendada)

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

## 5. Comportamento esperado

### 5.1 Configuração (Minha Academia → Financeiro)

#### Recebimento — editar conta

No modal **Nova conta / Editar conta**, bloco colapsável:

**“Taxas da maquininha (MDR)”**

- Toggle: **Usar taxas padrão da academia** (default **ligado**)
- Desligado → mesmos campos da seção Taxas (PIX, débito, crédito à vista, parcelado 2x–12x, antecipação %)
- Texto de ajuda: *“Só preencha se esta conta recebe por uma maquininha com taxas diferentes do padrão.”*

#### Taxas — seção existente

- Título do bloco MDR global → **“Taxas padrão da operadora (MDR)”**
- Lead: *“Usadas quando a conta do pagamento não tiver taxas próprias.”*
- Lista resumo (opcional v1.1): contas com override — ex. *“Sicoob · 12345 — MDR customizado”*

**Repasse ao aluno** (`cardFees`): **sem mudança** — continua global.

### 5.2 Resolução de MDR no pagamento

Ordem de precedência:

```
1. Conta do lançamento (bank_account) tem acquirerFees próprio? → usar
2. Senão → financeConfig.acquirerFees (global)
3. Política acquirerFeePolicy (absorb / pass_through) → inalterada
```

**Gatilho:** sempre que o operador escolhe ou troca a **conta bancária** no modal de pagamento (Mensalidades, Vendas, Caixa, conciliação).

### 5.3 Previsão de caixa

Sem conta conhecida por parcela futura:

```
conta sugerida = defaultAccountByMethod[método] || primeira conta cadastrada
MDR = resolveAcquirerFees(conta sugerida) || global
```

Legenda existente de “líquido estimado” permanece; passa a refletir MDR da conta padrão do método.

### 5.4 Exemplo — Sicoob + PagBank

| Conta | Uso | MDR débito | MDR crédito | MDR PIX |
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

## 6. User Stories

| ID | Como… | Quero… | Para… |
|----|-------|--------|-------|
| US1 | owner | cadastrar MDR da maquininha Sicoob na conta Sicoob | o Caixa bater com o extrato Sicoob |
| US2 | owner | deixar PagBank só com MDR de PIX customizado | cartão continuar usando padrão ou outra conta |
| US3 | recepção | ver líquido correto ao trocar a conta no pagamento | não registrar taxa errada |
| US4 | contador | confiar que fechamento bruto/taxa/líquido usam MDR da conta do TX | fechar o mês sem planilha paralela |
| US5 | owner com uma maquininha | não configurar nada por conta | comportamento idêntico ao hoje (só global) |

---

## 7. UI / UX

### Estados da conta

| Estado | Exibição no card Recebimento |
|--------|------------------------------|
| Usa padrão | Subtítulo normal (agência/conta) |
| MDR customizado | Badge ou subtítulo: *“MDR próprio”* |

### Feedback no pagamento (v1 desejável)

Ao mudar conta ou método, se MDR > 0 e UI já mostra valores: atualizar preview **Bruto / Taxa / Líquido** (mesmos rótulos do Caixa).

### Erros / validação

- Percentuais ≥ 0, máx. razoável 100 (igual hoje)
- Conta incompleta: não impede salvar MDR (salva junto quando conta válida)
- Save global: sem validação extra obrigatória (override é opcional)

---

## 8. Migração e compatibilidade

| Cenário | Comportamento |
|---------|---------------|
| Academia existente, só `acquirerFees` global | 100% igual |
| Nova conta sem `acquirerFees` | Herda global |
| Conta com override parcial (só débito preenchido) | **v1:** objeto completo normalizado como hoje; override substitui o global inteiro quando toggle desligado |
| Renomear banco/conta (rótulo muda) | Taxas permanecem no objeto da conta (Abordagem A) |

**Não** copiar automaticamente global → contas na migração.

---

## 9. Fases de entrega

### Fase 1 — Config + resolver (MVP)

- Schema + normalização + `resolveAcquirerFeesForAccount()`
- UI no modal de conta + copy na seção Taxas
- Testes unitários do resolver

### Fase 2 — Pagamentos e espelhos

- Mensalidades, vendas, `studentPaymentFinancialTxMirror`, `salesMirror`
- Antecipação: MDR da conta do TX original

### Fase 3 — Previsão e relatórios

- `financeForecastInflows`, `installmentSchedule`
- Verificar paridade fechamento / KPIs

---

## 10. Open Questions

| # | Pergunta | Proposta default |
|---|----------|------------------|
| OQ1 | Override parcial (só PIX) ou tabela completa obrigatória? | Tabela completa ao desligar toggle; evita merge campo a campo |
| OQ2 | Preview MDR no modal de pagamento é P0 ou P1? | P1 (Fase 2); P0 é cálculo correto no save |
| OQ3 | `cardFees` por conta no futuro? | Fora de escopo; reavaliar se clientes pedirem |
| OQ4 | Limite `financeConfig` com 5+ contas customizadas? | Monitorar; offload já existe para plans/banks |

---

## 11. Critérios de aceite

- [ ] Owner cadastra Sicoob e PagBank com MDR distintos e salva
- [ ] Pagamento débito na conta Sicoob usa MDR Sicoob no `FINANCIAL_TX`
- [ ] Pagamento PIX na conta PagBank usa MDR PagBank
- [ ] Conta sem override usa MDR global
- [ ] Academia sem override em nenhuma conta = comportamento atual
- [ ] Copy deixa claro: MDR por conta ≠ repasse ao aluno
- [ ] `npm test -- acquirerFees resolveAcquirerFees` verde

---

## 12. Histórico

| Data | Mudança |
|------|---------|
| 2026-06-17 | Spec inicial (brainstorm owner: duas maquininhas Sicoob/PagBank) |
