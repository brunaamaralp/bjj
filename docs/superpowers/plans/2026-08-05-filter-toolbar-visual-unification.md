# Filter Toolbar Visual Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar visual e UX das barras de filtros no idioma SaaS premium (Notion/Linear): um estado ativo roxo, hierarquia L0–L4 (busca → primários → avançados → tags ativas → ações), clear consistente e componentes shared reutilizáveis.

**Architecture:** Evoluir o sistema parcial existente (`FilterBar`, `FilterChipGroup`, `CompactStatusFilter`, `SearchField`, tokens `--control-*`) em vez de reescrever telas do zero. Tokens + CSS canônicos primeiro; depois primitivos React (`FilterToolbar`, `FilterTag`, `FilterClearAll`); migração tela a tela em PRs pequenos. Verde (`--color-accent`) deixa de significar “filtro selecionado” e permanece só para sucesso/CTA de sucesso.

**Tech Stack:** React 19, CSS tokens em `src/index.css` + módulos, Vitest + Testing Library, Lucide icons, menus `navi-menu__*`.

**Baseline (análise):** conversa de auditoria DS/UI — três famílias de chip (verde / roxo / strip branco), clear fragmentado, `FilterChipGroup` dead code, `filter-bar--stacked-mobile` sem CSS.

**Docs a atualizar no mesmo esforço:**
- [docs/controls-toolbar.md](../../controls-toolbar.md) — hoje exclui `.filter-chip` da padronização; reverter essa exclusão.
- [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md) — checklist de filtros.
- Fluxos tocados em `docs/flows/` só se a jornada visível mudar (mapa de telas / checklist).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/index.css` | Tokens `--filter-*`, estados canônicos `.filter-chip`, `.filter-tag`, `.filter-toolbar`, stacked-mobile, deprecar fill verde |
| `src/components/shared/FilterBar.jsx` | Wrapper legado; manter API; opcionalmente delegar a `FilterToolbar` |
| `src/components/shared/FilterToolbar.jsx` | **Criar** — shell L0–L4 (`primary` + `active` + `actions`) |
| `src/components/shared/FilterChipGroup.jsx` | Já existe; passar a ser o único path para chips de seleção exclusivos |
| `src/components/shared/FilterTag.jsx` | **Criar** — chip removível de filtro aplicado |
| `src/components/shared/FilterClearAll.jsx` | **Criar** — “Limpar” / “Limpar tudo” ghost |
| `src/components/shared/CompactStatusFilter.jsx` | Remover `●/○`; alinhar trigger ativo aos tokens; focus-visible |
| `src/components/finance/finance.css` | Trigger ativo → tokens `--filter-*` (não só `--v500`) |
| `src/components/finance/styles/shell.css` | `.finance-filter-pill` já está no idioma certo; alinhar hover/focus |
| `src/styles/pipeline.css` | Remover override verde de `.filter-chip.is-active` |
| `src/styles/inbox.css` | Alinhar active chips / clear copy |
| `src/styles/students.css` | Mobile stack + botões reais |
| `src/pages/Students.jsx` | Piloto: `FilterChipGroup` + `FilterClearAll` + `<button>` |
| `src/pages/Tasks.jsx` | Piloto: chips via shared |
| `src/pages/Pipeline.jsx` + `PipelineAdvancedFilters.jsx` | Badge count + clear unificado |
| `src/components/finance/MensalidadesPanel.jsx` / `TransacoesTab.jsx` / `JournalTab.jsx` | Clear → `FilterClearAll`; active row se ≥2 dims |
| `src/components/inbox/InboxListPanel.jsx` (ou equivalente) | Copy “Limpar tudo”; banner → `FilterTag` row se couber |
| `docs/controls-toolbar.md` | Spec oficial do filter system |
| `src/test/filterToolbarPrimitives.test.jsx` | **Criar** — RTL dos primitivos |
| `src/test/filterChipActiveTokens.test.js` | **Criar** — assert CSS source (sem verde no active canônico) |

**Não tocar:** `api/*` (Hobby 12/12), lógica de filtro em `src/lib/*Filters.js` (só UI), CTAs verdes legítimos (`.btn-action-primary` no Pipeline que usa accent por produto — fora do escopo de *filtro*).

---

## Estratégia de PRs

| PR | Escopo | Risco | Estimativa |
|----|--------|-------|------------|
| **PR-A** | Tokens + CSS canônico (active roxo; stacked-mobile; focus) | Baixo–médio (visual global) | ~80 LOC CSS |
| **PR-B** | Primitivos React + testes | Baixo | ~200 LOC |
| **PR-C** | Piloto Students + Tasks | Médio | ~150 LOC |
| **PR-D** | Finance toolbars + CompactStatusFilter polish | Médio | ~180 LOC |
| **PR-E** | Pipeline + Inbox | Médio | ~200 LOC |
| **PR-F** | Docs (`controls-toolbar`, DESIGN_SYSTEM) | Baixo | docs only |

Cada PR: `npm test -- filterToolbarPrimitives filterChipActiveTokens` (+ testes do módulo tocado). Validação visual manual nas rotas: `/alunos`, `/tarefas`, `/pipeline`, `/inbox`, `/financeiro`.

---

## Convenções (não negociáveis)

1. **Active selection** = `--color-primary-surface` + border `--color-primary` + text `--color-primary-dark` (ou aliases `--v*` já usados em finance pills).
2. **`--color-accent` (verde)** = sucesso / CTA de sucesso — **nunca** `.filter-chip.is-active` / `.date-chip.active`.
3. **Clear copy:** 1 filtro → `Limpar`; ≥2 → `Limpar tudo`. Aria: `Limpar filtros`.
4. Chips interativos = sempre `<button type="button">`, nunca `<span role="button">`.
5. Hierarquia L0–L4 quando a tela tiver busca + ≥2 dimensões + ações.
6. Segmented (período Inbox/Pipeline) permanece em `.filter-strip` + `.filter-pill` (já roxo) — não converter em fill sólido.

---

## PR-A — Tokens e CSS canônico

### Task 1: Tokens `--filter-*` em `:root`

**Files:**
- Modify: `src/index.css` (bloco de tokens ~L94–120)
- Test: `src/test/filterChipActiveTokens.test.js` (criar na Task 2)

- [ ] **Step 1: Adicionar tokens após o bloco `--control-*`**

Inserir em `src/index.css` logo após `--control-bg-muted`:

```css
  /* Filtros — toolbar SaaS (ver docs/controls-toolbar.md) */
  --filter-control-h: var(--control-height-toolbar);
  --filter-gap: var(--control-gap);
  --filter-gap-tight: 4px;
  --filter-radius: var(--control-radius-sm); /* 8px */
  --filter-chip-radius: 999px;
  --filter-font: var(--font-sm);
  --filter-font-label: var(--font-xs);
  --filter-pad-x: 10px;
  --filter-bg: transparent;
  --filter-bg-hover: var(--surface-hover, var(--azul-gelo));
  --filter-bg-active: var(--color-primary-surface, var(--v50));
  --filter-border: var(--control-border);
  --filter-border-active: 1px solid var(--color-primary);
  --filter-text: var(--text-secondary);
  --filter-text-active: var(--color-primary-dark, var(--v700));
  --filter-menu-shadow: 0 8px 24px rgba(15, 15, 15, 0.08);
  --filter-transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): add filter toolbar design tokens

