# Follow-up pós-aula experimental — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar retornos pós-aula experimental com termômetro de visibilidade, playbook configurável e outcomes obrigatórios.

**Architecture:** Lógica pura em `src/lib/followup*.js`; Dashboard como superfície principal; eventos em `lead_events`; config em `academy.settings.followupPlaybook`.

**Tech Stack:** React (Vite), Appwrite, Vitest, CSS existente (`dashboard.css`).

**Spec:** `docs/superpowers/specs/2026-06-10-followup-experimental-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/followupPlaybookDefaults.js` | Defaults + parse/merge settings |
| `src/lib/followupTemperature.js` | Regras 🟢🟡🔴 |
| `src/lib/followupState.js` | `computeFollowupState`, sort, group, enrich list |
| `src/lib/followupOutcomes.js` | Outcomes + `applyFollowupOutcomeEffects` |
| `src/lib/followupEventsCache.js` | Cache done/contact/snooze |
| `src/lib/followupManagerHealth.js` | Métricas painel gestor |
| `src/components/followup/FollowupTemperatureBadge.jsx` | Badge reutilizável |
| `src/components/followup/FollowupOutcomeDialog.jsx` | Modal outcome |
| `src/components/academy/FollowupPlaybookSection.jsx` | Config Processos |
| `src/components/dashboard/FollowupHealthPanel.jsx` | Painel gestor |
| `src/pages/Dashboard.jsx` | Integração principal |
| `src/pages/Pipeline.jsx` | Badge nos cards |
| `src/lib/dashboardDayBriefing.js` | Prioridade cooling |
| `src/lib/proactiveHub.js` | Item esfriando |

---

## Phase 1 — Termômetro + contact events

- [ ] Tests: `followupState.test.js`, `followupTemperature.test.js`
- [ ] Libs: temperature, state, events cache
- [ ] Dashboard: load `followup_contact`, enrich rows, group by temperature, WA → event
- [ ] Briefing + proactiveHub cooling alerts
- [ ] CSS temperature groups

## Phase 2 — Playbook

- [ ] `followupPlaybookDefaults.js` + tests
- [ ] `FollowupPlaybookSection` + `AutomacoesProcessosTab`
- [ ] Dashboard: next action line, template from playbook, inbox link

## Phase 3 — Outcomes

- [ ] `followupOutcomes.js` + `FollowupOutcomeDialog`
- [ ] Dashboard: replace ✓ with dialog, snooze events

## Phase 4 (partial) — Gestor + Pipeline

- [ ] `FollowupHealthPanel` on Dashboard
- [ ] `FollowupTemperatureBadge` on Pipeline cards

## Deferred

- Inbox banner, NL queries, IA copilot (fase 4b)
- Automação condicional D0/D+1 (fase 5)
