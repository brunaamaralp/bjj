const STORAGE_VERSION = 'v1';
const MAX_SUSPENDED = 5;

function storageKey(academyId) {
  return `sales:suspended:${STORAGE_VERSION}:${String(academyId || '').trim()}`;
}

function readRaw(academyId) {
  if (typeof window === 'undefined' || !academyId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(academyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(academyId, list) {
  if (typeof window === 'undefined' || !academyId) return;
  try {
    window.localStorage.setItem(storageKey(academyId), JSON.stringify(list.slice(0, MAX_SUSPENDED)));
  } catch {
    void 0;
  }
}

function cartLabel(cart) {
  const first = (cart || [])[0];
  if (!first) return 'Carrinho';
  const name = String(first.display_label || 'Item').trim();
  const extra = cart.length > 1 ? ` +${cart.length - 1}` : '';
  return `${name}${extra}`;
}

export function listSuspendedCarts(academyId) {
  return readRaw(academyId).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function suspendCart(academyId, snapshot) {
  if (!academyId || !snapshot?.cart?.length) return null;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sus-${Date.now()}`;
  const entry = {
    id,
    savedAt: Date.now(),
    label: cartLabel(snapshot.cart),
    ...snapshot,
  };
  const list = [entry, ...readRaw(academyId)].slice(0, MAX_SUSPENDED);
  writeRaw(academyId, list);
  return entry;
}

export function removeSuspendedCart(academyId, id) {
  const list = readRaw(academyId).filter((x) => x.id !== id);
  writeRaw(academyId, list);
  return list;
}
