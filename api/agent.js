import processHandler from '../lib/server/agentProcess.js';
import respondHandler from '../lib/server/agentRespond.js';
import aiPromptHandler from '../lib/server/aiPrompt.js';
import promptPreviewHandler from '../lib/server/promptPreview.js';
import generatePromptHandler from '../lib/server/generatePromptHandler.js';
import agentTestHandler from '../lib/server/agentTest.js';

export default async function handler(req, res) {
  const route = req.query.route || req.query.action || (Array.isArray(req.query.slug) ? req.query.slug?.[0] : req.query.slug);
  if (route === 'process' || req.url.includes('/process')) return processHandler(req, res);
  if (route === 'respond' || req.url.includes('/respond')) return respondHandler(req, res);
  if (route === 'ai-prompt' || req.url.includes('/ai-prompt')) return aiPromptHandler(req, res);
  if (route === 'prompt-preview' || req.url.includes('prompt-preview')) return promptPreviewHandler(req, res);
  if (route === 'generate-prompt' || req.url.includes('/generate-prompt')) return generatePromptHandler(req, res);
  if (route === 'test' || req.url.includes('/test')) return agentTestHandler(req, res);
  return res.status(404).json({ error: 'invalid_agent_action' });
}
