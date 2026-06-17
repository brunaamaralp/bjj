# Formas de recebimento e meios de captura — PRODUCT Spec

**Data:** 2026-06-17  
**Status:** Proposta — aguardando aprovação  
**TECH:** [2026-06-17-formas-recebimento-meios-captura-TECH.md](./2026-06-17-formas-recebimento-meios-captura-TECH.md)  
**Relacionado:**

- [config-inicial-financeiro](../../flows/financeiro/config-inicial-financeiro.md)
- [mdr-por-conta-bancaria](./2026-06-17-mdr-por-conta-bancaria-PRODUCT.md) (taxas por conta — base já implementada)
- [bruto-taxa-liquido-modelo-financeiro](./2026-06-17-bruto-taxa-liquido-modelo-financeiro-PRODUCT.md)
- [pagbank-conciliacao-integracao](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md)
- [mensalidades-parcelamento-taxas](./2026-06-15-mensalidades-parcelamento-taxas-PRODUCT.md)
- [payment-methods-enum-unificado](./2026-06-15-payment-methods-enum-unificado-PRODUCT.md)

**Benchmark:** cadastros de concorrentes em gestão para academias — *Formas de recebimento* (métodos simples) e *Cadastro de cartão* (canais com adquirente, taxa e prazo de crédito).

---

## 1. Problem Statement

Hoje o Nave configura recebimentos em **pelo menos três lugares** que o operador não associa mentalmente:

| O quê | Onde hoje | O que falta |
|-------|-----------|-------------|
| Conta bancária / PIX | Minha Academia → **Recebimento** | OK como cadastro de destino |
| Conta padrão por método | Final da seção Recebimento | Escondido; sem status “configurada” |
| Repasse ao aluno | Minha Academia → **Taxas** | Separado do método |
| Taxa da maquininha | Taxas (global) + modal da conta | Sem entidade “cartão” ou “link” |
| Formas no caixa | Código fixo (`paymentMethods.js`) | Sem ligar/desligar; sem boleto/cheque operacional |

**Consequências:**

1. **Setup lento** — owner visita Recebimento e Taxas várias vezes; não sabe se terminou.
2. **Caixa ≠ extrato** — pagamento registrado como liquidado no dia da venda, mas o banco credita D+30 (crédito parcelado).
3. **Múltiplas maquininhas confusas** — PagBank (link) e Stone (presencial) na mesma conta bancária com taxas diferentes não têm cadastro claro.
4. **Interface poluída** — métodos que a academia não usa (ex.: transferência) aparecem em todo modal de pagamento.

**Quem sofre:** owner no onboarding financeiro; recepção na hora do pagamento; contador na previsão e no fechamento.

---

## 2. Goals

| # | Objetivo | Como medir |
|---|----------|------------|
| G1 | **Uma tela** para configurar como a academia recebe | Nova seção `formas-recebimento`; ≥80% das configs atuais migráveis sem retrabalho |
| G2 | **Status visual** por forma (ativa, configurada) | Lista com ícones ✓/○ como no benchmark; progresso na sidebar |
| G3 | **Meio de captura** para cartão (maquininha, link, gateway) | Cadastro com nome, tipo crédito/débito, conta destino, taxas e **dias para cair na conta** |
| G4 | **Previsão de caixa realista** | Entrada prevista na data `pagamento + dias crédito`, não só na data da venda |
| G5 | **Comportamento automático por forma** | Boleto/cheque podem ficar pendentes; PIX/dinheiro liquidam na hora (configurável) |
| G6 | **Preservar modelo financeiro maduro** | Repasse (`cardFees`) ≠ taxa da maquininha (`acquirerFees`); taxas por conta mantidas |
| G7 | **Onboarding guiado** | Wizard pós-primeira conta: “Quais formas você usa?” em &lt;5 min |
| G8 | **Linguagem de academia** | Zero “MDR”, “adquirente” ou “gateway” na UI principal; ver §5 |

---

## 3. Non-Goals

