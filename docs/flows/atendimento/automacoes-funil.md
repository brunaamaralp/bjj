# Automações do funil

| Campo | Valor |
|---|---|
| **id** | `atendimento.automacoes.funil` |
| **módulo** | Atendimento |
| **personas** | owner, admin (editar gatilhos/templates); member (visualizar processos) |
| **rotas** | `/automacoes?tab=processos|modelos|configuracoes`, `/automacoes?wizard=1` |
| **pré-requisitos** | WhatsApp conectado para envios automáticos; modelos revisados |
| **status** | revisado (código) |
| **última revisão** | 2026-06-15 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:** — (gatilhos em `lib/automationCore.js`)

**Harness relacionado:** `npm test -- automacoesHub automacoesSetupWizard automationUx`

**Arquivos-chave:** `src/pages/Automacoes.jsx`, `src/pages/AutomacoesConfigTab.jsx`, `src/lib/automacoesHub.js`, `src/lib/automacoesSetupWizard.js`, `src/components/academy/AutomacoesSection.jsx`

---

## Resumo

Em **Automações**, a equipe define **processos internos** (templates de tarefa, playbook de retorno), personaliza **modelos de mensagem** WhatsApp e **liga/desliga gatilhos** do funil (confirmação de aula, falta, matrícula, aniversário, etc.). Um wizard inicial guia modelos → WhatsApp → gatilhos.

---

## Diagrama de fluxo

```mermaid
flowchart TD
  open["/automacoes"] --> wizard{Wizard ativo?}
  wizard -->|Sim| guide[AutomacoesSetupWizard]
  guide --> modelos[tab=modelos]
  guide --> agente[/agente-ia]
  guide --> config[tab=configuracoes]
  open --> tabs{tab}
  tabs --> processos[Processos — tarefas equipe]
  tabs --> modelos
  tabs --> config
  config --> toggle[Ligar gatilho]
  toggle --> cron[Cron / evento funil]
  cron --> zap[Envio Zapster]
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | `/automacoes` | `Automacoes` | Abrir hub | `HubTabBar` 3 abas |
| 2 | `?tab=processos` | `AutomacoesProcessosTab` | Templates de tarefa | `TaskTemplatesSection` |
| 3 | Processos | Playbook retorno | `FollowupPlaybookSection` | Rotinas pós-matrícula |
| 4 | `?tab=modelos` | `AutomacoesModelosTab` | Editar textos WhatsApp | `whatsappTemplates` |
| 5 | Modelos | Personalizar vs padrão | Diff com `DEFAULT_WHATSAPP_TEMPLATES` | `areTemplatesCustomized` |
| 6 | `?tab=configuracoes` | `AutomacoesConfigTab` | Ligar/desligar gatilho | `automationsConfig` persistido |
| 7 | Config | Readiness | WhatsApp desconectado | Aviso `computeAutomationReadiness` |
| 8 | Config | Sair com dirty | Trocar aba | `ConfirmDialog` guard |
| 9 | `?wizard=1` | Setup wizard | Primeira visita | Passos modelos → WA → gatilhos |
| 10 | Wizard | Ir WhatsApp | Navigate | `/agente-ia` |
| 11 | Onboarding | `setup_automations` | `/automacoes?wizard=1` | Fora do core do banner principal |

### Gatilhos principais (`AUTOMATION_LABELS`)

| Chave | Quando dispara |
|---|---|
| `schedule_confirm` | Confirma agendamento experimental |
| `presence_confirmed` / `missed` | Presença ou falta na aula |
| `waiting_decision` | Etapa funil «Aguardando decisão» |
| `followup_d1_attended` | Cron dia seguinte à experimental |
| `converted` | Matrícula realizada |
| `schedule_reminder` | Antes da aula |
| `birthday` | Aniversário do aluno (~9h BRT) |

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] Academia com funil e leads ativos
- [ ] Para envio real: WhatsApp conectado em `/agente-ia`
- [ ] Owner/admin para editar modelos e gatilhos (`canEditWhatsappTemplates`)

### Permissões por papel

| Papel | Ver Automações | Editar gatilhos/modelos |
|---|---|---|
| **owner** | Sim | Sim |
| **admin** | Sim | Sim (membership team admin) |
| **member** | Sim | Não (somente leitura em config) |

### Checklist passo a passo

1. [ ] `/automacoes?tab=processos` carrega seções de tarefas
2. [ ] `?tab=modelos` — editar template e salvar (owner/admin)
3. [ ] `?tab=configuracoes` — toggle gatilho persiste após reload
4. [ ] WhatsApp offline → indicador readiness na config
5. [ ] Wizard primeira visita redireciona para aba do passo atual
6. [ ] Dispensar wizard → `automacoesWizardDismissStorageKey`
7. [ ] Visitar modelos marca `automacoesModelosVisited` no localStorage
8. [ ] Sair da aba config com alterações → confirmação
9. [ ] `?tab=agente` legacy → redirect `/agente-ia`
10. [ ] Gatilho `converted` dispara após matrícula (ver [funil-lead-matricula.md](../crm/funil-lead-matricula.md))
11. [ ] Cron `automations-frequent` processa fila (backend — não duplicar doc API)
12. [ ] Multi-tenant: config isolada por `academyId`

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Falha ao salvar | Toast + `lastSaveFailed` | `AutomacoesConfigTab` |
| Sem permissão editar | Controles desabilitados | `canEditWhatsappTemplates` |

### Critérios de fluxo saudável vs regressão

**Saudável:** Gatilhos default off até ativar; preview de template; wizard não bloqueia power users.

**Regressão:** Envio com gatilho off; template vazio; perda de dirty ao trocar aba sem aviso.

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 5–6 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Gatilho | Lembrete de aula |
| Modelo | Texto personalizado com nome `{nome}` |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | Automações | "Aqui separo processo interno de mensagem automática." | Clareza |
| 2 | Modelos | "Ajusto o texto — o sistema só troca os dados do lead." | Personalização |
| 3 | Config | "Ligo só o que quero — começo pelo lembrete de aula." | Controle fino |
| 4 | Funil | "Quando confirmo a experimental, a mensagem sai sozinha." | Menos trabalho manual |
| 5 | Agente IA | "Sem WhatsApp conectado, nada dispara — por isso o wizard manda lá primeiro." | Dependência clara |

### O que não mostrar

- Cron secrets ou endpoint `/api/cron/`
- Spam de mensagens em número real

---

## Variações e atalhos

- **Processos vs WhatsApp:** aba Processos **não envia** WhatsApp (`AUTOMACOES_TAB_HINTS.processos`)
- **Financeiro:** lembretes de mensalidade em `FINANCE_WHATSAPP_REMINDERS_PATH` — não confundir com gatilhos do funil
- **Menu:** accordion Automações em `naviMenu.js` — Agente IA como filho se `canConfigureAgenteIa`
- **Relacionado:** [agente-ia-whatsapp.md](agente-ia-whatsapp.md), [conversas-inbox.md](../crm/conversas-inbox.md)

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-15 | — | Criação Fase 4 |
