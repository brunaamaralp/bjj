# Modal de Venda de Produto — Refatoração UX

**Data:** 2026-06-15  
**Status:** Aprovado para implementação  
**Abordagem:** 3 fases (P0 blockers → P1 experiência → P2 polish)  
**TECH:** [2026-06-15-modal-venda-produto-TECH.md](./2026-06-15-modal-venda-produto-TECH.md)

---

## 1. Problem Statement

Recepcionistas e instrutores registram vendas de produto por dois caminhos no app Nave:

| Fluxo | Entrada | Componentes |
|-------|---------|-------------|
| **A — Nova Venda global** | Atalho sidebar / menu mobile | `NovaVendaModal` → `SalesNewSaleTab` (`modalMode`) |
| **B — Venda no aluno** | Perfil do aluno → Registrar pagamento → Produto | `StudentPaymentModal` → `StudentProductSaleStep` |

A auditoria de UX (2026-06-15) identificou falhas que aumentam erro operacional, abandono de vendas e perda de dados:

1. **Erros invisíveis (Fluxo A)** — mensagens de validação (`localError`) renderizadas após o `</form>`, no fim do conteúdo rolável; o operador clica "Concluir venda" no checkout e não vê o motivo da falha sem rolar.
2. **Escape destrutivo (Fluxo A)** — `SalesVariantPicker` (nested modal) e modal pai registram ambos listener de `Escape`; cancelar seleção de tamanho fecha a venda inteira.
3. **Perda silenciosa de carrinho (Fluxo A)** — fechar via X ou Escape descarta itens sem confirmação.
4. **Fluxo no aluno inferior (Fluxo B)** — layout vertical sem abas mobile, sem footer fixo, estilos inline, botão submit não reflete validação de pagamento.

**Custo de não resolver:** vendas mal registradas, retrabalho no caixa, frustração em mobile e perda de confiança no atalho global.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Erro visível no checkout | 100% dos erros de submit aparecem acima do botão Concluir, sem scroll extra |
| G2 | Escape seguro com variant picker | 0 fechamentos acidentais do modal pai ao cancelar variante |
| G3 | Proteção contra perda de carrinho | 100% dos fechamentos com carrinho dirty passam por confirmação |
| G4 | Paridade mobile aluno ↔ global | Fluxo B legível em viewport 375px com ações acessíveis |
| G5 | Zero regressão comercial | Venda PIX, dinheiro, split, a prazo, colaborador, suspender/retomar intactos |

---

## 3. Non-Goals

- Alterar lógica de estoque, pagamentos, idempotência ou API de vendas.
- Novo arquivo em `/api/` (limite Hobby 12/12).
- Redesign do PDV full-page (`/vendas` sem `modalMode`).
- Hotkeys F2–F4 no modal global (permanecem só no PDV).
- Comprovante / receipt dentro do modal global (continua: toast + fechar).
- Exigir caixa aberto no modal global (`shiftBlocksSale` já bypass em `modalMode`).
- Unificação com `LeadCloseSaleModal` ou rewrite de `SalesNewSaleTab` fora do modal.
- Virtualização do catálogo de produtos.

---

## 4. User Stories

### Recepcionista — Fluxo A (Nova Venda global)

- Quero ver imediatamente por que a venda não concluiu (carrinho vazio, pagamento incompleto, vencimento ausente) para corrigir sem adivinhar.
- Quero cancelar a escolha de tamanho/variante sem perder o restante da venda.
- Quero ser avisado antes de descartar um carrinho com itens ao fechar o modal.
- Quero concluir a venda com Cancelar e Concluir sempre visíveis, inclusive em mobile.

### Instrutor / recepcionista — Fluxo B (venda no aluno)

- Quero vender produto para um aluno já identificado, com pagamento ou "Receber depois", em modal que caiba na tela do celular.
- Quero ver erros de validação no topo do formulário, não escondidos após scroll.
- Quero que o botão Confirmar só habilite quando pagamento estiver válido (ou "Receber depois" marcado).

