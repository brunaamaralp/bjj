# Hero follow-up em tempo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O hero do Dashboard (e demais telas de retorno) reflete respostas WhatsApp em segundos, sem pedir refresh manual, mesmo quando o usuário não está no Inbox.

**Architecture:** Extrair a subscription Appwrite Realtime de conversas para um módulo compartilhado. `useFollowupEventsByLead` passa a ativar realtime + polling adaptativo (fallback). O Inbox reutiliza o mesmo primitivo. Opcionalmente, alinhar a linha resumo do hero para não contar retornos que já têm contato no ciclo.

**Tech Stack:** React hooks, Appwrite Realtime (`realtime.subscribe`), evento `FOLLOWUP_INBOUND_CHANGED`, API `GET /api/agent?route=followup-inbound`, Vitest.

**Contexto atual (pós-auditoria):**
- Hero usa `hasContactInCycle` → depende de `inboundAfterByLead/Phone`.
- Já existe: cache SWR, polling 90s, evento do Inbox, refresh no botão ↻.
- Lacuna: até ~90s de atraso no Dashboard sem Inbox aberto; linha resumo conta retornos que já responderam.

---

## Decisão de desenho

| Opção | Latência | Custo API | Complexidade | Recomendação |
|-------|----------|-----------|--------------|--------------|
| Só polling 30s | ~30s | Alto (2× vs 60s) | Baixa | Fallback apenas |
| Realtime no Dashboard | ~1s | Baixo (1 GET ocasional) | Média | **Principal** |
| Realtime + polling adaptativo | ~1s + resiliência | Moderado | Média | **Escolhida** |

**Polling adaptativo proposto:**
- Realtime conectado + aba visível → poll a cada **120s** (safety net).
- Realtime desconectado + aba visível → poll a cada **45s**.
- Aba oculta → sem poll.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/conversationsRealtime.js` | **Criar** — subscribe/unsubscribe, filtro por academy, extrai inbound |
| `src/hooks/useFollowupInboundRealtime.js` | **Criar** — hook fino: realtime + estado `realtimeOn` |
| `src/hooks/useFollowupEventsByLead.js` | **Modificar** — integrar realtime + intervalos adaptativos |
| `src/hooks/useInboxRealtimeSync.js` | **Modificar** — delegar subscribe ao módulo compartilhado |
| `src/lib/dashboardDayBriefing.js` | **Modificar** (fase 2) — contagem de retornos sem contato |
| `src/test/conversationsRealtime.test.js` | **Criar** — handler de evento, filtro academy |
| `src/test/useFollowupInboundRealtime.test.js` | **Criar** — connect/disconnect, emite evento |
| `src/test/dashboardDayBriefing.test.js` | **Modificar** — resumo exclui quem já respondeu |

---

## Fase 1 — Realtime compartilhado (core) ✅

### Task 1: Módulo `conversationsRealtime` ✅

**Files:**
- Create: `src/lib/conversationsRealtime.js`
- Test: `src/test/conversationsRealtime.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// Filtra evento de outra academia
// Emite patch quando payload tem last_user_msg_at ou messages_recent user
// Ignora mensagens assistant-only
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- src/test/conversationsRealtime.test.js
```

- [ ] **Step 3: Implement minimal module**

API sugerida:

```javascript
export function buildConversationsChannel(dbId, colId) { ... }

export function shouldProcessConversationEvent(payload, expectedAcademyId) { ... }

export function conversationEventToInboundPatch(payload) {
  // { leadId, phone, lastUserMsgAt } | null
}

