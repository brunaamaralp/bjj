# Lead criança — nome no card e perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir de forma consistente **aluno** (quem vai à aula) e **responsável** (contato WhatsApp) no funil, recepção e perfil — sem novo campo no Appwrite — reutilizando o modelo `name` + `parentName` + `type`.

**Architecture:** Centralizar regras de exibição em `src/lib/leadDisplayName.js`, importando helpers existentes da Inbox onde fizer sentido. Cards e agenda usam título = `lead.name` e subtítulo = responsável quando `type` ∈ {Criança, Juniores} e `parentName` difere do aluno. Busca do funil passa a incluir `parentName`. Perfil ganha labels claros e hint quando cadastro incompleto. **Não alterar** `pickInboxDisplayName` na v1 (Inbox já correta).

**Tech Stack:** React 19, Vitest, CSS existente (`pipeline.css`, `profile-shared.css`), Zustand leads store.

**Spec / contexto:** Análise crítica na conversa 2026-06-17; modelo documentado em `docs/superpowers/specs/2026-06-11-conversa-cadastro-lead-ia-design.md`.

**Fora de escopo v1:**
- Migration automática de `"Mãe (Filho)"` no campo `name`
- Novo atributo Appwrite
- Corrigir `updateLead` via API (issue de salvamento inline — plano separado)
- Dois alunos no mesmo WhatsApp (um lead = um aluno)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/lib/leadDisplayName.js` | **Criar** — regras de título/subtítulo/busca/labels |
| `src/test/leadDisplayName.test.js` | **Criar** — casos de borda |
| `src/lib/inboxContactDisplay.js` | **Sem mudança v1** (Inbox permanece fonte de verdade para thread) |
| `src/pages/Pipeline.jsx` | Card desktop, lista mobile, filtro de busca |
| `src/styles/pipeline.css` | Subtítulo no card (truncate, cor secundária) |
| `src/pages/LeadProfile.jsx` | Hero labels, hint cadastro incompleto |
| `src/styles/profile-shared.css` | Subtítulo responsável no hero (se necessário) |
| `src/pages/Dashboard.jsx` | Agenda do dia + follow-up |
| `src/components/dashboard/FollowupHealthPanel.jsx` | Nome + subtítulo |
| `src/components/leads/NewLeadForm.jsx` | Label dinâmico “Nome do aluno” |
| `docs/flows/` | Atualizar checklist se jornada de perfil/funil mudar texto visível |

---

## Regras de negócio (implementar literalmente)

```javascript
// isLeadChildProfile(lead) → type === 'Criança' || type === 'Juniores'

// leadCardPrimaryName(lead) → trim(lead.name) || 'Sem nome'

// leadCardGuardianSubtitle(lead):
//   if (!isLeadChildProfile(lead)) return ''
//   const student = trim(lead.name)
//   const guardian = trim(lead.parentName)
//   if (!guardian) return ''
//   if (guardian.toLowerCase() === student.toLowerCase()) return ''
//   return `resp. ${guardian}`  // prefixo curto no card

// leadCardTooltip(lead):
//   primary + (subtitle ? ` · ${guardian}` : '')

// leadMatchesKanbanSearch(lead, query):
//   busca em name, parentName, phone (como hoje + parentName)

// leadProfileNameFieldLabel(lead):
//   isLeadChildProfile(lead) ? 'Nome do aluno' : 'Nome'

// leadProfileNeedsGuardianHint(lead):
//   isLeadChildProfile(lead) && !trim(lead.parentName)
```

**Importante:** subtítulo no funil exige **`type` criança/júnior**, não basta `parentName` (evita adulto com responsável preenchido por engano).

---

### Task 1: Módulo `leadDisplayName.js` + testes

**Files:**
- Create: `src/lib/leadDisplayName.js`
- Create: `src/test/leadDisplayName.test.js`
- Reference: `src/lib/inboxContactDisplay.js` (não modificar)

- [ ] **Step 1: Escrever testes que falham**

Criar `src/test/leadDisplayName.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  isLeadChildProfile,
  leadCardPrimaryName,
  leadCardGuardianSubtitle,
  leadCardTooltip,
  leadMatchesKanbanSearch,
  leadProfileNameFieldLabel,
  leadProfileNeedsGuardianHint,
} from '../lib/leadDisplayName.js';

