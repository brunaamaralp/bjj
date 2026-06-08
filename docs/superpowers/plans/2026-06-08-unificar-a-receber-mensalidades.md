# Unificar A receber + Mensalidades (Opção B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma única aba **A receber** no hub Financeiro, com **Mensalidades** como seção operacional interna — eliminando abas duplicadas sem perder cobrança, grade, pendências nem o consolidado de lançamentos/vendas.

**Architecture:** `ReceivablesTab` vira container-mãe com cabeçalho consolidado (total + chips por origem) e sub-abas (`visao` | `mensalidades` | `outros`). `MensalidadesPanel` permanece intacto como seção embutida. `?tab=mensalidades` e `/mensalidades` redirecionam para `?tab=a-receber&section=mensalidades` preservando `search`/`filtro`. Nova lib `financeiroReceivablesSections.js` centraliza slugs, defaults por perfil e builders de URL.

**Tech Stack:** React 18, React Router, Vitest, CSS existente em `src/components/finance/styles/`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/financeiroReceivablesSections.js` | **Criar** — slugs de seção, parse, build URL, default por perfil |
| `src/lib/financeiroHubTabs.js` | **Modificar** — remover Mensalidades das abas permitidas; default member → `a-receber` |
| `src/components/finance/ReceivablesTab.jsx` | **Modificar** — container com sub-abas + embed `MensalidadesPanel` |
| `src/components/finance/MensalidadesPanel.jsx` | **Modificar** — remover banner cruzado; props para modo seção |
| `src/pages/Caixa.jsx` | **Modificar** — um tabpanel; redirect legado `tab=mensalidades` |
| `src/components/routing/FinanceiroRedirects.jsx` | **Modificar** — `/mensalidades` → `a-receber&section=mensalidades` |
| `src/lib/naviMenu.js` | **Modificar** — item lateral aponta para A receber |
| `src/components/finance/VisaoGeralTab.jsx` | **Modificar** — links unificados |
| `src/components/finance/ReceivablesOverviewCard.jsx` | **Modificar** — CTA com seção default |
| ~12 arquivos com deep links | **Modificar** — ver Task 7 |
| `src/test/financeiroReceivablesSections.test.js` | **Criar** |
| `src/test/financeiroHubTabs.test.js` | **Modificar** |
| `src/test/legacyRedirects.test.jsx` | **Modificar** |
| `src/test/naviMenu.test.js` | **Modificar** |

---

## Modelo de URL

| URL | Comportamento |
|---|---|
| `?tab=a-receber` | Seção default conforme perfil (`visao` owner/admin, `mensalidades` member) |
| `?tab=a-receber&section=visao` | Tabela consolidada (todas as origens) |
| `?tab=a-receber&section=mensalidades` | `MensalidadesPanel` embutido |
| `?tab=a-receber&section=mensalidades&search=joao&filtro=overdue` | Mensalidades com filtros (legado preservado) |
| `?tab=a-receber&section=outros` | Só lançamentos pendentes + vendas a prazo |
| `?tab=mensalidades` (legado) | Redirect → `?tab=a-receber&section=mensalidades` (+ query) |
| `/mensalidades` (legado) | Redirect → idem |

---

## Wireframe lógico

```
┌─ A receber ─────────────────────────────────────────────┐
│ Referência: Junho 2026          [Atualizar]               │
│ Total a receber: R$ 12.450 · 38 itens                   │
│ [Mensalidade R$9k] [Lançamento R$2k] [Venda R$1,4k]     │
├─────────────────────────────────────────────────────────┤
│ [ Visão geral ] [ Mensalidades ] [ Outros ]  ← sub-abas │
├─────────────────────────────────────────────────────────┤
│ (conteúdo da seção ativa)                                │
│  - visao: tabela atual ReceivablesTab (todas origens)   │
│  - mensalidades: MensalidadesPanel (lista/grade/pend.)    │
│  - outros: tabela filtrada (lancamento + venda)         │
└─────────────────────────────────────────────────────────┘
```

---

### Task 1: Lib de seções + testes

**Files:**
- Create: `src/lib/financeiroReceivablesSections.js`
- Create: `src/test/financeiroReceivablesSections.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/test/financeiroReceivablesSections.test.js
import { describe, it, expect } from 'vitest';
import {
  RECEIVABLES_SECTIONS,
  parseReceivablesSection,
  getDefaultReceivablesSection,
  buildReceivablesSearchParams,
  normalizeLegacyFinanceiroTab,
} from '../lib/financeiroReceivablesSections.js';
import { FINANCEIRO_SECTIONS } from '../lib/financeiroHubTabs.js';