EOF
)"
```

### Task 2: Unificar estado ativo dos chips (roxo) + teste de contrato CSS

**Files:**
- Modify: `src/index.css` (~L546–631 `.filter-chip` / `.date-chip`)
- Create: `src/test/filterChipActiveTokens.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

describe('filter chip active tokens', () => {
  it('does not use accent green fill for .filter-chip.is-active', () => {
    const block = css.match(/\.filter-chip\.is-active\s*\{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/--color-accent|--accent(?!-)/);
    expect(block[0]).toMatch(/--filter-bg-active|--color-primary-surface/);
  });

  it('does not use accent green fill for .date-chip.active', () => {
    const block = css.match(/\.date-chip\.active\s*\{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).not.toMatch(/--color-accent/);
    expect(block[0]).toMatch(/--filter-bg-active|--color-primary-surface/);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test -- src/test/filterChipActiveTokens.test.js`
Expected: FAIL (ainda usa `--color-accent`)

- [ ] **Step 3: Atualizar CSS canônico**

Substituir hover/active de `.filter-chip` e `.date-chip`:

```css
.filter-chip {
  font-size: var(--filter-font-label, var(--font-xs));
  padding: 5px var(--filter-pad-x, 10px);
  min-height: 32px;
  border-radius: var(--filter-chip-radius, 999px);
  border: var(--filter-border, 0.5px solid var(--border-light));
  background: var(--surface);
  color: var(--filter-text, var(--text-secondary));
  cursor: pointer;
  white-space: nowrap;
  transition: var(--filter-transition, background 0.15s ease, border-color 0.15s ease, color 0.15s ease);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-chip:hover {
  background: var(--filter-bg-hover);
  border-color: var(--color-primary-light, var(--v200));
  color: var(--color-text-primary, var(--text));
}

.filter-chip:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}

.filter-chip.is-active {
  background: var(--filter-bg-active);
  color: var(--filter-text-active);
  border: var(--filter-border-active);
  font-weight: 600;
}

.filter-chip.is-active .filter-count {
  background: color-mix(in srgb, var(--color-primary) 18%, white);
  color: var(--filter-text-active);
}

.filter-chip:disabled,
.filter-chip[aria-disabled='true'] {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}

.date-chip:hover {
  background: var(--filter-bg-hover);
  border-color: var(--color-primary-light, var(--v200));
  color: var(--color-text-primary, var(--text));
}

.date-chip:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}

.date-chip.active {
  background: var(--filter-bg-active);
  color: var(--filter-text-active);
  border: var(--filter-border-active);
  font-weight: 600;
}
```

- [ ] **Step 4: Rodar teste — PASS**

Run: `npm test -- src/test/filterChipActiveTokens.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/test/filterChipActiveTokens.test.js
git commit -m "$(cat <<'EOF'
fix(ui): use primary surface for active filter chips

EOF
)"
```

### Task 3: CSS de `.filter-toolbar`, `.filter-tag`, stacked-mobile, clear-all

**Files:**
- Modify: `src/index.css` (após bloco `.filter-bar` / clear)

- [ ] **Step 1: Implementar CSS do shell e tags**

```css
.filter-bar--stacked-mobile {
  /* noop on desktop; stack on narrow viewports */
}

@media (max-width: 720px) {
  .filter-bar--stacked-mobile {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-bar--stacked-mobile > * {
    width: 100%;
    max-width: 100%;
  }
}

.filter-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-toolbar__primary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--filter-gap, var(--control-gap));
  min-height: var(--filter-control-h, var(--control-height-toolbar));
}

.filter-toolbar__spacer {
  flex: 1 1 8px;
  min-width: 8px;
}

.filter-toolbar__actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--filter-gap, var(--control-gap));
}

.filter-toolbar__active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.filter-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 10px;
  border-radius: var(--filter-chip-radius, 999px);
  background: var(--filter-bg-active);
  border: var(--filter-border-active);
  color: var(--filter-text-active);
  font-size: var(--filter-font-label, var(--font-xs));
  font-weight: 500;
  cursor: pointer;
  transition: var(--filter-transition);
}

