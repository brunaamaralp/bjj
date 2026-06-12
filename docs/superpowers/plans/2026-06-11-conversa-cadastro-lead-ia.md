# Conversa → Cadastro + Histórico do Lead (IA) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A IA preenche o cadastro do lead incrementalmente a partir do WhatsApp e registra momentos importantes na timeline — sem espelhar todas as mensagens.

**Architecture:** Estender `interpretAgentAction` com tier partial/full e `timeline_highlight`; novo módulo `conversationTimeline.js` para gravar eventos; `mergeLeadPatchSafely` em `updateStudentServer.js` antes do `updateDocument`.

**Spec:** [2026-06-11-conversa-cadastro-lead-ia-design.md](../specs/2026-06-11-conversa-cadastro-lead-ia-design.md)

**Tech Stack:** Node.js, Appwrite, Anthropic Haiku, Vitest, React (LeadProfile, AgenteIASection)

---

## File map

| File | Responsibility |
|------|----------------|
| `lib/server/agentStateMerge.js` | Tiers partial/full, `intakeMissingFieldsForTier` |
| `lib/server/agentActionInterpret.js` | Prompt + heurística mãe/filha + `timeline_highlight` |
| `lib/server/updateStudentServer.js` | `mergeLeadPatchSafely`, evento detalhado |
| `lib/server/conversationTimeline.js` | **Create** — gravar highlight com idempotência |
| `lib/server/agentActionExecutor.js` | Chamar highlight; passar tier ao executor |
| `lib/server/agentActionPolicy.js` | `isConversationTimelineEnabled` |
| `lib/agentActionConfig.js` | Normalizar `conversation_timeline` |
| `src/pages/LeadProfile.jsx` | Labels + filtro Conversa |
| `src/lib/leadProfileUrlState.js` | Filtro `conversation` na URL |
| `src/components/academy/AgenteIASection.jsx` | Toggle timeline |

---

### Task 1: Tiers partial/full em agentStateMerge

**Files:**
- Modify: `lib/server/agentStateMerge.js`
- Test: `lib/server/agentStateMerge.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
import { describe, it, expect } from 'vitest';
import {
  intakeMissingFieldsForTier,
  PATCHABLE_LEAD_FIELDS,
  INTAKE_FULL_FIELDS,
} from './agentStateMerge.js';

describe('intakeMissingFieldsForTier', () => {
  it('partial tier empty when at least one patchable field present', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela', age: '6' }, 'partial')).toEqual([]);
  });

  it('partial tier still empty without cpf', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'partial')).toEqual([]);
  });

  it('full tier requires name cpf birthDate', () => {
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'full')).toContain('cpf');
    expect(intakeMissingFieldsForTier({ name: 'Manuela' }, 'full')).toContain('birthDate');
  });

  it('full tier complete when all present', () => {
    expect(
      intakeMissingFieldsForTier(
        { name: 'Manuela', cpf: '12345678901', birthDate: '2019-01-01' },
        'full'
      )
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run lib/server/agentStateMerge.test.js`
Expected: FAIL — `intakeMissingFieldsForTier` not exported

- [ ] **Step 3: Implement**

Em `agentStateMerge.js`:

```javascript
/** Campos que podem ser gravados em patch parcial de lead. */
export const PATCHABLE_LEAD_FIELDS = [
  'name', 'age', 'type', 'parentName', 'responsavel', 'origin', 'phone',
  'emergencyContact', 'emergencyPhone', 'belt',
];

/** Intake completo (matrícula). */
export const INTAKE_FULL_FIELDS = ['name', 'cpf', 'birthDate'];

/** @deprecated use INTAKE_FULL_FIELDS */
export const INTAKE_REQUIRED_FIELDS = INTAKE_FULL_FIELDS;

/**
 * @param {object} collected
 * @param {'partial'|'full'} tier
 * @returns {string[]}
 */
export function intakeMissingFieldsForTier(collected, tier = 'full') {
  const c = collected && typeof collected === 'object' ? collected : {};
  if (tier === 'partial') {
    const hasAny = PATCHABLE_LEAD_FIELDS.some((f) => String(c[f] || '').trim());
    return hasAny ? [] : ['patchable_field'];
  }
  const missing = [];
  for (const f of INTAKE_FULL_FIELDS) {
    if (!String(c[f] || '').trim()) missing.push(f);
  }
  return missing;
}

/** @param {object} collected */
export function intakeMissingFields(collected) {
  return intakeMissingFieldsForTier(collected, 'full');
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --run lib/server/agentStateMerge.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/server/agentStateMerge.js lib/server/agentStateMerge.test.js
git commit -m "feat(agent): tiers partial/full para intake de lead via IA"
```

