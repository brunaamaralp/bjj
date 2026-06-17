/** Abas do hub /automacoes?tab= */
export const AUTOMACOES_GATILHOS_TAB_ID = 'gatilhos';

export const AUTOMACOES_TABS = [
  { id: 'modelos', label: 'Modelos' },
  { id: AUTOMACOES_GATILHOS_TAB_ID, label: 'Gatilhos' },
];

const AUTOMACOES_TAB_ALIASES = {
  configuracoes: AUTOMACOES_GATILHOS_TAB_ID,
};

/** @deprecated Use AUTOMACOES_COPY em automacoesCopy.js */
export const AUTOMACOES_TAB_HINTS = {
  modelos: 'Textos das mensagens usadas pelos gatilhos de WhatsApp.',
  gatilhos: 'Ligue ou desligue cada gatilho automático do funil e das rotinas diárias.',
};

export const FINANCE_WHATSAPP_REMINDERS_PATH =
  '/empresa?tab=financeiro&section=lembretes-whatsapp';

/** Agrupamento visual da aba Modelos (espelha categorias de gatilhos). */
export const WHATSAPP_TEMPLATE_UI_GROUPS = [
  {
    id: 'captacao',
    title: 'Captação e funil',
    hint: 'Textos usados nos gatilhos de leads e aulas experimentais.',
    keys: ['confirm', 'reminder', 'post_class', 'missed', 'recovery', 'dashboard_contact'],
  },
  {
    id: 'rotinas',
    title: 'Rotinas diárias',
    hint: 'Mensagens automáticas por data, sem ação manual no funil.',
    keys: ['birthday'],
  },
];

/**
 * Normaliza tab legada → canônica ou redirect externo.
 * @param {string | null | undefined} tab
 * @returns {{ kind: 'tab', tab: string } | { kind: 'redirect', to: string }}
 */
export function normalizeAutomacoesTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (t === 'processos') return { kind: 'redirect', to: '/tarefas?tab=processos' };
  if (AUTOMACOES_TAB_ALIASES[t]) return { kind: 'tab', tab: AUTOMACOES_TAB_ALIASES[t] };
  if (AUTOMACOES_TABS.some((x) => x.id === t)) return { kind: 'tab', tab: t };
  return { kind: 'tab', tab: 'modelos' };
}
