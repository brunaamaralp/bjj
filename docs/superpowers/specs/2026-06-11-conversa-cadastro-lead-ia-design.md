# Conversa WhatsApp → Cadastro + Histórico do Lead — Design v1

## Objetivo

Estender o pipeline de ações da IA no WhatsApp para:

1. **Preencher o cadastro do lead incrementalmente** a partir da conversa (ex.: mãe informa que a filha se chama Manuela e tem 6 anos).
2. **Registrar na timeline do lead apenas momentos importantes** extraídos pela IA — sem espelhar todas as mensagens do Inbox.

Complementa [2026-06-09-ia-acoes-whatsapp-design.md](./2026-06-09-ia-acoes-whatsapp-design.md).

## Escopo v1

### Incluído

- Patch parcial de campos do lead (`name`, `age`, `type`, `parentName`, `responsavel`, `origin`, etc.) com alta confiança.
- Mapeamento responsável ↔ criança quando `perfil_lead` ou contexto indicar `responsavel_crianca`.
- Evento `lead_updated` com texto legível listando campos alterados.
- Evento `conversation_highlight` na timeline para momentos relevantes (dados compartilhados, interesse, objeção, agendamento, aviso operacional).
- Config `modules.ai_actions.conversation_timeline.enabled` (default `true`).
- Filtro **Conversa** no histórico do perfil do lead.

### Fora de escopo

- Espelhar todas as mensagens WhatsApp na timeline.
- Resumo periódico de sessão (`conversation_session_summary`) — fase futura.
- Matrícula completa, pagamentos, mudança de funil automática.
- Sobrescrever campos já preenchidos manualmente sem confirmação explícita do cliente.

## Problema atual

| Gap | Detalhe |
|-----|---------|
| Intake bloqueante | `INTAKE_REQUIRED_FIELDS = ['name', 'cpf', 'birthDate']` impede gravar nome/idade antes do CPF |
| Timeline sem conversa | Mensagens ficam só em `conversations.messages` |
| Evento genérico | `lead_updated` diz apenas "Cadastro atualizado pela IA" |

## Arquitetura

```
agentRespond
  └─ void runAgentActions()
       ├─ interpretAgentAction()     → action + timeline_highlight + state_patch
       ├─ recordConversationHighlight()  (se timeline habilitada)
       ├─ executeAgentAction()       → update parcial / intake completo
       ├─ notifyTeamOfAiAction()
       └─ recordAiAction()
```

Sem novo endpoint Vercel. Módulos novos/alterados em `lib/server/agentAction*.js`, `lib/server/updateStudentServer.js`, `lib/server/conversationTimeline.js`.

## Frente A — Cadastro incremental

### Dois tiers de atualização

| Tier | Contato | Campos | Condição de execução |
|------|---------|--------|----------------------|
| **partial** | `lead` (não matriculado) | Whitelist em `studentNlUpdates.js` exceto campos sensíveis de matrícula | ≥1 campo válido extraído, `confidence: high`, `missing: []` no tier partial |
| **full** | `student` ou lead em intake de matrícula | Requer `name`, `cpf`, `birthDate` | Comportamento atual preservado |

### Mapeamento responsável + criança

Quando a mensagem ou `perfil_lead: responsavel_crianca` indicar que o interessado é criança:

| Campo lead | Valor |
|------------|-------|
| `name` | Nome da criança |
| `age` | Idade informada |
| `type` | `Criança` |
| `parentName` | Nome do responsável (perfil WhatsApp, nome anterior do lead, ou extraído) |
| `responsavel` | Igual a `parentName` quando aplicável |
| `phone` | Mantém telefone do WhatsApp (responsável) |

Se o lead ainda tem `name` = telefone ou nome genérico (`Amigo`, vazio), o patch pode substituir por nome da criança.

### Merge seguro (`mergeLeadPatchSafely`)

Regras ao aplicar patch no documento existente:

1. Campo **vazio** no lead → aceita valor novo.
2. Campo **placeholder** (só dígitos = telefone, ou `Amigo`) → aceita valor novo.
3. Campo **já preenchido** com valor diferente → **não sobrescreve** em v1 (registra em `agent_state.intake.pending_overwrites` para futura confirmação).
4. Campo com **mesmo valor** → ignora (idempotente).

