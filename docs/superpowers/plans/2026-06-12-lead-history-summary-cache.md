# Resumo IA do lead — cache com invalidação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir o resumo IA do histórico do lead com fingerprint de contexto, servir cache quando válido, e expor estado `stale` + botão “Atualizar” na UI.

**Architecture:** Lógica pura e orquestração em `lib/server/leadHistorySummary.js`; persistência em `leads.ai_history_summary_json`; handler `followupCopilotHandler` delega; UI em `FollowupCopilotButtons`.

**Tech Stack:** Node (Vercel `/api/agent`), Appwrite, Anthropic Claude, Vitest, React (Vite).

**Spec:** `docs/superpowers/specs/2026-06-12-lead-history-summary-cache-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/server/leadHistorySummary.js` | **Create** | Fingerprint, parse/store, context block, prompt, generate, resolve cache |
| `lib/server/leadHistorySummary.test.js` | **Create** | Testes unitários fingerprint + cache logic |
| `lib/server/followupCopilotHandler.js` | Modify | Delegar summary; aceitar `forceRefresh`; persistir |
| `lib/server/followupCopilotMessages.js` | Modify | Exportar timestamps no map (role, content, at) |
| `src/lib/followupCopilotApi.js` | Modify | `forceRefresh` param; tipos de resposta |
| `src/components/followup/FollowupCopilotButtons.jsx` | Modify | Stale badge, Atualizar, pontos_chave, generated_at |
| `src/lib/mapAppwriteLeadDoc.js` | Modify | Mapear `ai_history_summary_json` (opcional prefetch fase 2) |
| `scripts/verify-and-fix-schema-crm.mjs` | Modify | Atributo `ai_history_summary_json` |
| `docs/appwrite-setup.md` | Modify | Documentar novo atributo |

**Fora deste plano (fase 2):** unificar `agentRespond.generateSummary`; GET cache na abertura do perfil; CSS dedicado se necessário.

---

## Phase 1 — Core module + tests

### Task 1: Fingerprint e parse/store

**Files:**
- Create: `lib/server/leadHistorySummary.js`
- Create: `lib/server/leadHistorySummary.test.js`

- [ ] **Step 1: Write failing tests for fingerprint**

```javascript
// lib/server/leadHistorySummary.test.js
import { describe, it, expect } from 'vitest';
import {
  computeLeadHistoryFingerprint,
  parseStoredLeadHistorySummary,
  isSummaryFresh,
} from './leadHistorySummary.js';

describe('computeLeadHistoryFingerprint', () => {
  it('changes when last message timestamp changes', () => {
    const base = { lead: { $updatedAt: 'a', status: 'Novo', pipeline_stage: 'x' }, messages: [{ at: 't1' }], events: [] };
    const a = computeLeadHistoryFingerprint(base);
    const b = computeLeadHistoryFingerprint({ ...base, messages: [{ at: 't2' }] });
    expect(a).not.toBe(b);
  });

  it('changes when pipeline_stage changes', () => {
    const base = { lead: { $updatedAt: 'a', status: 'Novo', pipeline_stage: 'x' }, messages: [], events: [] };
    expect(computeLeadHistoryFingerprint(base)).not.toBe(
      computeLeadHistoryFingerprint({ ...base, lead: { ...base.lead, pipeline_stage: 'y' } })
    );
  });
});

describe('isSummaryFresh', () => {
  it('returns true when fingerprints match', () => {
    const fp = 'abc';
    const stored = parseStoredLeadHistorySummary(JSON.stringify({ v: 1, text: 'x', context_fingerprint: fp }));
    expect(isSummaryFresh(stored, fp)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test -- lib/server/leadHistorySummary.test.js
```

- [ ] **Step 3: Implement minimal module**

