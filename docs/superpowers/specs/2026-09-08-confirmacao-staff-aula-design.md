# Confirmação de professor/instrutor na aula + relatório — Design

**Data:** 2026-09-08  
**Status:** aprovado (abordagem B)  
**PRODUCT:** este documento (produto + design técnico enxuto)

**Contexto:** Na Recepção a grade de horários já existe (`RecepcaoSchedulesGrid`), mas o campo `instructor` em `schedules`/`classes` é texto livre do template — não registra quem **de fato** deu a aula nem permite fechar relatório de aulas por colaborador.

**Specs / fluxos relacionados:**

- [2026-07-01-recepcao-grade-horarios-PRODUCT.md](./2026-07-01-recepcao-grade-horarios-PRODUCT.md) — grade / aulas do dia
- [2026-06-19-agendamento-reservas-PRODUCT.md](./2026-06-19-agendamento-reservas-PRODUCT.md) — `class_slots`
- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)
- [empresa-horarios-turmas.md](../../flows/config/empresa-horarios-turmas.md)
- [equipe-colaboradores.md](../../flows/config/equipe-colaboradores.md)

**Nota de schema legado:** `scripts/provision-lesson-register-schema.mjs` provisiona coleção `instructors` + attrs parciais em `class_slots`. **v1 desta feature não usa a coleção `instructors`** — a fonte de pessoas é **Equipe** (`fetchTeamMemberships`). Os attrs em `class_slots` serão estendidos conforme abaixo.

---

**Nota (2026-09-10):** a entrada na Recepção passou a ser o clique no card da **grade semanal** (qualquer dia). A seção «Aulas de hoje» foi removida — ver [2026-09-10-confirmacao-staff-na-grade-design.md](./2026-09-10-confirmacao-staff-na-grade-design.md).

## 1. Problem Statement

A academia precisa saber, por dia, **quem foi o professor** e **quem foi o instrutor** de cada aula, para contabilizar **aulas dadas** por colaborador. Hoje isso não existe: a recepção só vê o nome previsto na grade.

**Quem sofre:** owner (folha / acordo com professores), recepcionista (quem opera o balcão).

**Custo de não resolver:** planilha paralela, disputa sobre “quem deu quantas aulas”, sem export confiável.

---

## 2. Goals

| # | Objetivo | Sucesso |
|---|----------|---------|
| G1 | Recepcionista confirma staff (ou “não houve”) por ocorrência do dia | ≤ 30 s por aula |
| G2 | Contagem por papel (professor / instrutor) em aulas confirmadas | Totais batem com detalhe exportado |
| G3 | Export CSV + PDF em Relatórios (período + filtro pessoa) | Download útil sem planilha manual |
| G4 | Sem nova Serverless Function (Hobby 12/12) | Só rotas em handlers existentes |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Contagem em **horas** (duração) | Decidido: conta **número de aulas** |
| Catálogo `instructors` separado | Lista = Equipe |
| Pesos diferentes professor vs instrutor | Fora do v1 |
| Pagamento / financeiro automático ao professor | Outro produto |
| Edição do template da grade na Recepção | Continua em `/empresa?tab=horarios` |
| Portal do professor ver próprias aulas | P2 |
| Auto-confirmação por presença na catraca | P2 |

---

## 4. Decisões de produto (fechadas)

1. **Papéis:** professor = responsável; instrutor = auxiliar; ambos entram no relatório (totais separados).
2. **Fonte:** somente membros da **Equipe**.
3. **Quem registra:** recepção (member/admin/owner com acesso à Recepção).
4. **Granularidade:** por **ocorrência do dia** (não o template semanal).
5. **Confirmação explícita** obrigatória — o previsto da grade não conta sozinho.
6. **Métrica:** número de **aulas confirmadas** (não horas).
7. **Confirmar sem staff:** permitido via status **“Não houve aula”** + **motivo obrigatório**.
8. **Relatório:** Relatórios → filtro período + pessoa → **CSV e PDF**.
9. **Mesma pessoa nos dois papéis:** conta **1 no total de professor** e **1 no total de instrutor** (papéis distintos); não soma 2 no “total geral de aulas da pessoa” — o relatório mostra colunas por papel.

---

## 5. Fluxo UX — Recepção

1. Seção **Aulas de hoje** (cards clicáveis) na Recepção, acima ou junto da grade semanal.
2. Clique → modal/drawer:
   - Cabeçalho: nome, horário, data (read-only)
   - Select **Professor** (Equipe, opcional)
   - Select **Instrutor** (Equipe, opcional)
   - Opção **Não houve aula** → motivo obrigatório; selects ignorados
   - **Confirmar**
3. Card após confirmar: badge **Confirmada** (nomes) ou **Não houve** (motivo curto).
4. Edição posterior permitida (reabre modal); grava `lesson_recorded_*` na última confirmação.
5. Pendentes: badge **Confirmar staff** — não entram no relatório até confirmar.

---

## 6. Modelo de dados