---

### Task 2: mergeLeadPatchSafely + evento detalhado

**Files:**
- Modify: `lib/server/updateStudentServer.js`
- Test: `lib/server/updateStudentServer.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
import { describe, it, expect } from 'vitest';
import {
  nlSanitizedToStudentPatch,
  mergeLeadPatchSafely,
  formatLeadUpdateEventText,
} from './updateStudentServer.js';

describe('mergeLeadPatchSafely', () => {
  const lead = { name: '37999999999', phone: '37999999999', age: '', type: '' };

  it('fills empty fields', () => {
    const patch = { name: 'Manuela', age: '6', type: 'Criança' };
    const { applied, skipped } = mergeLeadPatchSafely(lead, patch);
    expect(applied).toEqual({ name: 'Manuela', age: '6', type: 'Criança' });
    expect(skipped).toEqual([]);
  });

  it('does not overwrite confirmed name', () => {
    const existing = { name: 'João Silva', age: '10' };
    const { applied, skipped } = mergeLeadPatchSafely(existing, { name: 'Pedro' });
    expect(applied).toEqual({});
    expect(skipped).toContain('name');
  });

  it('replaces phone-as-name placeholder', () => {
    const { applied } = mergeLeadPatchSafely(lead, { name: 'Manuela' });
    expect(applied.name).toBe('Manuela');
  });
});

describe('formatLeadUpdateEventText', () => {
  it('lists applied fields in Portuguese', () => {
    const text = formatLeadUpdateEventText({ name: 'Manuela', age: '6' });
    expect(text).toContain('Manuela');
    expect(text).toContain('6');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- --run lib/server/updateStudentServer.test.js`

- [ ] **Step 3: Implement**

Adicionar em `updateStudentServer.js`:

```javascript
const PLACEHOLDER_NAME_RE = /^(amigo|cliente|contato|\d{10,15})$/i;

export function isLeadNamePlaceholder(name, phone = '') {
  const n = String(name || '').trim();
  if (!n) return true;
  const digits = n.replace(/\D/g, '');
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  if (digits && phoneDigits && digits === phoneDigits) return true;
  return PLACEHOLDER_NAME_RE.test(n);
}

const FIELD_LABELS = {
  name: 'nome',
  age: 'idade',
  type: 'tipo',
  parentName: 'responsável',
  responsavel: 'responsável',
  origin: 'origem',
  cpf: 'CPF',
  birth_date: 'nascimento',
};

/**
 * @param {object} existingLead
 * @param {Record<string, string>} patch
 */
export function mergeLeadPatchSafely(existingLead, patch) {
  const applied = {};
  const skipped = [];
  const doc = existingLead || {};
  const phone = doc.phone || doc.phone_number || '';

  for (const [key, value] of Object.entries(patch || {})) {
    const next = String(value ?? '').trim();
    if (!next) continue;
    const current = String(doc[key] ?? '').trim();

    if (key === 'name' && isLeadNamePlaceholder(current, phone)) {
      applied[key] = next;
      continue;
    }
    if (!current) {
      applied[key] = next;
      continue;
    }
    if (current === next) continue;
    skipped.push(key);
  }
  return { applied, skipped };
}

/** @param {Record<string, string>} applied */
export function formatLeadUpdateEventText(applied) {
  const parts = Object.entries(applied || {}).map(
    ([k, v]) => `${FIELD_LABELS[k] || k} → ${v}`
  );
  if (!parts.length) return 'Cadastro atualizado pela IA';
  return `Cadastro atualizado pela IA: ${parts.join(', ')}`;
}
```

Em `updateStudentServer`, no branch `kind === 'lead'`:

