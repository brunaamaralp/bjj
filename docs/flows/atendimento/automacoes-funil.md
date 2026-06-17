# Automações do funil

| Campo | Valor |
|---|---|
| **id** | `atendimento.automacoes.funil` |
| **módulo** | Atendimento |
| **personas** | owner, admin (editar gatilhos/templates); member (visualizar processos) |
| **rotas** | `/automacoes?tab=modelos|gatilhos&section=`, `/automacoes?wizard=1` (alias `configuracoes` → `gatilhos`; `processos` → `/tarefas?tab=processos`) |
| **pré-requisitos** | WhatsApp conectado para envios automáticos; modelos revisados |
| **status** | revisado (código) |
| **última revisão** | 2026-06-17 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:** [2026-06-16-automacoes-ux-onboarding-PRODUCT.md](../../superpowers/specs/2026-06-16-automacoes-ux-onboarding-PRODUCT.md) · [2026-06-17-automacoes-ux-clareza-PRODUCT.md](../../superpowers/specs/2026-06-17-automacoes-ux-clareza-PRODUCT.md) · [2026-06-17-automacoes-ia-restructure-PRODUCT.md](../../superpowers/specs/2026-06-17-automacoes-ia-restructure-PRODUCT.md) (aprovada P4) · [IMPLEMENTATION P4.1](../../superpowers/specs/2026-06-17-automacoes-ia-restructure-IMPLEMENTATION.md)

**Harness relacionado:** `npm test -- automacoesHub automacoesSetupWizard automationUx`

**Arquivos-chave:** `src/pages/Automacoes.jsx`, `src/pages/AutomacoesConfigTab.jsx`, `src/lib/automacoesHub.js`, `src/lib/automacoesSettingsSections.js`, `src/lib/automacoesSetupWizard.js`, `src/components/academy/AutomacoesSection.jsx`

---

## Resumo

Em **Mensagens do funil** (`/automacoes`), a equipe personaliza **modelos de mensagem** WhatsApp e **liga/desliga gatilhos** do funil (confirmação de aula, falta, matrícula, aniversário, etc.). Um wizard inicial guia modelos → WhatsApp → gatilhos. Processos da equipe (templates de tarefa, playbook) ficam em `/tarefas?tab=processos`.

---

## Diagrama de fluxo

```mermaid
flowchart TD
  open["/automacoes"] --> wizard{Wizard ativo?}
  wizard -->|Sim| guide[AutomacoesSetupWizard]
  guide --> modelos[tab=modelos]
  guide --> agente[/agente-ia]
  guide --> gatilhos[tab=gatilhos]
  open --> tabs{tab}
  tabs --> modelos
  tabs --> gatilhos
  gatilhos --> toggle[Ligar gatilho]
  toggle --> cron[Cron / evento funil]
  cron --> zap[Envio Zapster]
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | `/automacoes` | `Automacoes` | Abrir hub | Sidebar `AcademyTabSettingsLayout` (Modelos + Gatilhos por grupo); título «Mensagens do funil» |
| 2 | `?tab=modelos&section=captacao|rotinas` | `AutomacoesModelosTab` | Editar textos WhatsApp do grupo | `whatsappTemplates` |
| 3 | Modelos | Personalizar vs padrão | Diff com `DEFAULT_WHATSAPP_TEMPLATES` | `areTemplatesCustomized` |
| 4 | `?tab=gatilhos&section=captacao|pos-matricula|rotinas` | `AutomacoesConfigTab` | Ligar/desligar gatilho do grupo | `automationsConfig` persistido |
| 5 | Gatilhos | Readiness | WhatsApp desconectado | Aviso `computeAutomationReadiness` |
| 6 | Gatilhos | Sair com dirty | Trocar para Modelos na sidebar | `ConfirmDialog` guard |
| 7 | `?wizard=1` | Setup wizard | Primeira visita | Passos modelos → WA → gatilhos |
| 8 | Wizard | Ir WhatsApp | Navigate | `/agente-ia` |
| 9 | Legado `?tab=processos` | Redirect | `/tarefas?tab=processos` | Toast único (session) |

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

1. [ ] `/automacoes?tab=modelos` carrega modelos (section default `captacao`)
2. [ ] Sidebar navega entre grupos (`?section=`) sem perder estado do wizard
3. [ ] `?tab=gatilhos` — toggle gatilho persiste após reload
4. [ ] `?tab=configuracoes` redireciona para `?tab=gatilhos`
5. [ ] `?tab=processos` redireciona para `/tarefas?tab=processos`
6. [ ] WhatsApp offline → indicador readiness na aba Gatilhos
7. [ ] Wizard primeira visita redireciona para aba do passo atual
8. [ ] Dispensar wizard → `automacoesWizardDismissStorageKey`
9. [ ] Ack modelos (`navi_automacoes_modelos_ack_{academyId}`) ou template customizado conclui passo do wizard
10. [ ] Sair da aba config com alterações → confirmação
11. [ ] `?tab=agente` legacy → redirect `/agente-ia`
12. [ ] Gatilho `converted` dispara após matrícula (ver [funil-lead-matricula.md](../crm/funil-lead-matricula.md))
13. [ ] Cron `automations-frequent` processa fila (backend — não duplicar doc API)
14. [ ] Multi-tenant: config isolada por `academyId`
15. [ ] Aba Processos com wizard pendente → faixa compacta (não card full)
16. [ ] Configurações com WhatsApp offline → `StatusBanner` warning + readiness visível com wizard ativo
17. [ ] P3: compact passo WhatsApp → `/agente-ia` (não Modelos)
16. [ ] P3: Processos com compact → sem tab intro duplicado
17. [ ] P3: scope banner dispensável; reabre ao “Ver guia”
18. [ ] P3: member sem wizard; Modelos agrupados Captação/Rotinas

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

- **Processos vs WhatsApp:** aba Processos **não envia** WhatsApp; banner `AutomacoesTabIntroBanner` + wizard compacto se WA pendente
- **Financeiro:** lembretes de mensalidade em `FINANCE_WHATSAPP_REMINDERS_PATH` — não confundir com gatilhos do funil
- **Menu:** accordion Automações em `naviMenu.js` — Agente IA como filho se `canConfigureAgenteIa`
- **Relacionado:** [agente-ia-whatsapp.md](agente-ia-whatsapp.md), [conversas-inbox.md](../crm/conversas-inbox.md)

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-16 | — | UX onboarding P0/P1: scope banner, wizard contextual, ack modelos, readiness |
| 2026-06-17 | — | P3 clareza: bug compact WA, menos banners, scope dismiss, grupos modelos |
| 2026-06-16 | — | P2 polish: barra de progresso, passos pill, compact sem gradiente |
