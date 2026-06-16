# Conciliação bancária multi-formato + workspace de pareamento

**Data:** 2026-06-15  
**Status:** Aprovado para implementação  
**TECH:** [2026-06-15-conciliacao-multi-formato-TECH.md](./2026-06-15-conciliacao-multi-formato-TECH.md)

---

## 1. Problem Statement

Gestores financeiros precisam conciliar o extrato bancário com os lançamentos do Caixa. Hoje a aba **Conciliação** (`/financeiro?tab=conciliacao`) só importa **OFX/CSV** com parser fixo no browser. Bancos que entregam **Excel** ou **PDF** ficam de fora. Quando o layout do arquivo não bate com as heurísticas, a importação falha sem alternativa.

Na tela de detalhe, o layout tem duas colunas, mas o vínculo manual é limitado: linhas sem match só permitem **criar lançamento** ou **ignorar** — não dá para escolher um lançamento Nave existente. A coluna direita lista órfãos de forma passiva, sem interação cruzada.

**Custo de não resolver:** conciliação manual fora do sistema, erros de caixa, tempo perdido re-digitando extratos.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Importar extrato em OFX, CSV, Excel e PDF | 4 formatos aceitos no modal; preview antes de gravar |
| G2 | IA estrutura extratos não padronizados | Excel/PDF com layout desconhecido gera `items[]` válido em ≥80% dos casos de teste internos |
| G3 | Conciliação lado a lado intuitiva | Usuário vincula linha do extrato ↔ lançamento Nave em ≤3 cliques |
| G4 | Zero regressão no fluxo atual | OFX/CSV, matcher, confirm-match, complete, multi-tenant intactos |
| G5 | Respeitar limite Vercel Hobby | Nenhum arquivo novo em `/api/` |

---

## 3. Non-Goals

- Conciliação automática sem confirmação humana (IA só parseia).
- OCR enterprise para PDFs escaneados ruins.
- Múltiplas contas no mesmo extrato.
- Reconciliação de fatura de cartão de crédito.
- Edição de itens após import gravado.
- Nova Serverless Function.

---

## 4. User Stories

### Gestor financeiro (owner/admin)

- Enviar extrato em Excel exportado do banco e ver transações no preview antes de importar.
- Enviar extrato em PDF e a IA extrair as movimentações estruturadas.
- Corrigir data/valor/descrição de uma linha errada no preview sem reenviar o arquivo.
- Selecionar a conta bancária do extrato.
- Para cada linha do extrato sem match, escolher um lançamento Nave e confirmar o vínculo.
- Clicar num lançamento órfão à direita e vinculá-lo à linha do extrato selecionada.
- Filtrar lançamentos órfãos por valor/data próximos à linha selecionada.
- Confirmar sugestões em lote, ignorar, criar lançamento, finalizar conciliação.

### Edge cases

- Arquivo vazio → mensagem clara + hint.
- IA desabilitada → fallback CSV/OFX/Excel determinístico + mensagem.
- PDF acima dos limites → erro documentado.
- Valor/direção incompatível → erro amigável ao vincular.
- Extrato com >500 linhas → aviso no preview.
- Mobile: colunas empilham; pareamento via seletor.

---

## 5. Requirements por fase

### Fase 1 — Excel + preview editável (P0)

- **R1.1** Aceitar `.xlsx`, `.xls` no modal.
- **R1.2** Parser Excel no client (primeira aba → items normalizados).
- **R1.3** Erro com hint se colunas não detectadas; botão IA na Fase 3.
- **R1.4** Preview editável: data, descrição, valor, direção; remover linha; totais recalculados.
- **R1.5** Metadados `source_format` e `parse_method` no import.
- **R1.6** Persistir metadados em `bank_statements` com fallback graceful.

### Fase 2 — Workspace de pareamento (P0)

- **R2.1** Linha unmatched com `SearchableSelect` + botão Vincular.
- **R2.2** Seleção de linha do extrato com destaque visual.
- **R2.3** Coluna direita: botão "Vincular à linha selecionada".
- **R2.4** Filtro contextual ±5% valor, ±3 dias data; toggle "Mostrar todos".
- **R2.5** Componentes `BankReconPairRow` e `BankReconOrphanList`.
- **R2.6** Erros `direction_mismatch` / `amount_mismatch` amigáveis.
- **R2.7** A11y: `aria-selected`, labels nos seletores.

### Fase 3 — IA tabular (P1)

- **R3.1–R3.9** Handler + rota `import-bank-statement`; fluxo "Interpretar com IA" no modal.

### Fase 4 — PDF via IA (P1)

- **R4.1–R4.6** Upload PDF server-side; limites 5 MB / 500 linhas; preview editável.

### Fase 5 — Polish (P2)

- **R5.1** Coluna Formato na lista de extratos.
- **R5.2** Eventos com `source_format`.
- **R5.3** Testes unitários.
- **R5.4** (Futuro) Auto-match score ≥95.

---

## 6. Layout alvo (pareamento)

```
[Resumo extrato] [Confirmar sugestões N]

┌─ Extrato ─────────────────┬─ Lançamentos Nave ─────────┐
│ ● linha selecionada       │ (filtro valor/data)        │
│   [SearchableSelect ▼]    │   [Vincular] Mensalidade   │
│   [Vincular] [Criar] [⊘]  │   [Vincular] Aluguel       │
└───────────────────────────┴─────────────────────────────┘
[Finalizar conciliação]
```

---

## 7. Success Metrics

| Métrica | Alvo |
|---------|------|
| Tempo import → primeira conciliação | −40% vs. manual externo |
| Sucesso import Excel (layouts teste) | ≥90% |
| Sucesso PDF digital | ≥80% com revisão |
| Regressão matcher/confirm | 0 falhas nos testes existentes |

---

## 8. Open Questions (defaults aplicados)

| # | Default |
|---|---------|
| Q1 Limite linhas | 500; aviso no preview |
| Q2 PDF | Multimodal Anthropic; fallback texto se disponível |
| Q3 Editar pós-import | Não |
| Q4 Drag-and-drop | Não; botões + seletor |
| Q5 Auto-match 100 | Não; confirmação humana |

---

## 9. QA Checklist

**Import:** OFX, CSV `;`/`,`, Excel, preview editável, conta bancária  
**IA:** IA off → mensagem; Excel estranho → items; PDF digital → preview  
**Pareamento:** seletor unmatched; vincular da direita; filtro; erros de match  
**Multi-tenant:** extrato outra academia → 403; member → 403