```javascript
const leadPatch = nlSanitizedToLeadPatch(sanitized);
const { applied, skipped } = mergeLeadPatchSafely(contact?.doc || {}, leadPatch);
if (Object.keys(applied).length === 0) {
  return { ok: false, error: skipped.length ? 'fields_already_set' : 'no_valid_fields' };
}
await databases.updateDocument(DB_ID, LEADS_COL, leadId, applied);
await addLeadEventServer({
  academyId: aid,
  leadId,
  type: 'lead_updated',
  text: formatLeadUpdateEventText(applied),
  createdBy: 'ai-agent',
  payloadJson: { fields: Object.keys(applied), skipped, source: 'whatsapp_ai' },
});
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add lib/server/updateStudentServer.js lib/server/updateStudentServer.test.js
git commit -m "feat(lead): merge seguro e evento detalhado em update via IA"
```

---

### Task 3: Heurística mãe/filha + timeline_highlight no interpret

**Files:**
- Modify: `lib/server/agentActionInterpret.js`
- Test: `lib/server/agentActionInterpret.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
it('detects child info from parent message without API', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { interpretAgentAction } = await import('./agentActionInterpret.js');
  const out = await interpretAgentAction({
    message: 'Quero aula para minha filha Manuela, ela tem 6 anos',
    history: [],
    agentState: {},
    contact: { kind: 'lead', id: 'L1', name: '37999998888', doc: { name: '37999998888', phone: '37999998888' } },
    phone: '37999998888',
  });
  expect(out.action).toBe('update_student');
  expect(out.confidence).toBe('high');
  expect(out.data?.name || out.state_patch?.intake?.collected?.name).toMatch(/Manuela/i);
  expect(out.timeline_highlight?.confidence).toBe('high');
  expect(out.timeline_highlight?.text).toBeTruthy();
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement heurística em `interpretHeuristic`**

Padrão sugerido:

```javascript
const CHILD_INFO_RE =
  /\b(?:minha filha|meu filho|minha filha|meu filh[oa])\s+([A-Za-zÀ-ú]{2,40}).*?(?:tem|com)\s+(\d{1,2})\s*anos?/i;

// no interpretHeuristic, antes do return null:
const childMatch = msg.match(CHILD_INFO_RE);
if (childMatch && contact?.kind === 'lead') {
  const childName = childMatch[1].trim();
  const age = childMatch[2].trim();
  const parentName = String(contact.name || '').trim();
  const parentFromPhone = isLeadNamePlaceholder(parentName, phone) ? '' : parentName;
  return {
    action: 'update_student',
    confidence: 'high',
    data: {
      name: childName,
      age,
      type: 'Criança',
      ...(parentFromPhone ? { parentName: parentFromPhone, responsavel: parentFromPhone } : {}),
    },
    missing: [],
    summary: `Dados da criança: ${childName}, ${age} anos`,
    state_patch: {
      intake: {
        collected: { name: childName, age, type: 'Criança', ...(parentFromPhone ? { parentName: parentFromPhone } : {}) },
      },
    },
    timeline_highlight: {
      text: `Responsável informou: ${childName}, ${age} anos — interesse em aula`,
      confidence: 'high',
      categories: ['data_shared', 'interest'],
    },
  };
}
```

Importar `isLeadNamePlaceholder` de `updateStudentServer.js` (ou extrair para `lib/leadNamePlaceholder.js` se import circular).

Atualizar `buildSystemPrompt`:

- Documentar `timeline_highlight` no JSON de resposta.
- Regra: lead partial não exige cpf/birthDate.
- Regra: `responsavel_crianca` → `name` = criança, `parentName` = responsável.

No parse final de `interpretAgentAction`, após `action === 'update_student'`:

```javascript
import { intakeMissingFieldsForTier } from './agentStateMerge.js';

