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
- **Financeiro / Lançamentos** — ver [docs/harness/finance-lancamentos.md](docs/harness/finance-lancamentos.md)

## Adicionando novos testes

Para cada novo módulo refatorado, criar:

- tests/unit/[modulo].test.js — lógica pura
- tests/integration/[modulo].test.js — fluxo com mocks

Rodar test:ci antes de marcar o módulo como concluído.

## Cobertura atual (junho 2026)

| Métrica | Atual | Threshold |
|---|---|---|
| Lines | 63.22% | 61% |
| Functions | 73.80% | 71% |
| Branches | 49.68% | 47% |

| Arquivo | Lines | Testes |
|---|---|---|
| financeTxAggregate.js | 100% | 14 |
| inboxConversationState.js | 100% | — |
| bankReconciliationMatcher.js | 91.25% | 21 |
| financeTxFields.js | 87.24% | 53 |
| bankReconciliationValidation.js | 85.36% | 22 |
| financeAccountCategories.js | 84.84% | 28 |
| financeCategories.js | 83.92% | 36 |
| conversationsStore.js | 63.52% | 46 |
| constants.js | 73.91% | — |
| agentRespond.js | 57.93% | 5 integração |
| zapsterWebhook.js | 55.94% | 6 integração |
| financeClosingData.js | 33.78% | 19 |
| conversationsRealtime.js | 0% | frontend/realtime |

## Próximos ciclos

- **financeClosingData.js** — 33% lines; listFinancialTxForMonth e
  getCashClosing requerem mock Appwrite + Query
- **agentRespond.js** — 57% lines; lógica de construção de prompt e
  envio via Zapster ainda sem cobertura
- **conversationsRealtime.js** — requer jsdom + Appwrite Realtime mock,
  deixar para ciclo dedicado
- Meta: lines ≥ 67% após financeClosingData async
