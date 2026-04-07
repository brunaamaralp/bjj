import processHandler from './lib/agentProcess.js';
import respondHandler from './lib/agentRespond.js';

export default async function handler(req, res) {
  const action = req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  if (action === 'process' || req.url.includes('/process')) return processHandler(req, res);
  if (action === 'respond' || req.url.includes('/respond')) return respondHandler(req, res);
  return res.status(404).json({ error: 'invalid_agent_action' });
}
