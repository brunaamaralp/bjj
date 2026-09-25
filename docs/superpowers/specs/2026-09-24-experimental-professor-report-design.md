# Professor da experimental + relatório — Design

**Data:** 2026-09-24  
**Status:** aprovado (abordagem campo no lead)  
**PRODUCT:** este documento

**Specs / fluxos relacionados:**

- [2026-06-10-followup-experimental-design.md](./2026-06-10-followup-experimental-design.md)
- [2026-09-08-confirmacao-staff-aula-design.md](./2026-09-08-confirmacao-staff-aula-design.md) — padrão Equipe/roster (não herda slot)
- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md)
- [relatorios-indicadores.md](../../flows/analise/relatorios-indicadores.md)

---

## 1. Problem Statement

A academia precisa saber **quem deu cada aula experimental** no mês para **comissão** e para ver **conversão por professor**. Hoje o lead guarda data/hora e compareceu/faltou, mas não o responsável da experimental.

## 2. Goals

| # | Objetivo | Sucesso |
|---|----------|---------|
| G1 | Registrar 1 professor/instrutor ao marcar resultado (opcional; editável depois) | Campo no lead + evento de auditoria |
| G2 | Comissão: contar comparecimentos com professor no período | Totais batem com lista |
| G3 | Conversão: matrículas no período atribuídas ao professor da experimental | Totais batem com lista |
| G4 | Sem nova Serverless Function | Agregação no funil (`api/reports`) |

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Vários instrutores / rateio | Decidido: 1 responsável |
| Valor em R$ de comissão | Só contagem |
| Herdar staff do `class_slots` | Experimental ≠ aula da grade |
| Obrigar professor no compareceu | Pode completar depois |
| Comissão por “faltou” | Só compareceu |

## 4. Decisões fechadas

1. **Quando:** ao marcar Compareceu / Não compareceu (+ edição posterior no perfil).
2. **Comissão:** só leads com `attended_at` no período e professor preenchido.
3. **Conversão:** novo aluno no período (`countsAsNewStudentInPeriod`) atribuído ao professor gravado.
4. **Fonte do picker:** mesma de “Aulas (equipe)” — Equipe + roster (`buildLessonStaffPickerOptions`).
5. **Persistência:** `experimental_professor_user_id` + `experimental_professor_name` no lead (e preservação no merge relatório / students quando existir).
6. **Auditoria:** `lead_event` `experimental_professor_set` / `_changed` com payload id+nome.
7. **UI relatório:** seção no Funil — tabela por professor + “sem responsável”.

## 5. Dados

| Campo | Coleção | Tipo |
|-------|---------|------|
| `experimental_professor_user_id` | `leads` (+ `students` se provisionado) | string (ref `login:` / `roster:`) |
| `experimental_professor_name` | idem | string |

## 6. Relatório (métricas)

Por professor no intervalo `[from, to]`:

- `attended` — compareceu no período com esse professor
- `converted` — matriculado no período com esse professor
- `attended_no_professor` / `converted_no_professor` — buckets “sem responsável”

Falta (`missed`) aparece no funil existente; **não** entra na coluna de comissão.

---

**Aprovado pelo usuário** (comissões A+B, momento B, comissão só compareceu, 1 pessoa, professor opcional).