.filter-tag:hover {
  background: color-mix(in srgb, var(--color-primary) 14%, white);
}

.filter-tag:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}

.filter-clear-all {
  margin-left: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--filter-font, var(--font-sm));
  font-weight: 500;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--filter-radius);
}

.filter-clear-all:hover {
  color: var(--color-primary);
  background: var(--filter-bg-hover);
}

.filter-clear-all:focus-visible {
  outline: 2px solid var(--focus-ring-color);
  outline-offset: 2px;
}

/* Icon-only clear: keep .filter-clear for CompactStatusFilter X */
.filter-clear.filter-clear--icon {
  min-width: 34px;
  min-height: 34px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(ui): add filter toolbar, tag, and stacked-mobile styles

EOF
)"
```

### Task 4: Remover override verde do Pipeline

**Files:**
- Modify: `src/styles/pipeline.css` (~L90–126)

- [ ] **Step 1: Ajustar active do Pipeline para herdar canônico**

Substituir:

```css
.pipeline-container .filter-chip.is-active {
  background: var(--color-accent);
  color: #fff;
  border-color: var(--color-accent);
}
```

Por:

```css
.pipeline-container .filter-chip.is-active {
  /* herda --filter-* canônicos; só densifica raio local se necessário */
  border-radius: 10px;
}
```

Manter `.filter-chip--alert.is-active` em vermelho de alerta (não é “seleção genérica”).

- [ ] **Step 2: Commit**

```bash
git add src/styles/pipeline.css
git commit -m "$(cat <<'EOF'
fix(ui): drop pipeline green active filter chip override

