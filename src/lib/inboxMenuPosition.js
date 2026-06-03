/**
 * Posição do menu contextual flutuante (mensagem) na viewport.
 * @param {{ kind: string, anchorEl?: Element | null, menuW?: number, menuH?: number, pad?: number, vw?: number, vh?: number }}
 */
export function computeInboxMenuPosition({
  kind,
  anchorEl,
  menuW = 260,
  menuH,
  pad = 8,
  vw = typeof window !== 'undefined' ? window.innerWidth : 1200,
  vh = typeof window !== 'undefined' ? window.innerHeight : 800,
}) {
  const menuKind = String(kind || '').trim();
  const resolvedMenuH = Number.isFinite(menuH) ? menuH : menuKind === 'message' ? 300 : 360;
  const el = anchorEl && anchorEl.getBoundingClientRect ? anchorEl : null;
  const rect = el
    ? el.getBoundingClientRect()
    : { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 };

  let x = menuKind === 'message' ? rect.right - menuW : rect.left;
  x = Math.max(pad, Math.min(x, vw - menuW - pad));
  let y = rect.bottom + 6;
  if (y + resolvedMenuH > vh - pad) {
    y = rect.top - resolvedMenuH - 6;
  }
  y = Math.max(pad, Math.min(y, vh - resolvedMenuH - pad));
  return { x, y };
}
