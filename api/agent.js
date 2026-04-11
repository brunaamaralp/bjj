import processHandler from './_lib/agentProcess.js';
import respondHandler from '../lib/server/agentRespond.js';
import aiPromptHandler from './_lib/aiPrompt.js';

export default async function handler(req, res) {
  const route = req.query.route || req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  if (route === 'process' || req.url.includes('/process')) return processHandler(req, res);
  if (route === 'respond' || req.url.includes('/respond')) return respondHandler(req, res);
  if (route === 'ai-prompt' || req.url.includes('/ai-prompt')) return aiPromptHandler(req, res);
  return res.status(404).json({ error: 'invalid_agent_action' });
}