describe('leadDisplayName', () => {
  const childLead = {
    name: 'Antônio',
    parentName: 'Letícia',
    type: 'Criança',
    phone: '5511999998888',
  };

  it('isLeadChildProfile só por type Criança/Juniores', () => {
    expect(isLeadChildProfile({ type: 'Criança' })).toBe(true);
    expect(isLeadChildProfile({ type: 'Juniores' })).toBe(true);
    expect(isLeadChildProfile({ type: 'Adulto', parentName: 'Maria' })).toBe(false);
    expect(isLeadChildProfile({ type: 'Adulto' })).toBe(false);
  });

  it('subtítulo mostra responsável quando difere do aluno', () => {
    expect(leadCardGuardianSubtitle(childLead)).toBe('resp. Letícia');
  });

  it('subtítulo vazio sem parentName ou nomes iguais', () => {
    expect(leadCardGuardianSubtitle({ ...childLead, parentName: '' })).toBe('');
    expect(leadCardGuardianSubtitle({ ...childLead, parentName: 'Antônio' })).toBe('');
    expect(leadCardGuardianSubtitle({ name: 'João', type: 'Adulto', parentName: 'Maria' })).toBe('');
  });

  it('tooltip concatena aluno e responsável', () => {
    expect(leadCardTooltip(childLead)).toBe('Antônio · Letícia');
    expect(leadCardTooltip({ name: 'João', type: 'Adulto' })).toBe('João');
  });

  it('busca encontra por nome do responsável', () => {
    expect(leadMatchesKanbanSearch(childLead, 'letícia')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, 'antonio')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, '99998888')).toBe(true);
    expect(leadMatchesKanbanSearch(childLead, 'xyz')).toBe(false);
  });

  it('labels e hint de perfil', () => {
    expect(leadProfileNameFieldLabel(childLead)).toBe('Nome do aluno');
    expect(leadProfileNameFieldLabel({ type: 'Adulto' })).toBe('Nome');
    expect(leadProfileNeedsGuardianHint(childLead)).toBe(false);
    expect(leadProfileNeedsGuardianHint({ name: 'Bia', type: 'Criança', parentName: '' })).toBe(true);
  });

  it('primaryName fallback Sem nome', () => {
    expect(leadCardPrimaryName({})).toBe('Sem nome');
    expect(leadCardPrimaryName(childLead)).toBe('Antônio');
  });
});
```

- [ ] **Step 2: Rodar testes — devem falhar**

```bash
npm test -- src/test/leadDisplayName.test.js
```

Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `src/lib/leadDisplayName.js`**

```javascript
const CHILD_TYPES = new Set(['Criança', 'Juniores']);

function trim(v) {
  return String(v ?? '').trim();
}

export function isLeadChildProfile(lead) {
  return CHILD_TYPES.has(trim(lead?.type));
}

export function leadCardPrimaryName(lead) {
  const name = trim(lead?.name);
  return name || 'Sem nome';
}

export function leadCardGuardianSubtitle(lead) {
  if (!isLeadChildProfile(lead)) return '';
  const student = trim(lead?.name);
  const guardian = trim(lead?.parentName);
  if (!guardian) return '';
  if (guardian.toLowerCase() === student.toLowerCase()) return '';
  return `resp. ${guardian}`;
}

export function leadCardTooltip(lead) {
  const primary = leadCardPrimaryName(lead);
  const guardian = trim(lead?.parentName);
  if (isLeadChildProfile(lead) && guardian && guardian.toLowerCase() !== primary.toLowerCase()) {
    return `${primary} · ${guardian}`;
  }
  return primary === 'Sem nome' ? '' : primary;
}

export function leadProfileNameFieldLabel(lead) {
  return isLeadChildProfile(lead) ? 'Nome do aluno' : 'Nome';
}

export function leadProfileNeedsGuardianHint(lead) {
  return isLeadChildProfile(lead) && !trim(lead?.parentName);
}

/** Mesma normalização de dígitos usada no Pipeline (importar helper existente se houver export). */
function normalizePhoneDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

export function leadMatchesKanbanSearch(lead, rawQuery) {
  const q = trim(rawQuery).toLowerCase();
  const qPhone = normalizePhoneDigits(rawQuery);
  if (!q && !qPhone) return true;

  const name = trim(lead?.name).toLowerCase();
  const parent = trim(lead?.parentName).toLowerCase();
  const phoneNorm = normalizePhoneDigits(lead?.phone);

  if (qPhone && phoneNorm.includes(qPhone)) return true;
  if (q && name.includes(q)) return true;
  if (q && parent.includes(q)) return true;
  return false;
}
```

**Nota:** Se `normalizeKanbanPhone` já estiver exportado de `Pipeline.jsx` ou util compartilhado, reutilizar em vez de duplicar — preferir import de util existente após grep.

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/test/leadDisplayName.test.js
```

Expected: PASS (todos os casos).

- [ ] **Step 5: Rodar suite relacionada (regressão Inbox)**

```bash
npm test -- src/test/inboxContactDisplay.test.js src/test/leadDisplayName.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/leadDisplayName.js src/test/leadDisplayName.test.js
git commit -m "feat(leads): add leadDisplayName helpers for child/guardian display"
```

---

### Task 2: Card do funil (desktop + mobile) + busca

