/** Ordem comercial dos planos Nave (menor → maior). */
export const PLAN_ORDER = ['starter', 'studio', 'pro'];

/**
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {number} negativo se a<b, 0 se igual, positivo se a>b
 */
export function comparePlanSlugs(a, b) {
  const ia = PLAN_ORDER.indexOf(String(a || '').trim().toLowerCase());
  const ib = PLAN_ORDER.indexOf(String(b || '').trim().toLowerCase());
  const sa = ia === -1 ? 0 : ia;
  const sb = ib === -1 ? 0 : ib;
  return sa - sb;
}

/** @param {string} from @param {string} to */
export function isPlanUpgrade(from, to) {
  return comparePlanSlugs(from, to) < 0;
}

/** @param {string} from @param {string} to */
export function isPlanDowngrade(from, to) {
  return comparePlanSlugs(from, to) > 0;
}
