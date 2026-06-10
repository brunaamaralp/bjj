# IA com Ações no WhatsApp — Plano (implementado)

**Status:** Implementado em 2026-06-09.

**Spec:** [2026-06-09-ia-acoes-whatsapp-design.md](../specs/2026-06-09-ia-acoes-whatsapp-design.md)

## Módulos entregues

| Módulo | Função |
|--------|--------|
| `lib/server/agentActionExecutor.js` | Orquestrador pós-resposta |
| `lib/server/agentActionInterpret.js` | Interpretação Haiku + heurísticas |
| `lib/server/agentActionExecute.js` | Dispatcher de ações v1 |
| `lib/server/agentActionNotify.js` | Notificação + tarefa de conferência |
| `lib/server/agentActionAudit.js` | Idempotência via `lead_events` |
| `lib/server/agentActionPolicy.js` | Config `modules.ai_actions` |
| `lib/server/planFreezeExecute.js` | Trancamento server-side |
| `lib/server/updateStudentServer.js` | Cadastro parcial |
| `lib/server/createLeadServer.js` | Criar lead |
| `lib/server/conversationNoteServer.js` | Notas inbox/lead |
| `lib/server/agentContactResolve.js` | Resolver contato por telefone |
| `lib/server/agentStateMerge.js` | Estado multi-turno |

**Hook:** `agentRespond.js` chama `void runAgentActions(...)` após processar mensagem.

**Schema:** `agent_state` em `conversations` — rodar `node scripts/verify-and-fix-schema-integrations.mjs` em staging/produção.

**Testes:** `npm test -- --run lib/server/agentAction*.test.js lib/server/agentStateMerge.test.js lib/server/updateStudentServer.test.js`

## Checklist staging

- [ ] Provisionar `agent_state` na coleção conversations
- [ ] Mensagem de aviso → nota na conversa + tarefa "Conferir"
- [ ] Cadastro em várias mensagens → `update_student` + tarefa
- [ ] Pedido de trancamento + confirmação → freeze ativo + tarefa warning
- [ ] Handoff humano bloqueia novas ações
- [ ] ⌘K: "Trancar plano do João por 30 dias"