Implementar:
- `parseStoredLeadHistorySummary(raw)` → `{ v, text, pontos_chave, pendencias_mencionadas, generated_at, context_fingerprint, source_counts } | null`
- `serializeLeadHistorySummary(payload)` → string ≤ 8192
- `computeLeadHistoryFingerprint({ lead, messages, events })` → string determinística (ex.: join com `|`, sem crypto obrigatório)
- `isSummaryFresh(stored, currentFingerprint)` → boolean

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/server/leadHistorySummary.js lib/server/leadHistorySummary.test.js
git commit -m "feat(ai): add lead history summary fingerprint and parse helpers"
```

---

### Task 2: Context block + prompt constants

**Files:**
- Modify: `lib/server/leadHistorySummary.js`
- Modify: `lib/server/followupCopilotMessages.js`
- Modify: `lib/server/leadHistorySummary.test.js`

- [ ] **Step 1: Extend message mapper to include `at`**

Em `mapMessagesForCopilotContext`, preservar `at` de `timestamp`:

```javascript
.map((m) => ({
  role: m.role === 'assistant' ? 'assistente' : 'cliente',
  content: String(m.content || '').trim(),
  at: String(m.timestamp || m.at || '').trim(),
}))
```

- [ ] **Step 2: Write failing test for `buildLeadHistoryContextBlock`**

Assert:
- event line contains timestamp
- event type label in PT (ex.: `schedule` → `agendamento`)
- includes `pipeline_stage`
- truncation note when messages.length > window

- [ ] **Step 3: Implement `buildLeadHistoryContextBlock` + `LEAD_HISTORY_SUMMARY_SYSTEM`**

Extrair labels:

```javascript
const EVENT_TYPE_LABELS = {
  schedule: 'agendamento',
  note: 'nota',
  stage_change: 'mudança de etapa',
  conversation_highlight: 'destaque da conversa',
  // ...
};
```

Helper `formatContextTimestamp(iso)` → `YYYY-MM-DD HH:mm` (pt-BR).

`daysSinceLastContact(lead, messages, events)` substitui “dias desde a aula”.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

---

### Task 3: Resolve cache orchestration (sem Claude nos testes)

**Files:**
- Modify: `lib/server/leadHistorySummary.js`
- Modify: `lib/server/leadHistorySummary.test.js`

- [ ] **Step 1: Write failing tests for `resolveLeadHistorySummary`**

Mock `generateFn` injetável:

```javascript
it('returns cache when fingerprint matches and not forceRefresh', async () => {
  const fp = computeLeadHistoryFingerprint(fixtures);
  const lead = { ai_history_summary_json: serializeLeadHistorySummary({ v:1, text:'cached', context_fingerprint: fp, generated_at: '...' }) };
  const generateFn = vi.fn();
  const out = await resolveLeadHistorySummary({ lead, ...fixtures, forceRefresh: false, generateFn });
  expect(out.from_cache).toBe(true);
  expect(generateFn).not.toHaveBeenCalled();
});

it('calls generate when forceRefresh even if fresh', async () => { /* ... */ });
it('returns stale true with old text when fingerprint differs and not forceRefresh', async () => { /* ... */ });
```

- [ ] **Step 2: Implement `resolveLeadHistorySummary`**

Lógica:
1. Compute current fingerprint
2. Parse stored
3. If `!forceRefresh && stored && isSummaryFresh` → return cache
4. If `!forceRefresh && stored && !isSummaryFresh` → return `{ ...stored, stale: true, from_cache: true }` **sem** chamar Claude
5. If `forceRefresh || !stored` → `generateFn(context)` → serialize → `{ from_cache: false, stale: false }`

Exportar interface para handler injetar `callClaude` real.

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

---

## Phase 2 — Handler + schema + persistência

### Task 4: Appwrite attribute

**Files:**
- Modify: `scripts/verify-and-fix-schema-crm.mjs`
- Modify: `docs/appwrite-setup.md`

- [ ] **Step 1: Add `ai_history_summary_json` to `LEADS_ATTRS`**

```javascript
{ key: 'ai_history_summary_json', type: 'string', size: 8192 },
```

- [ ] **Step 2: Run provision (dry-run or dev)**

```bash
node scripts/verify-and-fix-schema-crm.mjs
```

- [ ] **Step 3: Document in appwrite-setup.md**

- [ ] **Step 4: Commit**

---

### Task 5: Wire `followupCopilotHandler`

**Files:**
- Modify: `lib/server/followupCopilotHandler.js`

- [ ] **Step 1: Replace inline SUMMARY_SYSTEM + buildContextBlock**

Importar de `leadHistorySummary.js`:
- `buildLeadHistoryContextBlock`
- `LEAD_HISTORY_SUMMARY_SYSTEM`
- `resolveLeadHistorySummary`
- `generateLeadHistorySummary` (wraps `callClaude`)

- [ ] **Step 2: Read `forceRefresh` from body**

```javascript
const forceRefresh = body.forceRefresh === true || body.force_refresh === true;
```

- [ ] **Step 3: On generate success, persist to lead**

```javascript
await databases.updateDocument(DB_ID, LEADS_COL, leadId, {
  ai_history_summary_json: serializeLeadHistorySummary(payload),
});
```

- [ ] **Step 4: Extend JSON response**

Incluir `pontos_chave`, `pendencias_mencionadas`, `generated_at`, `from_cache`, `stale`, `context_fingerprint`.

- [ ] **Step 5: Manual smoke test**

POST local/dev com lead de teste; segundo POST deve retornar `from_cache: true`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(ai): persist lead history summary with cache invalidation"
```

