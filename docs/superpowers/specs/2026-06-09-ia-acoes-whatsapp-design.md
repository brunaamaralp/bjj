# IA com Ações no WhatsApp — Design v1

## Objetivo

Após cada mensagem processada pelo agente WhatsApp, interpretar intenções operacionais e executar automaticamente quando `confidence: high` e dados completos. Sempre notificar a equipe (notificação interna + tarefa de conferência).

## Escopo v1

- `add_conversation_note` — nota na thread do inbox
- `add_lead_note` — nota no histórico do lead/aluno
- `update_student` — atualização parcial de cadastro (campos whitelist)
- `create_lead` — cadastro quando contato não existe
- `freeze_plan` — trancamento com confirmação explícita no chat

Fora de escopo: pagamentos, vendas, matrícula completa, funil.

## Política

| Condição | Comportamento |
|----------|---------------|
| `confidence: high` + `missing: []` + ação permitida | Executa + notifica equipe |
| Dados incompletos | Atualiza `agent_state`; IA continua coletando |
| `confidence: low/medium` | Não executa |
| Handoff humano ativo | Não executa ações de escrita |
| Falha na execução | Notificação `severity: high` + tarefa de correção |

## Arquitetura

`agentRespond` → `void runAgentActions()` → interpret → merge state → execute → notify → audit.

Sem novo endpoint Vercel; módulos em `lib/server/agentAction*.js`.

## Guardrails

- IDs resolvidos server-side por telefone/conversa (anti-IDOR)
- Idempotência por `message_id` em `lead_events` type `ai_action`
- Trancamento exige confirmação explícita do aluno
- `freeze_plan` via `executeFreezeServer` com `registeredBy: 'ai-agent'` (sem owner check HTTP)

## Config

`modules.ai_actions`: `{ enabled: true, actions: [...] }` — default todas ligadas.