### Edge cases

- Carrinho vazio → fechar modal **sem** confirmação.
- Venda em progresso (`creating === true`) → bloquear fechar (X, Escape, Cancelar).
- Variant picker aberto → Escape fecha só o picker.
- Suspender carrinho → conta como estado dirty (confirmação ao fechar).
- Estoque esgotado / catálogo stale → manter toasts e reload existentes (sem regressão).

---

## 5. Requirements por fase

### Fase 1 — P0 (blockers)

#### R1.1 — Banner de erro no checkout (Fluxo A)

**Comportamento:** Erros de validação local e de store exibidos dentro de `.sales-checkout`, imediatamente acima do botão "Concluir venda".

**Critérios de aceite:**

- [ ] Given carrinho com ≥1 item, when submit com pagamento inválido, then mensagem com `role="alert"` visível sem scroll adicional no painel checkout.
- [ ] Given carrinho vazio, when submit, then mensagem "Adicione pelo menos um item" visível no checkout.
- [ ] Given venda a prazo sem data, when submit, then mensagem de vencimento visível no checkout.
- [ ] Bloco de erro pós-`</form>` removido.

**Canal de feedback:** `StatusBanner` variant error ou equivalente; seguir [docs/ux-feedback.md](../../../docs/ux-feedback.md).

#### R1.2 — Escape isolado no variant picker (Fluxo A)

**Comportamento:** Com `SalesVariantPicker` aberto, Escape fecha apenas o picker; modal pai permanece aberto.

**Critérios de aceite:**

- [ ] Given variant picker aberto, when Escape, then picker fecha e carrinho/modal pai intactos.
- [ ] Given variant picker fechado, when Escape, then comportamento normal de fechar modal (sujeito a R1.3 se dirty).

#### R1.3 — ConfirmDialog ao fechar com carrinho dirty (Fluxo A)

**Comportamento:** Fechar (X, Escape, Cancelar) com estado dirty exibe `ConfirmDialog` antes de descartar.

**Estado dirty (default):** `cart.length > 0` OU aluno/cliente preenchido OU desconto aplicado OU venda a prazo marcada OU carrinho suspenso pendente de retomar.

**Critérios de aceite:**

- [ ] Given carrinho com itens, when clicar X, then dialog "Descartar venda?" com Descartar / Cancelar.
- [ ] Given carrinho vazio e campos default, when clicar X, then fecha sem dialog.
- [ ] Given `creating === true`, when tentar fechar, then ação bloqueada.
- [ ] Confirmar descarte → `onClose()` e estado resetado na próxima abertura.

**Referência de padrão:** `TransacoesTab.requestCloseTxModal` + `ConfirmDialog`.

#### R1.4 — Erro visível no fluxo aluno (Fluxo B)

**Comportamento:** `localError` exibido no topo de `StudentProductSaleStep`, antes do catálogo, usando componente do design system (não inline styles).

**Critérios de aceite:**

- [ ] Given validação falha, when submit, then banner/`FieldError` com `role="alert"` visível sem scroll.
- [ ] Remover `<p style={{...}}>` inline para erro.

---

### Fase 2 — P1 (experiência)

#### R2.1 — Footer fixo Cancelar + Concluir (Fluxo A)

**Comportamento:** `ModalShell.footer` com Cancelar (`btn-outline`) e Concluir venda (`btn-primary`); submit via `form="nova-venda-form"`.

**Critérios de aceite:**

- [ ] Footer visível enquanto corpo do modal rola.
- [ ] Cancelar dispara `requestClose` (com dirty check R1.3).
- [ ] Concluir dispara mesmo handler `submit` existente.
- [ ] Botão duplicado no corpo removido ou mantido só como fallback mobile sticky (preferir footer único).

#### R2.2 — Ocultar atalhos PDV no modal (Fluxo A)

**Critérios de aceite:**

- [ ] `SalesPosHints` não renderiza quando `modalMode === true`.

