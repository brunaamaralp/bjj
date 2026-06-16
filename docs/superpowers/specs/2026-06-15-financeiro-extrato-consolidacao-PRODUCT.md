# Consolidação Extrato Contábil — PRODUCT

**Data:** 2026-06-15  
**Status:** Aprovado para implementação  
**TECH:** [2026-06-15-financeiro-extrato-consolidacao-TECH.md](./2026-06-15-financeiro-extrato-consolidacao-TECH.md)

---

## 1. Problem Statement

A aba **Extrato contábil** no hub Financeiro duplica informação que pertence ao contexto de um lançamento e confunde com extrato bancário (Conciliação). Gestores precisam alternar entre Lançamentos e Extrato para ver o espelho contábil de uma transação liquidada.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Espelho contábil no drawer de detalhes | Tx liquidada exibe débito/crédito sem sair de Lançamentos |
| G2 | Razão manual em config | Owner cria partidas dobradas em Minha academia → Razão contábil |
| G3 | Hub mais enxuto | Aba Extrato removida do HubTabBar |
| G4 | Bookmarks preservados | `?tab=extrato` e `?tab=razao` redirecionam para config |
| G5 | Zero regressão | Auto-posting, DRE, plano de contas intactos |

---

## 3. Non-Goals

- Novo endpoint `/api/`
- Alterar `montarLancamento` ou schema `JOURNAL_COL`
- Drawer editável para partidas dobradas
- Espelho visível para recepcionista (member)

---

## 4. Estados do espelho (drawer)

| Estado | Condição | UI |
|--------|----------|-----|
| `pending` | status pending | "Será contabilizado ao liquidar" |
| `cancelled` | status cancelled | "Não contabilizado" |
| `posted` | settled + entrada no journal | Linhas D/C reais |
| `preview` | settled + sem entrada, montarLancamento ok | Linhas previstas (label "Previsto") |
| `post_missing` | settled + montarLancamento null | StatusBanner warning |

---

## 5. Redirects

| URL legada | Destino |
|------------|---------|
| `/financeiro?tab=extrato` | `/empresa?tab=financeiro&section=razao-contabil` |
| `/financeiro?tab=razao` | idem |

---

## 6. QA Checklist

1. Liquidar tx → drawer → espelho D/C
2. Tx pendente → mensagem de preview
3. Owner → Razão contábil → partida manual
4. Redirects legados funcionam
5. Member não vê espelho nem razão em config