---

## Phase 3 — Frontend

### Task 6: API client

**Files:**
- Modify: `src/lib/followupCopilotApi.js`

- [ ] **Step 1: Add `forceRefresh` optional param**

```javascript
export async function fetchFollowupCopilot({ academyId, leadId, mode, templateKey, nextAction, forceRefresh }) {
  // body: { ..., forceRefresh: forceRefresh || undefined }
}
```

- [ ] **Step 2: Commit**

---

### Task 7: UI — stale state + refresh

**Files:**
- Modify: `src/components/followup/FollowupCopilotButtons.jsx`

- [ ] **Step 1: Extend state**

```javascript
const [summaryMeta, setSummaryMeta] = useState({ generatedAt: '', stale: false, fromCache: false, pontosChave: [], pendencias: [] });
```

- [ ] **Step 2: `loadSummary({ forceRefresh })`**

- Primeiro clique: `forceRefresh: false`
- Botão “Atualizar”: `forceRefresh: true`

- [ ] **Step 3: Render panel**

- Meta line: `Gerado em {formatDate(generated_at)}` + badge “Desatualizado” se `stale`
- Lista `pontos_chave` (se houver)
- Botões: “Atualizar” (primary quando stale), “Fechar”

- [ ] **Step 4: Ajustar audit event**

Manter `addLeadEvent` tipo `ai_followup_draft` apenas em generate real (`!from_cache || forceRefresh`), não em cache hit.

- [ ] **Step 5: Manual UX check**

Dashboard + LeadProfile + Inbox banner.

- [ ] **Step 6: Commit**

---

## Phase 4 — Polish (opcional na mesma PR)

### Task 8: Temperature + prompt JSON robustness

- [ ] Baixar temperature para `0.1` no summary
- [ ] Fallback se JSON inválido: usar raw text como `summary`, arrays vazios
- [ ] Teste de extract JSON com markdown fence

### Task 9: Excluir `ai_history_summary` da timeline

- [ ] Se registrar evento de auditoria no futuro, garantir filtro em `LeadProfile.jsx` (`eventTypeFilter`) exclui tipo `ai_history_summary`

---

## Verification checklist

- [ ] `npm test -- lib/server/leadHistorySummary.test.js`
- [ ] `npm test -- lib/server/followupCopilotMessages.test.js` (regression)
- [ ] Dois POSTs seguidos summary → segundo `from_cache: true`
- [ ] Adicionar nota manual → próximo POST `stale: true`, texto antigo visível
- [ ] “Atualizar” → novo texto + `stale: false`
- [ ] Módulo IA desabilitado / billing → erros existentes intactos
- [ ] `mode: draft` inalterado

---

## Rollout

1. Deploy backend + provision schema **antes** do frontend (campo optional — safe)
2. Deploy frontend com UI stale/refresh
3. Monitorar logs `followup-copilot/claude` — expect queda de chamadas repetidas

---

## Fase 2 (backlog)

- [ ] GET cache na abertura do perfil (`LeadProfile` prefetch)
- [ ] Unificar prompt com `agentRespond.generateSummary` (incremental)
- [ ] Invalidar cache no webhook após `addLeadEvent` / nova mensagem (só bump — sem regerar)
- [ ] Estender para alunos matriculados se necessário