#### R2.3 — Reduzir toast por item adicionado (Fluxo A)

**Critérios de aceite:**

- [ ] Em `modalMode`, adicionar produto não dispara toast success; flash visual no card permanece.
- [ ] Toasts de erro/aviso (estoque, preço bloqueado) permanecem.

#### R2.4 — Scroll body no modal aluno (Fluxo B)

**Critérios de aceite:**

- [ ] `student-payment-modal` com `max-height` + scroll interno no body (padrão `nova-venda-modal`).

#### R2.5 — Footer no fluxo produto aluno (Fluxo B)

**Critérios de aceite:**

- [ ] Quando `isProduct`, footer com Cancelar + Confirmar venda.
- [ ] Confirmar delega para `submitSale` do step.
- [ ] Cancelar respeita dirty check (carrinho com itens).

#### R2.6 — Validação de pagamento no disabled (Fluxo B)

**Critérios de aceite:**

- [ ] Submit disabled quando `cart.length === 0` OU `creating` OU (`!receiveLater && !paymentValid.ok`).

---

### Fase 3 — P2 (polish)

#### R3.1 — Título "Vender produto" (Fluxo A)

- [ ] Título do modal: "Vender produto" (ação + objeto).

#### R3.2 — Combobox aluno a11y (Fluxo A)

- [ ] Label com `htmlFor` + `id` no input.
- [ ] `aria-controls` apontando para listbox; opções com `role="option"`.

#### R3.3 — Telefone avulso (Fluxo A)

- [ ] `inputMode="tel"` no campo telefone cliente avulso.

#### R3.4 — Chips de categoria (compartilhado)

- [ ] Botões de categoria com `aria-selected={true|false}`.

#### R3.5 — prefers-reduced-motion (global modais)

- [ ] Animação `navi-modal-in` desabilitada ou reduzida quando `prefers-reduced-motion: reduce`.

#### R3.6 — Cleanup CSS legado (Fluxo A)

- [ ] Remover duplicação `.nova-venda-modal-backdrop` que conflita com `.navi-modal-overlay`.

#### R3.7 — Empty state catálogo (compartilhado)

- [ ] Link "Cadastrar produtos" não navega com modal aberto por baixo; fechar modal ou toast orientando.

#### R3.8 — Abas mobile no fluxo aluno (Fluxo B)

- [ ] Reutilizar `.sales-mobile-tabs` / Catálogo + Carrinho como Fluxo A em viewport ≤900px.

---

## 6. Layout alvo

### Fluxo A — Nova Venda global

```
ModalShell "Vender produto"
├── Header (título + fechar)
├── Body (scroll)
│   ├── [mobile] Tabs: Catálogo | Carrinho
│   ├── Catálogo (SalesCatalogPicker)
│   └── Checkout
│       ├── Aluno / cliente avulso
│       ├── Carrinho + desconto + pagamento
│       └── [R1.1] Banner erro (role=alert)
└── Footer (fixo)
    ├── Cancelar
    └── Concluir venda — R$ total

SalesVariantPicker (nested, Escape isolado)
ConfirmDialog (dirty close)
```

### Fluxo B — Venda no aluno

```
ModalShell "Venda de produto"
├── Header
├── Body (scroll, max-height)
│   ├── [R1.4] Banner erro
│   ├── Contexto: aluno X
│   ├── [mobile R3.8] Tabs Catálogo | Carrinho
│   ├── Catálogo + carrinho + pagamento / receber depois
└── Footer [R2.5]
    ├── Cancelar
    └── Confirmar venda
```

---

## 7. Mapeamento auditoria → requirements

Rastreabilidade dos achados da auditoria UX (2026-06-15):

