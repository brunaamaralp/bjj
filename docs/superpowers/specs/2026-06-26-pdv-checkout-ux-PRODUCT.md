# PDV — Checkout e seleção de produto (UX)

**Data:** 2026-06-26  
**Status:** Aprovado para implementação  
**Abordagem:** 3 fases (P0 descoberta → P1 mobile/validação → P2 escala)  
**TECH:** [2026-06-26-pdv-checkout-ux-TECH.md](./2026-06-26-pdv-checkout-ux-TECH.md)  
**Auditoria origem:** revisão UX 2026-06-26 (chat) · fluxo [pdv-nova-venda.md](../../flows/vendas/pdv-nova-venda.md)  
**Specs relacionadas:** [2026-06-15-modal-venda-produto-PRODUCT.md](./2026-06-15-modal-venda-produto-PRODUCT.md) (P0 modal já entregue ou em curso)

---

## 1. Problem Statement

Recepcionistas usam **Loja → Vendas** (página, PDV e modal sidebar) para registrar vendas no balcão. O fluxo técnico funciona (catálogo, carrinho, pagamento, API), mas a **hierarquia visual** e a **descoberta de modos de pagamento** geram atrito operacional:

1. **Modos de negócio escondidos** — “Receber parte agora” e “Vender a prazo” ficam dentro de **Mais opções** (`<details>` fechado). O operador não associa isso a pagamento.
2. **PDV penaliza quem não usa atalhos** — bloco de pagamento manual inicia **fechado**; cartão com máquina exige passo extra após quick pay.
3. **Mobile exige scroll longo** — abas Catálogo/Carrinho separam contexto; pagamento e “Concluir” ficam abaixo do fold.
4. **Validação tardia** — preço por linha e pagamento parcial só ficam claros após blur ou submit; botão desabilitado sem motivo explícito.
5. **Inconsistência entre entradas** — no perfil do aluno, “Receber depois” é visível; no PDV principal, “a prazo” está enterrado.
6. **Bugs de estado** — `partialSale` não entra no dirty do modal; suspender carrinho não limpa partial.

**Custo de não resolver:** vendas a prazo/parciais não usadas ou feitas errado, abandono do fluxo no celular, retrabalho no caixa e suporte (“não consigo concluir a venda”).

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Modos de pagamento descobríveis | Operador encontra integral / parcial / a prazo **sem** abrir “Mais opções” em teste moderado (5 usuários, tarefa cronometrada &lt; 10s) |
| G2 | Conclusão mobile sem “caça ao botão” | Em viewport 375px, “Concluir venda” ou barra sticky visível **sem** scroll após adicionar 1 item e ir ao checkout |
| G3 | Motivo claro quando submit bloqueado | 100% dos estados `submitDisabled` exibem hint no footer **ou** no botão (texto específico: pagamento, preço, vencimento) |
| G4 | Paridade de modelo mental partial/prazo | Mesmos rótulos e posição relativa em `SalesNewSaleTab` e `StudentProductSaleStep` (onde aplicável) |
| G5 | Zero regressão comercial | PIX, split, troco, colaborador, suspender/retomar, estoque, idempotência e API inalterados |

---

## 3. Non-Goals

- Leitor de código de barras / integração hardware (P2 futuro; não bloquear desenho).
- Novos endpoints em `/api/` (limite Hobby 12/12).
- Alterar regras de `validatePagamentosAgainstTotal`, espelho financeiro ou status `parcial`/`pendente`.
- Hotkeys F2–F4 no modal sidebar (permanecem só página/PDV).
- Comprovante PDF dentro do modal global.
- Virtualização do catálogo ou redesign visual completo do PDV.
- Unificar `SalesNewSaleTab` com `LeadCloseSaleModal`.

---

## 4. Personas e fluxos

| Fluxo | Entrada | Componente |
|-------|---------|------------|
| **A — Loja / PDV** | `/loja?tab=vendas&subtab=new` | `SalesNewSaleTab` |
| **A′ — Modal** | Sidebar “Nova venda” | `NovaVendaModal` → `SalesNewSaleTab` (`modalMode`) |
| **B — Aluno** | Perfil → pagamento → Produto | `StudentProductSaleStep` |

Escopo principal: **Fluxo A e A′**. Fluxo B recebe apenas alinhamento de rótulos/modo a prazo (P1).

---

## 5. User Stories

### Recepcionista — balcão (Fluxo A)

- Quero escolher **como** vou receber (integral, parte agora, depois) **junto** ao pagamento, sem caçar em “Mais opções”.
- Quero ver **por que** não posso concluir (falta R$ X, preço do item Y, data de vencimento).
- No celular, quero ver o **total e concluir** sem rolar o checkout inteiro.
- No PDV, quero registrar cartão com máquina sem abrir “Pagamento manual” por padrão, se já escolhi cartão no quick pay.
- Quero que fechar o modal com entrada parcial marcada peça confirmação, como com carrinho cheio.

### Recepcionista — modal rápido (Fluxo A′)

- Quero os mesmos modos de pagamento visíveis que na página (não versão “capada”).
- Quero hint no footer quando pagamento parcial estiver inválido.

