# Design — Registro de aula na Recepção

**Data:** 2026-08-05  
**Status:** aprovado para implementação (escolhas: professor = cadastro `instructors`; data = coluna da semana corrente)

## Problema

A grade da Recepção mostra o template semanal (`schedules`), mas não permite registrar quem ministrou a aula numa data específica nem observações operacionais.

## Decisões

1. **Professores:** coleção `instructors` (nome, `is_active`, `academy_id`) — sem login; distintos de colaboradores da Equipe.
2. **Ocorrência:** reutilizar `class_slots` (1 doc por `schedule_id` + `slot_date`). Criar sob demanda se o cron ainda não gerou.
3. **Data no clique:** YMD da coluna clicada na **semana corrente** (segunda–domingo).
4. **API:** sem nova function — `api/leads.js?route=bookings&action=…`.
5. **CRUD de professores:** client store (padrão `classesStore`) + provisionamento de schema.

## Campos novos em `class_slots`

| Campo | Tipo | Uso |
|---|---|---|
| `instructor_id` | string | FK → `instructors` |
| `lesson_notes` | string (até 4k) | Observações |
| `lesson_recorded_by` | string | user id |
| `lesson_recorded_by_name` | string | nome |
| `lesson_recorded_at` | datetime | última edição do registro |

`instructor` (string legado) continua sincronizado com o nome do professor escolhido.

## Coleção `instructors`

| Campo | Tipo |
|---|---|
| `academy_id` | string |
| `name` | string |
| `is_active` | boolean |
| `sort_order` | integer |

Índice: `academy_id` (+ `is_active` se possível).

## Fluxo UI

1. Clique no card da grade → modal com dia (label + YMD), horário, turma/modalidade.
2. Carrega (ou cria) o `class_slot` daquele `schedule_id` + data.
3. Dropdown pesquisável de professores ativos; default = match por nome do schedule/turma se houver.
4. Textarea de observações; salvar = upsert no slot.
5. Reabrir = modo edição.

## Fora de escopo (v1)

- Histórico imutável de substituições (só último estado + audit fields)
- Cancelamento/falta de aula na UI
- Relatórios / exportação
- Cadastro completo de professores em Empresa (criação rápida no modal se lista vazia)

## Futuro

- Coleção `lesson_instructor_history` ou eventos de auditoria
- Status `cancelled` / `no_instructor` no slot
- Relatório de aulas por professor