**Files:**
- Modify: `src/pages/Pipeline.jsx` (~L318–320, ~L1030–1032, ~L2150–2160)
- Modify: `src/styles/pipeline.css` (~L966+)

- [ ] **Step 1: Importar helpers no topo de `Pipeline.jsx`**

```javascript
import {
  leadCardPrimaryName,
  leadCardGuardianSubtitle,
  leadCardTooltip,
  leadMatchesKanbanSearch,
} from '../lib/leadDisplayName.js';
```

- [ ] **Step 2: Atualizar `LeadCard` — bloco do nome**

Substituir:

```jsx
<span className="lead-card-name" title={String(lead.name || '').trim() || undefined}>
  {lead.name}
</span>
```

Por:

```jsx
<span className="lead-card-name" title={leadCardTooltip(lead) || undefined}>
  {leadCardPrimaryName(lead)}
</span>
{leadCardGuardianSubtitle(lead) ? (
  <span className="lead-card-guardian">{leadCardGuardianSubtitle(lead)}</span>
) : null}
```

Ajustar wrapper `lead-card-title-row` se necessário para `flex-col` ou segunda linha — ver Task 3 CSS.

- [ ] **Step 3: Lista mobile (~L1030)**

```jsx
<div className="pipeline-mobile-lead-name">
  {leadCardPrimaryName(lead)}
</div>
{leadCardGuardianSubtitle(lead) ? (
  <div className="pipeline-mobile-lead-guardian">{leadCardGuardianSubtitle(lead)}</div>
) : null}
```

- [ ] **Step 4: Busca do board — `applyBoardSearchFilter`**

Substituir corpo do filter por:

```javascript
return list.filter((l) => leadMatchesKanbanSearch(l, kanbanSearch));
```

Remover lógica duplicada de name/phone inline (DRY).

- [ ] **Step 5: Verificar visualmente**

```bash
npm run dev
```

Abrir `/pipeline`, lead tipo Criança com `name` + `parentName`, confirmar subtítulo e busca por nome da mãe.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Pipeline.jsx
git commit -m "feat(pipeline): show guardian subtitle on child lead cards and search parentName"
```

---

### Task 3: Estilos do card (funil)

**Files:**
- Modify: `src/styles/pipeline.css`

- [ ] **Step 1: Adicionar classes**

```css
.lead-card-title-row--name-only {
  flex-wrap: wrap;
}

