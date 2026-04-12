import instancesHandler from './_lib/zapsterInstances.js';
import webhookHandler from './_lib/zapsterWebhook.js';

const REQUIRED_ENV = ['ZAPSTER_API_TOKEN', 'INTERNAL_API_SECRET', 'ANTHROPIC_API_KEY'];

function hasZapsterApiToken() {
  return Boolean(String(process.env.ZAPSTER_API_TOKEN || process.env.ZAPSTER_TOKEN || '').trim());
}

const missingEnv = REQUIRED_ENV.filter((key) => {
  if (key === 'ZAPSTER_API_TOKEN') return !hasZapsterApiToken();
  return !String(process.env[key] || '').trim();
});

if (missingEnv.length > 0) {
  console.error('[zapster] VARIÁVEIS AUSENTES:', missingEnv.join(', '));
}

function zapsterTokenMissingResponse(res) {
  return res.status(503).json({
    sucesso: false,
    erro: 'Serviço de WhatsApp não configurado.',
    detalhe:
      'A variável ZAPSTER_API_TOKEN não está definida. Configure nas variáveis de ambiente do projeto (ou defina ZAPSTER_TOKEN como alternativa).',
    codigo: 'ZAPSTER_TOKEN_MISSING'
  });
}

export default async function handler(req, res) {
  const route = req.query.route || req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  const isInstances = route === 'instances' || req.url.includes('/instances');
  if (isInstances && !hasZapsterApiToken()) {
    return zapsterTokenMissingResponse(res);
  }
  if (isInstances) return instancesHandler(req, res);
  if (route === 'webhook' || req.url.includes('/webhook')) return webhookHandler(req, res);
  return res.status(404).json({ error: 'invalid_zapster_action' });
}