describe('financeiroReceivablesSections', () => {
  it('parseReceivablesSection — default visao quando ausente', () => {
    expect(parseReceivablesSection(new URLSearchParams(''))).toBe(RECEIVABLES_SECTIONS.VISAO);
  });

  it('parseReceivablesSection — mensalidades explícita', () => {
    const p = new URLSearchParams('section=mensalidades');
    expect(parseReceivablesSection(p)).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
  });

  it('getDefaultReceivablesSection — member em mensalidades', () => {
    expect(getDefaultReceivablesSection('member')).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
    expect(getDefaultReceivablesSection({ isOwner: false, isAdmin: false })).toBe(
      RECEIVABLES_SECTIONS.MENSALIDADES
    );
  });

  it('getDefaultReceivablesSection — gestor em visao', () => {
    expect(getDefaultReceivablesSection('owner')).toBe(RECEIVABLES_SECTIONS.VISAO);
    expect(getDefaultReceivablesSection({ isOwner: true })).toBe(RECEIVABLES_SECTIONS.VISAO);
  });

  it('buildReceivablesSearchParams — preserva search e filtro', () => {
    const p = buildReceivablesSearchParams({
      section: RECEIVABLES_SECTIONS.MENSALIDADES,
      search: 'Maria',
      filtro: 'overdue',
    });
    expect(p.get('tab')).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(p.get('section')).toBe('mensalidades');
    expect(p.get('search')).toBe('Maria');
    expect(p.get('filtro')).toBe('overdue');
  });

  it('normalizeLegacyFinanceiroTab — mensalidades vira a-receber + section', () => {
    const input = new URLSearchParams('tab=mensalidades&search=joao&filtro=pending');
    const out = normalizeLegacyFinanceiroTab(input);
    expect(out.tab).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
    expect(out.section).toBe(RECEIVABLES_SECTIONS.MENSALIDADES);
    expect(out.search).toBe('joao');
    expect(out.filtro).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/financeiroReceivablesSections.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal lib**

```javascript
// src/lib/financeiroReceivablesSections.js
import { FINANCEIRO_SECTIONS } from './financeiroHubTabs.js';

export const RECEIVABLES_SECTIONS = {
  VISAO: 'visao',
  MENSALIDADES: 'mensalidades',
  OUTROS: 'outros',
};

const VALID = new Set(Object.values(RECEIVABLES_SECTIONS));

export const RECEIVABLES_SECTION_LABELS = {
  [RECEIVABLES_SECTIONS.VISAO]: 'Visão geral',
  [RECEIVABLES_SECTIONS.MENSALIDADES]: 'Mensalidades',
  [RECEIVABLES_SECTIONS.OUTROS]: 'Outros',
};

export function parseReceivablesSection(searchParams) {
  const raw = String(searchParams?.get?.('section') || '').trim().toLowerCase();
  return VALID.has(raw) ? raw : RECEIVABLES_SECTIONS.VISAO;
}

export function getDefaultReceivablesSection(navRoleOrAccess) {
  if (navRoleOrAccess && typeof navRoleOrAccess === 'object') {
    const { isOwner, isAdmin } = navRoleOrAccess;
    if (isOwner || isAdmin) return RECEIVABLES_SECTIONS.VISAO;
    return RECEIVABLES_SECTIONS.MENSALIDADES;
  }
  return navRoleOrAccess === 'member'
    ? RECEIVABLES_SECTIONS.MENSALIDADES
    : RECEIVABLES_SECTIONS.VISAO;
}

export function buildReceivablesSearchParams({
  section = RECEIVABLES_SECTIONS.VISAO,
  search,
  filtro,
  extra = {},
} = {}) {
  const p = new URLSearchParams();
  p.set('tab', FINANCEIRO_SECTIONS.A_RECEBER);
  if (section && section !== RECEIVABLES_SECTIONS.VISAO) {
    p.set('section', section);
  }
  if (search) p.set('search', search);
  if (filtro) p.set('filtro', filtro);
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && String(v).trim()) p.set(k, String(v));
  }
  return p;
}

export function buildReceivablesPath(opts = {}) {
  const p = buildReceivablesSearchParams(opts);
  const qs = p.toString();
  return qs ? `/financeiro?${qs}` : '/financeiro';
}

/** Converte ?tab=mensalidades legado para novo formato. */
export function normalizeLegacyFinanceiroTab(searchParams) {
  const tab = String(searchParams?.get?.('tab') || '').trim().toLowerCase();
  const section = parseReceivablesSection(searchParams);
  const search = searchParams?.get?.('search') || undefined;
  const filtro = searchParams?.get?.('filtro') || searchParams?.get?.('filter') || undefined;

  if (tab === 'mensalidades') {
    return {
      tab: FINANCEIRO_SECTIONS.A_RECEBER,
      section: RECEIVABLES_SECTIONS.MENSALIDADES,
      search,
      filtro,
      changed: true,
    };
  }

  return { tab, section, search, filtro, changed: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/financeiroReceivablesSections.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiroReceivablesSections.js src/test/financeiroReceivablesSections.test.js
git commit -m "feat(finance): add receivables section helpers for unified A receber hub"
```

---

### Task 2: Hub tabs — remover aba Mensalidades

**Files:**
- Modify: `src/lib/financeiroHubTabs.js`
- Modify: `src/test/financeiroHubTabs.test.js`

- [ ] **Step 1: Update failing tests**

Em `src/test/financeiroHubTabs.test.js`, substituir expectativas de `MENSALIDADES` como aba folha:

```javascript
it('getFinanceiroDefaultTab — gestores em visão geral, member em a-receber', () => {
  expect(getFinanceiroDefaultTab({ isOwner: true })).toBe(FINANCEIRO_SECTIONS.OVERVIEW);
  expect(getFinanceiroDefaultTab({ isOwner: false, isAdmin: false })).toBe(
    FINANCEIRO_SECTIONS.A_RECEBER
  );
  expect(getFinanceiroDefaultTab('member')).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
});

it('buildFinanceiroAllowedLeafTabs — member sem mensalidades como aba', () => {
  const allowed = new Set(
    buildFinanceiroAllowedLeafTabs({ navRole: 'member', financeModule: true })
  );
  expect(allowed.has(FINANCEIRO_SECTIONS.MENSALIDADES)).toBe(false);
  expect(allowed.has(FINANCEIRO_SECTIONS.A_RECEBER)).toBe(true);
});

it('buildFinanceiroHubTabItems — ordem member prioriza a-receber', () => {
  const tabs = buildFinanceiroHubTabItems({ navRole: 'member', financeModule: true });
  expect(tabs.map((t) => t.id)).toEqual([
    FINANCEIRO_SECTIONS.A_RECEBER,
    'movimentacoes',
    FINANCEIRO_SECTIONS.OVERVIEW,
  ]);
});

it('member em ?tab=previsao redireciona para a-receber', () => {
  const allowed = new Set(
    buildFinanceiroAllowedLeafTabs({ navRole: 'member', financeModule: true })
  );
  const fallback = getFinanceiroDefaultTab('member');
  expect(resolveHubTab('previsao', allowed, fallback)).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
  expect(resolveHubTab('mensalidades', allowed, fallback)).toBe(FINANCEIRO_SECTIONS.A_RECEBER);
});
```

- [ ] **Step 2: Run tests — verify FAIL**

Run: `npm test -- src/test/financeiroHubTabs.test.js`
Expected: FAIL nos testes alterados

- [ ] **Step 3: Implement hub tabs changes**

Em `src/lib/financeiroHubTabs.js`:

1. Manter `FINANCEIRO_SECTIONS.MENSALIDADES` como constante legada (redirects), mas **remover** de:
   - `TAB_TO_SECTION` (ou mapear para `A_RECEBER` — preferível remover entrada)
   - `HUB_TAB_LABELS` / `HUB_TAB_SHORT_LABELS`
   - `buildFinanceiroAllowedLeafTabs` array base

2. Alterar `getFinanceiroDefaultTab`:

```javascript
export function getFinanceiroDefaultTab(navRoleOrAccess) {
  if (navRoleOrAccess && typeof navRoleOrAccess === 'object') {
    const { isOwner, isAdmin } = navRoleOrAccess;
    if (isOwner || isAdmin) return FINANCEIRO_SECTIONS.OVERVIEW;
    return FINANCEIRO_SECTIONS.A_RECEBER;
  }
  return navRoleOrAccess === 'member'
    ? FINANCEIRO_SECTIONS.A_RECEBER
    : FINANCEIRO_SECTIONS.OVERVIEW;
}
```

3. Em `financeiroLegacyTabToSlug`, adicionar alias:

```javascript
if (t === 'mensalidades') return FINANCEIRO_SECTIONS.A_RECEBER;
```

4. Remover `orderFinanceiroHubTabIds` branch que colocava `MENSALIDADES` antes de `A_RECEBER`; member order vira `[A_RECEBER, movimentacoes, OVERVIEW]`.

- [ ] **Step 4: Run tests — verify PASS**

Run: `npm test -- src/test/financeiroHubTabs.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/financeiroHubTabs.js src/test/financeiroHubTabs.test.js
git commit -m "refactor(finance): remove Mensalidades as top-level hub tab"
```

---

### Task 3: ReceivablesTab como container-mãe

**Files:**
- Modify: `src/components/finance/ReceivablesTab.jsx`
- Modify: `src/components/finance/styles/overview.css` (ou criar `styles/receivables.css` se preferir escopo)
- Modify: `src/components/finance/finance.css` (import do novo CSS se criado)

- [ ] **Step 1: Write failing test (opcional smoke — navegação de seção)**

```javascript
// src/test/receivablesTabSections.test.js
import { describe, it, expect } from 'vitest';
import { RECEIVABLE_SOURCE } from '../lib/receivablesAggregate.js';
import { RECEIVABLES_SECTIONS } from '../lib/financeiroReceivablesSections.js';

describe('ReceivablesTab section filtering', () => {
  const items = [
    { id: '1', source: RECEIVABLE_SOURCE.MENSALIDADE },
    { id: '2', source: RECEIVABLE_SOURCE.LANCAMENTO },
    { id: '3', source: RECEIVABLE_SOURCE.VENDA },
  ];

  function filterForSection(section, rows) {
    if (section === RECEIVABLES_SECTIONS.MENSALIDADES) {
      return rows.filter((r) => r.source === RECEIVABLE_SOURCE.MENSALIDADE);
    }
    if (section === RECEIVABLES_SECTIONS.OUTROS) {
      return rows.filter(
        (r) =>
          r.source === RECEIVABLE_SOURCE.LANCAMENTO || r.source === RECEIVABLE_SOURCE.VENDA
      );
    }
    return rows;
  }

  it('outros exclui mensalidades', () => {
    expect(filterForSection(RECEIVABLES_SECTIONS.OUTROS, items)).toHaveLength(2);
  });
});
```

Extrair `filterReceivablesForSection` para `src/lib/financeiroReceivablesSections.js` e testar lá (DRY).

- [ ] **Step 2: Extend lib with filter helper**

```javascript
import { RECEIVABLE_SOURCE } from './receivablesAggregate.js';

export function filterReceivablesForSection(section, items = []) {
  if (section === RECEIVABLES_SECTIONS.MENSALIDADES) {
    return items.filter((it) => it.source === RECEIVABLE_SOURCE.MENSALIDADE);
  }
  if (section === RECEIVABLES_SECTIONS.OUTROS) {
    return items.filter(
      (it) =>
        it.source === RECEIVABLE_SOURCE.LANCAMENTO || it.source === RECEIVABLE_SOURCE.VENDA
    );
  }
  return items;
}
```

- [ ] **Step 3: Refactor ReceivablesTab.jsx**

Props novas:

```javascript
export default function ReceivablesTab({
  academyId,
  referenceMonth,
  activeSection,
  defaultSection,
  navRole,
  onSectionChange,
  onReferenceMonthChange,
}) {
```

Estrutura:

1. Cabeçalho consolidado (existente) — sempre visível
2. Sub-abas (`role="tablist"`) com `RECEIVABLES_SECTION_LABELS`
3. `activeSection === 'mensalidades'` → render `<MensalidadesPanel embedded sectionMode referenceMonth onReferenceMonthChange />`
4. `visao` / `outros` → tabela existente com `filterReceivablesForSection`
5. Chips de origem no cabeçalho: ao clicar, chamar `onSectionChange` (`mensalidade` → `mensalidades`, `lancamento|venda` → `outros`)
6. Remover `itemActionLink` que apontava para `tab=mensalidades`; para mensalidade na tabela `visao`, link vira `onSectionChange('mensalidades', { search: item.label })`
7. Remover `StatusBanner` com `mensalidadePendenteCaixa` (redundante após unificação) ou reescrever: *"Registre pagamentos na seção Mensalidades."*

Sub-aba UI (padrão HubTabBar compacto ou botões existentes `mensal-page-tab`):

```jsx
<div className="receivables-tab__sections" role="tablist" aria-label="Seções de A receber">
  {Object.entries(RECEIVABLES_SECTION_LABELS).map(([id, label]) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={activeSection === id}
      className={`receivables-tab__section${activeSection === id ? ' receivables-tab__section--active' : ''}`}
      onClick={() => onSectionChange(id)}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 4: CSS mínimo**

```css
/* em styles/receivables.css ou overview.css */
.receivables-tab__sections {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}
.receivables-tab__section {
  /* reutilizar tokens de .mensal-page-tab se possível */
}
.receivables-tab__section--active {
  /* estado ativo */
}
.receivables-tab--section-mensalidades .receivables-tab__table-wrap {
  display: none;
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/test/financeiroReceivablesSections.test.js src/test/receivablesTabSections.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/financeiroReceivablesSections.js src/components/finance/ReceivablesTab.jsx src/components/finance/styles/
git commit -m "feat(finance): ReceivablesTab as unified container with sections"
```

---

### Task 4: MensalidadesPanel em modo seção

**Files:**
- Modify: `src/components/finance/MensalidadesPanel.jsx`

- [ ] **Step 1: Add `sectionMode` prop**

```javascript
export default function MensalidadesPanel({
  embedded = false,
  sectionMode = false,
  referenceMonth: referenceMonthProp,
  onReferenceMonthChange,
}) {
```

- [ ] **Step 2: Remove cross-link banner**

Remover bloco:

```jsx
<StatusBanner variant="info" className="mensalidades-receivable-hint">
  {FINANCE_TERM_HINTS.mensalidadePendenteCaixa}{' '}
  <Link to={`/financeiro?tab=${FINANCEIRO_SECTIONS.A_RECEBER}`}>Ver em A receber →</Link>
</StatusBanner>
```

Quando `sectionMode === true`, não renderizar esse banner.

- [ ] **Step 3: Ajustar header em sectionMode**

Se `embedded && sectionMode`:
- Não repetir título "Mensalidades" nem `PageHeader` (já está sob A receber)
- Manter toolbar (lista/resumo/pendências), filtros e conteúdo

- [ ] **Step 4: Manual smoke**

1. `npm run dev`
2. Abrir `/financeiro?tab=a-receber&section=mensalidades`
3. Confirmar: grade, registrar pagamento, filtros `filtro=overdue` via URL

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/MensalidadesPanel.jsx
git commit -m "refactor(finance): MensalidadesPanel section mode without cross-tab banner"
```

---

### Task 5: Caixa.jsx — wiring + redirect legado

**Files:**
- Modify: `src/pages/Caixa.jsx`

- [ ] **Step 1: Import helpers**

```javascript
import {
  parseReceivablesSection,
  getDefaultReceivablesSection,
  normalizeLegacyFinanceiroTab,
  RECEIVABLES_SECTIONS,
  buildReceivablesSearchParams,
} from '../lib/financeiroReceivablesSections.js';
```

- [ ] **Step 2: Legacy redirect effect**

Após resolver `activeTab`, adicionar:

```javascript
const legacy = normalizeLegacyFinanceiroTab(searchParams);
const receivablesSection = parseReceivablesSection(searchParams);
const defaultReceivablesSection = getDefaultReceivablesSection({ isOwner, isAdmin });

useEffect(() => {
  if (legacy.changed) {
    const p = buildReceivablesSearchParams({
      section: legacy.section,
      search: legacy.search,
      filtro: legacy.filtro,
    });
    setSearchParams(p, { replace: true });
    return;
  }
  if (activeTab === FINANCEIRO_SECTIONS.A_RECEBER) {
    const explicitSection = String(searchParams.get('section') || '').trim();
    if (!explicitSection) {
      const p = buildReceivablesSearchParams({ section: defaultReceivablesSection });
      setSearchParams(p, { replace: true });
    }
  }
}, [activeTab, legacy.changed, /* deps */]);
```

- [ ] **Step 3: Section change handler**

```javascript
const setReceivablesSection = useCallback(
  (section, opts = {}) => {
    const p = buildReceivablesSearchParams({
      section,
      search: opts.search,
      filtro: opts.filtro,
    });
    setSearchParams(p, { replace: true });
  },
  [setSearchParams]
);
```

- [ ] **Step 4: Remove Mensalidades tabpanel**

Remover bloco `activeTab === FINANCEIRO_SECTIONS.MENSALIDADES`.

Atualizar bloco A receber:

```jsx
{activeTab === FINANCEIRO_SECTIONS.A_RECEBER && academyId ? (
  <div role="tabpanel" id={`finance-tabpanel-${FINANCEIRO_SECTIONS.A_RECEBER}`} ...>
    <ReceivablesTab
      academyId={academyId}
      referenceMonth={referenceMonth}
      activeSection={receivablesSection}
      defaultSection={defaultReceivablesSection}
      navRole={navRole}
      onSectionChange={setReceivablesSection}
      onReferenceMonthChange={setReferenceMonth}
    />
  </div>
) : null}
```

- [ ] **Step 5: Update TAB_SUBTITLES**

```javascript
[FINANCEIRO_SECTIONS.A_RECEBER]: 'Tudo que a academia ainda deve receber — mensalidades, lançamentos e vendas',
// remover entrada MENSALIDADES
```

- [ ] **Step 6: PageHeader meta**

Incluir `FINANCEIRO_SECTIONS.A_RECEBER` na condição que omite meta duplicado quando filho tem picker próprio (hoje só mensalidades).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Caixa.jsx
git commit -m "feat(finance): wire unified A receber tab with section routing in Caixa hub"
```

---

### Task 6: Redirects e menu lateral

**Files:**
- Modify: `src/components/routing/FinanceiroRedirects.jsx`
- Modify: `src/lib/naviMenu.js`
- Modify: `src/test/legacyRedirects.test.jsx`
- Modify: `src/test/naviMenu.test.js`

- [ ] **Step 1: Update MensalidadesRedirect**

```javascript
import { buildReceivablesSearchParams } from '../../lib/financeiroReceivablesSections.js';
import { RECEIVABLES_SECTIONS } from '../../lib/financeiroReceivablesSections.js';

export function MensalidadesRedirect() {
  const [searchParams] = useSearchParams();
  const p = buildReceivablesSearchParams({
    section: RECEIVABLES_SECTIONS.MENSALIDADES,
    search: searchParams.get('search') || undefined,
    filtro: searchParams.get('filtro') || searchParams.get('filter') || undefined,
  });
  return <Navigate to={`/financeiro?${p.toString()}`} replace />;
}
```

- [ ] **Step 2: Update naviMenu accordion**

Em `buildFinanceiroAccordion`, trocar item mensalidades:

```javascript
{
  id: 'a-receber',
  label: 'A receber',
  to: `${FINANCEIRO_HUB_PATH}?tab=${FINANCEIRO_SECTIONS.A_RECEBER}&section=mensalidades`,
  iconKey: 'mensalidades', // manter ícone até ter um de a-receber
},
```

Atualizar `isAccordionChildActive`:

```javascript
if (child.id === 'a-receber' || child.id === 'mensalidades') {
  if (location.pathname === '/mensalidades') return true;
  if (isFinanceiroHubPath(location.pathname)) {
    const tab = String(new URLSearchParams(location.search || '').get('tab') || '').toLowerCase();
    return tab === FINANCEIRO_SECTIONS.A_RECEBER || tab === 'mensalidades';
  }
}
```

- [ ] **Step 3: Update legacy redirect test**

```javascript
it('/mensalidades → /financeiro?tab=a-receber&section=mensalidades', async () => {
  // ...
  expect(el?.getAttribute('data-search')).toContain('tab=a-receber');
  expect(el?.getAttribute('data-search')).toContain('section=mensalidades');
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/test/legacyRedirects.test.jsx src/test/naviMenu.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/routing/FinanceiroRedirects.jsx src/lib/naviMenu.js src/test/
git commit -m "refactor(finance): redirect legacy mensalidades routes to A receber section"
```

---

### Task 7: Atualizar deep links (~15 arquivos)

**Files (modify each):**

| Arquivo | De | Para |
|---|---|---|
| `src/components/finance/VisaoGeralTab.jsx` | `tab=mensalidades` | `tab=a-receber&section=mensalidades` |
| `src/components/finance/ReceivablesOverviewCard.jsx` | `tab=a-receber` | manter; member pode usar `&section=mensalidades` no CTA secundário |
| `src/components/dashboard/DashboardManagerSection.jsx` | `tab=mensalidades&filtro=overdue` | `buildReceivablesPath({ section:'mensalidades', filtro:'overdue' })` |
| `src/lib/proactiveHub.js` | idem | idem |
| `src/components/finance/settings/FinanceSettingsCollectionSection.jsx` | idem | idem |
| `src/components/finance/settings/FinanceSettingsExceptionsSection.jsx` | `tab=mensalidades` | path builder |
| `src/components/finance/ConfigTab.jsx` | 3 links | path builder |
| `src/components/finance/ForecastTab.jsx` | `tab=mensalidades&search=` | path builder |
| `src/pages/StudentProfile.jsx` | `tab=mensalidades&search=` | path builder |
| `src/lib/receivablesAggregate.js` | `linkTab: 'mensalidades'` | `linkTab: 'a-receber'` + documentar `section` |
| `src/components/finance/ReceivablesTab.jsx` | `itemActionLink` | `onSectionChange('mensalidades', { search })` |

- [ ] **Step 1: Criar helper de navegação (se ainda não exportado)**

Usar `buildReceivablesPath` de Task 1 em todos os links estáticos.

- [ ] **Step 2: Grep de verificação**

Run: `rg "tab=mensalidades|FINANCEIRO_SECTIONS\.MENSALIDADES" src --glob "*.{jsx,js}"`
Expected: só constantes legadas, redirects e comentários `@deprecated`

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS (corrigir falhas pontuais em `mobileMoreNav.test.js`, `nlCommandRouteContext.test.js` se existirem)

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "chore(finance): update deep links to unified A receber sections"
```

---

### Task 8: Visão Geral — evitar duplicata confusa

**Files:**
- Modify: `src/components/finance/VisaoGeralTab.jsx`
- Modify: `src/components/finance/ReceivablesOverviewCard.jsx`

- [ ] **Step 1: Unificar CTAs**

No card de inadimplentes → `buildReceivablesPath({ section: 'mensalidades', filtro: 'pending' })`.

No `ReceivablesOverviewCard` CTA principal → `tab=a-receber` (gestor cai em `visao`).

Opcional: segundo link "Cobrar mensalidades" → `section=mensalidades`.

- [ ] **Step 2: Remover link duplicado**

Se Visão Geral tinha **dois** links (um para Mensalidades, outro para A receber), deixar **um** para A receber e chips contextuais.

- [ ] **Step 3: Commit**

```bash
git add src/components/finance/VisaoGeralTab.jsx src/components/finance/ReceivablesOverviewCard.jsx
git commit -m "refactor(finance): align overview CTAs with unified A receber page"
```

---

### Task 9: Verificação final + checklist manual

- [ ] **Step 1: Automated tests**

```bash
npm test
npm run lint
```

- [ ] **Step 2: Manual QA checklist**

| Cenário | Esperado |
|---|---|
| Member abre `/financeiro` | `?tab=a-receber&section=mensalidades` |
| Owner abre `/financeiro` | `?tab=visao-geral` (inalterado) |
| Owner clica aba A receber | `section=visao` (tabela consolidada) |
| `/mensalidades?search=joao` | redirect com `a-receber&section=mensalidades&search=joao` |
| `?tab=mensalidades&filtro=overdue` | redirect preservando filtro |
| Registrar pagamento na seção Mensalidades | some da tabela visão após refresh / evento |
| Chip "Mensalidade" no cabeçalho | troca para seção Mensalidades |
| Chip "Lançamento pendente" | troca para seção Outros |
| Menu lateral "A receber" | abre seção mensalidades (recepção) |
| NL command prefill pagamento | modal abre na seção mensalidades |

- [ ] **Step 3: Commit final (se ajustes de QA)**

```bash
git commit -m "fix(finance): address QA findings from A receber unification"
```

---

## Self-review (spec coverage)

| Requisito | Task |
|---|---|
| Uma aba A receber no hub | Task 2, 5 |
| Mensalidades como seção operacional completa | Task 3, 4 |
| Consolidado (lançamentos + vendas) preservado | Task 3 (`visao` + `outros`) |
| Redirects legados | Task 1, 5, 6 |
| Default recepção em mensalidades | Task 1, 5 |
| Deep links atualizados | Task 7 |
| Sem banner cruzado entre abas | Task 4 |
| Testes | Tasks 1, 2, 6, 9 |

**Gaps intencionais (YAGNI nesta fase):**
- Não mover backend (`financeReceivablesHandler.js`) — já agrega corretamente
- Não renomear rota `/mensalidades` no App.jsx — redirect basta
- Não adicionar ações inline de pagamento na tabela `visao` — seção Mensalidades resolve

---

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Bookmarks `?tab=mensalidades` quebrados | Redirect automático Task 5 |
| `useEffect` de URL em loop | Guard: só `setSearchParams` se valor mudou |
| Header duplo (mês + título) | `sectionMode` suprime header em Task 4 |
| Testes espalhados com slug antigo | Grep gate em Task 7 Step 2 |

---

## Ordem de execução recomendada

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7 → Task 8 → Task 9
```

Tasks 3 e 4 podem rodar em paralelo após Task 1. Task 7 só após Task 5 (URL final estável).