| Achado (severidade) | Requirement |
|---------------------|-------------|
| Erro submit fora da viewport (blocker) | R1.1 |
| Escape fecha modal pai com picker (blocker) | R1.2 |
| Fechar sem confirmação perde carrinho (blocker) | R1.3 |
| Erro inline styles no aluno (blocker) | R1.4 |
| Submit longe do topo mobile / sem footer fixo | R2.1 |
| Atalhos PDV visíveis mas desativados | R2.2 |
| Toast a cada produto adicionado | R2.3 |
| Modal aluno sem max-height scroll | R2.4 |
| Footer ausente no fluxo produto aluno | R2.5 |
| Submit ignora paymentValid no aluno | R2.6 |
| Título genérico "Nova venda" | R3.1 |
| Combobox aluno incompleto | R3.2 |
| Telefone sem inputMode | R3.3 |
| Chips categoria sem aria-selected | R3.4 |
| Animação sem reduced-motion | R3.5 |
| CSS legado duplicado backdrop | R3.6 |
| Empty state navega com modal aberto | R3.7 |
| Aluno sem abas mobile | R3.8 |
| Botão disabled sem explicação prévia | Parcial R1.1 + inlineValidate existente |
| Nested modal z-index | TECH (stacking DOM order) |
| Sem foco automático ao abrir | Fora de escopo v1 (P2+ backlog) |

---

## 8. Success Metrics

| Métrica | Alvo | Método |
|---------|------|--------|
| Erro visível pós-submit inválido | 100% casos QA | Teste manual Fluxo A |
| Escape com variant picker | 0 fechamentos do pai | Teste manual |
| Fechar com carrinho dirty | 100% passam ConfirmDialog | Teste manual |
| Venda completa Fluxo A | PIX + dinheiro + a prazo OK | Teste manual / staging |
| Venda completa Fluxo B | PIX + receber depois OK | Teste manual / staging |
| Regressão PDV full-page | Hotkeys e receipt intactos | Smoke `/vendas` |

---

## 9. Open Questions (defaults aplicados)

| # | Pergunta | Default |
|---|----------|---------|
| Q1 | Suspender carrinho conta como dirty? | **Sim** |
| Q2 | Toast ao adicionar item no Fluxo B | **Não** (paridade com modal global pós-R2.3) |
| Q3 | Overlay click fecha modal global? | **Não** (manter `closeOnOverlay={false}`) |
| Q4 | Alterar `ModalShell` globalmente para nested Escape? | **Não** — lift state no Fluxo A (ver TECH) |

---

## 10. QA Checklist

### Fase 1 (P0)

- [ ] Fluxo A: submit carrinho vazio → erro visível no checkout
- [ ] Fluxo A: submit pagamento incompleto → erro visível no checkout
- [ ] Fluxo A: submit a prazo sem vencimento → erro visível
- [ ] Fluxo A: abrir variant picker → Escape → pai permanece aberto
- [ ] Fluxo A: carrinho com item → X → ConfirmDialog → cancelar mantém modal
- [ ] Fluxo A: carrinho com item → X → ConfirmDialog → descartar fecha modal
- [ ] Fluxo A: carrinho vazio → X fecha direto
- [ ] Fluxo A: creating → fechar bloqueado
- [ ] Fluxo B: erro validação visível no topo

### Fase 2 (P1)

- [ ] Fluxo A: footer Cancelar + Concluir funcionais
- [ ] Fluxo A: sem SalesPosHints no modal
- [ ] Fluxo A: adicionar produto sem toast success
- [ ] Fluxo B: modal scroll em viewport baixa
- [ ] Fluxo B: footer Confirmar/Cancelar
- [ ] Fluxo B: submit disabled com pagamento inválido
- [ ] Regressão: venda PIX concluída + toast sucesso + modal fecha (A)
- [ ] Regressão: suspender / retomar carrinho (A)

### Fase 3 (P2)

- [ ] Título "Vender produto"
- [ ] Combobox aluno: inspeção axe / VoiceOver básica
- [ ] Mobile 375px Fluxo B: abas Catálogo/Carrinho
- [ ] prefers-reduced-motion: sem animação de entrada
- [ ] Empty state: não deixa modal orphan ao navegar