.lead-card-guardian,
.pipeline-mobile-lead-guardian {
  display: block;
  width: 100%;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pipeline-mobile-lead-guardian {
  margin-top: 2px;
}
```

- [ ] **Step 2: Conferir card com SLA badge + nome longo** — não quebrar layout em 320px.

- [ ] **Step 3: Commit**

```bash
git add src/styles/pipeline.css
git commit -m "style(pipeline): guardian subtitle on lead cards"
```

---

### Task 4: Perfil do lead — labels, subtítulo hero, hint

**Files:**
- Modify: `src/pages/LeadProfile.jsx` (~L1947–1960, seção hero)
- Modify: `src/styles/profile-shared.css` (opcional — subtítulo hero)

- [ ] **Step 1: Importar helpers**

```javascript
import {
  leadCardGuardianSubtitle,
  leadCardPrimaryName,
  leadProfileNameFieldLabel,
  leadProfileNeedsGuardianHint,
  isLeadChildProfile,
} from '../lib/leadDisplayName.js';
```

- [ ] **Step 2: `ProfileInlineField` do nome — passar label dinâmico**

O componente aceita `label`. Trocar `label="Nome"` por:

```jsx
label={leadProfileNameFieldLabel(lead)}
```

- [ ] **Step 3: Subtítulo abaixo do nome (modo leitura, não edição)**

Após o `ProfileInlineField` do nome (ou `<h1>` quando não inline), quando `leadCardGuardianSubtitle(lead)`:

```jsx
<p className="lead-profile-hero__guardian">{leadCardGuardianSubtitle(lead)}</p>
```

CSS:

```css
.lead-profile-hero__guardian {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
```

- [ ] **Step 4: Banner hint quando criança sem responsável**

Usar `StatusBanner` (variant `info`) acima do hero ou abaixo dos badges:

```jsx
{leadProfileNeedsGuardianHint(lead) ? (
  <StatusBanner variant="info" className="lead-profile-guardian-hint">
    Informe o responsável em <strong>Outros detalhes</strong> (quem fala no WhatsApp). O nome acima é do aluno que vai à aula.
  </StatusBanner>
) : null}
```

Importar `StatusBanner` se ainda não estiver no arquivo.

- [ ] **Step 5: Modo edição completo — label do campo Nome**

No formulário de edição, trocar label estático “Nome” por `leadProfileNameFieldLabel(form)` ou equivalente quando `form.type` definido.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LeadProfile.jsx src/styles/profile-shared.css
git commit -m "feat(lead-profile): clarify student vs guardian names for child leads"
```

---

### Task 5: Recepção (Dashboard) + Follow-up

**Files:**
- Modify: `src/pages/Dashboard.jsx` (~L1008–1013, ~L1496)
- Modify: `src/components/dashboard/FollowupHealthPanel.jsx` (~L96)

- [ ] **Step 1: Importar helpers em Dashboard.jsx**

- [ ] **Step 2: Blocos que renderizam `lead.name`**

Padrão:

```jsx
<strong title={leadCardTooltip(lead)}>{leadCardPrimaryName(lead)}</strong>
{leadCardGuardianSubtitle(lead) ? (
  <span className="dashboard-lead-guardian">{leadCardGuardianSubtitle(lead)}</span>
) : null}
```

Aplicar em agenda do dia e lista de follow-up experimental.

- [ ] **Step 3: `FollowupHealthPanel.jsx` — mesmo padrão**

- [ ] **Step 4: CSS mínimo em `src/styles/dashboard.css` ou inline token existente** — reutilizar classes do pipeline se possível (extrair para `profile-shared.css` ou `lead-display.css` se duplicação > 2 arquivos).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.jsx src/components/dashboard/FollowupHealthPanel.jsx
git commit -m "feat(dashboard): show guardian subtitle for child leads"
```

---

### Task 6: Formulário novo lead — label dinâmico

**Files:**
- Modify: `src/components/leads/NewLeadForm.jsx` (~L267)

- [ ] **Step 1: Observar `leadType` do form (já existe watch/register)**

- [ ] **Step 2: Label condicional**

```jsx
<label htmlFor={`${formId}-name`}>
  {leadType === 'Criança' || leadType === 'Juniores' ? 'Nome do aluno' : 'Nome'}
</label>
```

Placeholder: `'Ex: nome de quem vai treinar'` quando criança.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/NewLeadForm.jsx
git commit -m "feat(leads): label student name on new lead form for child profile"
```

---

### Task 7: Documentação de fluxo (governança)

**Files:**
- Modify: `docs/flows/atendimento/agente-ia-whatsapp.md` ou fluxo de funil/perfil se existir — **linkar** este plano, não duplicar spec IA.
- Modify: `docs/flows/VALIDATION.md` — uma linha se checklist divergir.

- [ ] **Step 1:** Registrar na seção de perfil/funil: card mostra aluno + `resp.`; cadastro separa `name` / `parentName`.

- [ ] **Step 2: Commit docs**

```bash
git add docs/flows/
git commit -m "docs(flows): child lead display name on pipeline and profile"
```

---

### Task 8 (opcional / follow-up): Salvamento inline via API

**Problema:** `updateLead` no client Appwrite pode falhar com 401; usuário viu “Não foi possível salvar”.

**Files:**
- Modify: `src/store/useLeadStore.js` — fallback PATCH `/api/leads?id=`
- Modify: `api/leads.js` — aceitar patch camelCase via `updatesToAppwritePatch` server-side (reutilizar mapper)

**Não bloquear v1 de display.** Abrir issue ou plano `2026-06-17-lead-update-via-api.md` se necessário.

---

## Checklist de aceite (QA manual)

| Cenário | Esperado |
|---------|----------|
| Criança: Antônio + Letícia + type Criança | Card: **Antônio** / `resp. Letícia`; busca “Letícia” encontra |
| Criança sem parentName | Card só Antônio; hint no perfil |
| Adulto João | Card só João; label “Nome” |
| Adulto com parentName preenchido | **Sem** subtítulo no card (type Adulto) |
| Inbox | Sem regressão — título mãe, subtítulo filho |
| Contrato | `nome_aluno` / `nome_responsavel` inalterados nos dados |

---

## Comandos de verificação final

```bash
npm test -- src/test/leadDisplayName.test.js src/test/inboxContactDisplay.test.js
npm run lint
npm run build
```

---

## Self-review (spec coverage)

| Requisito | Task |
|-----------|------|
| Helpers centralizados | Task 1 |
| Card funil desktop | Task 2 |
| Card funil mobile | Task 2 |
| Busca parentName | Task 1 + 2 |
| Perfil labels + hint | Task 4 |
| Dashboard | Task 5 |
| New lead form | Task 6 |
| Docs flows | Task 7 |
| Save bug | Task 8 opcional |
| AgendaCalendarWeek | **Defer** — pode usar Task 5 pattern em PR rápido se tempo |

**Placeholder scan:** nenhum TBD restante.

---

## Riscos remanescentes pós-ship

1. Leads legados com nome da mãe em `name` — hint orienta, não corrige automaticamente.
2. `AgendaCalendarWeek.jsx` ainda mostra só `lead.name` até PR de alinhamento.
3. TaskCard / NL search global — fora do escopo v1.
