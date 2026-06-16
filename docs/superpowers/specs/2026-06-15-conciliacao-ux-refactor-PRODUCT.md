# Conciliação — Refatoração UX/UI

**Data:** 2026-06-15  
**Status:** Implementado (Fases A–E, 2026-06-15)  
**Pré-requisito:** [2026-06-15-conciliacao-multi-formato-PRODUCT.md](./2026-06-15-conciliacao-multi-formato-PRODUCT.md) (funcionalidade base já implementada)  
**TECH:** [2026-06-15-conciliacao-ux-refactor-TECH.md](./2026-06-15-conciliacao-ux-refactor-TECH.md)

---

## 1. Problem Statement

A Conciliação já importa OFX, CSV, Excel e PDF e permite vincular extrato ↔ lançamentos. Porém a **experiência ainda não comunica bem o pareamento** e o **feedback pós-ação é fraco**.

Problemas observados na implementação atual:

1. **Pareamento “lado a lado” quebrado visualmente** — linhas sem match trocam a coluna central por um seletor; a coluna direita só reage após clicar na linha (gesto pouco óbvio).
2. **Hierarquia de ações confusa** — “Vincular” e “Criar lançamento” competem como `btn-primary` na mesma linha.
3. **Sucesso silencioso** — confirmar vínculo atualiza a lista sem toast; o usuário não tem certeza imediata.
4. **PDF exige passo manual extra** — após upload, nada aparece até clicar “Interpretar com IA”.
5. **Resumo do extrato denso** — até 8 métricas no card inicial; alta carga cognitiva.
6. **Modal de import desalinhado** — sem drop zone nem stepper, diferente de `ImportFinanceModal` / `ImportFinanceTxModal`.
7. **Erros de parse** — texto vermelho solto em vez de `StatusBanner`/`ErrorBanner` ([docs/ux-feedback.md](../../ux-feedback.md)).
8. **IA: `low_confidence` não aplicado** — CSS existe, dados não chegam à UI.

**Custo de não resolver:** usuários continuam conciliando “no feeling”, ignoram a coluna direita, e reportam que “não sabe se salvou”.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Pareamento compreensível em ≤3 cliques sem ler texto de ajuda | Teste moderado: 4/5 usuários vinculam linha sem assistência |
| G2 | Feedback imediato em toda ação de conciliação | Toast em vincular, confirmar lote, criar, ignorar, finalizar |
| G3 | Paridade visual com modais de import do financeiro | Drop zone + stepper no modal de extrato |
| G4 | Resumo escaneável | KPIs principais em 3 blocos; detalhe opcional |
| G5 | Zero regressão funcional | APIs e fluxos de import/match inalterados |

---

## 3. Non-Goals

- Drag-and-drop entre colunas.
- Redesign completo do hub Financeiro.
- Auto-match sem confirmação humana.
- Virtualização / paginação server-side de itens do extrato.
- Novos endpoints de API.
- Alterar regras de matching ou validação server-side.

---

## 4. Personas e user stories

### Gestor financeiro (owner/admin)

- Ao vincular uma linha, ver confirmação clara (“Linha conciliada com Mensalidade João”).
- Entender qual linha do extrato está “ativa” sem ler texto pequeno.
- Ver só lançamentos relevantes à direita quando seleciono uma linha.
- Importar PDF e ver progresso automático da IA (ou CTA impossível de ignorar).
- Revisar extrato IA com linhas suspeitas destacadas.
- Ignorar ou criar lançamento com confirmação para evitar clique acidental.

### Edge cases

- Nenhuma linha selecionada → botões “Vincular” à direita desabilitados com tooltip claro.
- Lista de órfãos vazia após filtro → mensagem + link “Mostrar todos”.
- Modal com 300+ linhas → busca local por descrição/valor.
- Mobile → pareamento em uma coluna com “próximo pendente” navegável.

---

## 5. Princípios de design

1. **Uma linha, uma superfície de decisão** — extrato + candidatos + ações visíveis no mesmo contexto visual.
2. **Primário único por linha** — a ação principal é sempre “Vincular” (ou “Confirmar” em sugestões).
3. **Feedback transitório + persistente** — toast na ação; banner só para erros de página/load.
4. **Progressive disclosure** — KPIs simples primeiro; prova de saldo em accordion.
5. **Reutilizar padrões existentes** — `finance-import-drop`, stepper de `ImportFinanceTxModal`, `useToast`, `ConfirmDialog`, tokens `--finance-recon-*`.

---

## 6. Requirements por fase

### Fase A — Feedback e hierarquia (P0)

| ID | Requisito | Aceite |
|----|-----------|--------|
| A1 | Toast ao `confirmBankMatch` bem-sucedido | Mensagem com descrição curta do lançamento |
| A2 | Toast ao `confirmAllBankMatches` | “N sugestões confirmadas” |
| A3 | Toast ao `createTxFromBankItem` e `completeBankReconciliation` | Mensagem específica por ação |
| A4 | Hierarquia em `BankReconPairRow` unmatched | Primário: Vincular (se tx selecionado); outline: Criar; ghost/outline: Ignorar |
| A5 | Erros de parse/import no modal | `StatusBanner variant="error"` em vez de `<p>` vermelho |
| A6 | `ConfirmDialog` ao ignorar linha do extrato | Título + descrição; cancelar preserva estado |
| A7 | `ConfirmDialog` ao criar lançamento a partir da linha | Opcional texto “Será criado e conciliado automaticamente” |

