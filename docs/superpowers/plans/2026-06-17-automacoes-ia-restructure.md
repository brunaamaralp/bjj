# P4.1 — Reestruturação IA Automações (Opção A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Checkboxes (`- [ ]`) track progress.

**Goal:** Separar Processos da equipe (`/tarefas?tab=processos`) de Mensagens do funil (`/automacoes` com Modelos + Gatilhos).

**Canonical plan (tasks, código, testes):** [../specs/2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md](../specs/2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md)

**PRODUCT:** [../specs/2026-06-17-automacoes-ia-restructure-PRODUCT.md](../specs/2026-06-17-automacoes-ia-restructure-PRODUCT.md)  
**TECH:** [../specs/2026-06-17-automacoes-ia-restructure-TECH.md](../specs/2026-06-17-automacoes-ia-restructure-TECH.md)

---

## Resumo das 10 tasks

| # | Task | Entregável |
|---|------|------------|
| 1 | Libs + testes | `tasksHubTabs.js`, `automacoesHub.js` + `normalizeAutomacoesTab` |
| 2 | Wizard | `tab: gatilhos`, remover compact/processos |
| 3 | Migrar Processos | `TaskProcessosTab.jsx`, `Tasks.jsx` com `?tab=processos` |
| 4 | Hub automacoes | 2 abas, redirects, sem scope banner |
| 5 | Readiness | Sem passo financeiro |
| 6 | Navegação | Menu Atendimento (Opção A) |
| 7 | Legacy redirects | `empresaLegacyRedirects.js` |
| 8 | Deep links | grep + patch em ~15 arquivos |
| 9 | Docs | `docs/flows/` |
| 10 | QA | `npm test` + build + checklist PRODUCT |

**Verificação:** `npm test -- tasksHubTabs automacoesHub automacoesSetupWizard automationUx naviMenu empresaLegacyRedirects`

**Merge:** um PR atômico (Tasks 1–10).
