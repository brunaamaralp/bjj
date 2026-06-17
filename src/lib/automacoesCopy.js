/** Copy canônica do hub /automacoes — Mensagens do funil (P4). */
export const AUTOMACOES_COPY = {
  hub: {
    title: 'Mensagens do funil',
    subtitle:
      'Textos e gatilhos que enviam WhatsApp automaticamente quando o número está conectado no Agente IA.',
  },
  tab: {
    modelos: {
      hint: 'Textos usados pelos gatilhos automáticos do funil.',
    },
    gatilhos: {
      hint: 'Ative ou desative cada gatilho de envio automático do funil.',
    },
  },
  wizard: {
    eyebrow: 'Configurar mensagens automáticas',
    title: 'Três passos para o funil enviar WhatsApp',
    step: {
      modelos: 'Revisar modelos',
      whatsapp: 'Conectar WhatsApp',
      gatilhos: 'Ativar gatilhos',
    },
    modelos: {
      title: 'Personalize os textos',
      description: 'Revise as mensagens que o funil envia automaticamente no WhatsApp.',
      ctaLabel: 'Abrir Modelos',
      confirm: 'Revisei os modelos padrão — posso seguir para o próximo passo.',
      ctaBlockedHint:
        'Marque a confirmação na aba Modelos ou personalize pelo menos um texto para continuar.',
    },
    whatsapp: {
      title: 'Conecte o WhatsApp',
      description: 'Os gatilhos do funil usam o número conectado no Agente IA.',
      ctaLabel: 'Abrir Agente IA',
      ctaHint: 'Você sairá desta página.',
    },
    gatilhos: {
      title: 'Ative os gatilhos',
      description: 'Ligue só os envios que sua academia precisa — você pode mudar depois.',
      ctaLabel: 'Ir para Gatilhos',
    },
    complete:
      'Modelos, WhatsApp e gatilhos configurados. Mensagens automáticas do funil prontas — ajuste quando quiser.',
  },
  readiness: {
    zapsterOffline: 'WhatsApp desconectado — gatilhos não enviam até reconectar.',
  },
  migration: {
    processosMoved:
      'Processos da equipe agora ficam em Tarefas — use o menu ou a aba Processos da equipe.',
  },
};
