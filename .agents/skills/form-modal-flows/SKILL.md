---
name: form-modal-flows
description: >-
  Guides creation and review of form modals for the Nave app — visibility on open,
  fillability, masks, validation, layout, and design-system compliance. Use when
  building or auditing modals, dialogs, cadastro forms, wizards, máscaras de telefone/CPF/moeda,
  posicionamento de modal, fluxo de preenchimento, ModalShell, ConfirmDialog, or when
  modals appear off-screen or require page scroll to see.
---

# Form & Modal Flows (Nave)

Expert playbook for **creating** and **reviewing** form modals in this repo.

## When to Use

- New modal or multi-step form inside a dialog
- Review/refactor of an existing modal (UX, masks, validation, layout)
- Bug: modal opens off-screen, at the bottom of the page, or needs scroll to find
- Choosing modal vs drawer vs full page vs inline form

## Core Rule: Visible on Open

The modal must be **fully discoverable without scrolling the page** when it opens.

Centered vertically is fine. **Never** accept a modal that only appears after the user scrolls down the underlying page.

Common causes in this codebase — fix in this order:

1. **No portal** — overlay rendered inline in page tree → use `ModalShell` or `createPortal(..., document.body)`
2. **Broken `position: fixed`** — ancestor with `transform`, `filter`, `perspective`, or `contain: paint` creates a new containing block → portal to `document.body` or remove transform on ancestor
3. **Tall modal + centered flex overlay** — overlay has `overflow-y: auto` + `align-items: center`; dialog taller than viewport hides the top until overlay scroll → see [modal-visibility.md](references/modal-visibility.md)
4. **Page scroll not reset** — overlay opens while `window` scrollY is high and inline overlay follows document flow → portal + body scroll lock

Read [modal-visibility.md](references/modal-visibility.md) before changing CSS or structure.

## Execution Workflow

### Step 1 — Classify the UI

| Pattern | Use when | Component |
| --- | --- | --- |
| Form modal | Create/edit with several fields | `ModalShell` |
| Confirm / destructive | Short yes/no | `ConfirmDialog` |
| Multi-step wizard | 2+ logical steps | `ModalShell` + step state (see `MatriculaModal.jsx`) |
| Full create flow | Too many fields for modal | Dedicated page (`NewLead.jsx`) |

Do not build a one-off overlay when `ModalShell` or `ConfirmDialog` fits.

### Step 2 — Structure (new modals)

```jsx
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import { useToast } from '../../hooks/useToast';

<ModalShell
  open={open}
  onClose={onClose}
  title="Título claro — ação + objeto"
  maxWidth={480}
  footer={
    <>
      <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
      <button type="submit" className="btn-primary" disabled={busy}>Salvar</button>
    </>
  }
>
  {/* fields */}
</ModalShell>
```

Requirements:

- Portal to `document.body` (built into `ModalShell` / `ConfirmDialog`)
- `title` names the action («Registrar pagamento», not «Formulário»)
- Primary action right in footer; cancel/outline left
- Body scroll inside dialog (`maxHeight` + `overflow-y: auto`), not unbounded growth

### Step 3 — Form fillability

Follow [field-patterns.md](references/field-patterns.md). Summary:

- **Order**: required + identifying fields first; optional/advanced last
- **Labels**: visible `<label htmlFor>` or `aria-label`; never placeholder-only
- **Defaults**: prefill from context (lead name, today’s date, current plan)
- **Tab order**: matches visual order; no focus traps except inside open modal
- **Mobile**: `useVisualViewportKeyboardOffset` for footer padding when keyboard open (see `MatriculaModal.jsx`)

### Step 4 — Masks & formats (Brazil)

Reuse project utilities — do not duplicate mask logic:

| Data | Import | Notes |
| --- | --- | --- |
| Phone | `maskPhone` from `src/lib/masks.js` | Apply on `onChange` |
| CPF / CNPJ | `maskCPF`, `maskCNPJ`, `maskCPFOrCNPJ` | Same file |
| Currency input | `maskCurrency`, `parseCurrencyBRL` or `parseMaskToCents` + `formatBRLFromCents` from `moneyBr.js` | Store cents or number consistently with surrounding code |
| Date | `DateInput` / `DateInputField` from `DateInput.jsx` | Prefer over raw `<input type="date">` for BR typing |

Input attributes: `inputMode="numeric"` / `tel` where appropriate, `autoComplete` when known.

### Step 5 — Validation & feedback

Follow [docs/ux-feedback.md](../../../docs/ux-feedback.md):

- Field errors → `FieldError` below the input (`role="alert"`)
- Messages: short imperatives — «Informe o telefone.», «Selecione um plano.»
- Success after save → `useToast().success(...)`
- API errors → `toast.error(e, 'save')` or `friendlyError`
- Destructive confirm → `ConfirmDialog`, never `window.confirm`
- Do **not** duplicate the same error in toast and `FieldError`

Validate on submit at minimum; blur validation for format fields (phone, CPF, date).

### Step 6 — Design tokens

Follow [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md):

- Colors: `var(--color-primary)`, `var(--color-accent)`, `var(--danger)` — no new hex
- Spacing: `var(--space-*)` in layout gaps
- Buttons: `btn-primary`, `btn-outline`, `btn-danger` in confirm dialogs
- Section headings in modal body: `navi-section-heading`

### Step 7 — Accessibility

- `ModalShell` sets `role="dialog"`, `aria-modal`, `aria-labelledby`
- Focus first field on open (or first error after failed submit)
- Escape closes (default in `ModalShell`); overlay click optional
- `useModalA11y` when not using `ModalShell`
- Associate errors: `aria-describedby` → `FieldError` id

## Review Workflow (existing modals)

Use [review-checklist.md](references/review-checklist.md). Report findings as:

```markdown
## Form/Modal Review — [ComponentName]

### Visibility (blockers)
- 🔴 ...

### Fillability & masks
- 🟡 ...

### Validation & feedback
- 🟡 ...

### Design & a11y
- 🟢 ...
```

Fix 🔴 visibility issues before cosmetic tweaks.

## Known Anti-Patterns in Repo

| Anti-pattern | Example | Fix |
| --- | --- | --- |
| Inline overlay, no portal | Legacy modals not yet on `ModalShell` | Refactor to `ModalShell` + portal |
| Custom overlay duplicate | Various `createPortal` + hand-rolled header | Consolidate on `ModalShell` |
| Inline styles for shell | `borderRadius: 16`, `maxWidth` in JSX | Prefer `navi-modal-shell` classes + `maxWidth` prop |
| `zIndex: 9999` inline | Several modals | Use `var(--z-modal)` via CSS |
| Unmasked phone/CPF in form | Raw `<input>` | Wire `maskPhone` / `maskCPF` on change |

## Reference Files

- [modal-visibility.md](references/modal-visibility.md) — portal, fixed positioning, overlay scroll
- [field-patterns.md](references/field-patterns.md) — field order, masks, validation detail
- [review-checklist.md](references/review-checklist.md) — full audit checklist

## Project Sources of Truth

- `src/components/shared/ModalShell.jsx`
- `src/components/shared/ConfirmDialog.jsx`
- `src/components/shared/FieldError.jsx`
- `src/hooks/useModalA11y.js`
- `src/index.css` — `.navi-modal-overlay`, `.navi-modal-shell`
- `docs/ux-feedback.md`
- `DESIGN_SYSTEM.md`