const tier = contact?.kind === 'lead' ? 'partial' : 'full';
if (action === 'update_student' && state_patch.intake?.collected) {
  const miss = intakeMissingFieldsForTier(state_patch.intake.collected, tier);
  // replace missing array for partial tier
  ...
}
```

Retornar `timeline_highlight: parsed.timeline_highlight || null`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

---

### Task 4: conversationTimeline.js + policy

**Files:**
- Create: `lib/server/conversationTimeline.js`
- Create: `lib/server/conversationTimeline.test.js`
- Modify: `lib/agentActionConfig.js`
- Modify: `lib/server/agentActionPolicy.js`

- [ ] **Step 1: Write failing tests**

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('recordConversationHighlight', () => {
  it('skips when disabled', async () => {
    const { recordConversationHighlight } = await import('./conversationTimeline.js');
    const add = vi.fn();
    const out = await recordConversationHighlight({
      enabled: false,
      highlight: { text: 'x', confidence: 'high' },
      academyId: 'a1',
      leadId: 'l1',
      messageId: 'm1',
      addLeadEvent: add,
    });
    expect(out.recorded).toBe(false);
    expect(add).not.toHaveBeenCalled();
  });

  it('records high confidence highlight', async () => {
    const { recordConversationHighlight } = await import('./conversationTimeline.js');
    const add = vi.fn().mockResolvedValue({ $id: 'e1' });
    const out = await recordConversationHighlight({
      enabled: true,
      highlight: { text: 'Interesse em experimental', confidence: 'high', categories: ['interest'] },
      academyId: 'a1',
      leadId: 'l1',
      messageId: 'm1',
      conversationId: 'c1',
      addLeadEvent: add,
      listEvents: async () => [],
    });
    expect(out.recorded).toBe(true);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation_highlight', text: 'Interesse em experimental' })
    );
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `conversationTimeline.js`**

```javascript
import { addLeadEventServer, listLeadEventsServer } from './leadEvents.js';

const HIGHLIGHT_TYPE = 'conversation_highlight';

export async function wasHighlightRecorded(leadId, academyId, messageId, listEvents = listLeadEventsServer) {
  const mid = String(messageId || '').trim();
  if (!mid) return false;
  const events = await listEvents(leadId, academyId, 60);
  return events.some((ev) => {
    if (String(ev?.type) !== HIGHLIGHT_TYPE) return false;
    try {
      const p = typeof ev.payload_json === 'string' ? JSON.parse(ev.payload_json) : ev.payload_json;
      return p?.message_id === mid;
    } catch {
      return false;
    }
  });
}

