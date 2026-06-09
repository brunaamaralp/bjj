# Form/Modal Review Checklist

Copy and fill when auditing an existing modal.

## Visibility (fix first)

- [ ] Overlay uses portal to `document.body`
- [ ] No transform/filter ancestor breaking `position: fixed`
- [ ] Modal visible at open with page scrolled (`scrollY > 400`)
- [ ] Tall content: body scroll inside dialog OR top-biased overlay — not off-screen title
- [ ] Background scroll locked while open
- [ ] Sensible z-index (`var(--z-modal)`), not buried under chrome

## Structure

- [ ] Uses `ModalShell` or `ConfirmDialog` (or justified exception documented)
- [ ] Clear title (action + object)
- [ ] Footer: cancel + primary; destructive uses `ConfirmDialog` or `btn-danger`
- [ ] `onClose` on Escape and overlay (if product expects it)

## Fillability

- [ ] Logical field order; required fields first
- [ ] Labels on all inputs
- [ ] Sensible defaults from props/context
- [ ] Phone / CPF / CNPJ / currency / date use shared mask components
- [ ] Mobile keyboard does not hide primary action

## Validation & feedback

- [ ] Errors use `FieldError`, not toast-only for field issues
- [ ] API errors use `friendlyError` / `toast.error(e, ctx)`
- [ ] No duplicate toast + banner for same failure
- [ ] No `window.confirm`

## Design

- [ ] Tokens from design system (no new random hex)
- [ ] Spacing via `--space-*`; buttons via `btn-*` classes
- [ ] Consistent with sibling modals in same module

## Accessibility

- [ ] `role="dialog"` / `aria-modal` / labelled title
- [ ] Focus management on open
- [ ] Errors linked with `aria-describedby` / `aria-invalid`

## Severity guide

| Level | Meaning |
| --- | --- |
| 🔴 Blocker | Modal not visible on open, data loss risk, wrong mask losing digits |
| 🟡 Should fix | Poor order, missing labels, duplicate overlay code, toast/FieldError misuse |
| 🟢 Nice to have | Copy tweaks, minor spacing, consolidate custom CSS into tokens |