EOF
)"
```

---

## PR-B — Primitivos React

### Task 5: `FilterClearAll`

**Files:**
- Create: `src/components/shared/FilterClearAll.jsx`
- Create: `src/test/filterToolbarPrimitives.test.jsx`

- [ ] **Step 1: Teste que falha**

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FilterClearAll from '../components/shared/FilterClearAll.jsx';

describe('FilterClearAll', () => {
  it('labels Limpar for one filter and Limpar tudo for many', () => {
    const { rerender } = render(<FilterClearAll count={1} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toHaveTextContent('Limpar');

    rerender(<FilterClearAll count={3} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /limpar filtros/i })).toHaveTextContent('Limpar tudo');
  });

  it('calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<FilterClearAll count={2} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: /limpar filtros/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when count < 1', () => {
    const { container } = render(<FilterClearAll count={0} onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Rodar — FAIL**

Run: `npm test -- src/test/filterToolbarPrimitives.test.jsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implementar**

```jsx
import React from 'react';

/**
 * Ghost clear control for filter toolbars.
 * @param {{ count: number, onClick: () => void, className?: string }} props
 */
export default function FilterClearAll({ count = 0, onClick, className = '' }) {
  if (!count || count < 1) return null;
  const label = count >= 2 ? 'Limpar tudo' : 'Limpar';
  const classes = ['filter-clear-all', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} onClick={onClick} aria-label="Limpar filtros">
      {label}
    </button>
  );
}
```

- [ ] **Step 4: Rodar — PASS** + commit

```bash
git add src/components/shared/FilterClearAll.jsx src/test/filterToolbarPrimitives.test.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add FilterClearAll shared control

EOF
)"
```

### Task 6: `FilterTag`

**Files:**
- Create: `src/components/shared/FilterTag.jsx`
- Modify: `src/test/filterToolbarPrimitives.test.jsx`

- [ ] **Step 1: Acrescentar testes**

```jsx
import FilterTag from '../components/shared/FilterTag.jsx';

describe('FilterTag', () => {
  it('renders label and removes on click', () => {
    const onRemove = vi.fn();
    render(<FilterTag label="Status: Em atraso" onRemove={onRemove} />);
    fireEvent.click(screen.getByRole('button', { name: /remover filtro status: em atraso/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implementar**

```jsx
import React from 'react';
import { X } from 'lucide-react';

/**
 * Removable applied-filter chip.
 * @param {{ label: string, onRemove: () => void, className?: string }} props
 */
export default function FilterTag({ label, onRemove, className = '' }) {
  const classes = ['filter-tag', className].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      onClick={onRemove}
      aria-label={`Remover filtro ${label}`}
    >
      <span>{label}</span>
      <X size={14} aria-hidden />
    </button>
  );
}
```

- [ ] **Step 3: Test PASS + commit**

```bash
git add src/components/shared/FilterTag.jsx src/test/filterToolbarPrimitives.test.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add FilterTag for applied filters