export async function recordConversationHighlight({
  enabled,
  highlight,
  academyId,
  leadId,
  messageId,
  conversationId,
  addLeadEvent = addLeadEventServer,
  listEvents = listLeadEventsServer,
}) {
  if (!enabled) return { recorded: false, reason: 'disabled' };
  const h = highlight && typeof highlight === 'object' ? highlight : {};
  const text = String(h.text || '').trim();
  if (String(h.confidence) !== 'high' || !text) return { recorded: false, reason: 'low_confidence' };
  const lid = String(leadId || '').trim();
  if (!lid) return { recorded: false, reason: 'no_lead' };
  if (await wasHighlightRecorded(lid, academyId, messageId, listEvents)) {
    return { recorded: false, reason: 'idempotent' };
  }
  await addLeadEvent({
    academyId,
    leadId: lid,
    type: HIGHLIGHT_TYPE,
    text: text.slice(0, 1000),
    createdBy: 'ai-agent',
    payloadJson: {
      message_id: String(messageId || '').trim() || null,
      conversation_id: String(conversationId || '').trim() || null,
      categories: Array.isArray(h.categories) ? h.categories : [],
    },
  });
  return { recorded: true };
}
```

Em `agentActionConfig.js`, estender `normalizeAiActionsConfig`:

```javascript
export function normalizeAiActionsConfig(raw) {
  // ...existing...
  const conversation_timeline =
    raw.conversation_timeline && typeof raw.conversation_timeline === 'object'
      ? { enabled: raw.conversation_timeline.enabled !== false }
      : { enabled: true };
  return { enabled, actions: unique.length > 0 ? unique : [...V1_AI_ACTIONS], conversation_timeline };
}
```

Em `agentActionPolicy.js`:

```javascript
export function isConversationTimelineEnabled(academyDoc) {
  const cfg = normalizeAiActionsConfig(parseAcademyModules(academyDoc?.modules).ai_actions);
  return cfg.conversation_timeline?.enabled !== false;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

---

### Task 5: Integrar no agentActionExecutor

**Files:**
- Modify: `lib/server/agentActionExecutor.js`
- Modify: `lib/server/agentActionExecute.js` (passar `contact.doc`)

- [ ] **Step 1: Wire highlight antes da ação primária**

```javascript
import { recordConversationHighlight } from './conversationTimeline.js';
import { isConversationTimelineEnabled } from './agentActionPolicy.js';
import { intakeMissingFieldsForTier } from './agentStateMerge.js';

// após interpret, antes de canExecute:
const timelineEnabled = isConversationTimelineEnabled(academyDoc);
const highlightLeadId = contact.id || '';
if (timelineEnabled && highlightLeadId && interpreted.timeline_highlight) {
  await recordConversationHighlight({
    enabled: true,
    highlight: interpreted.timeline_highlight,
    academyId: aid,
    leadId: highlightLeadId,
    messageId: mid,
    conversationId: cid,
  });
}

// ajustar canExecute para update_student em lead:
let missing = Array.isArray(interpreted.missing) ? interpreted.missing.filter(Boolean) : [];
if (action === 'update_student') {
  const collected = {
    ...(mergedState.intake?.collected || {}),
    ...(interpreted.data || {}),
  };
  const tier = contact?.kind === 'lead' ? 'partial' : 'full';
  missing = intakeMissingFieldsForTier(collected, tier);
}
const canExecute = confidence === 'high' && missing.length === 0;
```

Garantir que `executeAgentAction` passa `contact` com `doc` para `updateStudentServer`.

- [ ] **Step 2: Run suite de agent actions**

Run: `npm test -- --run lib/server/agentActionInterpret.test.js lib/server/agentStateMerge.test.js lib/server/updateStudentServer.test.js lib/server/conversationTimeline.test.js`

- [ ] **Step 3: Commit**

---

### Task 6: UI — perfil do lead

**Files:**
- Modify: `src/pages/LeadProfile.jsx`
- Modify: `src/lib/leadProfileUrlState.js`
- Modify: `src/components/leadProfile/LeadProfileTimelineEventsList.jsx`
- Test: `src/test/leadProfileUrlState.test.js`

- [ ] **Step 1: Add filter `conversation` to url state**

```javascript
export const LEAD_HISTORY_FILTERS = new Set([
  'all', 'message', 'schedule', 'stage_change', 'note', 'conversation',
]);
```

- [ ] **Step 2: Add label in LeadProfile**

```javascript
conversation_highlight: 'Conversa WhatsApp',
lead_updated: 'Cadastro atualizado', // timeline uses ev.text for detail
```

- [ ] **Step 3: Filter logic**

```javascript
if (eventTypeFilter === 'conversation') {
  return t === 'conversation_highlight' || (t === 'lead_updated' && ev.payload?.source === 'whatsapp_ai');
}
```

- [ ] **Step 4: Add pill button "Conversa"**

- [ ] **Step 5: Style dot color for conversation_highlight** (accent) em `LeadProfileTimelineEventsList.jsx`

- [ ] **Step 6: Run tests**

Run: `npm test -- --run src/test/leadProfileUrlState.test.js`

- [ ] **Step 7: Commit**

---

### Task 7: UI — toggle Agente IA

**Files:**
- Modify: `src/components/academy/AgenteIASection.jsx`
- Modify: `lib/server/aiPrompt.js` (save/load `conversation_timeline`)

- [ ] **Step 1: State `conversationTimelineEnabled` loaded from `data.ai_actions.conversation_timeline`**

- [ ] **Step 2: Checkbox abaixo das ações v1**

Label: **Registrar momentos importantes no histórico do lead**

- [ ] **Step 3: Include in save payload** `conversation_timeline: { enabled: conversationTimelineEnabled }`

- [ ] **Step 4: Manual smoke** — salvar config, recarregar, verificar persistência

- [ ] **Step 5: Commit**

---

## Checklist staging

- [ ] Lead com nome = telefone recebe mensagem "minha filha Manuela, 6 anos" → cadastro atualizado + highlight na timeline
- [ ] Filtro **Conversa** no perfil mostra highlight e `lead_updated` detalhado
- [ ] Lead com nome já definido não sobrescreve sem confirmação
- [ ] Handoff humano bloqueia patch e highlight
- [ ] `conversation_timeline.enabled: false` bloqueia apenas highlights (patch continua se ação permitida)
- [ ] Idempotência: mesma mensagem não duplica highlight nem ação

## Comandos de teste

```bash
npm test -- --run lib/server/agentStateMerge.test.js lib/server/agentActionInterpret.test.js lib/server/updateStudentServer.test.js lib/server/conversationTimeline.test.js lib/server/agentActionPolicy.test.js src/test/leadProfileUrlState.test.js
```
