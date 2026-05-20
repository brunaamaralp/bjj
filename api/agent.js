import processHandler from '../lib/server/agentProcess.js';
import respondHandler from '../lib/server/agentRespond.js';
import aiPromptHandler from '../lib/server/aiPrompt.js';
import promptPreviewHandler from '../lib/server/promptPreview.js';
import generatePromptHandler from '../lib/server/generatePromptHandler.js';
import agentTestHandler from '../lib/server/agentTest.js';
import nlActionHandler from '../lib/server/nlActionHandler.js';
import importFinanceHandler from '../lib/server/importFinanceHandler.js';
import settleFinanceTxHandler from '../lib/server/settleFinanceTxHandler.js';
import cancelFinanceTxHandler from '../lib/server/cancelFinanceTxHandler.js';
import academyCreateHandler from '../lib/server/academiesCreate.js';
import teamMembersHandler from '../lib/server/teamMembers.js';
import academyWhatsappTemplatesHandler from '../lib/server/academyWhatsappTemplatesHandler.js';

export default async function handler(req, res) {
  try {
    const query = req?.query || {};
    const route = query.route || query.action || (Array.isArray(query.slug) ? query.slug?.[0] : query.slug);
    const url = String(req?.url || '');

    if (route === 'process' || url.includes('/process')) return processHandler(req, res);
    if (route === 'respond' || url.includes('/respond')) return respondHandler(req, res);
    if (route === 'ai-prompt' || url.includes('/ai-prompt')) return aiPromptHandler(req, res);
    if (route === 'prompt-preview' || url.includes('prompt-preview')) return promptPreviewHandler(req, res);
    if (route === 'generate-prompt' || url.includes('/generate-prompt')) return generatePromptHandler(req, res);
    if (route === 'test' || url.includes('/test')) return agentTestHandler(req, res);
    if (route === 'nl-action' || url.includes('nl-action')) return nlActionHandler(req, res);
    if (route === 'import-finance') return importFinanceHandler(req, res);
    if (route === 'settle-finance-tx') return settleFinanceTxHandler(req, res);
    if (route === 'cancel-finance-tx') return cancelFinanceTxHandler(req, res);
    if (route === 'academy-create') return academyCreateHandler(req, res);
    if (route === 'team-members') return teamMembersHandler(req, res);
    if (route === 'whatsapp-templates' || url.includes('/whatsapp-templates')) {
      return academyWhatsappTemplatesHandler(req, res);
    }
    return res.status(404).json({ error: 'invalid_agent_action' });
  } catch (error) {
    console.error('[api/agent] Unhandled error:', error);
    return res.status(500).json({
      error: 'internal_server_error',
      detail: error?.message || 'Falha inesperada no roteador /api/agent',
    });
  }
}