export function subscribeConversationsRealtime({ channel, onInboundPatch, onStatus }) {
  // returns { close() }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(followup): add shared conversations realtime helper"
```

---

### Task 2: Hook `useFollowupInboundRealtime` ✅

**Files:**
- Create: `src/hooks/useFollowupInboundRealtime.js`
- Test: `src/test/useFollowupInboundRealtime.test.js`

- [ ] **Step 1: Write failing test** — monta hook com academyId mock, simula evento realtime, verifica `emitFollowupInboundChanged` (mock).

- [ ] **Step 2: Implement hook**
  - Subscribe após `REALTIME_SUBSCRIBE_DELAY_MS` (300ms), igual Inbox.
  - Debounce 250ms antes de patch (evitar rajadas).
  - Expõe `{ realtimeOn: boolean }`.
  - Cleanup no unmount.

- [ ] **Step 3: Run tests + commit**

---

### Task 3: Integrar em `useFollowupEventsByLead` ✅

**Files:**
- Modify: `src/hooks/useFollowupEventsByLead.js`

- [ ] **Step 1: Adicionar opção**

```javascript
useFollowupEventsByLead(academyId, {
  defer = false,
  enableRealtime = true, // novo
} = {})
```

- [ ] **Step 2: Chamar `useFollowupInboundRealtime(academyId, { enabled: enableRealtime })`**

- [ ] **Step 3: Substituir `INBOUND_POLL_MS` fixo por helper**

```javascript
function getInboundPollMs(realtimeOn, hidden) {
  if (hidden) return null;
  return realtimeOn ? 120_000 : 45_000;
}
```

- [ ] **Step 4: Manter listener `FOLLOWUP_INBOUND_CHANGED`** (Inbox + outras abas).

- [ ] **Step 5: Teste unitário** — poll interval muda conforme `realtimeOn` (extrair helper para `src/lib/followupInboundPoll.js` se necessário).

- [ ] **Step 6: Commit**

---

### Task 4: Refatorar Inbox para reutilizar módulo ✅

**Files:**
- Modify: `src/hooks/useInboxRealtimeSync.js`

- [ ] **Step 1:** Manter comportamento atual (loadList/loadThread).
- [ ] **Step 2:** Usar `subscribeConversationsRealtime` + `conversationEventToInboundPatch` em vez de duplicar lógica de academy/phone.
- [ ] **Step 3:** Rodar testes existentes:

```bash
npm test -- src/test/Inbox.test.jsx src/test/useInboxAutoRefresh.test.js
```

- [ ] **Step 4: Commit**

---

## Fase 2 — Hero copy alinhada ✅

### Task 5: Linha resumo não conta quem já respondeu

**Files:**
- Modify: `src/lib/dashboardDayBriefing.js` (`buildDaySummaryLine`)
- Modify: `src/pages/Dashboard.jsx` (passar leads filtrados ou flag)
- Test: `src/test/dashboardDayBriefing.test.js`

- [ ] **Step 1: Failing test**

```javascript
// followUps: 2 total, 1 com hasContactInCycle → "retomar 1 retorno"
```

- [ ] **Step 2: Filtrar `followUpsNeedingContact = followUps.filter(l => !l.hasContactInCycle)` antes de contar**

- [ ] **Step 3: Pass tests + commit**

---

## Fase 3 — Verificação manual

### Checklist QA

- [ ] Lead com aula ontem, sem WhatsApp → hero: *"Ainda sem retorno. Vale uma mensagem."*
- [ ] Enviar mensagem **como cliente** (ou simular webhook) com Dashboard aberto **sem** Inbox → em ≤5s hero muda para *"já respondeu no WhatsApp"*
- [ ] Mesmo cenário com Inbox em outra aba → Dashboard atualiza via evento
- [ ] Desconectar realtime (dev: bloquear WS) → em ≤45s hero ainda atualiza via poll
- [ ] Botão ↻ continua forçando refresh completo
- [ ] Pipeline e LeadProfile refletem mesma mudança (mesmo hook)

### Comandos

```bash
npm test -- src/test/conversationsRealtime.test.js src/test/useFollowupInboundRealtime.test.js src/test/followupInbound.test.js src/test/dashboardDayBriefing.test.js src/test/followupState.test.js
npx eslint src/lib/conversationsRealtime.js src/hooks/useFollowupInboundRealtime.js src/hooks/useFollowupEventsByLead.js src/hooks/useInboxRealtimeSync.js
```

---

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Duas subscriptions (Inbox + Dashboard) | Mesmo padrão Appwrite; cada página faz cleanup no unmount. Uma aba = uma sub. |
| Rajada de GET `/followup-inbound` | Realtime patch local; poll só fallback. Debounce 250ms. |
| Payload realtime sem `last_user_msg_at` | `extractLastUserMessageAt` já varre `messages_recent`. |
| Billing gate na API inbound | Poll falhou silenciosamente hoje; manter — realtime patch ainda funciona. |

---

## Fora de escopo (YAGNI)

- Realtime na coleção `lead_events` (contato manual já patcha cache).
- Push notification / toast quando lead responde.
- Alterar prioridade “aula em 2h” vs “já respondeu” (regra de negócio separada).

---

## Ordem de execução recomendada

1. Task 1 → 2 → 3 (valor imediato no Dashboard)
2. Task 4 (DRY, menos regressão Inbox)
3. Task 5 (copy do hero, baixo risco)
4. QA manual

**Estimativa:** ~2–3h de implementação + testes.
