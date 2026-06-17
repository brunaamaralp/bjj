# Log de auditoria unificado (SIEM interno) — TECH Spec

**Data:** 2026-06-17  
**PRODUCT:** [2026-06-17-audit-log-siem-PRODUCT.md](./2026-06-17-audit-log-siem-PRODUCT.md)  
**Status:** Fase 1 em implementação

---

## 1. Arquitetura

```mermaid
flowchart LR
  subgraph writers [Handlers]
    T[api/tasks.js]
    N[conversationNotesHandler]
    S[salesCreateHandler]
    L[teamMembers.js]
  end

  subgraph core [Fase 1]
    R[recordAuditEvent]
    E[auditEventTypes.js]
    M[mapEnvelopeToAcademyDoc]
  end

  subgraph store [(academy_events)]
  end

  subgraph proj [Projeções]
    LE[lead_events]
    UI[Equipe audit UI]
    AF[audit-feed Fase 3]
  end

  writers --> R
  E --> R
  R --> M --> store
  R -.->|projectToLeadTimeline| LE
  store --> UI
  store --> AF
```

**Armazenamento Fase 1–3:** reutilizar coleção `academy_events` (schema em `verify-and-fix-schema-crm.mjs`). Não criar coleção nova até volume exigir.

---

## 2. Envelope canônico (TypeScript mental model)

```ts
type AuditEventInput = {
  eventType: string;           // tasks.completed | team_member_added (legado)
  academyId: string;
  actor?: {
    type?: 'user' | 'system' | 'cron' | 'ai-agent' | 'webhook';
    id?: string;
    name?: string;
  };
  target?: { type?: string; id?: string; name?: string };
  context?: Record<string, string>;  // lead_id, conversation_id, sale_id, ...
  summary?: string;
  severity?: 'info' | 'warning' | 'critical';
  source?: string;             // api.tasks.patch
  changes?: Record<string, { from?: unknown; to?: unknown }>;
  payload?: Record<string, unknown>;
  request?: { ip?: string; userAgent?: string };
  timestamp?: string;
  projectToLeadTimeline?: {
    leadId: string;
    type: string;
    text: string;
    createdBy?: string;
    payloadJson?: object;
  };
};
```

Persistência flat (Appwrite):

| Campo coleção | Origem |
|---------------|--------|
| `event_type` | `eventType` |
| `academy_id` | `academyId` |
| `actor_user_id` | `actor.id` |
| `actor_name` | `actor.name` |
| `target_type` | `target.type` |
| `target_id` | `target.id` |
| `target_user_id` | legado equipe / `target.id` se type=user |
| `target_name` | `target.name` |
| `timestamp` | ISO |
| `payload_json` | envelope completo (sem segredos) |
| `previous_values` / `new_values` | serialização de `changes` quando existir |
| `ip`, `user_agent` | `request` |

Campos futuros no schema (`domain`, `summary`, `severity`, `source`) gravados via `createDocumentResilient` — omitidos se atributo ausente.

---

## 3. Fase 1 — Arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `lib/server/auditEventTypes.js` | Constantes `tasks.completed`, helpers `parseEventType`, `defaultSummary` |
| `lib/server/auditLog.js` | `recordAuditEvent`, `formatAuditEventSummary`, mapeamento → Appwrite |
| `lib/server/academyEvents.js` | `recordAcademyEvent` delega a `recordAuditEvent` (adapter legado) |
| `api/tasks.js` | Conclusão → `recordAuditEvent` (+ projeção timeline) |
| `lib/server/conversationNotesHandler.js` | POST nota → `inbox.note_added` |
| `lib/server/salesCreateHandler.js` | Venda → `sales.created` |
| `src/test/auditLog.test.js` | Mapeamento e sanitização |

---

## 4. `recordAuditEvent` — comportamento

1. Normalizar `actor` (default `system`).
2. Montar `summary` se ausente (`defaultSummary(eventType, ctx)`).
3. Stripar `password`, `token`, `jwt`, `tempPassword` de `payload`.
4. `createDocumentResilient` em `ACADEMY_EVENTS_COL`.
5. Se `projectToLeadTimeline` presente → `addLeadEventServer` (não bloqueia em erro).
6. Retornar `$id` ou `null`; erros → `console.warn`.

**Não usar** `waitUntil` na Fase 1 (handlers já são rápidos); avaliar na Fase 3 se latência subir.

---

## 5. Registry de eventos (`auditEventTypes.js`)

```js
export const AUDIT_SCHEMA_VERSION = 1;

export const AUDIT_EVENTS = {
  TASKS_COMPLETED: 'tasks.completed',
  TASKS_CREATED: 'tasks.created',
  INBOX_NOTE_ADDED: 'inbox.note_added',
  SALES_CREATED: 'sales.created',
  // legado — manter strings para filtros existentes
  TEAM_MEMBER_ADDED: 'team_member_added',
  ...
};
```

`parseEventType('tasks.completed')` → `{ domain: 'tasks', action: 'completed' }`  
`parseEventType('team_member_added')` → `{ domain: 'team', action: 'member_added' }`

---

## 6. Fase 3 — API (planejado, não Fase 1)

```
GET /api/reports?route=audit-feed
  &from=YYYY-MM-DD&to=YYYY-MM-DD
  &actor_id=
  &domain=tasks|sales|inbox|team|finance|inventory|crm
  &event_type=
  &lead_id=
  &cursor=&limit=50
```

Handler: `lib/server/auditFeedHandler.js`  
Auth: `ensureAuth` + `ensureAcademyAccess` + `assertAuditFeedAccess(academyDoc, me)`.

Resposta:

```json
{
  "ok": true,
  "events": [{ "id", "occurred_at", "event_type", "domain", "summary", "actor", "target", "context" }],
  "next_cursor": null,
  "has_more": false
}
```

Índices Appwrite (provisionar em Fase 3):

- `(academy_id, timestamp DESC)`
- `(academy_id, actor_user_id, timestamp DESC)`
- `(academy_id, event_type, timestamp DESC)`

---

## 7. Migração legada (Fase 2)

| Antes | Depois |
|-------|--------|
| `recordAcademyEvent({ event_type: 'team_member_added', ... })` | Adapter → `recordAuditEvent` |
| `recordFinancialAudit({ action: 'sale_create', ... })` | `finance.sale_created` + manter espelho em `financial_audit_log` até paridade |
| `addLeadEventServer` direto em handlers | Preferir `projectToLeadTimeline` em `recordAuditEvent` |

---

## 8. Testes Fase 1

- `auditLog.test.js`: summary default, strip secrets, legacy team adapter fields.
- `taskCompletionFields.test.js`: já cobre PATCH; integração audit opcional em teste unitário do mapper.

---

## 9. Rollout

1. Deploy Fase 1 (write path) — sem UI nova.
2. Provisionar `APPWRITE_ACADEMY_EVENTS_COLLECTION_ID` em prod se ausente.
3. Fase 3: UI + `audit-feed` + índices.
4. Monitorar volume (Appwrite docs/mês); se &gt; 100k/mês por academia, avaliar TTL + export Blob.