EOF
)"
```

### Task 7: `FilterToolbar`

**Files:**
- Create: `src/components/shared/FilterToolbar.jsx`
- Modify: `src/test/filterToolbarPrimitives.test.jsx`

- [ ] **Step 1: Teste de estrutura**

```jsx
import FilterToolbar from '../components/shared/FilterToolbar.jsx';

describe('FilterToolbar', () => {
  it('renders primary, optional active row, and actions with spacer', () => {
    render(
      <FilterToolbar
        primary={<button type="button">Buscar</button>}
        active={<span data-testid="active-row">tags</span>}
        actions={<button type="button">Exportar</button>}
      />
    );
    expect(screen.getByText('Buscar')).toBeTruthy();
    expect(screen.getByTestId('active-row')).toBeTruthy();
    expect(screen.getByText('Exportar')).toBeTruthy();
    expect(document.querySelector('.filter-toolbar__spacer')).not.toBeNull();
  });

  it('hides active row when active is null', () => {
    const { container } = render(
      <FilterToolbar primary={<span>p</span>} active={null} />
    );
    expect(container.querySelector('.filter-toolbar__active')).toBeNull();
  });
});
```

- [ ] **Step 2: Implementar**

```jsx
import React from 'react';

/**
 * L0–L4 filter shell: primary row (search + filters + actions) + optional active tags row.
 * @param {{
 *   primary?: React.ReactNode,
 *   active?: React.ReactNode | null,
 *   actions?: React.ReactNode,
 *   className?: string,
 *   stackedMobile?: boolean,
 * }} props
 */
