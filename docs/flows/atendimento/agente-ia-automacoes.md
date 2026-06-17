# Agente IA e automações

| Campo | Valor |
|---|---|
| **id** | `atendimento.agente.automacoes` |
| **módulo** | Atendimento |
| **personas** | owner, member (config IA/WhatsApp); admin sem item Agente no menu |
| **rotas** | `/agente-ia`, `/automacoes?tab=modelos|gatilhos`, `/tarefas?tab=processos`, `/automacoes?wizard=1` |
| **pré-requisitos** | Integração Zapster; billing conforme plano |
| **status** | revisado (código) |
| **última revisão** | 2026-06-15 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Harness relacionado:** `npm test -- automacoesHub automacoesSetupWizard`

**Arquivos-chave:** `src/pages/AIAgentSettings.jsx`, `src/components/academy/AgenteIASection.jsx`, `src/pages/Automacoes.jsx`, `src/lib/automacoesSetupWizard.js`, `src/lib/automacoesHub.js`

---

## Resumo

Jornada em duas áreas complementares:

1. **Agente IA** (`/agente-ia`): conectar WhatsApp (QR Zapster), configurar prompt/FAQ do assistente e ativar atendimento automático (3 passos na UI).
2. **Mensagens do funil** (`/automacoes`): modelos de mensagem e gatilhos on/off; wizard de setup inicial.
3. **Processos da equipe** (`/tarefas?tab=processos`): templates de tarefa e playbook — sem WhatsApp automático.

Onboarding do CRM aponta `connect_whatsapp` e `setup_ai` para `/agente-ia`; `setup_automations` para `/automacoes?wizard=1`.

---

## Diagrama de fluxo

```mermaid
flowchart TD
  subgraph agente [Agente IA]
    a1[Passo 1: WhatsApp QR] --> a2[Passo 2: Prompt e FAQ]
    a2 --> a3[Passo 3: Ativar agente]
  end
  subgraph funil [Mensagens do funil]
    w[Wizard: Modelos] --> w2[Wizard: WhatsApp]
    w2 --> w3[Wizard: Gatilhos]
    m[tab=modelos] --> tpl[Editar templates WhatsApp]
    g[tab=gatilhos] --> trig[Ligar gatilhos funil]
  end
  subgraph processos [Processos da equipe]
    p[/tarefas?tab=processos] --> tasks[Templates tarefa equipe]
  end
  a1 --> w2
  tpl --> trig
```

---

## Mapa de telas — Agente IA

| # | Rota | Ação | Resultado |
|---|---|---|---|
| 1 | `/agente-ia` | Abrir **Agente IA** | `AgenteIASection` com progresso 3 passos |
| 2 | Passo 1 | Escanear QR / status WA | `useZapsterWhatsAppConnection` |
| 3 | Passo 2 | Editar prompt, FAQ, tom | `AgentIAPromptEditor`; save API agent |
| 4 | Passo 2 | Chat de teste | `AgentIATestChat` |
| 5 | Passo 3 | Ativar atendimento | Registro webhooks; agente ativo |
| 6 | Avançado | Opções e ações V1 | `AgentIAAdvancedOptions`, `V1_AI_ACTIONS` |

## Mapa de telas — Automações

| # | Rota | Ação | Resultado |
|---|---|---|---|
| 7 | `/tarefas?tab=processos` | Templates de tarefa | `TaskProcessosTab` — **não envia WA** |
| 8 | Processos | Playbook follow-up | `FollowupPlaybookSection` |
| 9 | `?tab=modelos` | Editar textos | `AutomacoesModelosTab`; placeholders |
| 10 | Modelos | Preview com lead | `AutomationPreviewLeadPicker` |
| 11 | `?tab=gatilhos` | Toggle gatilhos | `AutomacoesSection`; `automations_config` |
| 12 | Gatilhos | Salvar gatilhos | Persistência academia; guard dirty ao trocar aba |
| 13 | Wizard | Guia inicial | `AutomacoesSetupWizard` até 3 passos done |
| 14 | Legacy | `?tab=agente` | Redirect → `/agente-ia` |

---

## A — Auditoria operacional

### Permissões

| Papel | Menu Agente IA | Editar prompt | Editar templates/gatilhos |
|---|---|---|---|
| **owner** | Sim | Sim | Sim |
| **member** | Sim | Se role team admin/owner | Conforme `canEditWhatsappTemplates` |
| **admin** | **Não** no accordion (`canConfigureAgenteIa` = owner \| member) | — | Pode editar se team admin |

`canConfigureAgenteIa` em `App.jsx`: `navRole === 'owner' || navRole === 'member'`.

### Checklist — Agente IA

1. [ ] Owner/member: `/agente-ia` acessível
2. [ ] Admin: item Agente ausente no menu Automações
3. [ ] Status WhatsApp exibido (`formatWaAgentStatus`)
4. [ ] Passo 1 incompleto → subtítulo «Passo 1 de 3»
5. [ ] Salvar prompt com validação `validatePromptFields`
6. [ ] Ativar agente → toast sucesso webhooks
7. [ ] Member sem permissão team → somente visualização prompt

### Checklist — Automações

1. [ ] `/automacoes` default `tab=modelos` ou wizard step se guia ativo
2. [ ] Wizard: modelos visitados ou textos customizados → passo 1 done
3. [ ] Wizard: Zapster OK → passo WhatsApp done
4. [ ] Wizard: `activeCount > 0` → passo gatilhos done
5. [ ] Modelos: placeholders `{{nome}}` validados
6. [ ] Gatilhos: readiness UX (`computeAutomationReadiness`) sem WA conectado
7. [ ] Sair de gatilhos com dirty → `ConfirmDialog`
8. [ ] Processos em Tarefas: copy deixa claro que não envia WhatsApp
10. [ ] `?wizard=1` reabre guia (`handleReopenGuide`)

### Critérios saudável vs regressão

**Saudável:** Gatilhos só disparam com WA conectado; templates com placeholders válidos; agente isolado por academia.

**Regressão:** Admin configura Zapster sem acesso; gatilho ativo sem modelo; perda de config ao trocar aba sem aviso.

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 7–8 min (dois blocos)

### Bloco 1 — Agente (4 min)

| Cena | Narração | Gancho |
|---|---|---|
| QR | "Conecto o WhatsApp da academia escaneando o QR." | Canal oficial |
| Prompt | "Ensino a IA como falar da academia e das aulas." | Marca consistente |
| Teste | "Testo aqui antes de liberar pro lead." | Segurança |
| Ativar | "Ligo o atendimento automático." | 24/7 |

### Bloco 2 — Automações (3 min)

| Cena | Narração | Gancho |
|---|---|---|
| Modelos | "Personalizo a mensagem quando o lead entra no funil." | Tom da casa |
| Gatilhos | "Escolho quais envios automáticos ficam ligados." | Controle |
| Processos | "Tarefas da equipe são separadas — isso não manda WhatsApp sozinho." | Clareza operacional |

---

## Variações

- **Onboarding CRM:** `connect_whatsapp` + `setup_ai` → `/agente-ia`; member bloqueado no banner
- **Financeiro:** lembretes de mensalidade em `/empresa?tab=financeiro&section=lembretes-whatsapp` (não confundir com gatilhos do funil)
- **Inbox:** conversas em [conversas-inbox.md](../crm/conversas-inbox.md)
- **Cron:** envios frequentes via `automations-frequent` (backend) — sem mutex entre invocações (ver AGENTS.md)

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-15 | — | Criação Fase 4 |
