# Test Harness — Inbox & Agente de IA

## Rodar

| Comando | Quando usar |
|---|---|
| npm test | Durante desenvolvimento, rápido |
| npm run test:watch | Modo watch ao editar |
| npm run test:ci | Antes de qualquer commit de refactor |

## Estrutura

| Caminho | Tipo | O que cobre |
|---|---|---|
| tests/unit/ | Unitário | Lógica pura, sem dependências externas |
| tests/integration/ | Integração | Fluxos com Appwrite/Zapster/Claude mockados |

## Regra de uso

Antes de rodar qualquer prompt de refatoração no Cursor:

1. npm run test:ci → todos passando → commit de checkpoint
2. Aplica o prompt de refatoração
3. npm run test:ci → verifica regressões
4. Se falhar → reverte ou corrige antes de continuar

## Módulos cobertos

- lib/constants.js — handoff, timeouts, retry config
- lib/server/zapsterWebhook.js — recebimento inbound, dispatch agente
- lib/server/agentRespond.js — resposta Claude, handoff guard, retry
- src/lib/inboxConversationState.js — updates otimistas read/unread
- Detecção de nova mensagem (helper puro)

## Adicionando novos testes

Para cada novo módulo refatorado, criar:

- tests/unit/[modulo].test.js — lógica pura
- tests/integration/[modulo].test.js — fluxo com mocks

Rodar test:ci antes de marcar o módulo como concluído.

## Cobertura atual (junho 2026)

| Métrica | Atual | Threshold |
|---|---|---|
| Lines | 57.02% | 51% |
| Functions | 66.25% | 62% |
| Branches | 43.06% | 37% |

| Arquivo | Lines | Testes |
|---|---|---|
| inboxConversationState.js | 100% | — |
| financeCategories.js | ~90% | 36 |
| financeAccountCategories.js | ~85% | 28 |
| financeTxFields.js | ~80% | 29 |
| financeTxAggregate.js | ~90% | 14 |
| bankReconciliationMatcher.js | ~85% | 21 |
| bankReconciliationValidation.js | ~85% | 22 |
| conversationsStore.js | 63.52% | 46 |
| constants.js | ~74% | — |
| agentRespond.js | ~58% | 5 integração |
| zapsterWebhook.js | ~56% | 6 integração |
| financeClosingData.js | ~30% | apenas puras |
| conversationsRealtime.js | 0% | frontend/realtime |

## Próximos ciclos

- **financeClosingData.js** — deriveClosingTxResultFromPeriodItems e
  buildClosingPayload têm lógica pura, candidatas ao próximo ciclo unitário
- **conversationsStore.js** — funções restantes: getAcademyDocument,
  getConversationDocById, updateConversationAiThreadCycle (mock Appwrite simples)
- **conversationsRealtime.js** — requer jsdom + Appwrite Realtime mock,
  deixar para ciclo dedicado de testes de frontend
- Meta: lines ≥ 63% após financeClosingData
