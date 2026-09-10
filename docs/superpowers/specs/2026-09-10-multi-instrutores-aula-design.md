# Vários instrutores na confirmação de aula — Design

**Data:** 2026-09-10  
**Status:** aprovado  
**Relacionado:** [2026-09-08-confirmacao-staff-aula-design.md](./2026-09-08-confirmacao-staff-aula-design.md)

## Decisões

1. **1 professor** por aula; **N instrutores**.
2. Relatório: cada instrutor selecionado soma **+1** em aulas como instrutor.
3. UI: multi-seleção (checklist) na confirmação da Recepção.
4. Persistência sem novo attr Appwrite: `instructor_user_id` com ids unidos por `|`; `instructor_name` com nomes unidos por ` · `. Leitura faz parse; slots antigos (1 id) continuam válidos.
5. Regra de confirmação: professor **ou** ≥1 instrutor.

## Non-goals

- Vários professores.
- Nova coleção / attr `instructors_json` (pode vir depois).
