# Funil — do novo lead à matrícula

| Campo | Valor |
|---|---|
| **id** | `crm.funil.lead-matricula` |
| **módulo** | CRM |
| **personas** | recepcionista, owner |
| **rotas** | `/pipeline`, `/lead/:id`, `/experimental/:token` (público), modal **Novo lead** (global) |
| **pré-requisitos** | Usuário autenticado; estágios do funil configurados em Minha academia |
| **status** | revisado |
| **última revisão** | 2026-07-23 |

**Specs relacionadas:**

- [2026-06-17-funil-correcao-definitiva-PRODUCT.md](../superpowers/specs/2026-06-17-funil-correcao-definitiva-PRODUCT.md) — triagem desktop, movimentação e colunas custom
- [2026-06-10-followup-experimental-design.md](../superpowers/specs/2026-06-10-followup-experimental-design.md) — ações pós-experimental
- [2026-06-12-lead-history-summary-cache-design.md](../superpowers/specs/2026-06-12-lead-history-summary-cache-design.md) — resumo IA no perfil
- [2026-06-11-conversa-cadastro-lead-ia-design.md](../superpowers/specs/2026-06-11-conversa-cadastro-lead-ia-design.md) — cadastro via conversa
- [2026-07-06-public-experimental-booking-PRODUCT.md](../superpowers/specs/2026-07-06-public-experimental-booking-PRODUCT.md) — agendamento público de experimental (reagendamento por telefone)
- [2026-06-17-lead-child-display-names.md](../superpowers/plans/2026-06-17-lead-child-display-names.md) — exibição aluno vs responsável no funil e perfil
- [2026-07-23-plan-price-snapshot-design.md](../../superpowers/specs/2026-07-23-plan-price-snapshot-design.md) — matrícula grava `plan_price` do plano escolhido

**Harness relacionado:** `npm test -- enrollmentFlow performEnrollment publicExperimental`

**Arquivos-chave:** `src/pages/Pipeline.jsx`, `src/pages/LeadProfile.jsx`, `src/components/leads/NewLeadModal.jsx`, `src/lib/performEnrollment.js`, `src/pages/PublicExperimentalBooking.jsx`, `lib/server/publicExperimentalBook.js`

---

## Resumo

O operador captura um novo contato, acompanha o lead no **Funil** (kanban ou lista), abre o perfil para histórico e comunicação, move entre estágios conforme o playbook e conclui com **matrícula** — criando o registro de aluno e encerrando o ciclo comercial no CRM.

Interessados também podem **agendar aula experimental** pelo link público (`/experimental/:token`): o sistema cria lead em **Aula experimental** ou **reagenda** o lead existente (mesmo telefone + nome compatível), sem duplicar.

---

## Diagrama de fluxo