### Instrutor — venda no aluno (Fluxo B)

- Quero o mesmo vocabulário (“Vender a prazo” / “Receber depois”) e posição lógica que no PDV.

### Edge cases

- Alternar integral ↔ parcial ↔ a prazo limpa estado conflitante (pagamentos, due date) sem venda fantasma.
- `partialSale` + `deferredSale` mutuamente exclusivos (já no backend).
- Suspender carrinho reseta partial/deferred/pagamentos do snapshot.
- Colaborador ligado → confirmação antes de reescrever preços (P1).
- Carrinho vazio → modos de pagamento desabilitados.

---

## 6. Requirements

### Fase 1 — P0 (descoberta e correções)

#### R1.1 — Seletor de modo de recebimento (substitui toggles em “Mais opções”)

**Comportamento:** No bloco de pagamento (`sales-checkout`), **acima** do quick pay e do `SalesPaymentBlock`, exibir controle segmentado (radio group ou chips) com três opções:

| Valor interno | Rótulo UI |
|---------------|-----------|
| `integral` | Pagamento integral |
| `partial` | Receber parte agora |
| `deferred` | Vender a prazo |

- Mapeia para `partialSale` / `deferredSale` existentes (`integral` = ambos false).
- “Mais opções” **não** contém mais partial/deferred; permanece só o que for raro (ver R1.2).
- Quando `deferred`: ocultar quick pay e payment block; mostrar **Vencimento** (obrigatório no submit).
- Quando `partial`: ocultar quick pay; abrir payment block com `allowPartial`; campo opcional “Data para o restante”.
- Quando `integral`: comportamento atual (quick pay + manual).

**Critérios de aceite:**

- [ ] Given checkout com itens, when abrir venda, then os três modos estão visíveis sem expandir `<details>`.
- [ ] Given modo a prazo, when submit sem data, then erro de vencimento visível no checkout (banner + hint footer).
- [ ] Given modo parcial, when valor recebido ≥ total, then submit bloqueado com mensagem específica.
- [ ] Given troca de modo, when mudar integral → a prazo, then pagamentos limpos e due date focado.

#### R1.2 — “Mais opções” reduzido

**Comportamento:** `<details class="sales-more-options">` contém apenas **Venda com colaborador** (movido para dentro) ou fica removido se colaborador for promovido para toggle visível abaixo do modo de recebimento — **decisão TECH:** colaborador fica **fora** de details, abaixo do modo de pagamento; details pode ser **removido** se vazio.

**Critérios:**

- [ ] Partial/deferred não aparecem em “Mais opções”.
- [ ] Nenhum `<details>` vazio na UI.

#### R1.3 — PDV: pagamento manual após quick pay

**Comportamento:** Em `pdvMode`:

- `manualPaymentOpen` default **false** (mantém tela limpa).
- Ao clicar quick pay **cartão** (crédito/débito), abrir automaticamente `SalesPaymentBlock` (`manualPaymentOpen = true`) para “Recebido via” / parcelas.
- Ao clicar PIX/dinheiro, manter comportamento atual (foco em valor recebido se dinheiro).

**Critérios:**

- [ ] Given PDV, when quick pay cartão crédito, then bloco manual visível com capture method.
- [ ] Given PDV, when quick pay PIX, then não exige abrir “Pagamento manual” para concluir.

#### R1.4 — Hints de submit enriquecidos

**Comportamento:** Estender `getSaleFooterHint` e mensagens de `handleLiquidate`/submit para cobrir:

- `partialSale` + pagamento inválido → “Informe um valor recebido agora menor que o total.”
- Linha sem preço → “Informe o preço de «{label}».”
- `deferred` sem due date → “Informe a data de vencimento.”
- Pagamento integral com diferença → “Faltam R$ X,XX no pagamento.” (quando calculável)

**Critérios:**

- [ ] Footer do modal e área acima do botão na página mostram o **mesmo** hint.
- [ ] `partialSale` tem ramo dedicado (não mensagem genérica de total integral).

#### R1.5 — Dirty state e suspender

**Comportamento:**

- `isSaleCheckoutDirty` inclui `partialSale === true` e pagamentos com valor &gt; 0.
- `handleSuspendCart` reseta `partialSale`, `deferredSale`, `dueDate`, `payments` no snapshot (já reseta deferred; acrescentar partial).
- `getSaleFooterHint` recebe `partialSale`.

**Critérios:**

- [ ] Given partial marcado sem itens no carrinho impossível; given partial + itens, when fechar modal, then ConfirmDialog.
- [ ] Given suspender carrinho, when retomar outro, then partial não vaza do estado global.

---

### Fase 2 — P1 (mobile e validação)

#### R2.1 — Barra sticky de conclusão (mobile)

**Comportamento:** Em viewport ≤900px, fixar no rodapé do painel checkout (ou da aba Carrinho) uma barra com:

- Total da venda (`totalFinalMasked`)
- Botão primário “Concluir venda” (submit)
- Opcional: badge com contagem de itens