| Item | Motivo |
|------|--------|
| Taxa por bandeira (Visa/Master/Elo) | Complexidade; P2 se demandado |
| Import automático de tabela Stone/PagBank | Escopo integração ([pagbank](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md)) |
| Recalcular histórico em massa ao mudar dias crédito | Só novos lançamentos; ajuste manual no passado |
| Novo arquivo em `/api/` | Limite Vercel Hobby 12/12 |
| Substituir assinatura Nave (Asaas) | Billing da plataforma permanece separado |
| Criar formas totalmente customizadas pelo usuário (nome livre) | P1: lista estendida + toggles; P2: custom se necessário |
| Dias úteis vs corridos (checkbox benchmark) | P2; v1 usa dias corridos com tooltip “dias úteis em breve” |

---

## 4. Modelo conceitual (três camadas)

Separar o que hoje está misturado:

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1 — Conta bancária (onde o dinheiro cai)            │
│  Ex.: STONE · cc 12345, PagBank · PIX chave@academia        │
│  Já existe: financeConfig.bankAccounts[]                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ N:1
┌───────────────────────────▼─────────────────────────────────┐
│  CAMADA 2 — Meio de captura (como o pagamento entra)  NOVO  │
│  Ex.: STONE MAQUININHA crédito, LINK PAGAMENTO STONE online │
│  Taxa por parcela + dias para cair na conta                   │
└───────────────────────────┬─────────────────────────────────┘
                            │ agrupa
