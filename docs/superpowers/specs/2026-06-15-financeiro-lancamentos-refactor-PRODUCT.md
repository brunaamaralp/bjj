# Lançamentos (Financeiro) — Refatoração UX

**Data:** 2026-06-15  
**Status:** Aprovado para implementação  
**Abordagem:** 3 fases (P0 dados aluno → P1 tabela + drawer → P2 polish)

---

## 1. Problem Statement

Gestores financeiros usam **Lançamentos** (`/financeiro?tab=movimentacoes`) para registrar, filtrar e auditar entradas/saídas. A experiência falha em três frentes:

1. **Coluna Aluno vazia** e **busca de aluno no modal inoperante** — nomes resolvidos via `useStudentStore.students`, mas a rota Financeiro não carrega alunos.
2. **Tabela desktop excessivamente larga** — até 13 colunas visíveis por padrão, forçando scroll horizontal.
3. **Sem visão de detalhes** — não há drawer; edição só para pendentes via modal.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Nomes de aluno corretos | 100% dos txs com `lead_id` válido exibem nome ao abrir Financeiro direto |
| G2 | Busca de aluno no modal | Resultados em ≤500ms com ≥2 caracteres |
| G3 | Listagem legível ≥1280px | Tabela compacta sem overflow horizontal |
| G4 | Inspeção sem editar | Clique abre drawer com campos + ações |
| G5 | Zero regressão | Liquidar, estornar, recorrência, CSV, import, `?tx=` |

---

## 3. Non-Goals

- Alterar regras contábeis (competência, razão, side effects).
- Novo endpoint `/api/` (limite Hobby 12/12).
- Virtualização ou redesign do hub inteiro.
- Drawer editável inline (edição continua no modal).
- Alunos inativos na busca do modal (default: só ativos).

---

## 4. User Stories

### Gestor (owner/admin)

- Ver nome do aluno na lista.
- Buscar aluno por nome/telefone ao criar lançamento (como vendas).
- Tabela enxuta + drawer de detalhes ao clicar.
- Ir ao perfil do aluno a partir do drawer.
- Liquidar / estornar / editar a partir do drawer.

### Recepcionista (member)

- Ver lançamentos e detalhes; buscar por nome na toolbar.

### Edge cases

- Sem `lead_id`: `—`, sem link.
- `lead_id` órfão: **"Aluno não encontrado"** + tooltip com ID.
- Mobile: card + drawer full-width.

---

## 5. Requirements por fase

### Fase 1 — P0

- **R1.1** Nome na coluna/card via `lead_name` enriquecido server-side.
- **R1.2** Busca aluno no modal via API (`searchStudentsForSale`).
- **R1.3** Toolbar busca também em `tx.lead_name`.

### Fase 2 — P1

- **R2.1** Tabela compacta: Data, Descrição, Aluno, Líquido, Status, Ação. Opcionais ocultos por default.
- **R2.2** `FinanceTxDetailDrawer` com todos os campos + ações.
- **R2.3** `?tx=` abre drawer automaticamente.
- **R2.4** Mobile: categoria como título; tap abre drawer.

### Fase 3 — P2

- **R3.1** Filtros `status`, `dir`, `q` na URL.
- **R3.2** A11y: labels, keyboard nas linhas, drawer ARIA.
- **R3.3** ESC no modal + ConfirmDialog se dirty.
- **R3.4** Hint e loading na busca de aluno.

---

## 6. Layout alvo

```
Toolbar → Tabela compacta → (click) Drawer detalhes
         → Novo lançamento → Modal (busca API aluno)
```

---

## 8. Success Metrics

- 0 tickets "coluna aluno vazia" / "busca aluno não funciona"
- QA: fluxo novo lançamento com aluno ≥95% sucesso

---

## 9. Open Questions (defaults aplicados)

| # | Default |
|---|---------|
| Q1 Inativos na busca | Não |
| Q2 Click coluna Ação | Não (stopPropagation) |
| Q3 CSS drawer | Reutilizar task-drawer |
| Q4 CSV lead_name | Sim |

---

## 10. QA Checklist

**Fase 1:** coluna Aluno; busca modal; busca toolbar  
**Fase 2:** drawer; ações; mobile; `?tx=`  
**Fase 3:** URL filtros; ESC; confirmação dirty
