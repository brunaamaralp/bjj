/** Copy canônica do hub /automacoes (spec 2026-06-16-automacoes-ux-onboarding). */
export const AUTOMACOES_COPY = {
  hub: {
    subtitle: 'Processos internos da equipe e mensagens automáticas no WhatsApp do funil.',
  },
  tab: {
    processos: {
      hint: 'Checklists e follow-ups para a equipe executar no CRM.',
      banner:
        'Esta aba não envia WhatsApp. Para mensagens automáticas, use Modelos de Mensagem e Configurações.',
    },
    modelos: {
      hint: 'Textos usados pelos gatilhos automáticos do funil.',
    },
    configuracoes: {
      hint: 'Ative ou desative cada gatilho de envio automático.',
    },
  },
  wizard: {
    eyebrow: 'Configurar mensagens automáticas',
    title: 'Três passos para o funil enviar WhatsApp',
    step: {
      modelos: 'Revisar modelos',
      whatsapp: 'Conectar WhatsApp',
      configuracoes: 'Configurações',
    },
    modelos: {
      title: 'Personalize os textos',
      description: 'Revise as mensagens que o funil envia automaticamente no WhatsApp.',
      ctaLabel: 'Abrir Modelos de Mensagem',
      confirm: 'Revisei os modelos padrão — posso seguir para o próximo passo.',
      ctaBlockedHint:
        'Marque a confirmação na aba Modelos ou personalize pelo menos um texto para continuar.',
    },
    whatsapp: {
      title: 'Conecte o WhatsApp',
      description:
        'Os gatilhos do funil usam o número conectado no Agente IA. Processos (outra aba) não enviam mensagens.',
      ctaLabel: 'Abrir Agente IA',
      ctaHint: 'Você sairá desta página.',
    },
    configuracoes: {
      title: 'Ative os gatilhos',
      description: 'Ligue só os envios que sua academia precisa — você pode mudar depois.',
      ctaLabel: 'Ir para Configurações',
    },
    compact: {
      modelos: 'Falta revisar os modelos para o funil enviar WhatsApp.',
      whatsapp: 'Falta conectar o WhatsApp para os gatilhos automáticos funcionarem.',
      configuracoes: 'Falta ativar gatilhos automáticos nas Configurações.',
      cta: 'Continuar configuração',
    },
    complete:
      'Modelos, WhatsApp e gatilhos configurados. Mensagens automáticas do funil prontas — ajuste quando quiser.',
  },
  readiness: {
    zapsterOffline: 'WhatsApp desconectado — gatilhos não enviam até reconectar.',
  },
};
