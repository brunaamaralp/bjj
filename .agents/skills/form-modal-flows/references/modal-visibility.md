# Modal Visibility — Nave

Goal: when a modal opens, the user **sees it immediately** without hunting via page scroll.

Vertical **center** is acceptable. The failure mode to eliminate is: modal rendered **below the viewport** or only reachable after scrolling the **page** (not internal dialog scroll).

## Required: Portal to `document.body`

Always mount the overlay via:

- `ModalShell` (preferred), or
- `createPortal(overlay, document.body)`, or
- `ConfirmDialog` for confirmations

**Never** render `.navi-modal-overlay` as a sibling deep inside page layout without a portal.

### Why

Inline modals inherit stacking and positioning context from ancestors. If any ancestor has:

- `transform` (common in animations, sidebars, scaled cards)
- `filter` / `backdrop-filter` on a wrapper
- `perspective`
- `contain: paint` or `will-change: transform`

…then `position: fixed` on the modal is **not viewport-fixed**. It anchors to that ancestor. On a long scrolled page, the modal can appear at the **bottom of the page content**, forcing the user to scroll down to find it.

## Overlay CSS (canonical)

From `src/index.css`:

```css
.navi-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;      /* vertical center — OK */
  justify-content: center;
  overflow-y: auto;
  padding: 12px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
}
```

Center alignment is fine for **short and medium** dialogs.

## Tall dialogs: avoid “centered off-screen top”

When dialog height ≈ or > viewport:

- Flex `align-items: center` + overlay `overflow-y: auto` centers content in the **scrollable overlay height**
- The top of the dialog can start **above** the visible area
- User must scroll **inside the overlay** to reach the title — feels like modal is “missing” or “at the bottom”

### Fixes (pick one)

**A — Top-biased alignment for form modals (recommended for tall forms)**

```css
.navi-modal-overlay--form {
  align-items: flex-start;
  padding-top: max(24px, env(safe-area-inset-top, 0px));
}
```

Pass `className="navi-modal-overlay--form"` on `ModalShell` when body has many fields.

**B — Cap dialog height + internal scroll**

```css
.navi-modal-shell {
  max-height: min(90vh, calc(100dvh - 48px));
  display: flex;
  flex-direction: column;
}
.navi-modal-shell__body {
  overflow-y: auto;
  min-height: 0;
}
```

Keep header/footer fixed; scroll only the body.

**C — Reset overlay scroll on open**

```jsx
useEffect(() => {
  if (!open) return;
  overlayRef.current?.scrollTo(0, 0);
}, [open]);
```

Apply when keeping center alignment on tall content.

## Body scroll lock

While modal is open, prevent background page scroll:

- `ModalShell` / `ConfirmDialog` patterns, or
- `useModalA11y({ isOpen, onClose, lockScroll: true })`

Without lock, wheel/touch can scroll the page behind the overlay and disorient users.

## Mobile keyboard

On mobile, footer actions can sit under the keyboard. Pattern from `MatriculaModal.jsx`:

- `useMatchMobile()` + `useVisualViewportKeyboardOffset(isOpen && isMobile)`
- Add offset to footer `paddingBottom`

## Quick diagnostic checklist

When reviewing a “modal at the bottom” bug:

1. Is overlay portaled to `document.body`? If no → 🔴 portal first
2. Inspect ancestors for `transform` / `filter` on inline modals
3. Measure dialog height vs `100vh` — if tall, apply B or A
4. Check `z-index` not buried below sidebar (`var(--z-modal)`)
5. Open modal at `window.scrollY > 0` — still visible without page scroll?

## Do not

- Use `position: absolute` for full-screen overlays
- Rely on page scroll to bring modal into view
- Put critical title/actions only at the bottom of an unscrolled tall form
- Use inline `zIndex: 9999` instead of design tokens
