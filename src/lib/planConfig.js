/**
 * Fonte única da verdade para planos comerciais do Nave.
 * Usado tanto no frontend (UI de planos) quanto no backend (webhookHandlers).
 *
 * IMPORTANTE: os valores asaas_value devem corresponder exatamente
 * aos valores configurados nos links/assinaturas do Asaas.
 */

export const PLAN_CONFIG = {
  starter: {
    name: 'Starter',
    price: 297,
    threads: 300,
    overage_price: 0.80,
    asaas_value: 297.00,
    description: 'Ideal para academias em crescimento',
    features: ['300 conversas IA/mês', 'R$ 0,80/conversa adicional', 'Agente IA no WhatsApp', 'CRM de leads'],
  },
  studio: {
    name: 'Studio',
    price: 597,
    threads: 800,
    overage_price: 0.70,
    asaas_value: 597.00,
    description: 'Para academias com alto volume de leads',
    features: ['800 conversas IA/mês', 'R$ 0,70/conversa adicional', 'Agente IA no WhatsApp', 'CRM de leads', 'Prioridade no suporte'],
  },
  pro: {
    name: 'Pro',
    price: 997,
    threads: 2000,
    overage_price: 0.60,
    asaas_value: 997.00,
    description: 'Para redes de academias e alta escala',
    features: ['2.000 conversas IA/mês', 'R$ 0,60/conversa adicional', 'Agente IA no WhatsApp', 'CRM de leads', 'Suporte prioritário', 'Integrações avançadas'],
  },
};

/**
 * Identifica o plano pelo valor da cobrança do Asaas.
 * Tolerância de R$ 0,01 para evitar problemas de float.
 * @param {number|string} value
 * @returns {string|null} chave do plano ou null
 */
export function getPlanByAsaasValue(value) {
  const numValue = parseFloat(String(value || '0'));
  if (!Number.isFinite(numValue)) return null;
  for (const [key, plan] of Object.entries(PLAN_CONFIG)) {
    if (Math.abs(numValue - plan.asaas_value) < 0.01) {
      return key;
    }
  }
  console.warn('[planConfig] valor sem plano mapeado:', value);
  return null;
}

/**
 * Identifica o plano pelo externalReference gravado no checkout.
 * Formato esperado: "nave:{storeId}:{planKey}"
 * @param {string|null|undefined} ref
 * @returns {string|null}
 */
export function getPlanByExternalReference(ref) {
  if (!ref) return null;
  const s = String(ref).trim();
  // Formato novo: "nave:{storeId}:{planKey}"
  const partsNew = s.split(':');
  if (partsNew.length === 3 && partsNew[0] === 'nave') {
    const key = partsNew[2].toLowerCase();
    if (PLAN_CONFIG[key]) return key;
  }
  // Formato legado: "{planKey}_{storeId}"
  const partsLegacy = s.split('_');
  if (partsLegacy.length >= 2) {
    const key = partsLegacy[0].toLowerCase();
    if (PLAN_CONFIG[key]) return key;
  }
  return null;
}

/**
 * Extrai o storeId do externalReference.
 * Formato esperado: "nave:{storeId}:{planKey}"
 * @param {string|null|undefined} ref
 * @returns {string|null}
 */
export function getStoreIdFromExternalReference(ref) {
  if (!ref) return null;
  const s = String(ref).trim();
  const parts = s.split(':');
  if (parts.length === 3 && parts[0] === 'nave') {
    return parts[1] || null;
  }
  return null;
}

/**
 * Retorna o plan config pelo slug.
 * @param {string} slug
 */
export function getPlanConfig(slug) {
  const key = String(slug || '').trim().toLowerCase();
  return PLAN_CONFIG[key] ?? PLAN_CONFIG.starter;
}

export const PLAN_KEYS = /** @type {const} */ (['starter', 'studio', 'pro']);