Persistência na coleção **`class_slots`** (ocorrência materializada). Se o slot do dia ainda não existir no momento da confirmação, a API **cria/garante** o slot a partir do `schedule` + data (mesma lógica do gerador).

### Campos novos / canônicos em `class_slots`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `lesson_status` | string | `''` (pendente) \| `confirmed` \| `cancelled` |
| `professor_user_id` | string | user id Equipe (opcional) |
| `professor_name` | string | denormalizado no confirm |
| `instructor_user_id` | string | user id Equipe (opcional) |
| `instructor_name` | string | denormalizado |
| `lesson_cancel_reason` | string | obrigatório se `cancelled` |
| `lesson_recorded_by` | string | user id quem confirmou |
| `lesson_recorded_by_name` | string | nome |
| `lesson_recorded_at` | datetime | instante da confirmação |

Attrs legados do script (`instructor_id`, `lesson_notes`) podem coexistir; v1 **não depende** de `instructor_id` nem da coleção `instructors`.

**Índices sugeridos:** `(academy_id, slot_date)`, `(academy_id, lesson_status, slot_date)`.

---

## 7. API (sem nova function)

Via `api/leads.js?route=bookings` (handler `bookingsHandler`):

| Método | action | Uso |
|--------|--------|-----|
| POST | `confirm-lesson` | Body: `schedule_id` **ou** `slot_id`, `date`, `lesson_status`, ids/nomes, motivo |
| GET | `lesson-staff-report` | Query: `from`, `to`, `user_id?` — agregados + linhas |

Alternativa de export PDF: `api/reports.js` se o padrão de PDF binário já estiver lá; caso contrário PDF gerado no cliente a partir do JSON do report (CSV no cliente). Preferência: **CSV no cliente**; **PDF no servidor** se já houver padrão fácil em `reports` — senão PDF client com `pdf-lib`/`pdfkit` alinhado a outros exports.

Validação `confirm-lesson`:

- `cancelled` → `lesson_cancel_reason` obrigatório; limpa ou ignora professor/instrutor
- `confirmed` → professor e instrutor opcionais (podem ambos vazios **somente** se for `cancelled`; em `confirmed` permite staff vazio? **Sim** — produto D permite confirmar sem ninguém via “não houve”; se status for `confirmed` com ambos vazios, tratar como válido mas raro — UI deve empurrar para “não houve” se ambos vazios. **Regra:** UI: se ambos vazios e não “não houve”, bloquear submit. API: `confirmed` exige pelo menos um dos dois **ou** aceitar só com flag explícita. **Decisão:** API rejeita `confirmed` sem professor e sem instrutor; “sem ninguém” = `cancelled` + motivo.

---

## 8. Relatório

**Onde:** Relatórios — nova aba ou seção **“Aulas (staff)”** (sugerido: aba `aulas-staff` ou seção dentro de Frequência). Preferência: **aba própria** `aulas` / `Staff de aulas` para não misturar com retenção de alunos.

**Conteúdo:**

- KPIs: aulas confirmadas no período; aulas “não houve”; pendentes (opcional)
- Tabela por colaborador: nome | aulas como professor | aulas como instrutor
- Detalhe (opcional na tela / sempre no export): data, horário, turma, papel, status

**Export CSV:** linhas de detalhe + totais por pessoa.  
**Export PDF:** capa com período + tabela de totais + lista de ocorrências (cap de linhas se necessário).

Filtro `user_id`: restringe totais e detalhe àquela pessoa.

---

## 9. Contagem (regras)

```
para cada slot com lesson_status === 'confirmed':
  se professor_user_id → +1 aula_professor[user]
  se instructor_user_id → +1 aula_instrutor[user]

cancelled → 0 para todos
pendente ('' / null) → fora do relatório de “aulas dadas”
```

---

## 10. Permissões

- Confirmar: qualquer membro autenticado com acesso à academia (recepção opera).
- Relatório / export: mesmo escopo dos outros relatórios da academia (owner/admin; member se já vê Relatórios).

---

## 11. Fases de implementação

1. Domínio puro + testes (status, validação, agregação, CSV rows)
2. Provision schema attrs + API `confirm-lesson` / `lesson-staff-report`
3. UI Recepção: aulas de hoje + modal
4. UI Relatórios: painel + CSV + PDF
5. Atualizar `docs/flows/crm/hoje-dashboard.md` + `VALIDATION.md`

---

## 12. Open Questions (não bloqueantes)

| ID | Pergunta | Default v1 |
|----|----------|------------|
| OQ1 | Aba nova em Relatórios vs seção em Frequência? | Aba `aulas-staff` |
| OQ2 | Confirmar aula futura (amanhã)? | Permitir (recepção pode antecipar) |
| OQ3 | Limpar confirmação (voltar a pendente)? | Não no v1 — só editar confirmed/cancelled |

---

## 13. Success metrics

- Leading: % de aulas do dia com `lesson_status` preenchido até D+1
- Lagging: owner deixa de usar planilha externa para fechar mês de professores