### Evento `lead_updated`

Texto exemplo:

> Cadastro atualizado pela IA: nome → Manuela, idade → 6, tipo → Criança, responsável → Ana Silva

`payload_json`: `{ fields: ['name','age','type','parentName'], source: 'whatsapp_ai' }`

## Frente B — Momentos importantes na timeline

### Decisão de produto

**Somente momentos importantes extraídos pela IA** — não espelhar o chat completo.

### Evento `conversation_highlight`

| Campo | Valor |
|-------|-------|
| `type` | `conversation_highlight` |
| `text` | Frase curta em português, 1–2 linhas |
| `created_by` | `ai-agent` |
| `payload_json` | `{ message_id, conversation_id, categories: string[] }` |

**Categorias v1:** `data_shared`, `interest`, `scheduling`, `objection`, `operational_notice`, `question_answered`.

### Quando registrar

| Condição | Registrar? |
|----------|------------|
| `timeline_highlight.confidence === 'high'` e texto não vazio | Sim |
| `conversation_timeline.enabled === false` | Não |
| Handoff humano ativo | Não |
| Mesmo `message_id` já tem highlight | Não (idempotência) |
| Ação primária já gerou `lead_updated` com mesmo conteúdo | Highlight opcional mais curto (ex.: "Interesse em aula experimental para criança de 6 anos") |

### Interpretação

O JSON de `interpretAgentAction` ganha campo opcional:

```json
{
  "action": "update_student",
  "timeline_highlight": {
    "text": "Responsável informou: filha Manuela, 6 anos, interesse em horários infantis",
    "confidence": "high",
    "categories": ["data_shared", "interest"]
  }
}
```

Heurística offline (sem API): mensagens com padrão `minha filha|meu filho|tem X anos` geram highlight + patch parcial.

## Política de execução (inalterada + extensões)

| Condição | Comportamento |
|----------|---------------|
| `confidence: high` + `missing: []` + ação permitida | Executa + notifica equipe |
| Lead + tier partial | `missing` calculado só para tier partial |
| Student ou tier full | Exige `name`, `cpf`, `birthDate` |
| Handoff humano ativo | Não executa escrita nem highlight |
| `conversation_timeline.enabled: false` | Não grava `conversation_highlight` |

## Config

```json
{
  "ai_actions": {
    "enabled": true,
    "actions": ["add_conversation_note", "add_lead_note", "update_student", "create_lead", "freeze_plan"],
    "conversation_timeline": {
      "enabled": true
    }
  }
}
```

Default: `conversation_timeline.enabled = true` quando ausente.

## UI

### Agente IA (`AgenteIASection.jsx`)

Toggle: **Registrar momentos importantes no histórico do lead** (sub-opção de ações automáticas).

### Perfil do lead (`LeadProfile.jsx`)

- Label: `conversation_highlight` → **Conversa WhatsApp**
- Label: `lead_updated` → texto detalhado (não só "Cadastro atualizado")
- Filtro pill **Conversa** → `conversation_highlight` (+ opcionalmente `lead_updated` com `source: whatsapp_ai`)
- URL: `?history=conversation`

## Guardrails

- IDs resolvidos server-side (`resolveWhatsAppContact`) — anti-IDOR.
- Idempotência highlight: `message_id` em `payload_json` do evento `conversation_highlight`.
- Idempotência ações: mantém `wasActionProcessed` via `ai_action`.
- Notificação + tarefa de conferência para patches de cadastro (mesmo padrão v1).
- Highlight **não** gera tarefa de conferência (informativo); patch de cadastro **sim**.

## Testes

- `agentStateMerge.test.js` — tiers partial vs full
- `agentActionInterpret.test.js` — heurística mãe/filha + timeline_highlight
- `updateStudentServer.test.js` — merge seguro + texto do evento
- `conversationTimeline.test.js` — idempotência highlight

## Fases de entrega

| Fase | Entrega |
|------|---------|
| 1 | Patch parcial + merge seguro + evento `lead_updated` detalhado |
| 2 | `conversation_highlight` + interpret + executor + idempotência |
| 3 | UI (filtro Conversa, toggle config) |

Fase 4 futura: resumo de sessão, confirmação antes de sobrescrever campos preenchidos.