export default function FilterToolbar({
  primary = null,
  active = null,
  actions = null,
  className = '',
  stackedMobile = false,
}) {
  const root = ['filter-toolbar', className].filter(Boolean).join(' ');
  const primaryClass = [
    'filter-toolbar__primary',
    'navi-toolbar',
    stackedMobile ? 'filter-bar--stacked-mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={root}>
      <div className={primaryClass}>
        {primary}
        {actions ? (
          <>
            <div className="filter-toolbar__spacer" aria-hidden="true" />
            <div className="filter-toolbar__actions">{actions}</div>
          </>
        ) : null}
      </div>
      {active ? (
        <div className="filter-toolbar__active" aria-live="polite">
          {active}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: PASS + commit**

```bash
git add src/components/shared/FilterToolbar.jsx src/test/filterToolbarPrimitives.test.jsx
git commit -m "$(cat <<'EOF'
feat(ui): add FilterToolbar layout shell

EOF
)"
```

### Task 8: Garantir `FilterChipGroup` exportável e documentado no teste

**Files:**
- Modify: `src/components/shared/FilterChipGroup.jsx` (só se faltar `aria-pressed`)
- Modify: `src/test/filterToolbarPrimitives.test.jsx`

- [ ] **Step 1: Teste**

```jsx
import FilterChipGroup from '../components/shared/FilterChipGroup.jsx';

describe('FilterChipGroup', () => {
  it('marks active option and calls onChange', () => {
    const onChange = vi.fn();
    render(
      <FilterChipGroup
        value="ativos"
        onChange={onChange}
        options={[
          { id: 'ativos', label: 'Ativos' },
          { id: 'inativos', label: 'Inativos' },
        ]}
      />
    );
    const active = screen.getByRole('button', { name: 'Ativos' });
    expect(active.className).toMatch(/is-active/);
    fireEvent.click(screen.getByRole('button', { name: 'Inativos' }));
    expect(onChange).toHaveBeenCalledWith('inativos');
  });
});
```

- [ ] **Step 2: Adicionar `aria-pressed={active}` em cada button do `FilterChipGroup`**

```jsx
<button
  key={opt.id}
  type="button"
  aria-pressed={active}
  className={[/* ... */].filter(Boolean).join(' ')}
  onClick={() => onChange(opt.id)}
  title={opt.title || undefined}
>
```

- [ ] **Step 3: PASS + commit**

```bash
git add src/components/shared/FilterChipGroup.jsx src/test/filterToolbarPrimitives.test.jsx
git commit -m "$(cat <<'EOF'
feat(ui): wire FilterChipGroup aria-pressed and tests

EOF
)"
```

---

## PR-C — Piloto Students + Tasks

### Task 9: Students — chips `<button>` via `FilterChipGroup` + `FilterClearAll`

**Files:**
- Modify: `src/pages/Students.jsx` (~L386–526)
- Modify: `src/styles/students.css` (se clear mobile precisar alinhar)

- [ ] **Step 1: Imports**

```jsx
import FilterChipGroup from '../components/shared/FilterChipGroup.jsx';
import FilterClearAll from '../components/shared/FilterClearAll.jsx';
```

- [ ] **Step 2: Substituir spans Ativos/Inativos (desktop e mobile) por**

```jsx
<FilterChipGroup
  value={showInactive ? 'inativos' : 'ativos'}
  onChange={(id) => setShowInactive(id === 'inativos')}
  options={[
    { id: 'ativos', label: 'Ativos' },
    { id: 'inativos', label: 'Inativos' },
  ]}
/>
```

- [ ] **Step 3: Substituir botão “Limpar filtros” / mobile “Limpar” por**

```jsx
<FilterClearAll
  count={filtrosAtivos ? Math.max(1, collapsibleFilterCount || 1) : 0}
  onClick={limparFiltros}
/>
```

Ajustar `count` para refletir dimensões realmente ativas (origem/turma/plano/inativos) — reutilizar a mesma lógica que alimenta `collapsibleFilterCount` / `filtrosAtivos`. Se `filtrosAtivos` for boolean, mapear: `count={filtrosAtivos ? 2 : 0}` só se houver ≥2 dims; caso contrário passar contagem real.

- [ ] **Step 4: Smoke visual + teste de regressão de filtros**

Run: `npm test -- src/test/studentsListFilters.test.js`
Expected: PASS (lógica intacta)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Students.jsx src/styles/students.css
git commit -m "$(cat <<'EOF'
refactor(students): use shared filter chips and clear control

EOF
)"
```

### Task 10: Tasks — chips via shared

**Files:**
- Modify: `src/pages/Tasks.jsx` (~L1473–1511 e empty-state clear)

- [ ] **Step 1: Trocar markup manual de `.filter-chip` por `FilterChipGroup` onde for seleção exclusiva de status**

- [ ] **Step 2: Empty state / toolbar clear → `FilterClearAll` com copy unificada**

- [ ] **Step 3: Testes**

Run: `npm test -- src/test/taskFilters.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/Tasks.jsx
git commit -m "$(cat <<'EOF'
refactor(tasks): adopt FilterChipGroup and FilterClearAll

EOF
)"
```

---

## PR-D — Finance + CompactStatusFilter

### Task 11: Polish `CompactStatusFilter`

**Files:**
- Modify: `src/components/shared/CompactStatusFilter.jsx`
- Modify: `src/components/finance/finance.css` (`.mensal-status-filter__trigger--active`)

- [ ] **Step 1: Remover prefixo `●` / `○` do label; manter só `Check` no item ativo**

Antes:
```jsx
<span>
  {value === opt.id ? '●' : '○'} {opt.label}
  …
</span>
```

Depois:
```jsx
<span>
  {opt.label}
  {showCounts && opt.count != null ? ` (${opt.count})` : ''}
</span>
```

- [ ] **Step 2: Classes do trigger ativo alinhadas a filter tokens**

```css
.mensal-status-filter__trigger--active {
  background: var(--filter-bg-active) !important;
  border-color: var(--color-primary) !important;
  color: var(--filter-text-active);
}
```

- [ ] **Step 3: X clear usa `filter-clear filter-clear--icon`**

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/CompactStatusFilter.jsx src/components/finance/finance.css
git commit -m "$(cat <<'EOF'
refactor(ui): simplify CompactStatusFilter menu and active styles

EOF
)"
```

### Task 12: Finance bars — `FilterClearAll` + active tags quando ≥2 dims

**Files:**
- Modify: `src/components/finance/MensalidadesPanel.jsx` (~clear button)
- Modify: `src/components/finance/TransacoesTab.jsx`
- Modify: `src/components/finance/JournalTab.jsx`
- Optional: `ForecastTab` / `MonthlyClosingTab` — pills já estão corretas; só focus-visible se faltar

- [ ] **Step 1: Trocar botões `btn-outline … Limpar filtros` por `FilterClearAll`**

Calcular `count` a partir dos filtros ≠ default (status, datas, banco, natureza, busca, etc.).

- [ ] **Step 2 (Mensalidades / TX se ≥2 ativos): active row**

```jsx
import FilterToolbar from '../shared/FilterToolbar.jsx';
import FilterTag from '../shared/FilterTag.jsx';
import FilterClearAll from '../shared/FilterClearAll.jsx';

// Exemplo TX:
const activeTags = [];
if (status !== 'all') activeTags.push({ id: 'status', label: `Status: ${statusLabel}`, clear: () => setStatus('all') });
if (nature !== 'all') activeTags.push({ id: 'nature', label: `Natureza: ${natureLabel}`, clear: () => setNature('all') });
// …

const activeRow =
  activeTags.length >= 2 ? (
    <>
      {activeTags.map((t) => (
        <FilterTag key={t.id} label={t.label} onRemove={t.clear} />
      ))}
      <FilterClearAll count={activeTags.length} onClick={clearTxFilters} />
    </>
  ) : null;
```

Envolver a barra existente com `FilterToolbar` **somente** se não quebrar o painel `.finance-hub-filters`. Alternativa mais segura: manter `FinanceFiltersBar` e renderizar `filter-toolbar__active` **abaixo** do painel.

- [ ] **Step 3: Testes finance tocados**

Run: `npm test -- src/test/mensalidadesFilters.test.js src/test/mensalidadesPanel.test.jsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/MensalidadesPanel.jsx src/components/finance/TransacoesTab.jsx src/components/finance/JournalTab.jsx
git commit -m "$(cat <<'EOF'
refactor(finance): unify filter clear and active tags row

EOF
)"
```

---

## PR-E — Pipeline + Inbox

### Task 13: Pipeline — badge no “Filtros” + clear unificado

**Files:**
- Modify: `src/pages/Pipeline.jsx` (toolbar ~L3031 / L3128)
- Modify: `src/components/pipeline/PipelineAdvancedFilters.jsx`

- [ ] **Step 1: Botão avançado com count**

```jsx
<button
  type="button"
  className={`btn-action-ghost${advancedCount > 0 ? ' is-active' : ''}`}
  aria-expanded={advancedOpen}
>
  Filtros
  {advancedCount > 0 ? <span className="filter-count">{advancedCount}</span> : null}
</button>
```

- [ ] **Step 2: “Limpar filtros” no painel → `FilterClearAll`**

- [ ] **Step 3: Período continua em `.filter-chip` / strip — já herda active roxo do PR-A**

- [ ] **Step 4: Testes**

Run: `npm test -- src/test/pipelineEnrollmentFilter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Pipeline.jsx src/components/pipeline/PipelineAdvancedFilters.jsx
git commit -m "$(cat <<'EOF'
refactor(pipeline): badge advanced filters and shared clear

EOF
)"
```

### Task 14: Inbox — copy clear + chips active alinhados

**Files:**
- Modify: `src/styles/inbox.css` (overrides de `.filter-chip.is-active` se ainda forçarem cor divergente)
- Modify: componente da lista (`InboxListPanel.jsx` / `ConversationList.jsx`) — “Limpar filtro” → `FilterClearAll`

- [ ] **Step 1: Unificar label do clear do banner**

- [ ] **Step 2: Garantir que segments (Todas / Com você / …) permanecem no padrão segmented; só chips extras usam canônico**

- [ ] **Step 3: Commit**

```bash
git add src/styles/inbox.css src/components/inbox/
git commit -m "$(cat <<'EOF'
refactor(inbox): align filter clear copy with shared pattern

EOF
)"
```

---

## PR-F — Documentação

### Task 15: Atualizar `docs/controls-toolbar.md` e `DESIGN_SYSTEM.md`

**Files:**
- Modify: `docs/controls-toolbar.md`
- Modify: `DESIGN_SYSTEM.md`

- [ ] **Step 1: Em `controls-toolbar.md`, remover a exclusão de `.filter-chip` em “O que não padronizar” e adicionar seção:**

```markdown
## Filtros (toolbar SaaS)

### Hierarquia L0–L4
0. Busca (`SearchField`)
1. Primários (2–4): status, período, tipo
2. Avançados: botão **Filtros** + badge count
3. Tags ativas (`FilterTag`) quando ≥2 dimensões
4. Ações (`margin-left: auto` / `filter-toolbar__actions`)

### Componentes
- `FilterToolbar`, `FilterChipGroup`, `FilterTag`, `FilterClearAll`, `CompactStatusFilter`
- `FilterBar` / `FinanceFiltersBar` — wrappers legados ainda válidos

### Estado ativo
- Selection: `--filter-bg-active` (primary surface), **nunca** `--color-accent`
- Segmented strip: `.filter-strip` + `.filter-pill.active` (já no idioma roxo)

### Clear
- 1 → "Limpar"; ≥2 → "Limpar tudo"; `aria-label="Limpar filtros"`
```

- [ ] **Step 2: Em `DESIGN_SYSTEM.md`, na lista de componentes críticos, acrescentar `FilterToolbar`, `FilterTag`, `FilterClearAll`**

- [ ] **Step 3: Checklist de PR UI — bullet:**

```markdown
- Filtros: active = primary surface; clear via `FilterClearAll`; chips = `<button>` / `FilterChipGroup`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/controls-toolbar.md DESIGN_SYSTEM.md
git commit -m "$(cat <<'EOF'
docs: specify unified filter toolbar design system

EOF
)"
```

---

## Validação final (antes de merge do último PR)

- [ ] `npm test -- src/test/filterChipActiveTokens.test.js src/test/filterToolbarPrimitives.test.jsx`
- [ ] `npm test -- src/test/studentsListFilters.test.js src/test/taskFilters.test.js src/test/mensalidadesFilters.test.js src/test/pipelineEnrollmentFilter.test.js`
- [ ] Visual manual:
  - `/alunos` — chips Ativos/Inativos roxos; Limpar; focus ring no teclado
  - `/tarefas` — chips + clear
  - `/financeiro` (Mensalidades + Lançamentos) — clear ghost; tags se ≥2
  - `/pipeline` — período + Filtros (n) + limpar no painel
  - `/inbox` — segments intactos; clear copy
- [ ] Confirmar que CTAs verdes legítimos (ex.: botão primário accent no Pipeline) **não** foram alterados por engano

---

## Self-review do plano

| Requisito da análise | Task |
|----------------------|------|
| Unificar active (fim do verde em chip) | 2, 4 |
| Tokens / specs | 1, 3, 15 |
| Inputs/dropdowns premium | 11 |
| Tags ativas + Clear All | 5, 6, 12 |
| Agrupamento L0–L4 | 7, 12, 13 |
| Usar `FilterChipGroup` | 8, 9, 10 |
| stacked-mobile CSS | 3 |
| a11y button + focus | 2, 8, 9 |
| Docs | 15 |

Sem placeholders TBD. Escopo intencionalmente **não** migra Products/Inventory/Reports neste plano (mesmo padrão depois; listar como follow-up).

### Follow-up (fora deste plano)

- Products / Inventory / Reports / Contracts → mesma migração para `FilterToolbar` + clear.
- Substituir `<select>` nativos de toolbar por dropdowns `navi-menu` (maior esforço).
- Remover aliases `.date-chip.active` → `.is-active` em refactor cosmético futuro.
