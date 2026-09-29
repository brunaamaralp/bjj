# Mensalidades virtualização — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar sobreposição de linhas na grade virtualizada de Mensalidades (desktop + mobile) medindo altura real.

**Architecture:** `@tanstack/react-virtual` com `measureElement` nos itens; estimativas só como chute; CSS min-height e padding leve.

**Tech Stack:** React, `@tanstack/react-virtual`, Vitest, CSS em `finance.css`

**Spec:** [2026-09-29-mensalidades-virtualizacao-overlap-design.md](../specs/2026-09-29-mensalidades-virtualizacao-overlap-design.md)

---

### Task 1: Medição no virtualizer (MensalidadesListTable)

**Files:**
- Modify: `src/components/finance/MensalidadesListTable.jsx`

- [ ] Desktop: `estimateSize` grupo 44 / aluno 68; `measureElement: desktopVirtualizer.measureElement`
- [ ] Em cada `.mensal-desktop-virtual-row`: `ref={desktopVirtualizer.measureElement}` + `data-index={vi.index}`
- [ ] Mobile: `estimateSize` 180; `measureElement`; ref + `data-index` em `.mensal-virtual-item`
- [ ] Remover `height: vi.size` fixo no desktop se conflitar com medição (deixar medição definir)

### Task 2: CSS densidade / virtual rows

**Files:**
- Modify: `src/components/finance/finance.css`

- [ ] `.mensal-desktop-virtual-row` min-height ~68px; sem overflow hidden no conteúdo
- [ ] `.mensal-virtual-item` min-height coerente
- [ ] Padding vertical um pouco maior em `.mensalidades-page .mensal-table td` (desktop)
- [ ] Célula ação: vertical-align middle

### Task 3: Teste / verificação

**Files:**
- Modify or create: `src/test/mensalidadesListTable.test.jsx` (se já mockar virtualizer)

- [ ] Se houver teste do componente, assert que virtualizer recebe measureElement (ou smoke render >40 rows)
- [ ] `npm test -- --run src/test/mensalidadesListTable.test.jsx` (ou harness existente)

### Task 4: Doc de fluxo (checklist)

**Files:**
- Modify: `docs/flows/financeiro/a-receber-mensalidades.md` (1 item de aceite visual se couber)

- [ ] Nota breve: lista virtual medida sem overlap