```mermaid
flowchart TD
  start[Novo lead] --> modal[NewLeadModal]
  modal --> pipeline["/pipeline"]
  publicLink["/experimental/:token"] --> publicForm[Formulário público]
  publicForm --> pipeline
  pipeline --> stage[Mover estágio / ações rápidas]
  stage --> profile["/lead/:id"]
  profile --> whatsapp[WhatsApp template]
  profile --> schedule[Agendar experimental]
  profile --> matricula[Matricular]
  matricula --> enrollModal[Modal de matrícula]
  enrollModal --> performEnroll[performEnrollment]
  performEnroll --> student["/student/:id ou lista alunos"]
  pipeline --> kanban[Visão kanban]
  pipeline --> list[Visão lista]
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | (global) | `NewLeadModal` | Sidebar **Novo lead** ou FAB mobile | Modal com nome, telefone, origem, estágio inicial |
| 1b | `/experimental/:token` | `PublicExperimentalBooking` | Preencher nome, telefone, nascimento, horário | Lead criado ou reagendado em **Aula experimental**; origem **Experimental online** |
| 2 | `/pipeline` | `Pipeline.jsx` | Salvar novo lead | Lead aparece na coluna do estágio escolhido; perfil **Criança/Juniores**: card mostra **nome do aluno** + subtítulo `resp. {responsável}`; busca inclui responsável |
| 3 | `/pipeline` | Kanban / lista | Arrastar card ou menu de estágio | Estágio atualizado; automações disparam se configuradas |
| 3b | `/pipeline` (kanban desktop) | `InboxTriageCard` no card | Confirmar / Vincular aluno / Não é lead | Triagem concluída **sem** abrir perfil; mover para etapa ≠ Novo confirma triagem implicitamente |
| 3c | `/pipeline` (lista mobile) | Link **Triar no Inbox** | Abrir conversa | Triagem no Inbox — **sem** callout no card mobile |
| 4 | `/pipeline` | Card do lead | Clicar no card (fora da área de triagem) | Navega para `/lead/:id` |
| 5 | `/pipeline` | Menu ⋮ no card | WhatsApp, nota, matricular, excluir | Ação contextual sem sair do funil |
| 6 | `/lead/:id` | `LeadProfile.jsx` | Editar dados, aba **Conversa** / **Histórico** | Dados persistidos; criança: label **Nome do aluno**, responsável em Outros detalhes; hint se responsável vazio |
| 6b | `/lead/:id` | Aba Conversa | WA desconectado | Banner + empty “WhatsApp não conectado” + **Configurar WhatsApp** + **Abrir WhatsApp Web** (manual) → `/agente-ia` |
| 6c | `/lead/:id` | Aba Conversa | WA offline com histórico | Banner com link **Reconectar** → `/agente-ia`; thread read-only |
| 7 | `/lead/:id` | Botão matricular | Iniciar matrícula | Modal com plano, **desconto individual (R$)**, data e pagamento opcional (`MatriculaPaymentStep`) |
| 8 | Modal matrícula | Pagamento opcional | Forma + **Recebido via** (cartão) | `registerEnrollmentPayment` com `capture_method_id` |
| 9 | Modal matrícula | `executeMatricula` | Confirmar | `performEnrollment` cria aluno com `plan_price` do plano escolhido; lead marcado matriculado |
| 10 | `/pipeline` | Filtros (período, estágio) | Refinar visualização | Lista/kanban filtrados; contadores atualizados |
| 11 | `/lead/:id` | Resumo IA (se ativo) | Gerar/atualizar resumo | Cache de histórico exibido no perfil |

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] Estágios do funil definidos em `/empresa?tab=funil`
- [ ] Planos de mensalidade (se matrícula com plano financeiro) em `/empresa?tab=financeiro`
- [ ] Templates WhatsApp configurados para mensagens de estágio
- [ ] Lead de teste em estágio aberto (não matriculado)
- [ ] Link de experimental ativo em Empresa → Alunos → Configurações de matrícula (`PublicExperimentalSection`)

### Checklist passo a passo

1. [ ] Abrir **Novo lead** — modal visível e campos obrigatórios validados
1b. [ ] Abrir `/experimental/:token` — slots filtrados por faixa etária; menor exige responsável
1c. [ ] Reenviar com mesmo telefone e outro horário — **um** lead no funil, horário atualizado (reagendamento)
2. [ ] Criar lead "Teste Fluxo" — aparece em `/pipeline` no estágio correto
3. [ ] Alternar kanban ↔ lista **(desktop; largura > 1023px)** — mesmo lead visível em ambas
3b. [ ] Lead inbound em **Novo** (desktop) — callout triagem: Confirmar / Vincular / Não é lead **sem** navegar ao perfil
3c. [ ] Mover lead inbound para etapa custom (ex.: Primeiro contato) — card permanece na coluna; toast de confirmação implícita
3d. [ ] Mobile — link **Triar no Inbox** na coluna Novo; sem callout no card
4. [ ] Mover lead para estágio "Aguardando decisão" ou equivalente — badge e contador da coluna atualizam
5. [ ] Abrir perfil `/lead/:id` — dados consistentes com o card
6. [ ] Registrar nota ou evento na timeline — evento aparece ordenado
7. [ ] Enviar mensagem ou template WhatsApp — pela aba **Conversa** (integrado); com WA offline, usar **Abrir WhatsApp Web** no empty (envio manual) ou reconectar em `/agente-ia`
7b. [ ] Com WA desconectado — banner na coluna esquerda + empty na aba Conversa com CTAs **Configurar WhatsApp** e **Abrir WhatsApp Web**; tab “Conversa (offline)” com indicador âmbar
7c. [ ] Com WA offline e histórico — banner no painel com **Reconectar**; composer desabilitado
8. [ ] Iniciar matrícula — modal exige plano/data quando aplicável e permite informar desconto individual por aluno
8b. [ ] Informar desconto válido — preview mostra valor do plano, desconto e valor cobrado final em tempo real
9. [ ] Confirmar matrícula — lead some do funil aberto; aluno criado em `/students` com `plan_price` do plano escolhido
10. [ ] Abrir perfil do aluno `/student/:id` — vínculo com lead preservado; `belt` do lead (se existir via import/NL) copiado na conversão
11. [ ] Exportar planilha (menu pipeline) — arquivo gerado sem dados de outra academia

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Telefone duplicado | Validação no modal / toast | `NewLeadModal` |
| Telefone já matriculado (link público) | Erro `student_already_exists` | `publicExperimentalBook` |
| Lead já convertido (link público) | Erro `lead_converted` | `publicExperimentalBook` |
| Slot lotado (link público) | Erro `slot_full` | `publicExperimentalBook` |
| Matrícula sem plano obrigatório | Erro no modal de matrícula | `performEnrollment` |
| Desconto maior ou igual ao plano | Validação inline no modal de matrícula | `MatriculaModal` |
| WhatsApp desconectado no perfil | Banner warning + empty na aba Conversa (Configurar + wa.me) + tab “Conversa (offline)” + Reconectar com histórico | Spec [2026-06-16-lead-profile-whatsapp-offline-states-PRODUCT.md](../superpowers/specs/2026-06-16-lead-profile-whatsapp-offline-states-PRODUCT.md) |

### Permissões e multi-tenant

- Leads e alunos escopados por `academyId`.
- Exportação e listagem não devem incluir registros de outras academias.
- Ver [docs/multi-tenant-conventions.md](../multi-tenant-conventions.md).

### Critérios de fluxo saudável vs regressão

**Saudável:** Contadores de coluna batem com cards visíveis; matrícula idempotente (não duplica aluno); automações disparam com feedback (`automationUx`).

**Regressão:** Card some sem mudança de estágio; matrícula parcial (aluno sem lead); kanban não persiste drag; filtros de período incorretos; botões de triagem abrem perfil do lead; lead em etapa custom reaparece só em Novo.

**Spec:** [2026-06-17-funil-correcao-definitiva-PRODUCT.md](../superpowers/specs/2026-06-17-funil-correcao-definitiva-PRODUCT.md)

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 4–5 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Novo lead | Carla Mendes, (11) 98888-1234, origem Instagram |
| Estágios | Contato → Experimental agendada → Matriculado |
| Plano | Mensalidade Padrão — R$ 200 |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | Novo lead | "Chegou mensagem no Instagram? Cadastro em 20 segundos." | Captura sem atrito |
| 2 | Funil kanban | "Cada coluna é um estágio do seu funil — você vê onde cada pessoa está." | Visualização do pipeline |
| 3 | Mover estágio | "Arrasto Carla para 'Experimental agendada' — o time inteiro vê a mesma informação." | Colaboração |
| 4 | Perfil do lead | "Histórico completo: ligações, WhatsApp, notas — tudo num lugar." | Contexto único |
| 5 | WhatsApp | "Modelos prontos com nome e horário — um clique e a mensagem sai." | Comunicação rápida |
| 6 | Matrícula | "Decidiu matricular? Plano, data de início, e virou aluno automaticamente." | Fechamento sem retrabalho |

### O que não mostrar

- Importação em massa de planilha (fluxo separado)
- Configuração de estágios em Minha academia (fluxo de config)
- IDs internos de lead no Appwrite

---

## Variações e atalhos

- **Entrada alternativa:** lead criado a partir do **Inbox** ao associar conversa (`docs/flows/crm/conversas-inbox.md`)
- **Experimental online:** link público em Empresa → Alunos → **Configurações de matrícula** (`PublicExperimentalSection`); formulário em `/experimental/:token`; reagenda lead existente pelo telefone (não duplica); bloqueia se já matriculado ou lead convertido
- **Matrícula pelo funil:** menu rápido no card sem abrir perfil
- **Matrícula online:** link público em Empresa → Alunos → **Cadastro online** (`PublicEnrollmentSection`); toggle **Pedir graduação no formulário online** (default off) só aparece com graduações salvas; formulário em `/inscricao/:token` envia `belt` quando toggle ativo
- **Automações:** ao mudar estágio, processos em `/automacoes?tab=processos` podem enviar mensagens
- **Mobile (≤1023px):** vista lista agrupada por estágio; kanban só no desktop
- **Rota legada:** `/new-lead` redireciona ou abre modal — preferir atalho global

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-07-23 | — | Matrícula grava `plan_price` (snapshot do plano escolhido) |
| 2026-07-06 | — | Link público `/experimental/:token` para agendar experimental; reagendamento por telefone |
| 2026-06-23 | — | Matrícula passa a aceitar desconto individual recorrente com preview do valor final |
| 2026-06-19 | — | Matrícula online: toggle askBelt + campo graduação no formulário público |
