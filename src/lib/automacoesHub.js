/** Abas do hub /automacoes?tab= */
export const AUTOMACOES_TABS = [
  { id: 'processos', label: 'Processos' },
  { id: 'modelos', label: 'Modelos de Mensagem' },
  { id: 'configuracoes', label: 'Configurações' },
];

/** @deprecated Use AUTOMACOES_COPY em automacoesCopy.js */
export const AUTOMACOES_TAB_HINTS = {
  processos: 'Checklists e follow-ups internos — não envia WhatsApp automaticamente.',
  modelos: 'Textos das mensagens usadas pelos gatilhos de WhatsApp.',
  configuracoes: 'Ligue ou desligue cada gatilho automático do funil e das rotinas diárias.',
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
