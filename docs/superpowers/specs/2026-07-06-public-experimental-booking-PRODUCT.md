# Agendamento público de aula experimental — PRODUCT Spec

**Data:** 2026-07-06  
**Status:** aprovado  
**TECH:** `docs/superpowers/plans/2026-07-06-public-experimental-booking.md`

**Contexto:** O link `/inscricao/:token` matricula alunos. Interessados vindos de Instagram, site ou QR precisam de formulário self-service que cria/atualiza lead em **Aula experimental** com data e hora, respeitando lotação quando `class_slots` existir.

**Decisão de produto:** telefone já cadastrado como lead → **atualizar** agendamento (reagendamento), não duplicar.

**Fluxos relacionados:**

- [funil-lead-matricula.md](../../flows/crm/funil-lead-matricula.md)
- [hoje-dashboard.md](../../flows/crm/hoje-dashboard.md)
- [2026-06-19-agendamento-reservas-PRODUCT.md](./2026-06-19-agendamento-reservas-PRODUCT.md) — slots/bookings (já parcialmente implementado)

---

## 1. Problem Statement

Recepcionistas e a Bia cobrem WhatsApp, mas canais assíncronos (Instagram bio, site, QR na porta) não têm formulário público de experimental. O operador precisa cadastrar manualmente ou perder o lead.

---

## 2. Goals

| # | Objetivo | Métrica |
|---|----------|---------|
| G1 | Link compartilhável sem login | Lead criado/atualizado em ≤ 2 min pelo interessado |
| G2 | Aparece no funil automaticamente | `status=Agendado`, coluna **Aula experimental** |
| G3 | Horário com lotação | Slot lotado bloqueado com mensagem clara |
| G4 | Faixa etária | Criança/Juniores/Adulto filtram horários compatíveis |
| G5 | Reagendamento | Mesmo telefone + nome → atualiza lead existente |

---

## 3. Non-Goals (v1)

| Item | Motivo |
|------|--------|
| Multi-unidade (Fábricas/Colônia) | Sem modelo nativo; v2 via pergunta customizada |
| Pagamento na experimental | Domínio matrícula |
| Novo arquivo em `/api/` | Rotas em `api/leads.js?route=public-experimental` |
| Substituir Bia no WhatsApp | Complementar; Bia pode enviar o mesmo link depois |

---

## 4. UX — interessado

**Rota:** `/experimental/:token`

1. Nome, telefone, data de nascimento
2. Se menor: nome do responsável (obrigatório)
3. Lista de horários futuros (slots com vaga), filtrados por idade
4. Confirmar → tela de sucesso com resumo data/hora

**Erros amigáveis:**

- Link desativado / inválido
- Turma lotada → sugerir outro horário
- Já é aluno matriculado → orientar contato com a academia
- Sem grade configurada → mensagem + lead em **Novo** sem horário (fallback)

---

## 5. UX — admin

**Empresa → Alunos → Configurações de matrícula** (abaixo do link de matrícula online):

- Toggle ativar link de experimental
- Copiar URL `/experimental/{token}`
- Regenerar token
- Keywords por faixa etária (opcional; padrão GB-friendly)

---

## 6. API

| Método | Rota | Auth |
|--------|------|------|
| GET | `/api/leads?route=public-experimental&token=` | Público |
| GET | `&profile_type=Criança\|Juniores\|Adulto` | Slots filtrados |
| POST | `/api/leads?route=public-experimental&token=` | Público |
| POST | `/api/leads?route=public-experimental-config` | Owner/staff |

**POST body:** `{ name, phone, birthDate, parentName?, slot_id? }`

**POST outcome:**

- Lead criado ou atualizado (`buildSchedulePatch`)
- Booking criado em `class_slots` quando `slot_id` válido
- Bookings anteriores ativos do lead cancelados (reagendamento)
- Evento `experimental_agendada_online`

**Bloqueios:**

- `student_already_exists` — telefone de aluno ativo
- `slot_full` — lotação
- `lead_converted` — lead já matriculado (status terminal)

---

## 7. Segurança

- Token HMAC `nave-exp:v1:` + salt por academia (separado de matrícula)
- Mesmo `ENROLLMENT_LINK_SECRET` / fallback de env
- GET não expõe PII de outros leads

---

## 8. Critérios de aceite

- [ ] Link ativo cria lead visível em `/pipeline` na coluna experimental
- [ ] Reenvio com mesmo telefone atualiza data/hora (reagendamento)
- [ ] Slot lotado retorna erro sem criar booking duplicado
- [ ] Criança vê apenas slots com keywords infantis (ou genéricos)
- [ ] Admin pode desativar link sem apagar salt
- [ ] Testes unitários: settings, audience filter, book logic
