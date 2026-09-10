# Confirmação de staff na grade de horários — Design

**Data:** 2026-09-10  
**Status:** aprovado  
**Relacionado:** [2026-09-08-confirmacao-staff-aula-design.md](./2026-09-08-confirmacao-staff-aula-design.md)

## Decisões

1. Remover a seção **Aulas de hoje** da Recepção.
2. Clique em **qualquer** card da grade semanal abre o modal de confirmação da **data daquela coluna**.
3. Badge no card: pendente / confirmada / não houve (ícone + texto curto).
4. Reutilizar `ConfirmLessonStaffModal` e API `confirm-lesson` (cria slot se ainda não existir).
5. Carregar slots da semana visível para exibir badges; lookup `schedule_id` + `slot_date`.

## Non-goals

- Relatório, schema, edição do template da grade.
- Contador agregado de pendentes no header.

## Fluxos a atualizar

- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)
- [VALIDATION.md](../../flows/VALIDATION.md)