### Fase B — Pareamento visível (P0)

| ID | Requisito | Aceite |
|----|-----------|--------|
| B1 | Barra contextual `BankReconSelectionBar` | Fixa entre colunas ou no topo do workspace quando `selectedBankItemId` definido; mostra data, valor, descrição |
| B2 | Instrução dinâmica | Sem seleção: “Clique em uma linha pendente”; com seleção: “Escolha um lançamento à direita ou use o campo acima” |
| B3 | Highlight bidirecional leve | Órfão com valor/data compatível ganha classe `--candidate` mesmo antes de selecionar linha (opcional, só quando linha selecionada) |
| B4 | Modo foco (toggle) | “Focar pendências” oculta seção “Já conciliados” e expande altura da coluna de órfãos |
| B5 | Badge “Selecionada” na linha ativa | Além do outline; texto visível para baixa visão |
| B6 | Unificar copy | Remover ambiguidade “vincule à direita” vs seletor na mesma linha — barra contextual explica os dois caminhos |

**Layout alvo (workspace):**

```
[Voltar]  [Confirmar sugestões (3)]

┌─ KPI compacto (3 cards) ─────────────────────────────────┐
│ Pendentes │ Diferença │ Órfãos Nave                       │
└──────────────────────────────────────────────────────────┘

┌─ Seleção ativa (só se linha escolhida) ──────────────────┐
│ ● 15/01 PIX João R$ 150,00 — escolha um lançamento →     │
└──────────────────────────────────────────────────────────┘

┌─ Extrato ────────────────┬─ Lançamentos Nave ────────────┐
│ [sugestões / pendentes]  │ [filtrados | Mostrar todos]   │
│                          │ [Vincular] por linha          │
└──────────────────────────┴───────────────────────────────┘

[▸ Ver prova de saldo completa]
[Finalizar conciliação]
```

### Fase C — Modal de import (P1)

| ID | Requisito | Aceite |
|----|-----------|--------|
| C1 | Stepper 3 passos | Upload → Revisar → Confirmar (labels visíveis) |
| C2 | Drop zone | Reutilizar classes `finance-import-drop` (drag + click) |
| C3 | PDF auto-IA | Ao selecionar PDF válido, iniciar `runAiParse` automaticamente com loading central |
| C4 | Fallback manual IA | Se auto falhar, manter botão “Tentar novamente” |
| C5 | Linhas `low_confidence` | Handler IA marca flag; preview aplica `import-statement-row--low` + legenda “Revisar” |
| C6 | Busca no preview | Campo filtra por descrição/valor; contador “X de Y linhas” |
| C7 | Remover `style` inline do footer | Só classes CSS |

### Fase D — Resumo e lista (P1)

| ID | Requisito | Aceite |
|----|-----------|--------|
| D1 | KPI row compacta | 3 métricas: pendentes (qtd + R$), diferença, órfãos Nave |
| D2 | Accordion prova de saldo | Métricas detalhadas atuais dentro de `<details>` ou componente collapse |
| D3 | Lista de extratos | Ícone por formato (opcional) além da coluna texto |
| D4 | Empty state no workspace | Se todas linhas conciliadas, celebrar + CTA “Finalizar” |

### Fase E — A11y e mobile (P2)

| ID | Requisito | Aceite |
|----|-----------|--------|
| E1 | `aria-live="polite"` na barra de seleção e durante IA | Anuncia mudança de seleção e fim de parse |
| E2 | `aria-label` em botões ícone (remover linha) | Leitores de tela |
| E3 | Mobile: coluna única com tabs | “Extrato” / “Lançamentos” em `< 900px` opcional se B ainda confuso |
| E4 | Área de toque mínima 44px nos botões Vincular | Padding em `btn-sm` no contexto recon |

---

## 7. Success metrics

| Métrica | Alvo |
|---------|------|
| Tempo até primeiro vínculo manual (observação) | −30% vs. baseline atual |
| Taxa de uso da coluna direita | ≥50% dos vínculos manuais |
| Tickets “não sei se salvou” / “não entendi como vincular” | Tendência zero |
| Task success em teste interno (5 usuários) | ≥80% sem ajuda |

---

## 8. Open questions (defaults)

| # | Pergunta | Default |
|---|----------|---------|
| Q1 | Auto-IA em PDF sem perguntar | Sim, com cancelamento durante loading |
| Q2 | ConfirmDialog em Ignorar | Sim (Fase A) |
| Q3 | Modo foco default | Off; usuário ativa |
| Q4 | Tabs mobile vs colunas empilhadas | Colunas empilhadas primeiro; tabs só se E3 necessário |

---

## 9. QA checklist

**Feedback**
- [x] Toast ao vincular, confirmar lote, criar, finalizar
- [x] ConfirmDialog ignora / cria
- [x] Erros de parse em StatusBanner

**Pareamento**
- [x] Barra contextual ao selecionar linha
- [x] Vincular à direita só com linha ativa
- [x] Filtro + “Mostrar todos”
- [x] Hierarquia visual dos botões

**Import**
- [x] Stepper + drop zone
- [x] PDF auto-IA com loading
- [x] Linhas low_confidence destacadas
- [x] Busca no preview

**Regressão**
- [x] OFX/CSV/Excel import intacto
- [x] Matcher e validação server inalterados
