# Agente IA e WhatsApp

| Campo | Valor |
|---|---|
| **id** | `atendimento.agente.ia-whatsapp` |
| **módulo** | Atendimento |
| **personas** | owner, recepcionista (member com permissão de equipe); **admin sem acesso à página** |
| **rotas** | `/agente-ia` |
| **pré-requisitos** | Integração Zapster; papel com `canViewAgentSettings` |
| **status** | revisado (código) |
| **última revisão** | 2026-06-17 |
| **validação** | [VALIDATION.md](../VALIDATION.md) |

**Specs relacionadas:** [2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md](../../superpowers/specs/2026-06-17-agente-ia-config-ux-evolucao-PRODUCT.md) (UX painel config — P0)

**Harness relacionado:** `npm test -- zapsterInstancePhone automationUx` (adjacente)

**Arquivos-chave:** `src/pages/AIAgentSettings.jsx`, `src/components/academy/AgenteIASection.jsx`, `src/hooks/useZapsterWhatsAppConnection.js`, `src/lib/canEditAgentPrompt.js`

---

## Resumo

O **owner** ou **member** autorizado configura o assistente de IA em três passos: **conectar WhatsApp** (QR Zapster), **definir prompt/instruções** e **ativar** o atendimento automático com o botão **Ativar atendimento automático** (não há toggle no header do card). Antes disso, pode ligar **Recursos de IA** (toggle em linha de configuração) para copilot e comandos sem ativar respostas no WhatsApp. A página também oferece chat de teste e opções avançadas (FAQ, ações V1).

---

## Diagrama de fluxo

```mermaid
flowchart TD
  open["/agente-ia"] --> perm{canViewAgentSettings?}
  perm -->|Não| denied[Mensagem sem permissão]
  perm -->|Sim| steps[Setup 3 passos]
  steps --> s1[1 Conectar WhatsApp]
  s1 --> qr[QR / status Zapster]
  qr --> s2[2 Configurar assistente]
  s2 --> prompt[AgentIAPromptEditor]
  prompt --> s3[3 Botão Ativar atendimento]
  s3 --> active[iaAtiva + webhooks]
  active --> pause[Botão Pausar atendimento]
  active --> inbox[Conversas recebem respostas]
```

---

## Mapa de telas

| # | Rota | Componente | Ação do usuário | Resultado esperado |
|---|---|---|---|---|
| 1 | `/agente-ia` | `AIAgentSettings` → `AgenteIASection` | Abrir **Agente de Atendimento** | Header + painel setup |
| 2 | Passo 1 | Cartão WhatsApp | Escanear QR / reconectar | `card1Connected` |
| 3 | Passo 1 | Status | Ver desconectado/conectando/online | `formatWaAgentStatus` |
| 4 | Card 2 | Setting-row **Recursos de IA** | Toggle módulo IA (`.ai-switch`) | `aiModuleEnabled`; copilot/⌘K; **não** liga atendimento WA sozinho |
| 5 | Passo 2 | Editor de prompt | Instruções + regras | `isPromptConfigured` |
| 6 | Passo 2 | Salvar prompt | Persistir academia | Só se `canEditAgentPrompt` |
| 7 | Passo 2 | Chat de teste | `AgentIATestChat` | Simular resposta |
| 8 | Passo 3 | **Ativar atendimento automático** | Botão → `ConfirmDialog` (número WA, uso do ciclo) → `handleToggleIa(true)` |
| 9 | Passo 3 (ativo) | **Pausar atendimento automático** | Botão → `ConfirmDialog` → `handleToggleIa(false)` |
| 10 | PageHeader | Chip status | **Assistente ativo** / **Pausado** quando prompt configurado |
| 10 | Avançado | FAQ / ações | `AgentIAAdvancedOptions` | `V1_AI_ACTIONS`; toggle execução em setting-row |
| 11 | Link | Voltar conversas | `/conversas` | Inbox operacional |
| 12 | Menu | Agente no accordion Automações | Só se `canConfigureAgenteIa` | `naviMenu.js` |

**UX (P0):** Não existe toggle de `iaAtiva` no header ao lado do título. Ativar e pausar usam apenas os botões do rodapé do card (spec UX 2026-06-17).

---

## A — Auditoria operacional

### Pré-condições de dados

- [ ] Academia com instância WhatsApp provisionada (Zapster)
- [ ] Usuário **owner** ou **member** (`canViewAgentSettings`)

### Permissões por papel

| Papel | Ver `/agente-ia` | Editar prompt | Conectar WA |
|---|---|---|---|
| **owner** | Sim | Sim | Sim |
| **admin** | **Não** (`role === 'admin'`) | — | — |
| **member** | Sim | Se admin no time Appwrite | Conforme equipe |

