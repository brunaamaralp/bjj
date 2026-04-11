import instancesHandler from './_lib/zapsterInstances.js';
import webhookHandler from './_lib/zapsterWebhook.js';

export default async function handler(req, res) {
  const route = req.query.route || req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  if (route === 'instances' || req.url.includes('/instances')) return instancesHandler(req, res);
  if (route === 'webhook' || req.url.includes('/webhook')) return webhookHandler(req, res);
  return res.status(404).json({ error: 'invalid_zapster_action' });
}