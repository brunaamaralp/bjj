/** Ações v1 do agente WhatsApp (compartilhado cliente + servidor). */
export const V1_AI_ACTIONS = [
  'add_conversation_note',
  'add_lead_note',
  'update_student',
  'create_lead',
  'freeze_plan',
];

/** Metadados para UI de configuração. */
export const AI_ACTION_META = {
  add_conversation_note: {
    label: 'Nota na conversa',
    description: 'Registra observações internas na conversa do WhatsApp.',
    risk: 'low',
  },
  add_lead_note: {
    label: 'Nota no histórico do lead',
    description: 'Grava evento na linha do tempo do contato.',
    risk: 'low',
  },
  update_student: {
    label: 'Atualizar cadastro',
    description: 'Atualiza dados do aluno (e-mail, endereço, etc.) com dados completos.',
    risk: 'medium',
  },
  create_lead: {
    label: 'Cadastrar lead',
    description: 'Cria um novo lead quando o contato ainda não existe no CRM.',
    risk: 'medium',
  },
  freeze_plan: {
    label: 'Trancar plano',
    description: 'Tranca o plano após confirmação explícita no chat.',
    risk: 'high',
  },
};

/**
 * @param {unknown} modules
 * @returns {Record<string, unknown>}
 */
export function parseAcademyModules(modules) {
  if (!modules) return {};
  if (typeof modules === 'string') {
    try {
      const parsed = JSON.parse(modules);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof modules === 'object' && !Array.isArray(modules)) return { ...modules };
  return {};
}

/**
 * @param {unknown} raw
 * @returns {{ enabled: boolean, actions: string[] }}
 */
export function normalizeAiActionsConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { enabled: true, actions: [...V1_AI_ACTIONS] };
  }
  const enabled = raw.enabled !== false;
  const list = Array.isArray(raw.actions) ? raw.actions : V1_AI_ACTIONS;
  const actions = list
    .map((a) => String(a || '').trim())
    .filter((a) => V1_AI_ACTIONS.includes(a));
  const unique = [...new Set(actions)];
  return {
    enabled,
    actions: unique.length > 0 ? unique : [...V1_AI_ACTIONS],
  };
}

/**
 * @param {unknown} modules
 * @returns {{ enabled: boolean, actions: Set<string> }}
 */
export function getAiActionsPolicyFromModules(modules) {
  const mods = parseAcademyModules(modules);
  const cfg = normalizeAiActionsConfig(mods.ai_actions);
  return { enabled: cfg.enabled, actions: new Set(cfg.actions) };
}
