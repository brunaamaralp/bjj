# Confirmação staff de aula — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na Recepção, confirmar professor/instrutor (ou “não houve”) por aula do dia; em Relatórios, exportar CSV + PDF de aulas por colaborador.

**Architecture:** Persistência em `class_slots` (`lesson_status`, professor/instructor user ids + nomes, motivo, audit). API em `bookingsHandler` (`confirm-lesson`, `lesson-staff-report`). UI: seção “Aulas de hoje” + modal; aba Relatórios `aulas-staff`. Domínio puro em `lib/lessonStaffRegister.js` + agregação/export.

**Tech Stack:** React, Zustand, Appwrite, `api/leads.js?route=bookings`, `pdf-lib`/`pdfkit` (padrão do repo), Vitest.

**Spec:** [2026-09-08-confirmacao-staff-aula-design.md](../specs/2026-09-08-confirmacao-staff-aula-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/lessonStaffRegister.js` | Validação confirm + agregação + CSV rows |
| `lib/server/lessonStaffRegisterServer.js` | ensure slot + patch + report query |
| `lib/server/bookingsHandler.js` | actions HTTP |
| `scripts/provision-lesson-register-schema.mjs` | attrs novos |
| `src/lib/lessonStaffApi.js` | client fetch |
| `src/components/recepcao/RecepcaoTodayLessonsSection.jsx` | lista do dia |
| `src/components/recepcao/ConfirmLessonStaffModal.jsx` | modal |
| `src/pages/Dashboard.jsx` | montar seção |
| `src/components/reports/ReportsAulasStaffPanel.jsx` | relatório |
| `src/lib/reportsPageConfig.js` | aba |
| `docs/flows/...` | jornada + VALIDATION |

---

### Task 1: Domínio puro

**Files:**
- Create: `lib/lessonStaffRegister.js`
- Test: `tests/unit/finance/../` → prefer `src/test/lessonStaffRegister.test.js` or `tests/unit/lessonStaffRegister.test.js`

- [ ] Validar `confirmed` exige ≥1 staff; `cancelled` exige motivo
- [ ] Agregar totais por user_id / papel
- [ ] Montar linhas CSV

### Task 2: Schema provision

- [ ] Estender `provision-lesson-register-schema.mjs` com campos canônicos da spec

### Task 3: API

- [ ] `confirm-lesson` + `lesson-staff-report` em `bookingsHandler`
- [ ] Testes unitários do mapper/validação server-side se houver harness

### Task 4: UI Recepção

- [ ] Seção aulas de hoje + modal + integração Dashboard
- [ ] Teste de formulário / regras UI se houver padrão

### Task 5: Relatórios

- [ ] Aba + painel + CSV client + PDF
- [ ] Atualizar flows

---