`canEditAgentPrompt`: titular ou membership com role `admin`/`owner` no time.

Onboarding: member sem `canConfigureAgenteIa` recebe toast ao clicar passos IA/WhatsApp.

### Checklist passo a passo

1. [ ] Owner: `/agente-ia` carrega wizard 3 passos
2. [ ] Admin: mensagem «Você não tem permissão…»
3. [ ] Passo 1: QR exibido quando desconectado
4. [ ] Após conectar: passo 1 marcado done
5. [ ] **Recursos de IA:** toggle em setting-row; desligado bloqueia botão ativar (sem hint duplicado no CTA)
6. [ ] Passo 2: salvar prompt → `configDone`; badge **● Pronto para ativar**
7. [ ] Passo 3: botão **Ativar atendimento automático** (sem toggle no header)
8. [ ] Botão ativar disabled se WhatsApp desconectado ou Recursos de IA off
9. [ ] Com agente ativo: botão **Pausar**; badge **● Ativo** ou **● Ativo — WhatsApp desconectado**
10. [ ] Chat de teste responde sem enviar ao cliente real (ambiente de teste)
11. [ ] Billing guard bloqueia se assinatura exigir (`fetchWithBillingGuard`)
12. [ ] Legacy `/automacoes?tab=agente` → redirect `/agente-ia`
13. [ ] Trocar academia → conexão e prompt da academia correta
14. [ ] Inbox ([conversas-inbox.md](../crm/conversas-inbox.md)) reflete mensagens após ativo
15. [ ] CTA ativar/pausar oculto enquanto wizard, editor ou chat de teste abertos
16. [ ] Ativar abre confirmação com número WA e uso do ciclo (se aplicável)
17. [ ] Pausar abre confirmação antes de desligar
18. [ ] PageHeader exibe chip **Assistente ativo** ou **Pausado** com prompt configurado
19. [ ] Desligar Recursos de IA com agente ativo → pausa + toast informativo

### Estados de erro conhecidos

| Situação | Feedback esperado | Referência |
|---|---|---|
| Sem permissão | Card centralizado | `AgenteIASection` L1123 |
| Erro Zapster | `StatusBanner` / toast | `useZapsterWhatsAppConnection` |
| Prompt inválido | Validação `validatePromptFields` | limites de caracteres |
| Recursos de IA off | Botão ativar disabled; banner readonly (sem hint duplicado no CTA) | `AgentServiceControl`, banner readonly |
| WA desconectado | Botão ativar disabled + hint conectar card 1 | `AgentServiceControl` |

### Critérios de fluxo saudável vs regressão

**Saudável:** Três passos lineares; um único controle para ativar/pausar atendimento; reconexão automática; handoff humano no inbox preservado.

**Regressão:** Admin acessa agente; toggle de `iaAtiva` no header; IA ativa sem WhatsApp; prompt de outra academia; dois controles para mesma ação (toggle + botão).

---

## B — Roteiro de demonstração em vídeo

**Duração alvo:** 5 min

### Dados de demonstração sugeridos

| Entidade | Valor fictício |
|---|---|
| Academia | Demo WhatsApp |
| Prompt | Tom amigável, horários, preço experimental |

### Cenas

| Cena | Tela | Narração sugerida | Gancho de valor |
|---|---|---|---|
| 1 | Agente IA | "Três passos: WhatsApp, cérebro, ligar." | Setup guiado |
| 2 | QR | "Escaneio com o celular da academia — pronto." | Onboarding rápido |
| 3 | Prompt | "Ensino como a IA fala — testo antes de ir ao ar." | Controle de marca |
| 4 | Ativar | "Clico em Ativar atendimento automático — a IA passa a responder no WhatsApp." | 24/7 |
| 5 | Inbox | "Quando precisa de humano, cai aqui nas conversas." | Híbrido IA + equipe |

### O que não mostrar

- QR real de produção em gravação pública
- Chaves API Zapster

---

## Variações e atalhos

- **Onboarding:** `setup_ai` e `connect_whatsapp` → `/agente-ia`
- **Automações:** gatilhos WhatsApp exigem número conectado — ver [automacoes-funil.md](automacoes-funil.md)
- **Lembretes financeiros:** separados em `/empresa?tab=financeiro&section=lembretes-whatsapp`

---

## Histórico de revisão

| Data | Autor | Mudança |
|---|---|---|
| 2026-06-17 | — | P2: ConfirmDialog ativar/pausar, chip no PageHeader, toast IA off |
| 2026-06-17 | — | P1 UX: badges canônicos, banners consolidados, SettingRow shared, testes |
| 2026-06-17 | — | P0 UX config: botão ativar/pausar (sem toggle header); setting-row Recursos de IA; mapa e checklist |
| 2026-06-15 | — | Criação Fase 4 |
