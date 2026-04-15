import instancesHandler from '../lib/server/zapsterInstances.js';
import webhookHandler from '../lib/server/zapsterWebhook.js';

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

function firstQueryString(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v).trim();
}

/**
 * Este arquivo só multiplexa dois handlers. Não use `req.query.action` como
 * rota de alto nível: em GET ?action=qrcode isso virava route=qrcode e
 * `route === 'instances'` falhava (404 invalid_zapster_action + QR em loop).
 */
export default async function handler(req, res) {
  const url = String(req.url || '');
  const qRoute = firstQueryString(req.query.route);

  const isWebhook =
    qRoute === 'webhook' || url.includes('/webhook') || url.includes('route=webhook');

  if (isWebhook) {
    return webhookHandler(req, res);
  }

  if (!hasZapsterApiToken()) {
    return zapsterTokenMissingResponse(res);
  }
  return instancesHandler(req, res);
}