┌───────────────────────────▼─────────────────────────────────┐
│  CAMADA 3 — Forma de recebimento (o que o operador escolhe) │
│  Ex.: PIX, Dinheiro, Cartão crédito, Boleto, Cheque         │
│  Ativa/inativa, conta padrão, automações, repasse           │
└─────────────────────────────────────────────────────────────┘
```

**Regra de ouro:** o operador escolhe a **forma** no caixa; o sistema resolve **meio de captura** (se cartão) e **conta**; a **previsão** usa dias crédito do meio.

---

## 5. Terminologia na interface

| Conceito | Na interface | No código |
|----------|--------------|-----------|
| Forma de recebimento | **Forma de recebimento** | `paymentMethodConfig` / enum canônico |
| Meio de captura | **Maquininha / link de pagamento** | `captureMethod` |
| Conta bancária | **Conta para recebimento** | `bankAccounts[]` |
| Taxa da maquininha | **Taxa da maquininha** | `acquirerFees` |
| Repasse na mensalidade | **Repasse ao aluno** | `cardFees` |
| Prazo no extrato | **Dias para cair na conta** | `creditDays` |
| Liquidar no caixa | **Confirmar no caixa na hora** | `autoSettle` |
| Marcar recebido | **Marcar como recebido** | `autoMarkReceived` |

**Integração PagBank/Stone:** na UI, **“Conectado ao PagBank”** / **“Sem integração — registro manual”** — não expor nomes de API.

---

## 6. Comportamento esperado

### 6.1 Nova seção: Minha Academia → Financeiro → **Formas de recebimento**

**Rota:** `/empresa?tab=financeiro&section=formas-recebimento`  
**Slug:** `FINANCE_SETTINGS_SECTIONS.FORMAS = 'formas-recebimento'`  
**Grupo sidebar:** Essencial (abaixo de Recebimento ou substituindo o grid “conta por método”).

#### Layout master-detail (inspirado no benchmark, adaptado ao Nave)

```
┌──────────────────────────┬────────────────────────────────────────────┐
│ 🔍 Pesquisar…            │  CADASTRO — PIX                            │
├──────────────────────────┼────────────────────────────────────────────┤
│ Forma      Ativa  OK     │  Conta padrão: [PagBank ▼]                 │
│ ─────────────────────    │  Repasse ao aluno: [0,99 %]  (se plano)    │
│ PIX          ✓    ✓      │  Taxa maquininha: [0,99 %]  (opcional)     │
│ Dinheiro     ✓    ✓      │  ☑ Confirmar no caixa na hora              │
│ Cartão déb.  ✓    ✓      │  ☑ Marcar como recebido                    │
│ Cartão créd. ✓    ○      │  ☑ Forma ativa                             │
│ Boleto       ○    ○      │                                            │
│ Transferên.  ✓    ✓      │  [Salvar forma]                            │
│ Cheque       ○    ○      │                                            │
├──────────────────────────┤                                            │
│ Meios de captura (cartão)│                                            │
│ + Novo meio              │                                            │
│ STONE MAQUININHA    ✓    │                                            │
│ LINK STONE online   ✓    │                                            │
│ PAGBANK DÉBITO      ○    │                                            │
└──────────────────────────┴────────────────────────────────────────────┘
```

**Coluna OK (configurada):** ✓ quando conta padrão definida **e** (para cartão) ao menos um meio de captura ativo com taxas preenchidas ou explicitamente “sem taxa”.

**Abas do painel direito:**

| Aba | Quando |
|-----|--------|
| **Cadastro** | Forma simples (PIX, dinheiro, boleto…) |
| **Meios de captura** | Forma = cartão crédito ou débito |
| *(futuro)* **Integração** | Meio com PagBank conectado |

### 6.2 Formas simples (PIX, dinheiro, boleto, transferência, cheque, outro)

| Campo | Comportamento |
|-------|---------------|
| Conta padrão | Dropdown contas cadastradas; herda de `defaultAccountByMethod` na migração |
| Repasse ao aluno (%) | Espelha `cardFees` do método; link “editar parcelas” só se crédito |
| Taxa maquininha (%) / (R$) | Espelha `acquirerFees` global ou da conta; tipo **%** ou **valor fixo** por transação |
| Confirmar no caixa na hora | Default: ligado para PIX/dinheiro; desligado para boleto/cheque |
| Marcar como recebido | Default: ligado; desligado para boleto até confirmação |
| Forma ativa | Esconde método em Mensalidades, Vendas, Perfil, NL |

**Boleto e cheque (novos métodos operacionais):**

- Aparecem na lista desligados por default.
- Ao ativar: fluxo de pagamento permite vencimento + status `pending`.
- Liquidação manual ou via conciliação bancária.

### 6.3 Meio de captura (cadastro de cartão)

Entidade `financeConfig.captureMethods[]`:

| Campo | UI | Exemplo |
|-------|-----|---------|
| `id` | (interno) | `cap_stone_credito` |
| `name` | Nome | `STONE - MAQUININHA` |
| `paymentMethod` | (derivado) | `cartao_credito` ou `cartao_debito` |
| `bankAccountLabel` | Conta padrão | `STONE` |
| `channel` | Tipo de canal | `presencial` \| `link` \| `integrado` |
| `online` | ☑ Venda online / recorrência | link PagBank, assinatura futura |
| `maxInstallments` | Máx. parcelas | `12` |
| `active` | ☑ Ativo | |
| `useDefaultFees` | ☑ Usar taxas padrão da forma/conta | como hoje em conta |
| `fees` | Matriz 1x–12x | ver §6.4 |
| `integration` | (P1) | `{ provider: 'pagbank', connected: false }` |

**Lista à esquerda (subseção):** filtro por crédito/débito; badge “online” no link.

**Seleção no pagamento:** se há um único meio ativo para crédito → preenche automaticamente; se há vários → dropdown “Recebido via” (maquininha Stone, link PagBank…).

### 6.4 Matriz taxa + dias para cair na conta

Por parcela (1x–`maxInstallments`), colapsável como hoje em Taxas:

| Parcela | Taxa (%) | Taxa fixa (R$) | Dias para cair na conta |
|---------|----------|----------------|-------------------------|
| 1x | 3,19 | 0,00 | 30 |
| 2x | 5,59 | 0,00 | 30 |
| 3x | 6,49 | 0,00 | 30 |
| … | | | |

- **Taxa:** alimenta `acquirerFees` efetivo do meio (substitui override genérico da conta quando meio explícito no lançamento).
- **Dias para cair:** alimenta previsão e, opcionalmente, data de liquidação no Caixa (§6.6).

Botão **“Preencher igual para todas as parcelas”** e **“Copiar de outro meio”** reduzem digitação (gap vs benchmark).

### 6.5 Repasse ao aluno (inalterado em conceito)

- Continua em `cardFees` — global por tipo (PIX, débito, crédito, parcelas).
- Na UI da forma: campo resumido + link **“Editar repasse detalhado”** → scroll para bloco existente ou sub-aba.
- Plano com `applyCardFee` mantém comportamento atual.

### 6.6 Liquidação no Caixa vs crédito bancário

| Modo | Quando | Caixa | Previsão |
|------|--------|-------|----------|
| **Na hora** (default PIX/dinheiro) | `autoSettle: true` | `status=settled`, `settledAt=paid_at` | entrada na data do pagamento |
| **No crédito bancário** (default crédito parcelado) | `autoSettle: false` + `creditDays>0` | `status=pending` até data prevista **ou** `settled` com `settledAt` futuro *(decisão TECH)* | entrada em `paid_at + creditDays` |
| **Boleto/cheque** | `autoMarkReceived: false` | pagamento `pending`; caixa ao compensar | vencimento do boleto |

**Copy na forma:**

> *“Confirmar no caixa na hora”* — o lançamento aparece como liquidado no dia em que você registra o pagamento.  
> *“Dias para cair na conta”* — quando o extrato bancário costuma creditar (ex.: 30 dias no crédito).

### 6.7 Simplificação dos cadastros existentes

| Antes | Depois |
|-------|--------|
| Recebimento → grid 6 selects “conta por método” | Migrado para Formas de recebimento; grid removido ou link “gerenciar em Formas” |
| Taxas → bloco maquininha global | Mantido como **“Taxas padrão da academia”** + link “usadas quando forma/meio não define override” |
| Conta → taxas próprias | Mantido; meio de captura pode herdar ou sobrescrever |
| `paymentMethods.js` fixo | Enum canônico permanece; visibilidade via `paymentMethodSettings[method].active` |

---

## 7. Wizard de configuração inicial (facilitar cadastro)

Disparo: primeira conta bancária salva **ou** onboarding `setup_finance` incompleto.

**Passo 1 — Conta** *(já existe)*  
“Onde você recebe? Banco ou PIX.”

**Passo 2 — Formas que usa**  
Checkboxes com ícones: PIX, Dinheiro, Cartão (débito/crédito), Boleto, Transferência, Cheque.  
Pré-marca PIX + Dinheiro + Cartão.

**Passo 3 — Cartão (se marcado)**  
Pergunta única: “Como você recebe no cartão?”  
- ☐ Maquininha na recepção  
- ☐ Link de pagamento (WhatsApp)  
- ☐ Os dois  

Para cada opção marcada: nome sugerido (`Maquininha`, `Link de pagamento`), conta do passo 1, **3 campos rápidos**: taxa débito %, taxa crédito 1x %, dias crédito (default 30).  
Link: “Configurar parcelas depois”.

**Passo 4 — Resumo**  
Lista formas ✓ configuradas; botão **“Ir para Formas de recebimento”** para ajuste fino.

**Métrica:** tempo médio setup financeiro &lt; 5 min em teste moderado.

---

## 8. User Stories

| ID | Como… | Quero… | Para… |
|----|-------|--------|-------|
| US1 | owner | ver numa lista quais formas estão ativas e configuradas | saber se posso operar o caixa |
| US2 | owner | cadastrar Stone presencial e link PagBank com taxas diferentes | o líquido bater com cada extrato |
| US3 | owner | definir que crédito parcelado cai em 30 dias | a previsão de caixa ser realista |
| US4 | recepção | só ver PIX, dinheiro e cartão na mensalidade | não escolher método errado |
| US5 | recepção | escolher “maquininha” vs “link” quando há dois meios | registrar na conta certa |
| US6 | recepção | registrar boleto como pendente | liquidar só quando compensar |
| US7 | contador | ver entradas previstas na data do crédito bancário | não confundir com data da venda |
| US8 | owner com uma maquininha | usar o wizard e nunca abrir matriz de 12 parcelas | configurar rápido |
| US9 | owner avançado | copiar taxas de um meio para outro | não redigitar 12 linhas |
| US10 | admin (não owner) | editar formas e meios permitidos | manter recepção sem acessar planos |

---

## 9. Requisitos por fase

### Fase 1 — P0 (unificar cadastro + status)

| Req | Critério de aceite |
|-----|-------------------|
| R1 | Seção `formas-recebimento` na sidebar Essencial |
| R2 | Lista formas com colunas Ativa e Configurada |
| R3 | Painel por forma: conta padrão, toggles ativa / auto-caixa / auto-recebido |
| R4 | Migrar `defaultAccountByMethod` para `paymentMethodSettings` |
| R5 | Filtrar `PAYMENT_METHODS` nos modais por `active` |
| R6 | Progresso sidebar: “4/6 formas configuradas” |
| R7 | Atualizar [config-inicial-financeiro.md](../../flows/financeiro/config-inicial-financeiro.md) |

### Fase 2 — P0 (meios de captura)

| Req | Critério de aceite |
|-----|-------------------|
| R8 | CRUD `captureMethods[]` com nome, tipo, conta, canal, max parcelas |
| R9 | Matriz taxa % + fixa R$ por parcela (1x–12x) |
| R10 | Dropdown “Recebido via” no pagamento quando &gt;1 meio ativo |
| R11 | Resolução de taxa: meio → conta → global (precedência documentada na TECH) |
| R12 | Badge “Taxas próprias” no meio; herança da conta |

### Fase 3 — P1 (dias crédito + previsão)

| Req | Critério de aceite |
|-----|-------------------|
| R13 | Campo **Dias para cair na conta** por parcela no meio |
| R14 | Previsão usa `paid_at + creditDays` para cartão parcelado |
| R15 | Opção por forma: liquidar no caixa “na hora” vs “na data do crédito” |
| R16 | Fechamento mensal: nota explicativa quando caixa ≠ extrato por prazo |

### Fase 4 — P1 (formas estendidas + wizard)

| Req | Critério de aceite |
|-----|-------------------|
| R17 | Boleto e cheque operacionais (pending → liquidar) |
| R18 | Wizard pós-primeira conta (§7) |
| R19 | “Copiar de outro meio” na matriz de taxas |
| R20 | Taxa fixa R$ por transação na forma simples (boleto R$ 1,90) |

### Fase 5 — P2 (integração)

| Req | Critério de aceite |
|-----|-------------------|
| R21 | Meio `integrado` vinculado a credencial PagBank ([spec](./2026-06-16-pagbank-conciliacao-integracao-PRODUCT.md)) |
| R22 | Webhook preenche meio + liquida na data real do extrato |
| R23 | Dias úteis no cálculo de crédito |
| R24 | Assinatura recorrente como meio `online` |

---

## 10. Schema proposto (resumo para TECH)

```ts
// financeConfig — extensão; retrocompatível
{
  bankAccounts: BankAccount[];           // inalterado
  acquirerFees: AcquirerFees;            // fallback global
  cardFees: CardFees;                    // repasse global
  acquirerFeePolicy: 'absorb' | 'pass_through';

  // NOVO — substitui defaultAccountByMethod gradualmente
  paymentMethodSettings: {
    [canonical: string]: {
      active: boolean;
      defaultBankAccountLabel?: string;
      autoSettle?: boolean;
      autoMarkReceived?: boolean;
      // repasse/acquirer override opcional por forma (P2)
    };
  };

  // NOVO
  captureMethods: Array<{
    id: string;
    name: string;
    paymentMethod: 'cartao_credito' | 'cartao_debito';
    bankAccountLabel: string;
    channel: 'presencial' | 'link' | 'integrado';
    online: boolean;
    maxInstallments: number;
    active: boolean;
    useDefaultFees: boolean;
    fees: {
      [installment: string]: {
        percent: number;
        fixed: number;
        creditDays: number;
      };
    };
    integration?: { provider: string; externalId?: string };
  }>;

  // DEPRECATED após migração — ler fallback
  defaultAccountByMethod?: Record<string, string>;
}
```

**Migração v1:**  
`paymentMethodSettings[method].active = true` para todos os métodos atuais;  
`defaultBankAccountLabel` ← `defaultAccountByMethod[method]`;  
`captureMethods` vazio → comportamento idêntico ao hoje (taxa da conta/global).

---

## 11. Impacto em telas operacionais

| Tela | Mudança |
|------|---------|
| Mensalidades — modal pagamento | Só formas ativas; opcional “Recebido via”; conta do meio |
| Nova venda | Idem |
| Perfil aluno — pagamento | Idem |
| Caixa / Lançamentos | Status inicial conforme `autoSettle`; liquidação futura se crédito |
| Previsão | Itens “Crédito cartão — parcela 2/3” na data `+ creditDays` |
| Conciliação | Match por valor + data prevista de crédito (P3 + PagBank) |
| NL / register_payment | Respeitar formas ativas; inferir meio se único |

---

## 12. Success Metrics

| Métrica | Alvo (90 dias pós Fase 2) |
|---------|---------------------------|
| Academias com ≥1 forma configurada (conta + ativa) | ≥95% das com `bankAccounts` |
| Tempo médio setup financeiro (wizard) | &lt; 5 min |
| Tickets suporte “taxa errada / conta errada” | −30% |
| Uso de previsão com cartão parcelado | +20% (confiança) |
| Formas inativas (transferência/cheque desligados) | ≥40% academias customizam |

---

## 13. Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| `financeConfig` JSON grande | Limite 3 meios ativos típicos; matriz sparse; validação tamanho existente |
| Confusão repasse vs taxa maquininha | Dois blocos visuais + `FINANCE_TERM_HINTS` |
| Regressão em `expectedAmountWithCardFee` | Testes parity; feature flag por academia |
| Duplicar config (conta + meio + forma) | Herança clara: forma → meio → conta → global |
| Usuário não entende “dias crédito” | Tooltip com exemplo: “Vendeu dia 10 → cai dia 10 do mês seguinte” |

---

## 14. Open Questions

| # | Pergunta | Dono |
|---|----------|------|
| Q1 | Caixa com `settledAt` futuro vs lançamento `pending` + job de liquidação? | Engenharia |
| Q2 | Um meio de captura por transação obrigatório quando N&gt;1? | Produto |
| Q3 | Boleto nativo ou só “outro” até integração? | Produto — proposta: boleto P1 |
| Q4 | Admin edita formas mas não meios integrados? | Produto + permissões |
| Q5 | Renomear seção “Recebimento” para “Contas bancárias” evitando duplicidade? | UX |

---

## 15. Governança de docs

Ao implementar cada fase, atualizar no mesmo PR:

- [config-inicial-financeiro.md](../../flows/financeiro/config-inicial-financeiro.md) — mapa de telas + checklist
- [a-receber-mensalidades.md](../../flows/financeiro/a-receber-mensalidades.md) — seleção de forma/meio
- `financeSettingsSections.js` — slug, labels, progresso
- [VALIDATION.md](../../flows/VALIDATION.md) — se checklist divergir

---

## 16. Resumo executivo

O Nave **não precisa copiar** o modelo simplificado do concorrente (uma taxa só, liquidação imediata). Precisa **organizar** o que já é forte (repasse, taxa por conta, parcelas) numa experiência **única e guiada**:

1. **Formas de recebimento** — o que o operador escolhe; ativa, conta, automações.  
2. **Meios de captura** — como o cartão entra; taxa e **quando o dinheiro cai**.  
3. **Contas bancárias** — onde o dinheiro repousa.

Com wizard, status visual e cópia entre meios, o cadastro fica **mais rápido que o benchmark** para o caso comum (1 maquininha + PIX), e **mais preciso** para o caso avançado (Stone + PagBank + previsão D+30).
