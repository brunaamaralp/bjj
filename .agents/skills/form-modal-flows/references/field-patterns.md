# Field Patterns — Form Modals

## Field order

1. **Identity** — name, phone, email (what the user knows first)
2. **Decision** — plan, status, category, amount
3. **Dates** — default to sensible values (`defaultEnrollmentDateIso`, today)
4. **Optional / advanced** — notes, custom questions, secondary contacts
5. **Actions** — footer only; never duplicate submit mid-form without reason

Group related fields with a short `navi-section-heading` when ≥3 fields share a topic.

## Labels & placeholders

- Every control has a visible label or `aria-label`
- Placeholder is hint only, not the label
- Required fields: mark with `(obrigatório)` or `required` + visual convention consistent with sibling forms
- Selects: first option is placeholder «Selecione…» with `value=""` disabled

## Masks (apply on change)

```jsx
import { maskPhone, maskCPF } from '../../lib/masks.js';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks.js';
// or cents: parseMaskToCents, formatBRLFromCents from moneyBr.js

<input
  value={phone}
  onChange={(e) => setPhone(maskPhone(e.target.value))}
  inputMode="tel"
  autoComplete="tel"
/>
```

```jsx
import { DateInputField } from '../DateInput';

<DateInputField
  type="date"
  value={dateIso}
  onChange={(e) => setDateIso(e.target.value)}
  required
/>
```

Store canonical values (ISO date, cents, digits-only phone) in state/API; display masked.

## Validation timing

| Type | When |
| --- | --- |
| Required empty | On submit |
| Phone / CPF / date format | On blur or submit |
| Business rules (stock, plan freeze days) | On submit with server-style message |

Keep error state per field; clear field error when user edits that field.

```jsx
{errors.name ? <FieldError id="name-error">{errors.name}</FieldError> : null}
<input aria-describedby={errors.name ? 'name-error' : undefined} aria-invalid={!!errors.name} />
```

## Submit UX

- Disable submit while `busy` / `submitting`
- Show loading on primary button (`AsyncButton` where already used)
- Close modal on success unless next step stays in same dialog (wizard)
- Toast success **after** confirmed save

## Multi-step modals

- Show step progress in title or subtitle («Passo 2 de 3»)
- Back button returns without losing draft if cheap to keep
- Do not nest modals; swap steps inside one shell
- Final step success can simplify actions (single «Fechar» or next action)

## Intuitiveness checks

Ask for each field: «Would a receptionist understand this label without training?»

- Prefer domain terms from `useTerms()` over internal enum names
- Show computed read-only hints (return date, days remaining) near inputs they depend on
- Dangerous values (zero price, backdated payment) → inline warning before submit, not only toast