A barra não cobre campos de pagamento enquanto o usuário edita; aparece quando scroll passou do total do carrinho **ou** sempre visível na aba Carrinho (decisão TECH: **sempre visível** na aba Carrinho/mobile checkout).

**Critérios:**

- [ ] Given mobile + 1 item no carrinho, when aba Carrinho, then botão Concluir visível sem scroll até o fim do form.
- [ ] Given submit desabilitado, then hint também visível na barra ou imediatamente acima dela.

#### R2.2 — Validação de preço proativa no carrinho

**Comportamento:** Com `inlineValidate`, marcar linha com preço ≤ 0 **ao digitar** (debounce 300ms), não só no blur. Destacar `.sales-cart-row--invalid`.

**Critérios:**

- [ ] Given preço apagado, when parar de digitar, then FieldError na linha sem precisar blur.

#### R2.3 — Busca de catálogo

**Comportamento:**

- Placeholder: `Buscar por nome, categoria ou SKU…`
- Autofocus no campo de busca ao montar `SalesNewSaleTab` em `pdvMode` (não em modal para não roubar foco do primeiro tab).
- Hint `text-xs` abaixo da busca se query &lt; 2 chars e lista grande: opcional skip P1.

**Critérios:**

- [ ] Given PDV página, when carregar, then foco no input de busca.
- [ ] Placeholder atualizado.

#### R2.4 — Colaborador: confirmação de preço

**Comportamento:** Ao marcar “Venda com colaborador” com carrinho não vazio, `ConfirmDialog`: “Recalcular preços dos itens para tabela colaborador?”

**Critérios:**

- [ ] Cancelar mantém toggle desmarcado e preços anteriores.

#### R2.5 — Alinhamento Fluxo B

**Comportamento:** Renomear checkbox “Receber depois” → **“Vender a prazo”** (subtitle: “Sem pagamento agora”). Mesma ordem visual: modo de recebimento antes do payment block.

Escopo mínimo: rótulo + aria-label; reestruturação completa do step fica opcional se custo alto.

---

### Fase 3 — P2 (futuro)

| ID | Item |
|----|------|
| R3.1 | Variantes inline no card (≤6 chips; modal se &gt;6) |
| R3.2 | Campo código de barras na busca |
| R3.3 | Terceira aba mobile “Pagar” separada de Carrinho |
| R3.4 | Entrada parcial no `StudentProductSaleStep` |
| R3.5 | Remover CSS morto `.sales-cart-table` |
| R3.6 | F5 crédito + hints PDV para modos de recebimento |
| R3.7 | Banner no modal: “Atalhos e comprovante em Loja → Vendas (PDV)” |

---

## 7. Mapa de telas (pós-implementação)

| # | Área | Mudança visível |
|---|------|-----------------|
| 1 | Checkout | Radio/chips: integral / parte agora / a prazo |
| 2 | Checkout | Partial & prazo fora de “Mais opções” |
| 3 | PDV | Cartão quick pay abre captura automaticamente |
| 4 | Footer modal | Hints específicos (partial, preço, vencimento) |
| 5 | Mobile | Barra sticky total + Concluir |
| 6 | Carrinho | Linha inválida em tempo real |
| 7 | Catálogo | Placeholder + autofocus PDV |

---

## 8. Success Metrics

**Leading (1–2 semanas pós-deploy):**

- Redução de submits falhos por `paymentValid` / `partial` em logs client-side (se instrumentado) ou relatos de suporte.
- Tempo médio para concluir venda teste (1 item, PIX) em mobile ≤ baseline atual.

**Lagging:**

- Adoção de vendas `parcial` / `pendente` vs só `concluida` (indica descoberta dos modos).
- Tickets “não consigo fechar venda” relacionados a pagamento.

---

## 9. Open Questions

| # | Pergunta | Dono | Bloqueante? |
|---|----------|------|-------------|
| Q1 | Colaborador fica fora de “Mais opções” ou dentro de details renomeado “Opções avançadas”? | Produto | Não — default: fora, visível |
| Q2 | Barra sticky só mobile ou também PDV desktop estreito? | Eng | Não — default: ≤900px |
| Q3 | Student flow: só rótulo ou reestruturação igual ao PDV? | Produto | Não — P1 mínimo = rótulo |

---

## 10. Test plan (aceitação QA)

1. Venda integral PIX — página, modal, PDV.
2. Venda parcial 40% + quitar saldo em Todas as vendas.
3. Venda a prazo com vencimento → liquidar depois.
4. Mobile 375px: adicionar item → concluir sem scroll excessivo.
5. PDV: crédito quick pay → selecionar máquina → concluir.
6. Fechar modal com partial ativo → ConfirmDialog.
7. Suspender e retomar → sem partial órfão.
8. Colaborador: confirmar e cancelar dialog.
9. Regressão: split pagamento, troco dinheiro, estoque esgotado.

**Harness:** `npm test -- lojaSalesTabs saleModalDirty salesPaymentBlock`

---

## 11. Histórico de revisão

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-26 | — | Criação a partir de auditoria UX PDV/checkout |
